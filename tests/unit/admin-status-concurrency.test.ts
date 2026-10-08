import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { VendorDatabase } from "@/server/vendor/database";

const memory = vi.hoisted(() => ({ database: null as unknown, counter: 0 }));
const adminId = "11111111-1111-4111-8111-111111111111";
const vendorId = "00000000-0000-4000-8000-000000000001";

vi.mock("server-only", () => ({}));
vi.mock("@/server/admin/auth", () => ({
  requireRequestAdmin: async () => ({
    user: { id: adminId, email: "admin@example.com", name: "Admin", role: "super_admin" },
    sessionHash: "platform-session",
  }),
}));
vi.mock("@/server/vendor/database", () => ({
  newAuditRecord: (actorId: string, action: string, entityType: string, entityId: string, vendor: string | null) => ({
    id: `audit-${++memory.counter}`,
    actorId,
    action,
    entityType,
    entityId,
    vendorId: vendor,
    createdAt: new Date().toISOString(),
  }),
  readVendorDatabase: async () => structuredClone(memory.database),
  updateVendorDatabase: async <T,>(mutation: (database: VendorDatabase) => T | Promise<T>) => {
    const draft = structuredClone(memory.database) as VendorDatabase;
    const result = await mutation(draft);
    memory.database = draft;
    return structuredClone(result);
  },
}));

import { PATCH } from "@/app/api/admin/vendors/[vendorId]/status/route";

function database(): VendorDatabase {
  return {
    version: 2,
    revision: 1,
    vendors: [
      {
        id: vendorId,
        slug: "chapega",
        displayName: "Chapega.com",
        status: "active",
        revision: 1,
        createdAt: "2026-09-18T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    users: [
      {
        id: adminId,
        email: "admin@example.com",
        name: "Admin",
        platformRole: "super_admin",
        passwordSalt: "salt",
        passwordHash: "hash",
        active: true,
        createdAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    memberships: [],
    sessions: [
      {
        idHash: "platform-session",
        userId: adminId,
        scope: "platform",
        activeVendorId: null,
        createdAt: "2026-09-18T00:00:00.000Z",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    ],
    products: [],
    orders: [],
    settings: [],
    audit: [],
  };
}

/** Every product edit or kiosk order bumps the vendor revision. */
function simulateShopActivity(times: number) {
  const state = memory.database as VendorDatabase;
  state.vendors[0] = { ...state.vendors[0], revision: state.vendors[0].revision + times };
}

function patch(body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/admin/vendors/${vendorId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ vendorId }) },
  );
}

beforeEach(() => {
  memory.database = database();
  memory.counter = 0;
});

describe("admin vendor status changes", () => {
  it("are not blocked by unrelated shop activity since the admin loaded the page", async () => {
    const revisionSeenByAdmin = 1;
    simulateShopActivity(6);

    const response = await patch({ status: "suspended", revision: revisionSeenByAdmin });

    expect(response.status).toBe(200);
    expect((memory.database as VendorDatabase).vendors[0].status).toBe("suspended");
  });

  it("still refuses a duplicate change from a second admin with a stale view", async () => {
    expect((await patch({ status: "suspended", revision: 1 })).status).toBe(200);

    const duplicate = await patch({ status: "suspended", revision: 1 });
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: { code: "VENDOR_STATUS_UNCHANGED" },
    });
    expect(
      (memory.database as VendorDatabase).audit.filter(
        (record) => record.action === "platform.vendor.suspended",
      ),
    ).toHaveLength(1);
  });

  it("accepts an explicit expected status and rejects one that is out of date", async () => {
    const ok = await patch({ status: "suspended", expectedStatus: "active" });
    expect(ok.status).toBe(200);

    const stale = await patch({ status: "active", expectedStatus: "active" });
    expect(stale.status).toBe(400);
  });
});
