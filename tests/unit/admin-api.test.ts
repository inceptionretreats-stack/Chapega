import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AdminServiceError } from "@/server/admin/errors";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  bootstrap: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/admin/auth", () => ({
  requireRequestAdmin: mocks.requireAdmin,
}));
vi.mock("@/server/admin/service", () => ({
  getAdminBootstrap: mocks.bootstrap,
}));

import { GET } from "@/app/api/admin/bootstrap/route";

beforeEach(() => {
  mocks.requireAdmin.mockReset();
  mocks.bootstrap.mockReset();
});

describe("platform administrator API boundary", () => {
  it("does not accept an ordinary vendor cookie as platform authorization", async () => {
    mocks.requireAdmin.mockRejectedValue(
      new AdminServiceError(
        401,
        "ADMIN_AUTH_REQUIRED",
        "Your platform session has ended. Sign in again.",
      ),
    );
    const request = new NextRequest("http://localhost/api/admin/bootstrap", {
      headers: { cookie: "chapega_vendor_session=ordinary-vendor-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ADMIN_AUTH_REQUIRED",
        message: "Your platform session has ended. Sign in again.",
      },
    });
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });
});
