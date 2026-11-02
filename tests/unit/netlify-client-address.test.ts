import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getContext: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@netlify/functions", () => ({ getContext: mocks.getContext }));

import {
  clientAddressLabel,
  clientAddressTrustConfigured,
  expectedRequestOrigin,
  proxyHeadersTrusted,
  sameOriginRejection,
  trustedClientAddress,
} from "@/server/http/request-identity";
import { setLogSink } from "@/server/observability/logger";
import { resetClientAddressWarning, warnIfClientAddressUnknown } from "@/server/vendor/throttle";

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://shop.example/api/vendor/login", {
    method: "POST",
    headers: { host: "shop.example", ...headers },
  });
}

beforeEach(() => {
  vi.stubEnv("NETLIFY", "true");
  vi.stubEnv("CHAPEGA_HOST_PLATFORM", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("TRUST_PROXY_HEADERS", "");
  mocks.getContext.mockReset().mockReturnValue({ ip: "203.0.113.20" });
  resetClientAddressWarning();
});

afterEach(() => {
  vi.unstubAllEnvs();
  setLogSink(null);
});

describe("Netlify client identity", () => {
  it("supports the explicit server runtime marker without a build-only NETLIFY flag", () => {
    vi.stubEnv("NETLIFY", "");
    vi.stubEnv("CHAPEGA_HOST_PLATFORM", "netlify");
    expect(trustedClientAddress(request({ "x-nf-client-connection-ip": "198.51.100.3" }))).toBe(
      "203.0.113.20",
    );
    expect(proxyHeadersTrusted()).toBe(false);
  });

  it.each(["vercel", "NETLIFY", "true"])(
    "does not trust an unknown runtime marker: %s",
    (value) => {
      vi.stubEnv("CHAPEGA_HOST_PLATFORM", value);
      expect(trustedClientAddress(request({ "x-forwarded-for": "198.51.100.1" }))).toBeNull();
      expect(clientAddressTrustConfigured()).toBe(false);
      expect(mocks.getContext).not.toHaveBeenCalled();
    },
  );

  it("uses the platform context and ignores client-supplied address headers", () => {
    const incoming = request({
      "x-forwarded-for": "198.51.100.1",
      "x-real-ip": "198.51.100.2",
      "x-nf-client-connection-ip": "198.51.100.3",
    });
    expect(trustedClientAddress(incoming)).toBe("203.0.113.20");
    expect(clientAddressLabel(incoming)).toBe("203.0.113.20");
    expect(proxyHeadersTrusted()).toBe(false);
  });

  it("accepts a literal IPv6 address", () => {
    mocks.getContext.mockReturnValue({ ip: "2001:db8::20" });
    expect(trustedClientAddress(request())).toBe("2001:db8::20");
  });

  it.each(["", "1", "false"])("does not enable context trust for NETLIFY=%s", (value) => {
    vi.stubEnv("NETLIFY", value);
    expect(
      trustedClientAddress(request({ "x-nf-client-connection-ip": "198.51.100.3" })),
    ).toBeNull();
    expect(mocks.getContext).not.toHaveBeenCalled();
    expect(clientAddressTrustConfigured()).toBe(false);
  });

  it("honours the explicit trust-off switch without reading the context", () => {
    vi.stubEnv("CHAPEGA_HOST_PLATFORM", "netlify");
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    expect(trustedClientAddress(request())).toBeNull();
    expect(clientAddressLabel(request())).toBe("direct");
    expect(clientAddressTrustConfigured()).toBe(false);
    expect(mocks.getContext).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "", "shop.example", "203.0.113.20:443", "203.0.113.20, 198.51.100.1"])(
    "fails closed for an invalid platform IP: %s",
    (ip) => {
      mocks.getContext.mockReturnValue({ ip });
      vi.stubEnv("TRUST_PROXY_HEADERS", "true");
      expect(trustedClientAddress(request({ "x-forwarded-for": "198.51.100.1" }))).toBeNull();
      expect(clientAddressLabel(request())).toBe("proxy");
    },
  );

  it("fails closed outside an active Netlify request", () => {
    mocks.getContext.mockImplementation(() => {
      throw new Error("No active request");
    });
    expect(
      trustedClientAddress(request({ "x-nf-client-connection-ip": "198.51.100.3" })),
    ).toBeNull();
  });

  it("preserves Vercel's precedence and configured proxy behavior", () => {
    vi.stubEnv("CHAPEGA_HOST_PLATFORM", "netlify");
    vi.stubEnv("VERCEL", "1");
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "198.51.100.7" }))).toBe(
      "198.51.100.7",
    );
    expect(mocks.getContext).not.toHaveBeenCalled();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NETLIFY", "");
    vi.stubEnv("CHAPEGA_HOST_PLATFORM", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    expect(trustedClientAddress(request({ "x-forwarded-for": "198.51.100.8, 192.0.2.1" }))).toBe(
      "198.51.100.8",
    );
  });

  it("does not opt same-origin checks into forwarded-host or protocol trust", () => {
    const headers = {
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "http",
    };
    expect(expectedRequestOrigin(request(headers))).toBe("https://shop.example");
    expect(sameOriginRejection(request({ ...headers, origin: "http://attacker.example" }))).toEqual(
      { code: "INVALID_ORIGIN" },
    );
    expect(sameOriginRejection(request({ ...headers, origin: "https://shop.example" }))).toBeNull();
    expect(mocks.getContext).not.toHaveBeenCalled();
  });

  it("avoids a premature startup warning but reports an observed missing context", () => {
    const lines: string[] = [];
    setLogSink((_level, line) => lines.push(line));
    warnIfClientAddressUnknown();
    expect(lines).toEqual([]);
    warnIfClientAddressUnknown(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("security.client_address_unknown");
  });
});
