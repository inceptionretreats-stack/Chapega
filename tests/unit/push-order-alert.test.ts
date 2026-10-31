import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  finish: vi.fn(),
  deliver: vi.fn(),
  logs: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/push/registrations", () => ({
  claimOrderPushTargets: mocks.claim,
  finishOrderPush: mocks.finish,
}));
vi.mock("@/server/push/fcm", () => ({ deliverFcmMessage: mocks.deliver }));

import { notifyNewKioskOrder } from "@/server/push/order-alert";
import { setLogSink } from "@/server/observability/logger";
import type { VendorOrder } from "@/types/vendor";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const vendor = { id: "00000000-0000-4000-8000-000000000001", slug: "chapega" };
const order = {
  id: "5b9e1f9e-0c0a-4f5e-9d8a-3f1f2b6c7d8e",
  orderNumber: "GFT-20261101-4821",
  totalPaise: 129_900,
  items: [{ quantity: 2 }],
} as unknown as VendorOrder;

function enablePush() {
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
}

beforeEach(() => {
  mocks.claim.mockReset();
  mocks.finish.mockReset().mockResolvedValue(0);
  mocks.deliver.mockReset();
  mocks.logs = [];
  setLogSink((_level, line) => mocks.logs.push(line));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", "");
  vi.stubEnv("FCM_TEST_BASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  setLogSink(null);
});

describe("announcing a new kiosk order", () => {
  it("does nothing at all while push is off", async () => {
    await notifyNewKioskOrder(vendor, order);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("sends nothing when the order was already claimed or nobody registered a phone", async () => {
    enablePush();
    mocks.claim.mockResolvedValueOnce([]).mockResolvedValueOnce(null);

    await notifyNewKioskOrder(vendor, order);
    await notifyNewKioskOrder(vendor, order);

    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();
  });

  it("sends to every phone and forgets the tokens FCM rejected", async () => {
    enablePush();
    mocks.claim.mockResolvedValue([
      { tokenHash: "h1", token: "token-1" },
      { tokenHash: "h2", token: "token-2" },
      { tokenHash: "h3", token: "token-3" },
    ]);
    mocks.deliver
      .mockResolvedValueOnce("sent")
      .mockResolvedValueOnce("unregistered")
      .mockResolvedValueOnce("failed");

    await notifyNewKioskOrder(vendor, order);

    expect(mocks.claim).toHaveBeenCalledWith(vendor.id, order.id);
    expect(mocks.deliver).toHaveBeenCalledTimes(3);
    const tokens = mocks.deliver.mock.calls.map(([, message]) => message.token);
    expect(tokens).toEqual(["token-1", "token-2", "token-3"]);
    expect(mocks.finish).toHaveBeenCalledWith(vendor.id, order.id, {
      sent: 1,
      failed: 1,
      unregistered: ["h2"],
    });
    const summary = mocks.logs.find((line) => line.includes("push.order_alert"));
    expect(summary).toContain('"sent":1');
    expect(mocks.logs.join("\n")).not.toContain("token-1");
  });

  it("never throws, even when the database fails", async () => {
    enablePush();
    mocks.claim.mockRejectedValue(new Error("connection reset"));

    await expect(notifyNewKioskOrder(vendor, order)).resolves.toBeUndefined();
    expect(mocks.logs.join("\n")).toContain("push.order_alert_failed");
  });
});
