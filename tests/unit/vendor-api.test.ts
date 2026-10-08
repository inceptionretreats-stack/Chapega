import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/server/vendor/auth", () => ({
  getRequestVendorContext: vi.fn(),
}));

import { clientAddress } from "@/server/vendor/api";

function request(headers: HeadersInit = {}): NextRequest {
  return { headers: new Headers(headers) } as NextRequest;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("rate-limit client identity", () => {
  it("trusts Vercel's protected forwarded address automatically", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("TRUST_PROXY_HEADERS", "");

    expect(
      clientAddress(
        request({
          "x-vercel-forwarded-for": "203.0.113.8",
          "x-forwarded-for": "198.51.100.9",
        }),
      ),
    ).toBe("203.0.113.8");
  });

  it("accepts a valid address from an explicitly trusted reverse proxy", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");

    expect(clientAddress(request({ "x-forwarded-for": "2001:db8::10, 10.0.0.1" }))).toBe(
      "2001:db8::10",
    );
  });

  it("does not trust proxy headers when trust is explicitly disabled", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");

    expect(clientAddress(request({ "x-vercel-forwarded-for": "203.0.113.8" }))).toBe("direct");
  });

  it("does not place an unvalidated header value in a rate-limit bucket", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");

    expect(clientAddress(request({ "x-forwarded-for": "not-an-ip" }))).toBe("proxy");
  });
});
