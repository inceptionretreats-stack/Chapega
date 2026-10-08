import { beforeEach, describe, expect, it, vi } from "vitest";

const MINUTE = 60_000;
const NOW = Date.parse("2026-10-08T10:00:00.000Z");

const state = vi.hoisted(() => ({
  session: null as null | { created_at: string; expires_at: string },
  updates: [] as Array<{ expiresAt: string; sessionHash: string | undefined }>,
  updateReturnsRows: true,
  logs: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/vendor/auth", () => ({
  vendorUserFromDatabase: (_db: unknown, user: { id: string }) => ({ id: user.id }),
}));
vi.mock("@/server/supabase/postgres", () => ({
  getSupabasePostgres: () => ({
    begin: async <T,>(operation: (transaction: unknown) => Promise<T>) => {
      const context = new Map<string, string>();
      const transaction = async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join("?").replace(/\s+/g, " ").trim();
        if (text.startsWith("select set_config")) {
          context.set(String(values[0]), String(values[1]));
          return [];
        }
        if (text.includes("from private.vendor_sessions")) {
          return state.session
            ? [{
                user_id: "11111111-1111-4111-8111-111111111111",
                active_vendor_id: "00000000-0000-4000-8000-000000000001",
                ...state.session,
                now: new Date(NOW).toISOString(),
              }]
            : [];
        }
        if (text.startsWith("update private.vendor_sessions")) {
          state.updates.push({
            expiresAt: String(values[0]),
            sessionHash: context.get("app.session_hash"),
          });
          return state.updateReturnsRows ? [{ id_hash: values[1] }] : [];
        }
        if (text.includes("from private.vendor_users")) {
          return [{
            id: "11111111-1111-4111-8111-111111111111",
            email: "owner@example.com",
            name: "Owner",
            platform_role: "super_admin",
            password_salt: "s",
            password_hash: "h",
            active: true,
            created_at: "2026-09-18T00:00:00.000Z",
          }];
        }
        if (text.includes("from private.vendor_memberships")) return [];
        if (text.includes("from private.vendors")) {
          return [{
            id: "00000000-0000-4000-8000-000000000001",
            slug: "chapega",
            display_name: "Chapega",
            status: "active",
            revision: 1,
            created_at: "2026-09-18T00:00:00.000Z",
            updated_at: "2026-09-18T00:00:00.000Z",
          }];
        }
        return [];
      };
      Object.assign(transaction, {
        savepoint: async <S,>(inner: (savepoint: unknown) => Promise<S>) => inner(transaction),
      });
      return operation(transaction);
    },
  }),
}));

import {
  getSupabasePlatformUserByToken,
  getSupabaseVendorUserByToken,
} from "@/server/vendor/supabase-auth";
import { setLogSink } from "@/server/observability/logger";

const tokenHash = "b".repeat(64);
const vendorRules = { idleMs: 30 * MINUTE, absoluteMs: 12 * 60 * MINUTE };

function session(createdMinutesAgo: number, expiresInMinutes: number) {
  return {
    created_at: new Date(NOW - createdMinutesAgo * MINUTE).toISOString(),
    expires_at: new Date(NOW + expiresInMinutes * MINUTE).toISOString(),
  };
}

beforeEach(() => {
  state.updates = [];
  state.updateReturnsRows = true;
  state.logs = [];
  setLogSink((_level, line) => state.logs.push(line));
});

describe("Supabase session sliding", () => {
  it("slides the idle deadline using the database clock and the presented session", async () => {
    state.session = session(10, 20);

    await expect(
      getSupabaseVendorUserByToken(tokenHash, undefined, vendorRules),
    ).resolves.not.toBeNull();

    expect(state.updates).toEqual([
      { expiresAt: new Date(NOW + 30 * MINUTE).toISOString(), sessionHash: tokenHash },
    ]);
  });

  it("never extends past the absolute lifetime and rejects sessions beyond it", async () => {
    state.session = session(12 * 60 - 10, 5);
    await getSupabaseVendorUserByToken(tokenHash, undefined, vendorRules);
    expect(state.updates[0]?.expiresAt).toBe(new Date(NOW + 10 * MINUTE).toISOString());

    state.updates = [];
    state.session = session(12 * 60 + 1, 5); // a pre-idle-timeout session past 12 h
    await expect(
      getSupabaseVendorUserByToken(tokenHash, undefined, vendorRules),
    ).resolves.toBeNull();
    expect(state.updates).toEqual([]);
  });

  it("authenticates a background refresh without sliding the deadline (AUD-17)", async () => {
    state.session = session(10, 20);
    await expect(
      getSupabaseVendorUserByToken(tokenHash, undefined, vendorRules, false),
    ).resolves.not.toBeNull();
    await expect(
      getSupabasePlatformUserByToken(
        tokenHash,
        { idleMs: 15 * MINUTE, absoluteMs: 8 * 60 * MINUTE },
        false,
      ),
    ).resolves.not.toBeNull();
    expect(state.updates).toEqual([]);
  });

  it("skips the write when the deadline is already current", async () => {
    state.session = session(0, 30);
    await getSupabaseVendorUserByToken(tokenHash, undefined, vendorRules);
    expect(state.updates).toEqual([]);
  });

  it("warns once when row-level security denies the refresh", async () => {
    state.updateReturnsRows = false;
    state.session = session(10, 5);
    await getSupabasePlatformUserByToken(tokenHash, { idleMs: 15 * MINUTE, absoluteMs: 8 * 60 * MINUTE });
    await getSupabasePlatformUserByToken(tokenHash, { idleMs: 15 * MINUTE, absoluteMs: 8 * 60 * MINUTE });

    expect(state.updates).toHaveLength(2);
    expect(state.logs.filter((line) => line.includes("auth.session_refresh_denied"))).toHaveLength(1);
  });
});
