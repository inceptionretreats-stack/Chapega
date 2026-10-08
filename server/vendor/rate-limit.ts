import "server-only";

import { usesSupabaseBackend } from "@/server/supabase/config";
import { getSupabasePostgres } from "@/server/supabase/postgres";
import { VendorServiceError } from "@/server/vendor/errors";

/**
 * Rate-limit primitives. Policies (which buckets, which numbers) live in
 * server/vendor/throttle.ts.
 *
 * - Fixed windows (`consumeRateLimit`) count attempts per window.
 * - Progressive buckets (`reserveProgressiveAttempt`) never lock hard: after
 *   a number of free attempts each further attempt must wait an exponentially
 *   growing, capped delay since the previous one. They are reset on success.
 *
 * Shared buckets use Postgres when Supabase is the backend (so every instance
 * agrees) and an in-process map otherwise. `consumeMemoryRateLimit` is always
 * in-process, for per-instance flood protection on hot read paths.
 */

/** A 429 that carries its Retry-After value to apiError/adminApiError. */
export class RateLimitExceededError extends VendorServiceError {
  constructor(
    readonly retryAfterSeconds: number,
    message = "Too many requests. Please wait a moment and try again.",
  ) {
    super(429, "RATE_LIMITED", message);
    this.name = "RateLimitExceededError";
  }
}

export type RateLimitResult = Readonly<{
  allowed: boolean;
  retryAfterSeconds: number;
}>;

type RateEntry = { count: number; resetAt: number; lastAt: number };
const key = "__chapegaVendorRateLimits";
const globalRates = globalThis as typeof globalThis & {
  [key]?: Map<string, RateEntry>;
};
const rates = globalRates[key] ?? (globalRates[key] = new Map());
/**
 * Bounded so a flood of distinct keys cannot exhaust memory. The login
 * safety cap limits how fast new keys can be created, so evicting a live
 * account bucket this way would take far longer than the bucket's decay.
 */
const MAX_BUCKETS = 20_000;

/** Forget all in-process buckets (tests and local tooling only). */
export function clearMemoryRateLimits(): void {
  rates.clear();
}

function pruneRates(now: number): void {
  if (rates.size < MAX_BUCKETS) return;
  for (const [bucket, entry] of rates) {
    if (entry.resetAt <= now) rates.delete(bucket);
  }
  while (rates.size >= MAX_BUCKETS) {
    const oldest = rates.keys().next().value as string | undefined;
    if (!oldest) break;
    rates.delete(oldest);
  }
}

function unavailable(error: unknown): VendorServiceError {
  const failure = new VendorServiceError(
    503,
    "RATE_LIMIT_UNAVAILABLE",
    "Sign-in protection is temporarily unavailable. Please try again.",
  );
  failure.cause = error;
  return failure;
}

function secondsUntil(timestamp: number, now: number): number {
  return Math.max(1, Math.ceil((timestamp - now) / 1_000));
}

/** Fixed window, always in this process. */
export function consumeMemoryRateLimit(
  bucket: string,
  maximum: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  pruneRates(now);
  const existing = rates.get(bucket);
  if (!existing || existing.resetAt <= now) {
    rates.set(bucket, { count: 1, resetAt: now + windowMs, lastAt: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= maximum) {
    return { allowed: false, retryAfterSeconds: secondsUntil(existing.resetAt, now) };
  }
  existing.count += 1;
  existing.lastAt = now;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Fixed window, shared across instances when Supabase is the backend. */
export async function consumeRateLimit(
  bucket: string,
  maximum: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (!usesSupabaseBackend()) {
    return consumeMemoryRateLimit(bucket, maximum, windowMs);
  }
  try {
    const sql = getSupabasePostgres();
    await sql`
      delete from private.rate_limit_buckets
      where reset_at < now() - interval '1 day'
    `;
    const rows = await sql<Array<{ attempt_count: number | string; reset_at: Date | string }>>`
      insert into private.rate_limit_buckets (bucket, attempt_count, reset_at)
      values (
        ${bucket},
        1,
        now() + (${windowMs} * interval '1 millisecond')
      )
      on conflict (bucket) do update set
        attempt_count = case
          when private.rate_limit_buckets.reset_at <= now() then 1
          else private.rate_limit_buckets.attempt_count + 1
        end,
        reset_at = case
          when private.rate_limit_buckets.reset_at <= now()
            then now() + (${windowMs} * interval '1 millisecond')
          else private.rate_limit_buckets.reset_at
        end
      returning attempt_count, reset_at
    `;
    const count = Number(rows[0]?.attempt_count ?? maximum + 1);
    const resetAt = new Date(rows[0]?.reset_at ?? Date.now() + windowMs).getTime();
    return {
      allowed: count <= maximum,
      retryAfterSeconds: count <= maximum ? 0 : secondsUntil(resetAt, Date.now()),
    };
  } catch (error) {
    throw unavailable(error);
  }
}

/** Give back one attempt (e.g. a successful sign-in must not count). */
export async function refundRateLimit(bucket: string): Promise<void> {
  if (!usesSupabaseBackend()) {
    refundMemoryRateLimit(bucket);
    return;
  }
  try {
    await getSupabasePostgres()`
      update private.rate_limit_buckets
      set attempt_count = greatest(attempt_count - 1, 0)
      where bucket = ${bucket} and reset_at > now()
    `;
  } catch (error) {
    throw unavailable(error);
  }
}

export function refundMemoryRateLimit(bucket: string): void {
  const existing = rates.get(bucket);
  if (existing && existing.count > 0) existing.count -= 1;
}

export async function resetRateLimit(bucket: string): Promise<void> {
  if (!usesSupabaseBackend()) {
    rates.delete(bucket);
    return;
  }
  try {
    await getSupabasePostgres()`
      delete from private.rate_limit_buckets where bucket = ${bucket}
    `;
  } catch (error) {
    throw unavailable(error);
  }
}

export type ProgressivePolicy = Readonly<{
  /** Attempts allowed back-to-back before any delay applies. */
  freeAttempts: number;
  /** Delay before the first throttled attempt; doubles for each one after. */
  baseDelayMs: number;
  /** Upper bound for the delay; there is never a longer lockout. */
  maxDelayMs: number;
  /** The streak is forgotten this long after the last attempt. */
  decayMs: number;
}>;

export type ProgressiveState = Readonly<{
  count: number;
  lastAt: number;
  resetAt: number;
}>;

export function progressiveDelayMs(attempts: number, policy: ProgressivePolicy): number {
  if (attempts < policy.freeAttempts) return 0;
  const exponent = Math.min(30, attempts - policy.freeAttempts);
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** exponent);
}

/**
 * Pure decision for a progressive bucket. Attempts are counted when they are
 * reserved (not when they fail) so a burst of parallel requests cannot all
 * slip through before the first failure is recorded.
 */
export function decideProgressiveAttempt(
  state: ProgressiveState | null,
  now: number,
  policy: ProgressivePolicy,
): Readonly<{ allowed: boolean; retryAfterSeconds: number; next: ProgressiveState | null }> {
  const live = state && state.resetAt > now ? state : null;
  const attempts = live?.count ?? 0;
  const delay = progressiveDelayMs(attempts, policy);
  if (live && delay > 0 && now < live.lastAt + delay) {
    return {
      allowed: false,
      retryAfterSeconds: secondsUntil(live.lastAt + delay, now),
      next: null,
    };
  }
  return {
    allowed: true,
    retryAfterSeconds: 0,
    next: { count: attempts + 1, lastAt: now, resetAt: now + policy.decayMs },
  };
}

export async function reserveProgressiveAttempt(
  bucket: string,
  policy: ProgressivePolicy,
): Promise<RateLimitResult> {
  if (!usesSupabaseBackend()) {
    const now = Date.now();
    pruneRates(now);
    const existing = rates.get(bucket) ?? null;
    const decision = decideProgressiveAttempt(existing, now, policy);
    if (decision.next) rates.set(bucket, { ...decision.next });
    return { allowed: decision.allowed, retryAfterSeconds: decision.retryAfterSeconds };
  }
  try {
    return await getSupabasePostgres().begin(async (transaction) => {
      // Seed an already-expired row so the row lock below always has a target.
      await transaction`
        insert into private.rate_limit_buckets
          (bucket, attempt_count, reset_at, updated_at)
        values (${bucket}, 0, now() - interval '1 second', now() - interval '1 day')
        on conflict (bucket) do nothing
      `;
      const [row] = await transaction<
        Array<{
          attempt_count: number | string;
          reset_at: Date | string;
          updated_at: Date | string;
          now: Date | string;
        }>
      >`
        select attempt_count, reset_at, updated_at, now() as now
        from private.rate_limit_buckets
        where bucket = ${bucket}
        for update
      `;
      const now = new Date(row?.now ?? Date.now()).getTime();
      const state: ProgressiveState | null = row
        ? {
            count: Number(row.attempt_count),
            lastAt: new Date(row.updated_at).getTime(),
            resetAt: new Date(row.reset_at).getTime(),
          }
        : null;
      const decision = decideProgressiveAttempt(state, now, policy);
      if (decision.next) {
        await transaction`
          update private.rate_limit_buckets
          set attempt_count = ${decision.next.count},
              updated_at = ${new Date(decision.next.lastAt).toISOString()},
              reset_at = ${new Date(decision.next.resetAt).toISOString()}
          where bucket = ${bucket}
        `;
      }
      return {
        allowed: decision.allowed,
        retryAfterSeconds: decision.retryAfterSeconds,
      };
    });
  } catch (error) {
    throw unavailable(error);
  }
}
