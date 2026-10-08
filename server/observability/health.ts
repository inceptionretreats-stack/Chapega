import "server-only";

import { getVendorDataBackend, type VendorDataBackend } from "@/server/supabase/config";
import { logger, serializeError } from "@/server/observability/logger";

export type ReadinessResult = Readonly<{
  ready: boolean;
  backend: VendorDataBackend | "unknown";
  checkedAt: string;
}>;

/** Probes may arrive every few seconds from several load balancers. */
const CACHE_MS = 5_000;
const CHECK_TIMEOUT_MS = 3_000;

type ReadinessCache = {
  result?: ReadinessResult;
  expiresAt: number;
  inFlight?: Promise<ReadinessResult>;
};

const cacheKey = "__chapegaReadinessCache";
const globalCache = globalThis as typeof globalThis & {
  [cacheKey]?: ReadinessCache;
};
const cache = globalCache[cacheKey] ?? (globalCache[cacheKey] = { expiresAt: 0 });

export function resetReadinessCache(): void {
  cache.result = undefined;
  cache.expiresAt = 0;
  cache.inFlight = undefined;
}

async function withTimeout<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Readiness check timed out after ${ms} ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeBackend(backend: VendorDataBackend): Promise<void> {
  if (backend === "supabase") {
    const { getSupabasePostgres } = await import("@/server/supabase/postgres");
    const sql = getSupabasePostgres();
    await sql`select 1 as ok`;
    return;
  }
  // The local adapter validates its checksummed snapshot (and recovers from
  // the backup) on first read, which is exactly what a request would need.
  const { readLocalVendorDatabase } = await import("@/server/vendor/database");
  await readLocalVendorDatabase();
}

async function runCheck(): Promise<ReadinessResult> {
  let backend: VendorDataBackend | "unknown" = "unknown";
  try {
    backend = getVendorDataBackend();
    await withTimeout(probeBackend(backend), CHECK_TIMEOUT_MS);
    return { ready: true, backend, checkedAt: new Date().toISOString() };
  } catch (error) {
    logger.error("health.readiness_failed", {
      backend,
      error: serializeError(error),
    });
    return { ready: false, backend, checkedAt: new Date().toISOString() };
  }
}

/** Readiness: is the selected data backend reachable right now? */
export async function checkReadiness(): Promise<ReadinessResult> {
  const now = Date.now();
  if (cache.result && cache.expiresAt > now) return cache.result;
  if (!cache.inFlight) {
    cache.inFlight = runCheck().then((result) => {
      cache.result = result;
      cache.expiresAt = Date.now() + CACHE_MS;
      cache.inFlight = undefined;
      return result;
    });
  }
  return cache.inFlight;
}
