import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

async function loadConfiguration() {
  vi.resetModules();
  return import("@/server/supabase/config");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Supabase backend selection", () => {
  it("keeps local development explicit", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CHAPEGA_DATA_BACKEND", "local");
    const { getVendorDataBackend } = await loadConfiguration();
    expect(getVendorDataBackend()).toBe("local");
  });

  it("rejects an accidental local production backend", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHAPEGA_DATA_BACKEND", "local");
    vi.stubEnv("ALLOW_LOCAL_VENDOR_BACKEND", "false");
    const { getVendorDataBackend } = await loadConfiguration();
    expect(() => getVendorDataBackend()).toThrow(/disabled in production/i);
  });

  it("allows a clearly opted-in private production preview", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHAPEGA_DATA_BACKEND", "local");
    vi.stubEnv("ALLOW_LOCAL_VENDOR_BACKEND", "true");
    const { getVendorDataBackend } = await loadConfiguration();
    expect(getVendorDataBackend()).toBe("local");
  });

  it("selects Supabase when all cloud values are present", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CHAPEGA_DATA_BACKEND", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co/");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    vi.stubEnv(
      "SUPABASE_DATABASE_URL",
      "postgresql://chapega_app.example:password@example.pooler.supabase.com:6543/postgres",
    );
    const { getSupabaseConfiguration, getVendorDataBackend } = await loadConfiguration();
    expect(getVendorDataBackend()).toBe("supabase");
    expect(getSupabaseConfiguration()).toEqual({
      databaseUrl:
        "postgresql://chapega_app.example:password@example.pooler.supabase.com:6543/postgres",
      projectUrl: "https://example.supabase.co",
      secretKey: "sb_secret_test",
    });
  });

  it("rejects using the Postgres owner as the runtime connection", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    vi.stubEnv(
      "SUPABASE_DATABASE_URL",
      "postgresql://postgres.example:password@example.pooler.supabase.com:6543/postgres",
    );
    const { getSupabaseConfiguration } = await loadConfiguration();
    expect(() => getSupabaseConfiguration()).toThrow(/chapega_app role/i);
  });

  it("rejects incomplete explicit Supabase configuration", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CHAPEGA_DATA_BACKEND", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_DATABASE_URL", "");
    const { getSupabaseConfiguration } = await loadConfiguration();
    expect(() => getSupabaseConfiguration()).toThrow(/SUPABASE_DATABASE_URL, SUPABASE_SECRET_KEY/);
  });
});
