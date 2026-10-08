import { beforeEach, describe, expect, it, vi } from "vitest";

type UserRow = {
  id: string;
  email: string;
  name: string;
  platform_role: "super_admin" | null;
  password_salt: string;
  password_hash: string;
  active: boolean;
  created_at: string;
};

const state = vi.hoisted(() => ({
  openTransactions: 0,
  transactionsDuringVerify: [] as number[],
  verifyCalls: [] as Array<{ salt: string; hash: string }>,
  users: new Map<string, UserRow>(),
  /** Simulates a password rotation that lands while the hash is computed. */
  rotateDuringVerify: false,
  writes: [] as string[],
}));

const userId = "11111111-1111-4111-8111-111111111111";
const vendorId = "00000000-0000-4000-8000-000000000001";

function baseUser(): UserRow {
  return {
    id: userId,
    email: "owner@example.com",
    name: "Owner",
    platform_role: "super_admin",
    password_salt: "user-salt",
    password_hash: "user-hash",
    active: true,
    created_at: "2026-09-18T00:00:00.000Z",
  };
}

vi.mock("server-only", () => ({}));
vi.mock("@/server/vendor/crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/vendor/crypto")>()),
  verifyPassword: async (password: string, salt: string, hash: string) => {
    state.transactionsDuringVerify.push(state.openTransactions);
    state.verifyCalls.push({ salt, hash });
    if (state.rotateDuringVerify) {
      const user = state.users.get("owner@example.com");
      if (user) state.users.set(user.email, { ...user, password_hash: "rotated-hash" });
    }
    return password === "correct-password" && hash === "user-hash";
  },
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
    begin: async <T,>(operation: (transaction: unknown) => Promise<T>) => {
      state.openTransactions += 1;
      const context = new Map<string, string>();
      const transaction = async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join("?").replace(/\s+/g, " ").trim();
        if (text.startsWith("select set_config")) {
          context.set(String(values[0]), String(values[1]));
          return [];
        }
        if (text.includes("from private.vendor_users") && text.includes("where email")) {
          const row = state.users.get(String(values[0]));
          return row ? [row] : [];
        }
        if (text.includes("from private.vendor_users") && text.includes("where id")) {
          const row = [...state.users.values()].find((user) => user.id === values[0]);
          return row ? [row] : [];
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
        if (/^(insert|delete|update)/.test(text)) state.writes.push(text.split(" ").slice(0, 3).join(" "));
        return [];
      };
      try {
        return await operation(transaction);
      } finally {
        state.openTransactions -= 1;
      }
    },
  }),
}));

import {
  authenticateSupabasePlatformLogin,
  authenticateSupabaseVendorLogin,
} from "@/server/vendor/supabase-auth";

function input(email: string, password: string) {
  return {
    email,
    password,
    dummySalt: "dummy-salt",
    dummyHash: "dummy-hash",
    tokenHash: "a".repeat(64),
    createdAt: "2026-10-08T10:00:00.000Z",
    expiresAt: "2026-10-08T10:30:00.000Z",
  };
}

beforeEach(() => {
  state.openTransactions = 0;
  state.transactionsDuringVerify = [];
  state.verifyCalls = [];
  state.rotateDuringVerify = false;
  state.writes = [];
  state.users = new Map([["owner@example.com", baseUser()]]);
});

describe.each([
  ["vendor", authenticateSupabaseVendorLogin],
  ["platform", authenticateSupabasePlatformLogin],
] as const)("Supabase %s sign-in", (_scope, authenticate) => {
  it("verifies the password with no database transaction open", async () => {
    const user = await authenticate(input("owner@example.com", "correct-password"));

    expect(user).not.toBeNull();
    expect(state.transactionsDuringVerify).toEqual([0]);
    expect(state.writes.some((write) => write.startsWith("insert into private.vendor_sessions"))).toBe(true);
  });

  it("still spends a full verification on unknown accounts", async () => {
    await expect(
      authenticate(input("nobody@example.com", "correct-password")),
    ).resolves.toBeNull();
    expect(state.verifyCalls).toEqual([{ salt: "dummy-salt", hash: "dummy-hash" }]);
    expect(state.transactionsDuringVerify).toEqual([0]);
  });

  it("refuses to create a session if the password changed during verification", async () => {
    state.rotateDuringVerify = true;

    await expect(
      authenticate(input("owner@example.com", "correct-password")),
    ).resolves.toBeNull();
    expect(state.writes.some((write) => write.includes("vendor_sessions"))).toBe(false);
  });
});
