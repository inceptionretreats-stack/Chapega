import { scryptSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorDatabase } from "@/server/vendor/database";

const memory = vi.hoisted(() => ({ database: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/config", () => ({
  usesSupabaseBackend: () => false,
  isSupabaseConfigurationAvailable: () => false,
}));
vi.mock("@/server/vendor/database", () => ({
  newAuditRecord: (actorId: string, action: string) => ({
    id: `audit-${action}`,
    actorId,
    action,
    entityType: "auth",
    entityId: actorId,
    vendorId: null,
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

import { authenticateVendorLogin } from "@/server/vendor/auth";
import { passwordHashNeedsRehash, verifyPassword } from "@/server/vendor/crypto";

const vendorId = "00000000-0000-4000-8000-000000000001";
const userId = "11111111-1111-4111-8111-111111111111";
const password = "an existing eight-plus password";
const salt = Buffer.alloc(16, 3).toString("base64");
/** Stored by the previous implementation: N=2^14, bare base64 key. */
const legacyHash = scryptSync(password, Buffer.from(salt, "base64"), 64, {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
}).toString("base64");

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
        id: userId,
        email: "owner@example.com",
        name: "Owner",
        platformRole: null,
        passwordSalt: salt,
        passwordHash: legacyHash,
        active: true,
        createdAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    memberships: [
      {
        vendorId,
        userId,
        role: "owner",
        active: true,
        isDefault: true,
        createdAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    sessions: [],
    products: [],
    orders: [],
    settings: [],
    audit: [],
  };
}

beforeEach(() => {
  memory.database = database();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VENDOR_EMAIL", "");
  vi.stubEnv("VENDOR_PASSWORD", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("vendor sign-in with a legacy password hash", () => {
  it("accepts the existing password and stores an upgraded hash", async () => {
    const login = await authenticateVendorLogin("owner@example.com", password);
    expect(login?.user.id).toBe(userId);

    const stored = (memory.database as VendorDatabase).users[0];
    expect(stored.passwordHash).toMatch(/^scrypt\$N=131072,r=8,p=1\$/);
    expect(passwordHashNeedsRehash(stored.passwordHash)).toBe(false);
    await expect(
      verifyPassword(password, stored.passwordSalt, stored.passwordHash),
    ).resolves.toBe(true);
  });

  it("leaves the hash alone when the password is wrong", async () => {
    await expect(
      authenticateVendorLogin("owner@example.com", "not the password at all"),
    ).resolves.toBeNull();
    expect((memory.database as VendorDatabase).users[0].passwordHash).toBe(legacyHash);
  });
});
