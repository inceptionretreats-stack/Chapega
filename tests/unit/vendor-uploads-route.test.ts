import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { VendorUser } from "@/types/vendor";

const mocks = vi.hoisted(() => ({
  deleteUnusedVendorImage: vi.fn(),
  getRequestVendorContext: vi.fn(),
  saveVendorImage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/vendor/auth", () => ({
  getRequestVendorContext: mocks.getRequestVendorContext,
}));
vi.mock("@/server/vendor/image-lifecycle", () => ({
  deleteUnusedVendorImage: mocks.deleteUnusedVendorImage,
  VENDOR_UPLOAD_PATH_PATTERN:
    /^\/vendor-products\/[0-9a-f-]{36}\/[a-f0-9]{64}\.(?:png|jpg)$/,
}));
vi.mock("@/server/vendor/images", () => ({
  saveVendorImage: mocks.saveVendorImage,
}));

import { DELETE, POST } from "@/app/api/vendor/uploads/route";
import { POST as scopedPost } from "@/app/api/vendor/[vendorSlug]/uploads/route";

const owner: VendorUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.com",
  name: "Owner",
  platformRole: "super_admin",
  role: "owner",
  activeVendor: {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "chapega",
    displayName: "Chapega.com",
    status: "active",
  },
  memberships: [],
  capabilities: {
    view_dashboard: true,
    manage_orders: true,
    manage_catalogue: true,
    manage_settings: true,
    manage_team: true,
  },
};
const hash = "b".repeat(64);
const imagePath = `/vendor-products/${owner.activeVendor.id}/${hash}.jpg`;

function access(user = owner) {
  return {
    user,
    vendor: user.activeVendor,
    membership: {
      vendorId: user.activeVendor.id,
      userId: user.id,
      role: user.role,
    },
    capabilities: user.capabilities,
  };
}

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/vendor/uploads", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.getRequestVendorContext.mockReset().mockResolvedValue(access());
  mocks.deleteUnusedVendorImage.mockReset().mockResolvedValue({
    path: imagePath,
  });
});

describe("DELETE /api/vendor/uploads", () => {
  it("allows an authenticated owner to delete an unused upload", async () => {
    const response = await DELETE(request({ path: imagePath }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      image: { path: imagePath },
    });
    expect(mocks.deleteUnusedVendorImage).toHaveBeenCalledWith(
      imagePath,
      owner.activeVendor.id,
    );
  });

  it("forbids staff before attempting deletion", async () => {
    const staff: VendorUser = {
      ...owner,
      role: "staff",
      capabilities: {
        ...owner.capabilities,
        manage_catalogue: false,
        manage_settings: false,
        manage_team: false,
      },
    };
    mocks.getRequestVendorContext.mockResolvedValueOnce(access(staff));

    const response = await DELETE(request({ path: imagePath }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(mocks.deleteUnusedVendorImage).not.toHaveBeenCalled();
  });

  it("rejects traversal, unsupported extensions, and extra fields", async () => {
    for (const body of [
      { path: "/vendor-products/../secret.png" },
      { path: `/vendor-products/${hash}.webp` },
      { path: imagePath, force: true },
    ]) {
      const response = await DELETE(request(body));
      expect(response.status).toBe(400);
    }

    expect(mocks.deleteUnusedVendorImage).not.toHaveBeenCalled();
  });

  it("rejects cross-site requests", async () => {
    const crossSiteRequest = new NextRequest(
      "http://localhost/api/vendor/uploads",
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: JSON.stringify({ path: imagePath }),
      },
    );

    const response = await DELETE(crossSiteRequest);

    expect(response.status).toBe(403);
    expect(mocks.getRequestVendorContext).not.toHaveBeenCalled();
    expect(mocks.deleteUnusedVendorImage).not.toHaveBeenCalled();
  });
});

describe("POST upload body validation", () => {
  const handlers = [
    ["unscoped", (request: NextRequest) => POST(request)],
    [
      "scoped",
      (request: NextRequest) =>
        scopedPost(request, { params: Promise.resolve({ vendorSlug: "chapega" }) }),
    ],
  ] as const;

  function upload(contentType: string, body: string): NextRequest {
    return new NextRequest("http://localhost/api/vendor/uploads", {
      method: "POST",
      headers: { "content-type": contentType, origin: "http://localhost" },
      body,
    });
  }

  for (const [label, handler] of handlers) {
    it(`answers 400 (not 500) for a non-multipart ${label} upload`, async () => {
      const response = await handler(upload("application/json", '{"image":"x"}'));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INVALID_UPLOAD" },
      });
      expect(mocks.saveVendorImage).not.toHaveBeenCalled();
    });

    it(`answers 400 for a malformed multipart ${label} upload`, async () => {
      const response = await handler(
        upload("multipart/form-data; boundary=missing", "not really multipart"),
      );

      expect(response.status).toBe(400);
      expect(mocks.saveVendorImage).not.toHaveBeenCalled();
    });
  }
});
