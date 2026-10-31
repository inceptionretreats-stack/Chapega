import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  placeKioskOrder: vi.fn(),
  runAfterResponse: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/vendor/service", () => ({ placeKioskOrder: mocks.placeKioskOrder }));
vi.mock("@/server/vendor/throttle", () => ({ assertKioskOrderAllowed: async () => {} }));
vi.mock("@/server/vendor/database", () => ({ DEFAULT_VENDOR_SLUG: "chapega" }));
vi.mock("@/server/http/after-response", () => ({ runAfterResponse: mocks.runAfterResponse }));

import { POST as scopedOrder } from "@/app/api/kiosk/[vendorSlug]/orders/route";
import { POST as defaultOrder } from "@/app/api/kiosk/orders/route";
import { VendorServiceError } from "@/server/vendor/errors";

const vendor = { id: "00000000-0000-4000-8000-000000000001", slug: "chapega" };
const order = { id: "5b9e1f9e-0c0a-4f5e-9d8a-3f1f2b6c7d8e", orderNumber: "GFT-20261101-4821" };

function submission() {
  return new NextRequest("http://localhost/api/kiosk/chapega/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      idempotencyKey: "4f1c2a7e-8a7b-4d63-9a6e-0d2f9c1b5e33",
      kioskName: "Main Entrance",
      customer: {},
      items: [{ productId: "mug", quantity: 1, giftWrapped: false }],
    }),
  });
}

const context = { params: Promise.resolve({ vendorSlug: "chapega" }) };

beforeEach(() => {
  mocks.placeKioskOrder.mockReset();
  mocks.runAfterResponse.mockReset();
});

describe("kiosk orders and new-order notifications", () => {
  it.each([
    ["the shop's kiosk", () => scopedOrder(submission(), context)],
    ["the default kiosk", () => defaultOrder(submission())],
  ])("%s announces a new order once, after answering", async (_name, post) => {
    mocks.placeKioskOrder.mockResolvedValue({ order, vendor, created: true });

    const response = await post();

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ order });
    expect(mocks.runAfterResponse).toHaveBeenCalledTimes(1);
    expect(mocks.runAfterResponse.mock.calls[0][0]).toBe("push.new_order");
  });

  it("does not announce a retry of the same order", async () => {
    mocks.placeKioskOrder.mockResolvedValue({ order, vendor, created: false });

    const response = await scopedOrder(submission(), context);

    expect(response.status).toBe(201);
    expect(mocks.runAfterResponse).not.toHaveBeenCalled();
  });

  it("does not announce an order that was refused", async () => {
    mocks.placeKioskOrder.mockRejectedValue(
      new VendorServiceError(409, "SHOP_PAUSED", "The shop has paused new kiosk orders."),
    );

    const response = await scopedOrder(submission(), context);

    expect(response.status).toBe(409);
    expect(mocks.runAfterResponse).not.toHaveBeenCalled();
  });
});
