import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  statements: [] as Array<{ text: string; values: unknown[]; lockHeld: boolean }>,
  lockHeld: false,
  openTransactions: 0,
  transactionsDuringVerify: [] as number[],
  evicted: [] as Array<{ id_hash: string }>,
  failAppSessions: null as null | { code: string },
}));

const userId = "11111111-1111-4111-8111-111111111111";
const vendorId = "00000000-0000-4000-8000-000000000001";

vi.mock("server-only", () => ({}));
vi.mock("@/server/vendor/crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/vendor/crypto")>()),
  verifyPassword: async (password: string) => {
    state.transactionsDuringVerify.push(state.openTransactions);
    return password === "correct-password";
  },
  passwordHashNeedsRehash: () => false,
}));
vi.mock("@/server/vendor/auth", () => ({
  vendorUserFromDatabase: (
    _database: unknown,
    user: { id: string; email: string },
    activeVendorId: string,
  ) => ({ id: user.id, email: user.email, activeVendor: { id: activeVendorId } }),
}));
vi.mock("@/server/supabase/postgres", () => ({
  getSupabasePostgres: () => ({
    begin: async <T>(operation: (transaction: unknown) => Promise<T>) => {
      state.openTransactions += 1;
      const transaction = async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join("?").replace(/\s+/g, " ").trim();
        state.statements.push({ text, values, lockHeld: state.lockHeld });
        if (text.includes("pg_advisory_xact_lock")) state.lockHeld = true;
        if (text.startsWith("select set_config")) return [];
        if (text.includes("from private.vendor_users")) {
          return [
            {
              id: userId,
              email: "owner@example.com",
              name: "Owner",
              platform_role: null,
              password_salt: "salt",
              password_hash: "hash",
              active: true,
              must_change_password: false,
              created_at: "2026-09-18T00:00:00.000Z",
            },
          ];
        }
        if (text.includes("from private.vendor_memberships")) {
          return [
            {
              vendor_id: vendorId,
              user_id: userId,
              role: "owner",
              active: true,
              is_default: true,
              created_at: "2026-09-18T00:00:00.000Z",
            },
          ];
        }
        if (text.includes("from private.vendors")) {
          return [
            {
              id: vendorId,
              slug: "chapega",
              display_name: "Chapega",
              status: "active",
              revision: 1,
              created_at: "2026-09-18T00:00:00.000Z",
              updated_at: "2026-09-18T00:00:00.000Z",
            },
          ];
        }
        if (text.includes("'vendor_app'") && state.failAppSessions) {
          throw Object.assign(
            new Error('column "device_hash" does not exist'),
            state.failAppSessions,
          );
        }
        if (text.includes("returning id_hash")) return state.evicted;
        return [];
      };
      Object.assign(transaction, {
        savepoint: async <S>(inner: (savepoint: unknown) => Promise<S>) => inner(transaction),
      });
      try {
        return await operation(transaction);
      } finally {
        state.openTransactions -= 1;
        state.lockHeld = false;
      }
    },
  }),
}));

import {
  authenticateSupabaseVendorAppLogin,
  authenticateSupabaseVendorLogin,
} from "@/server/vendor/supabase-auth";

const device = {
  hash: "d".repeat(64),
  platform: "android" as const,
  model: "Pixel 8",
  appVersion: "1.0.0+1",
  maxDevices: 3,
};

function input(password = "correct-password") {
  return {
    email: "owner@example.com",
    password,
    dummySalt: "dummy-salt",
    dummyHash: "dummy-hash",
    tokenHash: "a".repeat(64),
    createdAt: "2026-11-01T10:00:00.000Z",
    expiresAt: "2026-11-15T10:00:00.000Z",
  };
}

function writes() {
  return state.statements.filter(({ text }) => /^(insert|delete|update)/.test(text));
}

beforeEach(() => {
  state.statements = [];
  state.lockHeld = false;
  state.openTransactions = 0;
  state.transactionsDuringVerify = [];
  state.evicted = [];
  state.failAppSessions = null;
});

describe("Supabase sign-in from the Studio app", () => {
  it("verifies the password with no transaction open, then writes under the user lock", async () => {
    const result = await authenticateSupabaseVendorAppLogin({ ...input(), device });

    expect(result?.user).toMatchObject({ id: userId });
    expect(state.transactionsDuringVerify).toEqual([0]);
    expect(writes().every((statement) => statement.lockHeld)).toBe(true);
  });

  it("replaces this phone, keeps room for it among the others, and creates a vendor_app row", async () => {
    state.evicted = [{ id_hash: "b".repeat(64) }];
    const result = await authenticateSupabaseVendorAppLogin({ ...input(), device });

    const [sameDevice, eviction, insert] = writes();
    expect(sameDevice.text).toContain("session_scope = 'vendor_app'");
    expect(sameDevice.text).toContain("device_hash = ?");
    expect(sameDevice.values).toContain(device.hash);
    expect(eviction.text).toContain("offset ?");
    expect(eviction.values).toContain(2);
    expect(insert.text).toContain("insert into private.vendor_sessions");
    expect(insert.text).toContain("'vendor_app'");
    expect(insert.values).toEqual(
      expect.arrayContaining([device.hash, "android", "Pixel 8", "1.0.0+1", vendorId]),
    );
    expect(result?.signedOutDevices).toBe(1);
    // A phone never touches the person's Studio (browser) session.
    expect(writes().some(({ text }) => text.includes("session_scope = 'vendor'"))).toBe(false);
    const audit = writes().find(({ text }) => text.includes("private.audit_log"));
    expect(audit?.values).toContain("vendor.app.login");
  });

  it("leaves Studio sign-in exactly as before: it ends only Studio sessions", async () => {
    await authenticateSupabaseVendorLogin(input());

    const deletes = writes().filter(({ text }) => text.startsWith("delete"));
    expect(deletes).toHaveLength(1);
    expect(deletes[0].text).toContain("session_scope = 'vendor'");
    expect(writes().some(({ text }) => text.includes("vendor_app"))).toBe(false);
  });

  it("refuses a wrong password without opening a transaction", async () => {
    const result = await authenticateSupabaseVendorAppLogin({ ...input("wrong"), device });

    expect(result).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it.each(["42703", "42P01"])(
    "answers 503 MIGRATION_REQUIRED when the database is behind (%s)",
    async (code) => {
      state.failAppSessions = { code };

      await expect(
        authenticateSupabaseVendorAppLogin({ ...input(), device }),
      ).rejects.toMatchObject({ status: 503, code: "MIGRATION_REQUIRED" });
    },
  );
});
