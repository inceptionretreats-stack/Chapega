import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfiguration } from "@/server/supabase/config";

type SupabaseAdminRuntime = {
  client?: SupabaseClient;
};

const runtimeKey = "__chapegaSupabaseAdminRuntime";
const runtime = globalThis as typeof globalThis & {
  [runtimeKey]?: SupabaseAdminRuntime;
};
const shared = runtime[runtimeKey] ?? (runtime[runtimeKey] = {});

// Storage calls can run while a tenant's row lock is held, so a stalled
// request must not hold that lock indefinitely.
const STORAGE_TIMEOUT_MS = 10_000;

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const timeout = AbortSignal.timeout(STORAGE_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

export function getSupabaseAdmin(): SupabaseClient {
  if (shared.client) return shared.client;
  const { projectUrl, secretKey } = getSupabaseConfiguration();
  shared.client = createClient(projectUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch: fetchWithTimeout },
  });
  return shared.client;
}
