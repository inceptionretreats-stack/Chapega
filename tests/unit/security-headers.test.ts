import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadConfig(env: Record<string, string> = {}) {
  for (const name of [
    "CHAPEGA_DATA_BACKEND",
    "SUPABASE_DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
  ]) {
    vi.stubEnv(name, env[name] ?? "");
  }
  vi.stubEnv("NODE_ENV", env.NODE_ENV ?? "production");
  vi.resetModules();
  const config = (await import("@/next.config")).default;
  const rules = (await config.headers?.()) ?? [];
  const global = rules.find((rule) => rule.source === "/(.*)");
  const headers = new Map(
    (global?.headers ?? []).map((header) => [header.key.toLowerCase(), header.value]),
  );
  return { config, headers, list: global?.headers ?? [] };
}

function directives(policy: string | undefined): Map<string, string[]> {
  return new Map(
    (policy ?? "")
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [name, values]),
  );
}

describe("security headers", () => {
  it("does not advertise the framework", async () => {
    const { config } = await loadConfig();
    expect(config.poweredByHeader).toBe(false);
  });

  it("sends the baseline hardening headers on every route", async () => {
    const { headers } = await loadConfig();

    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
  });

  it("enforces a single Next.js-compatible content security policy", async () => {
    const { headers, list } = await loadConfig();
    const policy = directives(headers.get("content-security-policy"));

    expect(list.filter((header) => /^content-security-policy/i.test(header.key))).toHaveLength(1);
    expect(headers.has("content-security-policy-report-only")).toBe(false);

    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(policy.get("connect-src")).toEqual(["'self'"]);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
  });

  it("allows Supabase Storage images when Supabase is the backend", async () => {
    const { headers } = await loadConfig({
      SUPABASE_DATABASE_URL: "postgresql://chapega_app.ref:pw@host/db",
      NEXT_PUBLIC_SUPABASE_URL: "https://ref.supabase.co/",
      SUPABASE_SECRET_KEY: "sb_secret",
    });
    expect(directives(headers.get("content-security-policy")).get("img-src")).toContain(
      "https://ref.supabase.co",
    );
  });

  it("allows development tooling only in development and never sends HSTS there", async () => {
    const { headers } = await loadConfig({ NODE_ENV: "development" });
    const policy = directives(headers.get("content-security-policy"));

    expect(policy.get("script-src")).toContain("'unsafe-eval'");
    expect(policy.get("connect-src")).toContain("ws:");
    expect(headers.has("strict-transport-security")).toBe(false);
  });
});
