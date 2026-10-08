import "server-only";

import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { logger } from "@/server/observability/logger";

/**
 * Proxy headers (X-Forwarded-*) are attacker-controlled unless a proxy we
 * trust overwrites them. Vercel always does; any other reverse proxy must be
 * declared with TRUST_PROXY_HEADERS=true. TRUST_PROXY_HEADERS=false disables
 * trust everywhere. This single rule governs client addresses (rate limits)
 * and the request origin (CSRF checks), so the two can never disagree.
 */
export function proxyHeadersTrusted(): boolean {
  const preference = process.env.TRUST_PROXY_HEADERS?.trim();
  if (preference === "false") return false;
  if (preference === "true") return true;
  return process.env.VERCEL === "1";
}

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",", 1)[0]?.trim();
  return first ? first : null;
}

/**
 * The client IP when a trusted proxy supplied a valid one, otherwise null.
 * Route handlers cannot see the socket address, so without a trusted proxy
 * every client is indistinguishable and callers must not key shared limits
 * on the address.
 */
export function trustedClientAddress(request: NextRequest): string | null {
  if (!proxyHeadersTrusted()) return null;
  const candidates =
    process.env.VERCEL === "1"
      ? ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"]
      : ["x-forwarded-for", "x-real-ip"];
  for (const name of candidates) {
    const address = firstHeaderValue(request.headers.get(name));
    if (address && isIP(address)) return address;
  }
  return null;
}

/** Backwards-compatible bucket label: an IP, "proxy" (bad header) or "direct". */
export function clientAddressLabel(request: NextRequest): string {
  if (!proxyHeadersTrusted()) return "direct";
  return trustedClientAddress(request) ?? "proxy";
}

// A bare host[:port]: DNS name, IPv4, or bracketed IPv6. Anything else
// (userinfo, paths, whitespace) cannot be a Host the browser sent.
const HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.?|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;

/**
 * The origin the browser addressed: scheme + Host header, or the forwarded
 * host/scheme from a trusted proxy. request.nextUrl is not used for the host
 * because `next start` derives it from the bind address (e.g. localhost).
 */
export function expectedRequestOrigin(request: NextRequest): string | null {
  const trusted = proxyHeadersTrusted();
  const host =
    (trusted ? firstHeaderValue(request.headers.get("x-forwarded-host")) : null) ??
    firstHeaderValue(request.headers.get("host"));
  if (!host) return request.nextUrl.origin;
  if (!HOST_PATTERN.test(host)) return null;

  const forwardedProto = trusted
    ? firstHeaderValue(request.headers.get("x-forwarded-proto"))?.toLowerCase()
    : null;
  const protocol =
    forwardedProto === "https" || forwardedProto === "http"
      ? `${forwardedProto}:`
      : request.nextUrl.protocol;
  try {
    return new URL(`${protocol}//${host}`).origin;
  } catch {
    return null;
  }
}

export type OriginRejection = Readonly<{
  code: "CROSS_SITE_REQUEST" | "INVALID_ORIGIN";
}>;

/**
 * CSRF defence for state-changing requests. Browsers send Origin on every
 * cross-origin and same-origin non-GET request and Sec-Fetch-Site on modern
 * engines; non-browser clients without either are allowed because they do
 * not carry ambient cookies on a victim's behalf.
 */
export function sameOriginRejection(request: NextRequest): OriginRejection | null {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    logger.warn("security.origin_rejected", {
      reason: "cross-site",
      path: request.nextUrl.pathname,
    });
    return { code: "CROSS_SITE_REQUEST" };
  }
  const origin = request.headers.get("origin");
  if (origin === null) return null;
  const expected = expectedRequestOrigin(request);
  if (expected && origin === expected) return null;
  logger.warn("security.origin_rejected", {
    reason: "origin-mismatch",
    origin: origin.slice(0, 200),
    expected,
    path: request.nextUrl.pathname,
  });
  return { code: "INVALID_ORIGIN" };
}
