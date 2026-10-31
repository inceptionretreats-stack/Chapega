import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getRequestVendorContext: vi.fn(),
  removeOrderCustomerDetails: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/vendor/auth", () => ({
  getRequestVendorContext: mocks.getRequestVendorContext,
}));
vi.mock("@/server/vendor/service", () => ({
  removeOrderCustomerDetails: mocks.removeOrderCustomerDetails,
}));

import { DELETE } from "@/app/api/vendor/orders/[orderId]/customer/route";
import { DELETE as scopedDelete } from "@/app/api/vendor/[vendorSlug]/orders/[orderId]/customer/route";

const access = { user: { id: "owner-1" }, vendor: { id: "vendor-1", slug: "chapega" } };

function request(body: unknown, origin = "http://localhost"): NextRequest {
  return new NextRequest("http://localhost/api/vendor/chapega/orders/order-1/customer", {
    method: "DELETE",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.getRequestVendorContext.mockReset().mockResolvedValue(access);
  mocks.removeOrderCustomerDetails.mockReset().mockResolvedValue({ id: "order-1", version: 3 });
});

describe("DELETE /api/vendor/:vendorSlug/orders/:orderId/customer", () => {
  it("removes the details for the order and version given", async () => {
    const response = await scopedDelete(request({ version: 2 }), {
      params: Promise.resolve({ vendorSlug: "chapega", orderId: "order-1" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ order: { id: "order-1", version: 3 } });
    expect(mocks.getRequestVendorContext).toHaveBeenCalledWith(expect.anything(), "chapega");
    expect(mocks.removeOrderCustomerDetails).toHaveBeenCalledWith("order-1", 2, access);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("works through the unscoped route for the session's shop", async () => {
    const response = await DELETE(request({ version: 2 }), {
      params: Promise.resolve({ orderId: "order-1" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.removeOrderCustomerDetails).toHaveBeenCalledWith("order-1", 2, access);
  });

  it("rejects cross-site requests and unexpected fields before touching the order", async () => {
    const params = Promise.resolve({ vendorSlug: "chapega", orderId: "order-1" });
    const crossSite = await scopedDelete(request({ version: 2 }, "https://attacker.example"), {
      params,
    });
    expect(crossSite.status).toBe(403);

    const extra = await scopedDelete(request({ version: 2, customerName: "x" }), { params });
    expect(extra.status).toBe(400);
    expect(mocks.removeOrderCustomerDetails).not.toHaveBeenCalled();
  });

  it("asks an anonymous caller to sign in", async () => {
    mocks.getRequestVendorContext.mockResolvedValue(null);
    const response = await scopedDelete(request({ version: 2 }), {
      params: Promise.resolve({ vendorSlug: "chapega", orderId: "order-1" }),
    });
    expect(response.status).toBe(401);
  });
});
