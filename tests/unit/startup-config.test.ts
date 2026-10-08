import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as instrumentation from "@/instrumentation";
import { inspectServerConfiguration } from "@/server/config/startup";
import { setLogSink } from "@/server/observability/logger";
import { adminSessionPolicy, vendorSessionPolicy } from "@/server/security/session-policy";
import { resetClientAddressWarning } from "@/server/vendor/throttle";

const MANAGED = [
  "NODE_ENV",
  "NEXT_RUNTIME",
  "NEXT_PHASE",
  "VERCEL",
  "CHAPEGA_DATA_BACKEND",
  "ALLOW_LOCAL_VENDOR_BACKEND",
  "ALLOW_VENDOR_PREVIEW_LOGIN",
  "SUPABASE_DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "VENDOR_EMAIL",
  "VENDOR_PASSWORD",
  "VENDOR_SESSION_HOURS",
  "VENDOR_SESSION_IDLE_MINUTES",
  "ADMIN_SESSION_HOURS",
  "ADMIN_SESSION_IDLE_MINUTES",
  "TRUST_PROXY_HEADERS",
  "LOG_LEVEL",
];

let logs: string[] = [];

function environment(values: Record<string, string>) {
  for (const name of MANAGED) vi.stubEnv(name, values[name] ?? "");
}

beforeEach(() => {
  resetClientAddressWarning();
  logs = [];
  setLogSink((_level, line) => logs.push(line));
  environment({ NODE_ENV: "development", NEXT_RUNTIME: "nodejs" });
});

afterEach(() => {
  setLogSink(null);
  vi.unstubAllEnvs();
});

describe("startup configuration validation (instrumentation register)", () => {
  it("fails fast with a clear message instead of silently using defaults", async () => {
    environment({
      NODE_ENV: "development",
      NEXT_RUNTIME: "nodejs",
      VENDOR_SESSION_HOURS: "twelve",
      ADMIN_SESSION_HOURS: "48",
    });

    expect(typeof instrumentation.register).toBe("function");
    await expect(instrumentation.register?.()).rejects.toThrow(
      /VENDOR_SESSION_HOURS.*1.*168[\s\S]*ADMIN_SESSION_HOURS.*1.*24/,
    );
  });

  it("exits the process in production rather than serving 500s", async () => {
    environment({
      NODE_ENV: "production",
      NEXT_RUNTIME: "nodejs",
      CHAPEGA_DATA_BACKEND: "local",
      ALLOW_LOCAL_VENDOR_BACKEND: "true",
      VENDOR_SESSION_IDLE_MINUTES: "-5",
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(instrumentation.register?.()).rejects.toThrow("exit 1");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("does nothing during `next build`", async () => {
    environment({
      NODE_ENV: "production",
      NEXT_RUNTIME: "nodejs",
      NEXT_PHASE: "phase-production-build",
      VENDOR_SESSION_HOURS: "nonsense",
    });
    await expect(instrumentation.register?.()).resolves.toBeUndefined();
  });

  it("accepts the default development setup", async () => {
    await expect(instrumentation.register?.()).resolves.toBeUndefined();
    expect(inspectServerConfiguration().errors).toEqual([]);
  });

  it("reports invalid or missing production configuration", () => {
    environment({ NODE_ENV: "production", CHAPEGA_DATA_BACKEND: "postgres" });
    expect(inspectServerConfiguration().errors.join("\n")).toMatch(/CHAPEGA_DATA_BACKEND/);

    environment({ NODE_ENV: "production" });
    expect(inspectServerConfiguration().errors.join("\n")).toMatch(
      /SUPABASE_DATABASE_URL.*NEXT_PUBLIC_SUPABASE_URL.*SUPABASE_SECRET_KEY/,
    );

    environment({
      NODE_ENV: "development",
      VENDOR_EMAIL: "owner@example.com",
      VENDOR_PASSWORD: "replace-with-a-long-unique-password",
    });
    expect(inspectServerConfiguration().errors.join("\n")).toMatch(/placeholder/i);

    environment({ NODE_ENV: "development", TRUST_PROXY_HEADERS: "yes" });
    expect(inspectServerConfiguration().errors.join("\n")).toMatch(/TRUST_PROXY_HEADERS/);

    environment({ NODE_ENV: "development", ALLOW_VENDOR_PREVIEW_LOGIN: "1" });
    expect(inspectServerConfiguration().errors.join("\n")).toMatch(/ALLOW_VENDOR_PREVIEW_LOGIN/);
  });

  it("warns about risky but valid production settings", async () => {
    environment({
      NODE_ENV: "production",
      NEXT_RUNTIME: "nodejs",
      CHAPEGA_DATA_BACKEND: "local",
      ALLOW_LOCAL_VENDOR_BACKEND: "true",
      ALLOW_VENDOR_PREVIEW_LOGIN: "true",
    });

    const report = inspectServerConfiguration();
    expect(report.errors).toEqual([]);
    const warnings = report.warnings.join("\n");
    expect(warnings).toMatch(/ALLOW_VENDOR_PREVIEW_LOGIN/);
    expect(warnings).toMatch(/ALLOW_LOCAL_VENDOR_BACKEND/);

    await instrumentation.register?.();
    const output = logs.join("\n");
    expect(output).toContain("config.warning");
    expect(output).toContain("TRUST_PROXY_HEADERS");
  });
});

describe("session settings at runtime", () => {
  it("never silently replaces an invalid value with the default", () => {
    environment({ NODE_ENV: "development", VENDOR_SESSION_IDLE_MINUTES: "0" });
    expect(() => vendorSessionPolicy()).toThrow(/VENDOR_SESSION_IDLE_MINUTES/);

    environment({ NODE_ENV: "development", ADMIN_SESSION_HOURS: "eight" });
    expect(() => adminSessionPolicy()).toThrow(/ADMIN_SESSION_HOURS/);
  });
});

describe(".env.example (AUD-33)", () => {
  it("starts a development server when copied to .env.local as the README says", () => {
    const template = readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
    const values: Record<string, string> = { NODE_ENV: "development", NEXT_RUNTIME: "nodejs" };
    for (const line of template.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) values[match[1]] = match[2];
    }
    environment(values);
    for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);

    expect(inspectServerConfiguration().errors).toEqual([]);
  });

  it("documents every session and logging setting the server reads", () => {
    const template = readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
    for (const name of [
      "VENDOR_SESSION_HOURS",
      "VENDOR_SESSION_IDLE_MINUTES",
      "ADMIN_SESSION_HOURS",
      "ADMIN_SESSION_IDLE_MINUTES",
      "LOG_LEVEL",
    ]) {
      expect(template, name).toMatch(new RegExp(`^#? ?${name}=`, "m"));
    }
  });
});
