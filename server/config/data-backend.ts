/**
 * Build-time view of the data backend, for next.config.ts (which runs outside
 * the server bundle and therefore cannot import the server-only selector in
 * server/supabase/config.ts). The rules mirror getVendorDataBackend() exactly
 * - tests/unit/data-backend-selection.test.ts pins the two together - but this
 * version never throws: invalid combinations are refused at server startup.
 */
export type DataBackend = "local" | "supabase";

type Environment = Readonly<Record<string, string | undefined>>;

function present(env: Environment, name: string): boolean {
  return Boolean(env[name]?.trim());
}

export function selectVendorDataBackend(env: Environment): DataBackend {
  const configured = env.CHAPEGA_DATA_BACKEND?.trim();
  if (configured === "local" || configured === "supabase") return configured;
  if (configured) return "local";
  if (
    present(env, "SUPABASE_DATABASE_URL") &&
    present(env, "NEXT_PUBLIC_SUPABASE_URL") &&
    present(env, "SUPABASE_SECRET_KEY")
  ) {
    return "supabase";
  }
  if (env.NODE_ENV === "production" && env.ALLOW_LOCAL_VENDOR_BACKEND !== "true") {
    return "supabase";
  }
  return "local";
}

/** The Supabase project origin (https only), or undefined. */
export function supabaseProjectOrigin(env: Environment): string | undefined {
  const value = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
