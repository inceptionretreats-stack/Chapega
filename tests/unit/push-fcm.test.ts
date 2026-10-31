import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getPushConfiguration } from "@/server/push/config";
import { classifyFcmFailure, deliverFcmMessage } from "@/server/push/fcm";
import { resetGoogleAccessTokenCache } from "@/server/push/google-oauth";
import { orderAlertMessage } from "@/server/push/order-alert";
import { setLogSink } from "@/server/observability/logger";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const fetchMock = vi.fn();

function fcmError(status: number, errorCode?: string, fieldViolations?: string[]) {
  return Response.json(
    {
      error: {
        code: status,
        status: "ERROR",
        details: [
          ...(errorCode
            ? [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }]
            : []),
          ...(fieldViolations
            ? [
                {
                  "@type": "type.googleapis.com/google.rpc.BadRequest",
                  fieldViolations: fieldViolations.map((field) => ({ field })),
                },
              ]
            : []),
        ],
      },
    },
    { status },
  );
}

const order = {
  id: "5b9e1f9e-0c0a-4f5e-9d8a-3f1f2b6c7d8e",
  orderNumber: "GFT-20261101-4821",
  totalPaise: 129_900,
  items: [{ quantity: 1 }, { quantity: 2 }],
};

beforeEach(() => {
  resetGoogleAccessTokenCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setLogSink(() => {});
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("FCM_TEST_BASE_URL", "");
  vi.stubEnv(
    "FCM_SERVICE_ACCOUNT_JSON",
    JSON.stringify({
      type: "service_account",
      project_id: "chapega-studio",
      private_key_id: "key-id-1",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      client_email: "push@chapega-studio.iam.gserviceaccount.com",
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setLogSink(null);
});

describe("the new-order message", () => {
  it("carries the order number, total and item count, and nothing about the customer", () => {
    const message = orderAlertMessage("fcm-token", "chapega", order, 1_800_000_000);

    expect(message.notification).toEqual({
      title: "New kiosk order",
      body: "GFT-20261101-4821 · ₹1,299.00 · 3 items",
    });
    expect(message.data).toEqual({
      type: "order.created",
      vendorSlug: "chapega",
      orderId: order.id,
      orderNumber: "GFT-20261101-4821",
      totalPaise: "129900",
      itemCount: "3",
    });
    expect(Object.values(message.data).every((value) => typeof value === "string")).toBe(true);
    expect(message.android).toMatchObject({
      priority: "high",
      notification: { channel_id: "new_orders", tag: order.id },
    });
    expect(message.apns.headers["apns-collapse-id"]).toBe(order.id);
  });

  it("never includes customer details, whatever the order holds", () => {
    const customer = {
      customerName: "Meera Iyer",
      customerPhone: "+91 98765 43210",
      giftNote: "Happy birthday, Amma",
      orderNote: "Pick up at 6",
      whatsappMessage: "Hello Chapega, I selected these gifts",
    };
    const message = orderAlertMessage(
      "fcm-token",
      "chapega",
      { ...order, ...customer } as typeof order,
      1_800_000_000,
    );

    const text = JSON.stringify(message);
    for (const value of Object.values(customer)) expect(text).not.toContain(value);
    expect(text).not.toContain("9876543210");
  });
});

describe("classifying FCM failures", () => {
  it.each([
    [404, "UNREGISTERED", undefined, "unregistered"],
    [403, "SENDER_ID_MISMATCH", undefined, "unregistered"],
    [400, "INVALID_ARGUMENT", ["message.token"], "unregistered"],
    [400, "INVALID_ARGUMENT", ["message.android.ttl"], "failed"],
    // A wrong project id is NOT_FOUND without UNREGISTERED: keep every token.
    [404, undefined, undefined, "failed"],
    [401, "THIRD_PARTY_AUTH_ERROR", undefined, "apns"],
    [401, undefined, undefined, "reauthenticate"],
    [429, "QUOTA_EXCEEDED", undefined, "retry"],
    [503, "UNAVAILABLE", undefined, "retry"],
  ] as const)("%i %s → %s", async (status, code, fields, expected) => {
    const body = await fcmError(status, code, fields ? [...fields] : undefined).json();
    expect(classifyFcmFailure(status, body)).toBe(expected);
  });
});

describe("delivering one message", () => {
  const token = () => Response.json({ access_token: "access", expires_in: 3600 });
  const deadline = () => Date.now() + 10_000;

  it("sends to the project's messages:send endpoint with the access token", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(Response.json({ name: "m/1" }));

    const delivery = await deliverFcmMessage(
      getPushConfiguration()!,
      orderAlertMessage("fcm-token", "chapega", order),
      deadline(),
    );

    expect(delivery).toBe("sent");
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://fcm.googleapis.com/v1/projects/chapega-studio/messages:send");
    expect(init.headers.authorization).toBe("Bearer access");
    expect(JSON.parse(init.body).message.token).toBe("fcm-token");
  });

  it("reports a dead token, and gets a new access token once after a 401", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(fcmError(404, "UNREGISTERED"));
    expect(
      await deliverFcmMessage(
        getPushConfiguration()!,
        orderAlertMessage("t", "chapega", order),
        deadline(),
      ),
    ).toBe("unregistered");

    fetchMock
      .mockResolvedValueOnce(fcmError(401))
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(Response.json({ name: "m/2" }));
    expect(
      await deliverFcmMessage(
        getPushConfiguration()!,
        orderAlertMessage("t", "chapega", order),
        deadline(),
      ),
    ).toBe("sent");
  });

  it("retries once after a 503, and gives up quietly on network errors", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(fcmError(503, "UNAVAILABLE"))
      .mockResolvedValueOnce(fcmError(503, "UNAVAILABLE"));
    expect(
      await deliverFcmMessage(
        getPushConfiguration()!,
        orderAlertMessage("t", "chapega", order),
        deadline(),
      ),
    ).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(
      await deliverFcmMessage(
        getPushConfiguration()!,
        orderAlertMessage("t", "chapega", order),
        deadline(),
      ),
    ).toBe("failed");
  });

  it("does not start a send after the deadline", async () => {
    expect(
      await deliverFcmMessage(
        getPushConfiguration()!,
        orderAlertMessage("t", "chapega", order),
        Date.now() - 1,
      ),
    ).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
