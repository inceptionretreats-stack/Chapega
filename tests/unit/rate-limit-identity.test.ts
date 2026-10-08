import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticateVendorLogin: vi.fn(),
  authenticateAdminLogin: vi.fn(),
  recordKioskOrder: vi.fn(),
  getKioskBootstrap: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/config", () => ({
  usesSupabaseBackend: () => false,
}));
vi.mock("@/server/vendor/auth", () => ({
  VENDOR_SESSION_COOKIE: "chapega_vendor_session",
  authenticateVendorLogin: mocks.authenticateVendorLogin,
  getRequestVendorContext: vi.fn(),
}));
vi.mock("@/server/admin/auth", () => ({
  ADMIN_SESSION_COOKIE: "chapega_admin_session",
  authenticateAdminLogin: mocks.authenticateAdminLogin,
}));
vi.mock("@/server/vendor/service", () => ({
  recordKioskOrder: mocks.recordKioskOrder,
  getKioskBootstrap: mocks.getKioskBootstrap,
}));
vi.mock("@/server/vendor/database", () => ({
  DEFAULT_VENDOR_SLUG: "chapega",
}));

import { POST as vendorLogin } from "@/app/api/vendor/login/route";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import { POST as scopedOrder } from "@/app/api/kiosk/[vendorSlug]/orders/route";
import { GET as scopedBootstrap } from "@/app/api/kiosk/[vendorSlug]/bootstrap/route";
import { GET as defaultBootstrap } from "@/app/api/kiosk/bootstrap/route";
import { clearMemoryRateLimits } from "@/server/vendor/rate-limit";
import { resetClientAddressWarning } from "@/server/vendor/throttle";
import { setLogSink } from "@/server/observability/logger";

const VENDOR_PASSWORD = "correct horse battery staple";
const ADMIN_PASSWORD = "admin passphrase for chapega";
let now = Date.parse("2026-10-08T10:00:00.000Z");
let logLines: Array<Record<string, unknown>> = [];

function json(url: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost", ...headers },
    body: JSON.stringify(body),
  });
}

function loginAs(email: string, password: string, headers?: Record<string, string>) {
  return vendorLogin(json("http://localhost/api/vendor/login", { email, password }, headers));
}

function adminLoginAs(email: string, password: string) {
  return adminLogin(json("http://localhost/api/admin/login", { email, password }));
}

function advance(seconds: number) {
  now += seconds * 1_000;
  vi.setSystemTime(now);
}

function order(kioskName: string, index: number) {
  return {
    idempotencyKey: `${kioskName}-${index}-${Math.random()}`,
    orderNumber: `GFT-20261008-${String(index).padStart(4, "0")}`,
    createdAt: new Date(now).toISOString(),
    kioskName,
    customer: { customerName: "Asha", customerPhone: "9876543210" },
    items: [{ productId: "frame", quantity: 1, giftWrapped: false }],
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  now = Date.parse("2026-10-08T10:00:00.000Z");
  vi.setSystemTime(now);
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("TRUST_PROXY_HEADERS", "");
  clearMemoryRateLimits();
  resetClientAddressWarning();
  logLines = [];
  setLogSink((_level, line) => logLines.push(JSON.parse(line)));
  mocks.authenticateVendorLogin
    .mockReset()
    .mockImplementation(async (email: string, password: string) =>
      password === VENDOR_PASSWORD
        ? { user: { id: email }, token: "token", expiresAt: new Date(now + 3_600_000) }
        : null,
    );
  mocks.authenticateAdminLogin
    .mockReset()
    .mockImplementation(async (_email: string, password: string) =>
      password === ADMIN_PASSWORD
        ? { user: { id: "admin" }, token: "token", expiresAt: new Date(now + 3_600_000) }
        : null,
    );
  mocks.recordKioskOrder.mockReset().mockImplementation(async (input: { orderNumber: string }) => ({
    orderNumber: input.orderNumber,
  }));
  mocks.getKioskBootstrap.mockReset().mockResolvedValue({
    vendor: { id: "00000000-0000-4000-8000-000000000001", slug: "chapega", displayName: "Chapega" },
    revision: "7",
    products: [],
    settings: {},
    storeOpen: true,
    syncedAt: new Date(now).toISOString(),
  });
});

afterEach(() => {
  setLogSink(null);
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("login throttling without a trusted client address", () => {
  it("does not let one client's failures lock every account out", async () => {
    for (let index = 0; index < 35; index += 1) {
      const response = await loginAs(`stranger${index}@example.com`, "wrong-password");
      expect(response.status).toBe(401);
    }

    const owner = await loginAs("owner@example.com", VENDOR_PASSWORD);
    expect(owner.status).toBe(200);
  });

  it("slows an attacked account progressively instead of locking it for 15 minutes", async () => {
    let waited = 0;
    for (let failures = 0; failures < 8;) {
      const response = await adminLoginAs("admin@example.com", "wrong-password");
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(300);
        advance(retryAfter);
        waited += retryAfter;
        continue;
      }
      expect(response.status).toBe(401);
      failures += 1;
    }

    let success = await adminLoginAs("admin@example.com", ADMIN_PASSWORD);
    if (success.status === 429) {
      advance(Number(success.headers.get("retry-after")));
      success = await adminLoginAs("admin@example.com", ADMIN_PASSWORD);
    }
    expect(success.status).toBe(200);
    // The old policy locked the super admin for 15 minutes after 6 failures.
    expect(waited).toBeLessThan(15 * 60);

    // A successful sign-in resets the account's counter.
    const afterReset = await adminLoginAs("admin@example.com", "typo-once");
    expect(afterReset.status).toBe(401);
  });

  it("logs a one-time warning recommending TRUST_PROXY_HEADERS", async () => {
    await loginAs("a@example.com", "wrong-password");
    await loginAs("b@example.com", "wrong-password");

    const warnings = logLines.filter((line) => line.event === "security.client_address_unknown");
    expect(warnings).toHaveLength(1);
    expect(JSON.stringify(warnings)).toContain("TRUST_PROXY_HEADERS");
  });
});

describe("login throttling with a trusted client address", () => {
  it("does not count successful sign-ins toward the per-address limit", async () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    for (let index = 0; index < 40; index += 1) {
      const response = await loginAs(`staff${index % 3}@example.com`, VENDOR_PASSWORD, {
        "x-forwarded-for": "203.0.113.20",
      });
      expect(response.status).toBe(200);
    }
  });

  it("still blocks a single address that keeps failing, with Retry-After", async () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    let limited: Response | null = null;
    for (let index = 0; index < 40 && !limited; index += 1) {
      const response = await loginAs(`victim${index}@example.com`, "wrong-password", {
        "x-forwarded-for": "198.51.100.7",
      });
      if (response.status === 429) limited = response;
    }
    expect(limited).not.toBeNull();
    expect(Number(limited?.headers.get("retry-after"))).toBeGreaterThan(0);

    // Another address is unaffected.
    const other = await loginAs("owner@example.com", VENDOR_PASSWORD, {
      "x-forwarded-for": "203.0.113.99",
    });
    expect(other.status).toBe(200);
  });
});

describe("kiosk order throttling", () => {
  const context = { params: Promise.resolve({ vendorSlug: "chapega" }) };

  it("keys unknown clients by vendor and kiosk instead of one platform bucket", async () => {
    for (let index = 1; index <= 20; index += 1) {
      const response = await scopedOrder(
        json("http://localhost/api/kiosk/chapega/orders", order("Main entrance", index)),
        context,
      );
      expect(response.status).toBe(201);
    }

    const limited = await scopedOrder(
      json("http://localhost/api/kiosk/chapega/orders", order("Main entrance", 21)),
      context,
    );
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    const otherKiosk = await scopedOrder(
      json("http://localhost/api/kiosk/chapega/orders", order("Back counter", 1)),
      context,
    );
    expect(otherKiosk.status).toBe(201);
  });
});

describe("public kiosk bootstrap", () => {
  it("supports conditional requests with an ETag derived from vendor and revision", async () => {
    const first = await scopedBootstrap(
      new NextRequest("http://localhost/api/kiosk/chapega/bootstrap"),
      { params: Promise.resolve({ vendorSlug: "chapega" }) },
    );
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag");
    expect(etag).toMatch(/^"[^"]+"$/);
    expect(first.headers.get("cache-control")).toContain("no-cache");

    const revalidated = await scopedBootstrap(
      new NextRequest("http://localhost/api/kiosk/chapega/bootstrap", {
        headers: { "if-none-match": etag ?? "" },
      }),
      { params: Promise.resolve({ vendorSlug: "chapega" }) },
    );
    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe("");

    mocks.getKioskBootstrap.mockResolvedValueOnce({
      vendor: {
        id: "00000000-0000-4000-8000-000000000001",
        slug: "chapega",
        displayName: "Chapega",
      },
      revision: "8",
      products: [],
      settings: {},
      storeOpen: true,
      syncedAt: new Date(now).toISOString(),
    });
    const changed = await defaultBootstrap(
      new NextRequest("http://localhost/api/kiosk/bootstrap", {
        headers: { "if-none-match": etag ?? "" },
      }),
    );
    expect(changed.status).toBe(200);
    expect(changed.headers.get("etag")).not.toBe(etag);
  });

  it("rate-limits a client that floods the public catalogue", async () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    let limited: Response | null = null;
    for (let index = 0; index < 200 && !limited; index += 1) {
      const response = await defaultBootstrap(
        new NextRequest("http://localhost/api/kiosk/bootstrap", {
          headers: { "x-forwarded-for": "198.51.100.42" },
        }),
      );
      if (response.status === 429) limited = response;
    }
    expect(limited).not.toBeNull();
    expect(Number(limited?.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
