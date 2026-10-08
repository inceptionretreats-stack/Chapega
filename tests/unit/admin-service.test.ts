import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  VendorAuditRecord,
  VendorDatabase,
  VendorDatabaseAccess,
} from "@/server/vendor/database";
import type { AdminAuthContext } from "@/server/admin/auth";

const memory = vi.hoisted(() => ({
  database: null as unknown,
  auditCounter: 0,
  readAccess: null as unknown,
  updateAccess: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/vendor/crypto", () => ({
  derivePasswordHash: async () => ({ salt: "new-salt", hash: "new-hash" }),
}));
vi.mock("@/server/vendor/database", () => ({
  newAuditRecord: (
    actorId: string,
    action: string,
    entityType: VendorAuditRecord["entityType"],
    entityId: string,
    vendorId: string | null,
  ): VendorAuditRecord => ({
    id: `audit-${++memory.auditCounter}`,
    actorId,
    action,
    entityType,
    entityId,
    vendorId,
    createdAt: new Date().toISOString(),
  }),
  readVendorDatabase: async (access: VendorDatabaseAccess) => {
    memory.readAccess = access;
    return structuredClone(memory.database);
  },
  updateVendorDatabase: async <T>(
    mutation: (database: VendorDatabase) => T | Promise<T>,
    access: VendorDatabaseAccess,
  ) => {
    memory.updateAccess = access;
    const draft = structuredClone(memory.database) as VendorDatabase;
    const result = await mutation(draft);
    memory.database = draft;
    return structuredClone(result);
  },
}));

import {
  createAdminVendor,
  getAdminBootstrap,
  updateAdminVendorStatus,
} from "@/server/admin/service";

const vendorId = "00000000-0000-4000-8000-000000000001";
const adminId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const platformHash = "platform-session-hash";

const context: AdminAuthContext = {
  user: {
    id: adminId,
    email: "admin@example.com",
    name: "Platform Admin",
    role: "super_admin",
  },
  sessionHash: platformHash,
};

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
        email: context.user.email,
        name: context.user.name,
        platformRole: "super_admin",
        passwordSalt: "salt",
        passwordHash: "hash",
        active: true,
        createdAt: "2026-09-18T00:00:00.000Z",
      },
      {
        id: ownerId,
        email: "owner@example.com",
        name: "Vendor Owner",
        platformRole: null,
        passwordSalt: "salt",
        passwordHash: "hash",
        active: true,
        createdAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    memberships: [
      {
        vendorId,
        userId: ownerId,
        role: "owner",
        active: true,
        isDefault: true,
        createdAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    sessions: [
      {
        idHash: platformHash,
        userId: adminId,
        scope: "platform",
        activeVendorId: null,
        createdAt: "2026-09-18T00:00:00.000Z",
        expiresAt: "2099-09-18T00:00:00.000Z",
      },
    ],
    products: [],
    orders: [],
    settings: [
      {
        vendorId,
        shopName: "Chapega.com",
        ownerWhatsAppNumber: "919876543210",
        defaultCountryCode: "91",
        kioskName: "Main kiosk",
        maxCartQuantity: 5,
        giftWrapFeePaise: 2_500,
        qrResetSeconds: 120,
        showPreviewLabel: false,
        storeOpen: true,
        lowStockThreshold: 3,
        version: 1,
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    audit: [],
  };
}

beforeEach(() => {
  memory.database = database();
  memory.auditCounter = 0;
  memory.readAccess = null;
  memory.updateAccess = null;
});

describe("platform administrator service", () => {
  it("derives overview data only through the platform session scope", async () => {
    const bootstrap = await getAdminBootstrap(context);
    expect(memory.readAccess).toEqual({ platformSessionHash: platformHash });
    expect(bootstrap.metrics).toEqual({
      totalVendors: 1,
      activeVendors: 1,
      orderCount: 0,
      productCount: 0,
    });
    expect(bootstrap.vendors[0].owner.email).toBe("owner@example.com");
  });

  it("rechecks platform role even when a vendor owner claims an admin context", async () => {
    const databaseState = memory.database as VendorDatabase;
    databaseState.sessions.push({
      idHash: "forged-platform-session",
      userId: ownerId,
      scope: "platform",
      activeVendorId: null,
      createdAt: "2026-09-18T00:00:00.000Z",
      expiresAt: "2099-09-18T00:00:00.000Z",
    });
    const forgedContext: AdminAuthContext = {
      user: {
        id: ownerId,
        email: "owner@example.com",
        name: "Vendor Owner",
        role: "super_admin",
      },
      sessionHash: "forged-platform-session",
    };

    await expect(getAdminBootstrap(forgedContext)).rejects.toMatchObject({
      status: 401,
      code: "ADMIN_AUTH_REQUIRED",
    });
  });

  it("creates a tenant, settings, and an initial owner without platform authority", async () => {
    const result = await createAdminVendor(context, {
      displayName: "Petal House",
      slug: "petal-house",
      ownerName: "Mira Owner",
      ownerEmail: "mira@example.com",
      ownerWhatsAppNumber: "+91 98765 43210",
      temporaryPassword: "TemporaryPass1",
    });
    const state = memory.database as VendorDatabase;
    const created = state.vendors.find((vendor) => vendor.slug === "petal-house");
    const owner = state.users.find((user) => user.email === "mira@example.com");

    expect(memory.updateAccess).toEqual({ platformSessionHash: platformHash });
    expect(created).toMatchObject({ status: "active", revision: 1 });
    expect(owner).toMatchObject({
      platformRole: null,
      passwordSalt: "new-salt",
      passwordHash: "new-hash",
    });
    expect(state.memberships).toContainEqual(
      expect.objectContaining({
        vendorId: created?.id,
        userId: owner?.id,
        role: "owner",
        active: true,
        isDefault: true,
      }),
    );
    expect(state.settings).toContainEqual(
      expect.objectContaining({
        vendorId: created?.id,
        shopName: "Petal House",
        ownerWhatsAppNumber: "919876543210",
      }),
    );
    expect(result.vendor.displayName).toBe("Petal House");
    expect(result.metrics.totalVendors).toBe(2);
  });

  it("suspends and reactivates a vendor with status-specific concurrency checks", async () => {
    const suspended = await updateAdminVendorStatus(context, vendorId, "suspended", "active");
    expect(suspended.vendor).toMatchObject({ status: "suspended", revision: 2 });
    expect(memory.updateAccess).toEqual({
      vendorId,
      platformSessionHash: platformHash,
    });

    const reactivated = await updateAdminVendorStatus(context, vendorId, "active");
    expect(reactivated.vendor).toMatchObject({ status: "active", revision: 3 });
    expect((memory.database as VendorDatabase).audit.map((record) => record.action)).toEqual([
      "platform.vendor.suspended",
      "platform.vendor.reactivated",
    ]);
  });
});
