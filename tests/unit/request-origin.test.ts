import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/server/vendor/auth", () => ({
  getRequestVendorContext: vi.fn(),
}));

import { assertSameOrigin } from "@/server/vendor/api";
import { assertAdminSameOrigin } from "@/server/admin/api";
import { setLogSink } from "@/server/observability/logger";

/**
 * `next start` builds request.nextUrl from its own bind address (localhost),
 * not from the Host the browser used, so these requests model what the
 * server actually receives: the URL the framework constructs plus the
 * browser's Host/Origin headers.
 */
function request(
  headers: Record<string, string>,
  url = "http://localhost:3400/api/vendor/login",
): NextRequest {
  return new NextRequest(url, { method: "POST", headers });
}

const checks = [
  ["vendor", assertSameOrigin],
  ["admin", assertAdminSameOrigin],
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  setLogSink(null);
});

describe.each(checks)("%s same-origin check", (_scope, assertOrigin) => {
  it("accepts a genuine same-origin request on a non-localhost host", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "");

    expect(() =>
      assertOrigin(request({ host: "127.0.0.1:3400", origin: "http://127.0.0.1:3400" })),
    ).not.toThrow();
    expect(() =>
      assertOrigin(request({ host: "shop.example.com", origin: "http://shop.example.com" })),
    ).not.toThrow();
  });

  it("uses X-Forwarded-Host/Proto only from a trusted proxy", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const proxied = {
      host: "10.0.0.7:3000",
      "x-forwarded-host": "shop.example.com",
      "x-forwarded-proto": "https",
      origin: "https://shop.example.com",
    };

    expect(() => assertOrigin(request(proxied))).not.toThrow();

    vi.stubEnv("TRUST_PROXY_HEADERS", "");
    expect(() => assertOrigin(request(proxied))).toThrow(
      expect.objectContaining({ status: 403, code: "INVALID_ORIGIN" }),
    );
  });

  it("trusts Vercel's forwarded host automatically", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("TRUST_PROXY_HEADERS", "");

    expect(() =>
      assertOrigin(
        request({
          host: "chapega-abc123.vercel.app",
          "x-forwarded-host": "shop.example.com",
          "x-forwarded-proto": "https",
          origin: "https://shop.example.com",
        }),
      ),
    ).not.toThrow();
  });

  it("ignores a forged X-Forwarded-Host when proxy headers are not trusted", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "");

    expect(() =>
      assertOrigin(
        request({
          host: "shop.example.com",
          "x-forwarded-host": "evil.example",
          origin: "http://evil.example",
        }),
      ),
    ).toThrow(expect.objectContaining({ status: 403, code: "INVALID_ORIGIN" }));
  });

  it("still rejects mismatching origins and cross-site fetches", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "");

    expect(() =>
      assertOrigin(request({ host: "shop.example.com", origin: "https://attacker.example" })),
    ).toThrow(expect.objectContaining({ status: 403, code: "INVALID_ORIGIN" }));
    expect(() => assertOrigin(request({ host: "shop.example.com", origin: "null" }))).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(() =>
      assertOrigin(request({ host: "shop.example.com", "sec-fetch-site": "cross-site" })),
    ).toThrow(expect.objectContaining({ status: 403, code: "CROSS_SITE_REQUEST" }));
    expect(() =>
      assertOrigin(
        request({ host: "shop.example.com:80@evil.example", origin: "http://evil.example" }),
      ),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });

  it("rejects a scheme downgrade for the same host", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");

    expect(() =>
      assertOrigin(
        request({
          host: "shop.example.com",
          "x-forwarded-proto": "https",
          origin: "http://shop.example.com",
        }),
      ),
    ).toThrow(expect.objectContaining({ status: 403, code: "INVALID_ORIGIN" }));
  });

  it("allows requests without an Origin header (non-browser clients)", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "");

    expect(() => assertOrigin(request({ host: "shop.example.com" }))).not.toThrow();
  });
});
