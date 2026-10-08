import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorDatabase } from "@/server/vendor/database";

const memory = vi.hoisted(() => ({
  database: null as unknown,
  auditCounter: 0,
  inMutation: false,
  verifiedInsideMutation: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/config", () => ({
  usesSupabaseBackend: () => false,
}));
vi.mock("@/server/admin/config", () => ({
  getAdminCredentialConfiguration: () => ({
    available: true,
    preview: false,
    credentials: null,
  }),
}));
vi.mock("@/server/vendor/crypto", () => ({
  randomToken: () => "test-admin-token",
  sha256: (value: string) => `hash:${value}`,
  // The stored hash "matches" the published preview and placeholder passwords
  // too, modelling an account that still has one of them in production.
  verifyPassword: async (password: string) => {
    if (memory.inMutation) memory.verifiedInsideMutation = true;
    return (
      password === "CorrectPassword1" ||
      password === "Chapega@2026" ||
      password === "replace-with-a-long-unique-password"
    );
  },
}));
vi.mock("@/server/vendor/database", () => ({
  newAuditRecord: (
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    vendorId: string | null,
  ) => ({
    id: `audit-${++memory.auditCounter}`,
    actorId,
    action,
    entityType,
    entityId,
    vendorId,
    createdAt: new Date().toISOString(),
  }),
  readLocalVendorDatabase: async () => structuredClone(memory.database),
  updateLocalVendorDatabase: async <T>(
    mutation: (database: VendorDatabase) => T | Promise<T>,
  ) => {
    const draft = structuredClone(memory.database) as VendorDatabase;
    memory.inMutation = true;
    let result: T;
    try {
      result = await mutation(draft);
    } finally {
      memory.inMutation = false;
    }
    memory.database = draft;
    return structuredClone(result);
  },
}));

import {
  ADMIN_SESSION_COOKIE,
  authenticateAdminLogin,
  destroyAdminSession,
  getAdminByToken,
} from "@/server/admin/auth";

const adminId = "11111111-1111-4111-8111-111111111111";
const vendorUserId = "22222222-2222-4222-8222-222222222222";
const vendorId = "00000000-0000-4000-8000-000000000001";

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
        name: "Platform Admin",
        platformRole: "super_admin",
        passwordSalt: "salt",
        passwordHash: "hash",
        active: true,
        createdAt: "2026-09-18T00:00:00.000Z",
      },
      {
        id: vendorUserId,
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
        userId: vendorUserId,
        role: "owner",
        active: true,
        isDefault: true,
        createdAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    sessions: [
      {
        idHash: "hash:vendor-token",
        userId: vendorUserId,
        scope: "vendor",
        activeVendorId: vendorId,
        createdAt: "2026-09-18T00:00:00.000Z",
        expiresAt: "2099-09-18T00:00:00.000Z",
      },
    ],
    products: [],
    orders: [],
    settings: [],
    audit: [],
  };
}

beforeEach(() => {
  memory.database = database();
  memory.auditCounter = 0;
});

describe("platform administrator authentication", () => {
  it("uses a separate cookie and never upgrades an owner membership", async () => {
    expect(ADMIN_SESSION_COOKIE).toBe("chapega_admin_session");
    expect(ADMIN_SESSION_COOKIE).not.toBe("chapega_vendor_session");

    await expect(
      authenticateAdminLogin("owner@example.com", "CorrectPassword1"),
    ).resolves.toBeNull();
    expect(
      (memory.database as VendorDatabase).sessions.filter(
        (session) => session.scope === "platform",
      ),
    ).toHaveLength(0);
  });

  it("creates and resolves only a platform-scoped super-admin session", async () => {
    const login = await authenticateAdminLogin(
      "admin@example.com",
      "CorrectPassword1",
    );

    expect(login?.token).toBe("test-admin-token");
    expect(login?.user.role).toBe("super_admin");
    expect(
      (memory.database as VendorDatabase).sessions.find(
        (session) => session.idHash === "hash:test-admin-token",
      ),
    ).toMatchObject({
      userId: adminId,
      scope: "platform",
      activeVendorId: null,
    });
    await expect(getAdminByToken("vendor-token")).resolves.toBeNull();
    await expect(getAdminByToken("test-admin-token")).resolves.toMatchObject({
      user: { id: adminId, role: "super_admin" },
      sessionHash: "hash:test-admin-token",
    });
  });

  it("hashes the password outside the serialized local write queue", async () => {
    memory.verifiedInsideMutation = false;
    await expect(
      authenticateAdminLogin("admin@example.com", "CorrectPassword1"),
    ).resolves.not.toBeNull();
    await expect(
      authenticateAdminLogin("nobody@example.com", "CorrectPassword1"),
    ).resolves.toBeNull();
    expect(memory.verifiedInsideMutation).toBe(false);
  });

  it("destroys the platform session without touching vendor sessions", async () => {
    await authenticateAdminLogin("admin@example.com", "CorrectPassword1");
    await destroyAdminSession("test-admin-token");

    expect(
      (memory.database as VendorDatabase).sessions.map((session) => session.scope),
    ).toEqual(["vendor"]);
  });
});

describe("platform administrator credential guard", () => {
  function promotePreviewOwner(): void {
    const state = memory.database as VendorDatabase;
    state.users = state.users.map((user) =>
      user.id === adminId ? { ...user, email: "owner@chapega.com" } : user,
    );
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects the published preview pair in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_VENDOR_PREVIEW_LOGIN", "");
    promotePreviewOwner();

    await expect(
      authenticateAdminLogin("owner@chapega.com", "Chapega@2026"),
    ).resolves.toBeNull();
    expect(
      (memory.database as VendorDatabase).sessions.some(
        (session) => session.scope === "platform",
      ),
    ).toBe(false);
  });

  it("always rejects the .env.example placeholder password", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(
      authenticateAdminLogin("admin@example.com", "replace-with-a-long-unique-password"),
    ).resolves.toBeNull();
  });
});
