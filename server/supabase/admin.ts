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

export function getSupabaseAdmin(): SupabaseClient {
  if (shared.client) return shared.client;
  const { projectUrl, secretKey } = getSupabaseConfiguration();
  shared.client = createClient(projectUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return shared.client;
}
