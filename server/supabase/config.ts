import "server-only";

export type VendorDataBackend = "local" | "supabase";

type SupabaseConfiguration = Readonly<{
  databaseUrl: string;
  projectUrl: string;
  secretKey: string;
}>;

function trimmedEnvironmentValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getVendorDataBackend(): VendorDataBackend {
  const configured = trimmedEnvironmentValue("CHAPEGA_DATA_BACKEND");
  if (configured === "local") {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_VENDOR_BACKEND !== "true"
    ) {
      throw new Error(
        "The local vendor backend is disabled in production. Configure Supabase or explicitly set ALLOW_LOCAL_VENDOR_BACKEND=true for a private preview.",
      );
    }
    return configured;
  }
  if (configured === "supabase") return configured;
  if (configured) {
    throw new Error(
      "CHAPEGA_DATA_BACKEND must be either 'local' or 'supabase'.",
    );
  }

  const hasDatabaseUrl = Boolean(trimmedEnvironmentValue("SUPABASE_DATABASE_URL"));
  const hasProjectUrl = Boolean(trimmedEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL"));
  const hasSecretKey = Boolean(trimmedEnvironmentValue("SUPABASE_SECRET_KEY"));
  if (hasDatabaseUrl && hasProjectUrl && hasSecretKey) return "supabase";

  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_LOCAL_VENDOR_BACKEND !== "true"
  ) {
    return "supabase";
  }
  return "local";
}

export function getSupabaseConfiguration(): SupabaseConfiguration {
  const databaseUrl = trimmedEnvironmentValue("SUPABASE_DATABASE_URL");
  const projectUrl = trimmedEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = trimmedEnvironmentValue("SUPABASE_SECRET_KEY");

  const missing = [
    !databaseUrl ? "SUPABASE_DATABASE_URL" : null,
    !projectUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !secretKey ? "SUPABASE_SECRET_KEY" : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    throw new Error(
      `Supabase backend configuration is incomplete. Set ${missing.join(", ")}.`,
    );
  }

  if (!databaseUrl || !projectUrl || !secretKey) {
    throw new Error("Supabase backend configuration is incomplete.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(projectUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS URL.");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS.");
  }
  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("SUPABASE_DATABASE_URL must be a valid Postgres connection URL.");
  }
  if (!/^postgres(?:ql)?:$/i.test(parsedDatabaseUrl.protocol)) {
    throw new Error("SUPABASE_DATABASE_URL must be a Postgres connection URL.");
  }

  const databaseUser = decodeURIComponent(parsedDatabaseUrl.username);
  if (
    databaseUser !== "chapega_app" &&
    !databaseUser.startsWith("chapega_app.")
  ) {
    throw new Error(
      "SUPABASE_DATABASE_URL must use the restricted chapega_app role. Keep the postgres owner URL in SUPABASE_ADMIN_DATABASE_URL for migrations only.",
    );
  }

  return { databaseUrl, projectUrl: parsedUrl.origin, secretKey };
}

export function usesSupabaseBackend(): boolean {
  return getVendorDataBackend() === "supabase";
}

export function isSupabaseConfigurationAvailable(): boolean {
  try {
    getSupabaseConfiguration();
    return true;
  } catch {
    return false;
  }
}
