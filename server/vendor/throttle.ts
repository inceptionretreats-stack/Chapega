import "server-only";

import type { NextRequest } from "next/server";
import {
  proxyHeadersTrusted,
  trustedClientAddress,
} from "@/server/http/request-identity";
import { logger } from "@/server/observability/logger";
import { sha256 } from "@/server/vendor/crypto";
import {
  consumeMemoryRateLimit,
  consumeRateLimit,
  RateLimitExceededError,
  refundMemoryRateLimit,
  refundRateLimit,
  reserveProgressiveAttempt,
  resetRateLimit,
  type ProgressivePolicy,
  type RateLimitResult,
} from "@/server/vendor/rate-limit";

/**
 * Throttling policies. Route handlers cannot see the socket address, so a
 * client IP is only known when a trusted proxy supplies it (Vercel, or
 * TRUST_PROXY_HEADERS=true). Without it every client looks the same, and a
 * per-address bucket would let one attacker lock everybody out, so:
 *
 * Sign-in (vendor and admin)
 * - Per account (email hash): progressive delay, never a hard lockout. Vendor:
 *   5 free attempts, then 1 s doubling to at most 5 min between attempts.
 *   Admin: 3 free attempts, then 2 s doubling to at most 5 min. The streak is
 *   forgotten 1 h after the last attempt and reset by a successful sign-in.
 *   With a known address this is keyed per account+address, plus a looser
 *   per-account bucket (20 free attempts) against distributed guessing.
 * - Per address (known address only): 30 attempts / 15 min; successful
 *   sign-ins are refunded, so only failures count.
 * - Safety cap per instance: 1,000 attempts / 5 min per sign-in scope,
 *   protecting the CPU from scrypt floods. Successful sign-ins are refunded.
 *
 * Kiosk orders
 * - Known address: 30 / min per vendor+address.
 * - Unknown address: 20 / min per vendor+kiosk name (a real kiosk takes one
 *   order per customer journey, i.e. a few per minute at most).
 * - Per vendor, all clients: 120 / min safety cap.
 *
 * Public kiosk catalogue (per instance, no database writes on a read path)
 * - Known address: 120 / min per vendor+address (kiosks poll every 30 s).
 * - Per vendor, all clients: 2,400 / min.
 */

const MINUTE = 60_000;
const VENDOR_ACCOUNT_POLICY: ProgressivePolicy = {
  freeAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 5 * MINUTE,
  decayMs: 60 * MINUTE,
};
const ADMIN_ACCOUNT_POLICY: ProgressivePolicy = {
  freeAttempts: 3,
  baseDelayMs: 2_000,
  maxDelayMs: 5 * MINUTE,
  decayMs: 60 * MINUTE,
};
const DISTRIBUTED_ACCOUNT_POLICY: ProgressivePolicy = {
  freeAttempts: 20,
  baseDelayMs: 1_000,
  maxDelayMs: 5 * MINUTE,
  decayMs: 60 * MINUTE,
};
export const LOGIN_ADDRESS_LIMIT = { maximum: 30, windowMs: 15 * MINUTE } as const;
export const LOGIN_SAFETY_CAP = { maximum: 1_000, windowMs: 5 * MINUTE } as const;
export const KIOSK_ORDER_ADDRESS_LIMIT = { maximum: 30, windowMs: MINUTE } as const;
export const KIOSK_ORDER_KIOSK_LIMIT = { maximum: 20, windowMs: MINUTE } as const;
export const KIOSK_ORDER_VENDOR_CAP = { maximum: 120, windowMs: MINUTE } as const;
export const BOOTSTRAP_ADDRESS_LIMIT = { maximum: 120, windowMs: MINUTE } as const;
export const BOOTSTRAP_VENDOR_CAP = { maximum: 2_400, windowMs: MINUTE } as const;

let unknownAddressWarningLogged = false;

/** Allow the one-time warning to be emitted again (tests only). */
export function resetClientAddressWarning(): void {
  unknownAddressWarningLogged = false;
}

/**
 * One-time warning (per process) that client addresses are unknown. Called at
 * startup by instrumentation and lazily on the first throttled request.
 */
export function warnIfClientAddressUnknown(): void {
  if (unknownAddressWarningLogged || proxyHeadersTrusted()) return;
  unknownAddressWarningLogged = true;
  logger.warn("security.client_address_unknown", {
    message:
      "Client IP addresses are not trusted, so rate limits fall back to per-account and per-kiosk buckets. " +
      "If this server runs behind a reverse proxy or load balancer that sets X-Forwarded-For, set TRUST_PROXY_HEADERS=true.",
  });
}

function clientAddressFor(request: NextRequest): string | null {
  const address = trustedClientAddress(request);
  if (!address) warnIfClientAddressUnknown();
  return address;
}

function rejectIfLimited(
  result: RateLimitResult,
  scope: string,
  bucketKind: string,
  message: string,
): void {
  if (result.allowed) return;
  logger.warn("security.rate_limited", {
    scope,
    bucket: bucketKind,
    retryAfterSeconds: result.retryAfterSeconds,
  });
  throw new RateLimitExceededError(result.retryAfterSeconds, message);
}

export type LoginScope = "vendor" | "admin";

export type LoginAttempt = Readonly<{
  /** Clear the account streak and give back the address/safety-cap attempt. */
  succeeded: () => Promise<void>;
}>;

const LOGIN_MESSAGE = "Too many sign-in attempts. Please wait and try again.";

/**
 * Reserve a sign-in attempt or throw RateLimitExceededError (429 with
 * Retry-After). Call `succeeded()` after a valid sign-in.
 */
export async function beginLoginAttempt(
  scope: LoginScope,
  request: NextRequest,
  normalizedEmail: string,
): Promise<LoginAttempt> {
  const logScope = `${scope}-login`;
  const emailHash = sha256(normalizedEmail);
  const address = clientAddressFor(request);
  const accountPolicy = scope === "admin" ? ADMIN_ACCOUNT_POLICY : VENDOR_ACCOUNT_POLICY;

  const accountBucket = address
    ? `login-account:${scope}:${emailHash}:${address}`
    : `login-account:${scope}:${emailHash}`;
  rejectIfLimited(
    await reserveProgressiveAttempt(accountBucket, accountPolicy),
    logScope,
    "account",
    LOGIN_MESSAGE,
  );

  const distributedBucket = address ? `login-account-all:${scope}:${emailHash}` : null;
  if (distributedBucket) {
    rejectIfLimited(
      await reserveProgressiveAttempt(distributedBucket, DISTRIBUTED_ACCOUNT_POLICY),
      logScope,
      "account-all-addresses",
      LOGIN_MESSAGE,
    );
  }

  const addressBucket = address ? `login-address:${scope}:${address}` : null;
  if (addressBucket) {
    rejectIfLimited(
      await consumeRateLimit(
        addressBucket,
        LOGIN_ADDRESS_LIMIT.maximum,
        LOGIN_ADDRESS_LIMIT.windowMs,
      ),
      logScope,
      "address",
      LOGIN_MESSAGE,
    );
  }

  const safetyBucket = `login-safety:${scope}`;
  rejectIfLimited(
    consumeMemoryRateLimit(
      safetyBucket,
      LOGIN_SAFETY_CAP.maximum,
      LOGIN_SAFETY_CAP.windowMs,
    ),
    logScope,
    "safety-cap",
    LOGIN_MESSAGE,
  );

  return {
    succeeded: async () => {
      refundMemoryRateLimit(safetyBucket);
      await Promise.all([
        resetRateLimit(accountBucket),
        distributedBucket ? resetRateLimit(distributedBucket) : Promise.resolve(),
        addressBucket ? refundRateLimit(addressBucket) : Promise.resolve(),
      ]);
    },
  };
}

const ORDER_MESSAGE = "Too many orders were prepared. Please wait a moment.";

function kioskKey(kioskName: string): string {
  return sha256(kioskName.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN")).slice(0, 32);
}

export async function assertKioskOrderAllowed(
  request: NextRequest,
  vendorSlug: string,
  kioskName: string,
): Promise<void> {
  const address = clientAddressFor(request);
  if (address) {
    rejectIfLimited(
      await consumeRateLimit(
        `kiosk-order:${vendorSlug}:address:${address}`,
        KIOSK_ORDER_ADDRESS_LIMIT.maximum,
        KIOSK_ORDER_ADDRESS_LIMIT.windowMs,
      ),
      "kiosk-order",
      "address",
      ORDER_MESSAGE,
    );
  } else {
    rejectIfLimited(
      await consumeRateLimit(
        `kiosk-order:${vendorSlug}:kiosk:${kioskKey(kioskName)}`,
        KIOSK_ORDER_KIOSK_LIMIT.maximum,
        KIOSK_ORDER_KIOSK_LIMIT.windowMs,
      ),
      "kiosk-order",
      "kiosk",
      ORDER_MESSAGE,
    );
  }
  rejectIfLimited(
    await consumeRateLimit(
      `kiosk-order:${vendorSlug}:all`,
      KIOSK_ORDER_VENDOR_CAP.maximum,
      KIOSK_ORDER_VENDOR_CAP.windowMs,
    ),
    "kiosk-order",
    "vendor-cap",
    ORDER_MESSAGE,
  );
}

const CATALOGUE_MESSAGE = "The catalogue is busy. Please try again shortly.";

export function assertKioskBootstrapAllowed(
  request: NextRequest,
  vendorSlug: string,
): void {
  const address = clientAddressFor(request);
  if (address) {
    rejectIfLimited(
      consumeMemoryRateLimit(
        `kiosk-bootstrap:${vendorSlug}:${address}`,
        BOOTSTRAP_ADDRESS_LIMIT.maximum,
        BOOTSTRAP_ADDRESS_LIMIT.windowMs,
      ),
      "kiosk-bootstrap",
      "address",
      CATALOGUE_MESSAGE,
    );
  }
  rejectIfLimited(
    consumeMemoryRateLimit(
      `kiosk-bootstrap:${vendorSlug}:all`,
      BOOTSTRAP_VENDOR_CAP.maximum,
      BOOTSTRAP_VENDOR_CAP.windowMs,
    ),
    "kiosk-bootstrap",
    "vendor-cap",
    CATALOGUE_MESSAGE,
  );
}
