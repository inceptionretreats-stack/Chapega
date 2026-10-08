import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  supabase: false,
  row: null as null | {
    attempt_count: number;
    reset_at: Date;
    updated_at: Date;
  },
  queries: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/config", () => ({
  usesSupabaseBackend: () => state.supabase,
}));
vi.mock("@/server/supabase/postgres", () => ({
  getSupabasePostgres: () => ({
    begin: async <T>(operation: (transaction: unknown) => Promise<T>) => {
      const transaction = async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join("?").replace(/\s+/g, " ").trim();
        state.queries.push(text);
        if (text.startsWith("insert")) {
          state.row ??= {
            attempt_count: 0,
            reset_at: new Date(Date.now() - 1_000),
            updated_at: new Date(Date.now() - 86_400_000),
          };
          return [];
        }
        if (text.startsWith("select")) {
          return state.row ? [{ ...state.row, now: new Date() }] : [];
        }
        if (text.startsWith("update") && state.row) {
          state.row = {
            attempt_count: Number(values[0]),
            updated_at: new Date(String(values[1])),
            reset_at: new Date(String(values[2])),
          };
        }
        return [];
      };
      return operation(transaction);
    },
  }),
}));

import {
  clearMemoryRateLimits,
  consumeMemoryRateLimit,
  decideProgressiveAttempt,
  progressiveDelayMs,
  refundMemoryRateLimit,
  reserveProgressiveAttempt,
  type ProgressivePolicy,
} from "@/server/vendor/rate-limit";

const policy: ProgressivePolicy = {
  freeAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  decayMs: 60_000,
};

beforeEach(() => {
  clearMemoryRateLimits();
  state.supabase = false;
  state.row = null;
  state.queries = [];
});

describe("progressive delay", () => {
  it("doubles after the free attempts and never exceeds the cap", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 40].map((n) => progressiveDelayMs(n, policy))).toEqual([
      0, 0, 0, 1_000, 2_000, 4_000, 8_000, 8_000,
    ]);
  });

  it("forgets a streak after the decay period", () => {
    const decision = decideProgressiveAttempt(
      { count: 30, lastAt: 0, resetAt: 60_000 },
      60_001,
      policy,
    );
    expect(decision).toMatchObject({ allowed: true, next: { count: 1 } });
  });

  it("counts reserved attempts so a parallel burst cannot exceed the free attempts", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => reserveProgressiveAttempt("burst", policy)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(policy.freeAttempts);
    expect(results.find((result) => !result.allowed)?.retryAfterSeconds).toBe(1);
  });

  it("uses a row lock and the database clock in Supabase mode", async () => {
    state.supabase = true;
    for (let attempt = 0; attempt < policy.freeAttempts; attempt += 1) {
      await expect(reserveProgressiveAttempt("db-bucket", policy)).resolves.toMatchObject({
        allowed: true,
      });
    }
    await expect(reserveProgressiveAttempt("db-bucket", policy)).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(state.row?.attempt_count).toBe(policy.freeAttempts);
    expect(state.queries.some((query) => query.endsWith("for update"))).toBe(true);
  });
});

describe("fixed windows", () => {
  it("refunds an attempt so successes do not count", () => {
    for (let index = 0; index < 3; index += 1) {
      expect(consumeMemoryRateLimit("window", 3, 60_000).allowed).toBe(true);
      refundMemoryRateLimit("window");
    }
    expect(consumeMemoryRateLimit("window", 3, 60_000).allowed).toBe(true);
    expect(consumeMemoryRateLimit("window", 3, 60_000).allowed).toBe(true);
    expect(consumeMemoryRateLimit("window", 3, 60_000).allowed).toBe(true);
    expect(consumeMemoryRateLimit("window", 3, 60_000)).toMatchObject({
      allowed: false,
    });
  });
});
