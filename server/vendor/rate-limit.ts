import "server-only";

import { usesSupabaseBackend } from "@/server/supabase/config";
import { getSupabasePostgres } from "@/server/supabase/postgres";
import { VendorServiceError } from "@/server/vendor/errors";

type RateEntry = { count: number; resetAt: number };
const key = "__chapegaVendorRateLimits";
const globalRates = globalThis as typeof globalThis & {
  [key]?: Map<string, RateEntry>;
};
const rates = globalRates[key] ?? (globalRates[key] = new Map());
const MAX_BUCKETS = 2_000;

function pruneRates(now: number): void {
  for (const [bucket, entry] of rates) {
    if (entry.resetAt <= now) rates.delete(bucket);
  }
  while (rates.size >= MAX_BUCKETS) {
    const oldest = rates.keys().next().value as string | undefined;
    if (!oldest) break;
    rates.delete(oldest);
  }
}

export async function consumeRateLimit(
  bucket: string,
  maximum: number,
  windowMs: number,
): Promise<Readonly<{ allowed: boolean; retryAfterSeconds: number }>> {
  if (usesSupabaseBackend()) {
    try {
      const sql = getSupabasePostgres();
      await sql`
        delete from private.rate_limit_buckets
        where reset_at < now() - interval '1 day'
      `;
      const rows = await sql<
        Array<{ attempt_count: number | string; reset_at: Date | string }>
      >`
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
        retryAfterSeconds:
          count <= maximum
            ? 0
            : Math.max(1, Math.ceil((resetAt - Date.now()) / 1_000)),
      };
    } catch (error) {
      const unavailable = new VendorServiceError(
        503,
        "RATE_LIMIT_UNAVAILABLE",
        "Sign-in protection is temporarily unavailable. Please try again.",
      );
      unavailable.cause = error;
      throw unavailable;
    }
  }
  const now = Date.now();
  pruneRates(now);
  const existing = rates.get(bucket);
  if (!existing || existing.resetAt <= now) {
    rates.set(bucket, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= maximum) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1_000),
      ),
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function resetRateLimit(bucket: string): Promise<void> {
  if (usesSupabaseBackend()) {
    try {
      await getSupabasePostgres()`
        delete from private.rate_limit_buckets where bucket = ${bucket}
      `;
      return;
    } catch (error) {
      const unavailable = new VendorServiceError(
        503,
        "RATE_LIMIT_UNAVAILABLE",
        "Sign-in protection is temporarily unavailable. Please try again.",
      );
      unavailable.cause = error;
      throw unavailable;
    }
  }
  rates.delete(bucket);
}
