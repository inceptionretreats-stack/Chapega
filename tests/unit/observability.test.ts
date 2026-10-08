import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getKioskBootstrap: vi.fn(),
  usesSupabaseBackend: vi.fn(() => false),
  sqlQuery: vi.fn(),
  readLocalVendorDatabase: vi.fn(),
  authenticateVendorLogin: vi.fn(),
  reserveProgressiveAttempt: vi.fn(),
  resetRateLimit: vi.fn(),
  requireAdmin: vi.fn(),
  updateAdminVendorStatus: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/vendor/service", () => ({
  getKioskBootstrap: mocks.getKioskBootstrap,
}));
vi.mock("@/server/supabase/config", () => ({
  usesSupabaseBackend: mocks.usesSupabaseBackend,
  getVendorDataBackend: () => (mocks.usesSupabaseBackend() ? "supabase" : "local"),
}));
vi.mock("@/server/supabase/postgres", () => ({
  getSupabasePostgres: () => mocks.sqlQuery,
}));
vi.mock("@/server/vendor/database", () => ({
  DEFAULT_VENDOR_SLUG: "chapega",
  readLocalVendorDatabase: mocks.readLocalVendorDatabase,
}));
vi.mock("@/server/vendor/auth", () => ({
  VENDOR_SESSION_COOKIE: "chapega_vendor_session",
  authenticateVendorLogin: mocks.authenticateVendorLogin,
  getRequestVendorContext: vi.fn(),
}));
vi.mock("@/server/vendor/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/vendor/rate-limit")>()),
  reserveProgressiveAttempt: mocks.reserveProgressiveAttempt,
  resetRateLimit: mocks.resetRateLimit,
}));
vi.mock("@/server/admin/auth", () => ({
  requireRequestAdmin: mocks.requireAdmin,
}));
vi.mock("@/server/admin/service", () => ({
  updateAdminVendorStatus: mocks.updateAdminVendorStatus,
}));

import { logger, serializeError, setLogSink } from "@/server/observability/logger";
import { withRequestContext } from "@/server/observability/request-context";
import { resetReadinessCache } from "@/server/observability/health";
import { apiError } from "@/server/vendor/api";
import { VendorServiceError } from "@/server/vendor/errors";
import { GET as kioskBootstrap } from "@/app/api/kiosk/bootstrap/route";
import { GET as healthz } from "@/app/api/healthz/route";
import { GET as readyz } from "@/app/api/readyz/route";
import { POST as vendorLogin } from "@/app/api/vendor/login/route";
import { PATCH as adminStatus } from "@/app/api/admin/vendors/[vendorId]/status/route";

type LogLine = Record<string, unknown> & { level: string; event: string };
let lines: LogLine[] = [];

beforeEach(() => {
  lines = [];
  setLogSink((level, line) => {
    lines.push({ ...(JSON.parse(line) as LogLine), level });
  });
  mocks.usesSupabaseBackend.mockReturnValue(false);
  mocks.reserveProgressiveAttempt.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.resetRateLimit.mockResolvedValue(undefined);
  resetReadinessCache();
});

afterEach(() => {
  setLogSink(null);
  vi.unstubAllEnvs();
});

function event(name: string): LogLine | undefined {
  return lines.find((line) => line.event === name);
}

describe("structured logger", () => {
  it("writes one JSON object per line and redacts credentials", () => {
    logger.warn("test.event", {
      password: "hunter2-hunter2",
      nested: { cookie: "chapega_vendor_session=abc", Authorization: "Bearer x" },
      token: "raw-token",
      emailHash: "abc123",
    });

    const line = event("test.event");
    expect(line).toMatchObject({ level: "warn", emailHash: "abc123" });
    expect(typeof line?.time).toBe("string");
    const serialized = JSON.stringify(lines);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("raw-token");
    expect(serialized).not.toContain("chapega_vendor_session=abc");
    expect(serialized).not.toContain("Bearer x");
  });

  it("serializes error causes without query parameters or row data", () => {
    const databaseError = Object.assign(new Error("relation does not exist"), {
      code: "42P01",
      query: "select password_hash from private.vendor_users where email = $1",
      parameters: ["owner@example.com"],
    });
    const wrapped = new VendorServiceError(503, "BACKEND_UNAVAILABLE", "Down");
    wrapped.cause = databaseError;

    const serialized = serializeError(wrapped);
    expect(serialized).toMatchObject({
      name: "VendorServiceError",
      code: "BACKEND_UNAVAILABLE",
      status: 503,
      cause: { message: "relation does not exist", code: "42P01" },
    });
    expect(JSON.stringify(serialized)).not.toContain("owner@example.com");
    expect(JSON.stringify(serialized)).not.toContain("password_hash");
  });
});

describe("request identifiers", () => {
  it("echoes a safe incoming x-request-id and stamps it on log lines", async () => {
    const handler = withRequestContext(async () => {
      logger.info("inside.handler");
      return Response.json({ ok: true });
    });

    const response = await handler(
      new NextRequest("http://localhost/api/test", {
        headers: { "x-request-id": "req-abc_123" },
      }),
    );

    expect(response.headers.get("x-request-id")).toBe("req-abc_123");
    expect(event("inside.handler")?.requestId).toBe("req-abc_123");
  });

  it("falls back to x-vercel-id, then to a generated identifier", async () => {
    const handler = withRequestContext(async () => Response.json({ ok: true }));

    const vercel = await handler(
      new NextRequest("http://localhost/api/test", {
        headers: { "x-vercel-id": "bom1::abcde-1700000000000-0123456789ab" },
      }),
    );
    expect(vercel.headers.get("x-request-id")).toBe("bom1::abcde-1700000000000-0123456789ab");

    const generated = await handler(
      new NextRequest("http://localhost/api/test", {
        headers: { "x-request-id": "bad id <script>alert(1)</script>" },
      }),
    );
    expect(generated.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("turns an escaped exception into a logged 500 with the request id", async () => {
    const handler = withRequestContext(async () => {
      throw new Error("boom");
    });

    const response = await handler(new NextRequest("http://localhost/api/test"));
    expect(response.status).toBe(500);
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toBeTruthy();
    expect(lines.some((line) => line.level === "error" && line.requestId === requestId)).toBe(true);
  });
});

describe("API failure logging", () => {
  it("logs every 5xx with its underlying cause", async () => {
    const failure = new VendorServiceError(503, "BACKEND_UNAVAILABLE", "Try again.");
    failure.cause = new Error("connect ETIMEDOUT 10.0.0.1:6543");

    const response = apiError(failure);

    expect(response.status).toBe(503);
    const line = lines.find((entry) => entry.level === "error");
    expect(line).toBeDefined();
    expect(JSON.stringify(line)).toContain("connect ETIMEDOUT");
  });

  it("logs and fails properly when the public kiosk catalogue cannot load", async () => {
    mocks.getKioskBootstrap.mockRejectedValueOnce(new Error("database offline"));

    const response = await kioskBootstrap(new NextRequest("http://localhost/api/kiosk/bootstrap"));

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(JSON.stringify(lines)).toContain("database offline");
  });
});

describe("health endpoints", () => {
  it("reports liveness without touching dependencies", async () => {
    const response = await healthz(new NextRequest("http://localhost/api/healthz"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(mocks.sqlQuery).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("checks Supabase with select 1 and reports 503 when unreachable", async () => {
    mocks.usesSupabaseBackend.mockReturnValue(true);
    mocks.sqlQuery.mockRejectedValueOnce(new Error("password authentication failed"));

    const down = await readyz(new NextRequest("http://localhost/api/readyz"));
    expect(down.status).toBe(503);
    const body = await down.json();
    expect(JSON.stringify(body)).not.toContain("password authentication");
    expect(JSON.stringify(lines)).toContain("password authentication failed");
  });

  it("reports ready when the selected backend answers", async () => {
    mocks.usesSupabaseBackend.mockReturnValue(true);
    mocks.sqlQuery.mockResolvedValue([{ ok: 1 }]);

    const ready = await readyz(new NextRequest("http://localhost/api/readyz"));
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toMatchObject({
      status: "ready",
      backend: "supabase",
    });
    const call = mocks.sqlQuery.mock.calls[0]?.[0] as TemplateStringsArray;
    expect(call.join("").replace(/\s+/g, " ").trim()).toBe("select 1 as ok");
  });
});

describe("security event logging", () => {
  it("records failed vendor sign-ins without the email or password", async () => {
    mocks.authenticateVendorLogin.mockResolvedValueOnce(null);

    const response = await vendorLogin(
      new NextRequest("http://localhost/api/vendor/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "not-the-password",
        }),
      }),
    );

    expect(response.status).toBe(401);
    const line = event("auth.login_failed");
    expect(line).toMatchObject({ level: "warn", scope: "vendor" });
    expect(typeof line?.emailHash).toBe("string");
    const serialized = JSON.stringify(lines);
    expect(serialized).not.toContain("owner@example.com");
    expect(serialized).not.toContain("not-the-password");
  });

  it("records rate-limit rejections and origin rejections", async () => {
    mocks.reserveProgressiveAttempt.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const limited = await vendorLogin(
      new NextRequest("http://localhost/api/vendor/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ email: "owner@example.com", password: "whatever-pass" }),
      }),
    );
    expect(limited.status).toBe(429);
    expect(event("security.rate_limited")).toMatchObject({ scope: "vendor-login" });

    const rejected = await vendorLogin(
      new NextRequest("http://localhost/api/vendor/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ email: "owner@example.com", password: "whatever-pass" }),
      }),
    );
    expect(rejected.status).toBe(403);
    expect(event("security.origin_rejected")).toMatchObject({
      origin: "https://evil.example",
    });
  });

  it("records platform administrator status changes", async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      user: { id: "11111111-1111-4111-8111-111111111111" },
      sessionHash: "x",
    });
    mocks.updateAdminVendorStatus.mockResolvedValueOnce({
      vendor: { id: "00000000-0000-4000-8000-000000000001", status: "suspended" },
      metrics: {},
      activity: {},
    });

    const response = await adminStatus(
      new NextRequest(
        "http://localhost/api/admin/vendors/00000000-0000-4000-8000-000000000001/status",
        {
          method: "PATCH",
          headers: { "content-type": "application/json", origin: "http://localhost" },
          body: JSON.stringify({ status: "suspended", revision: 1 }),
        },
      ),
      { params: Promise.resolve({ vendorId: "00000000-0000-4000-8000-000000000001" }) },
    );

    expect(response.status).toBe(200);
    expect(event("admin.vendor_status_changed")).toMatchObject({
      level: "info",
      actorId: "11111111-1111-4111-8111-111111111111",
      vendorId: "00000000-0000-4000-8000-000000000001",
      status: "suspended",
    });
  });
});
