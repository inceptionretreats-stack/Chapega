import "server-only";

/**
 * Session lifetime rules shared by the local and Supabase adapters.
 *
 * Every session has an idle timeout and an absolute lifetime. The stored
 * `expires_at` is the idle deadline: sign-in sets it to now + idle, and each
 * authenticated request slides it to now + idle, but never past
 * created_at + absolute. The cookie itself is a browser-session cookie.
 *
 * Vendor: VENDOR_SESSION_IDLE_MINUTES (default 30, 5-1440),
 *         VENDOR_SESSION_HOURS (default 12, 1-168).
 * Admin:  ADMIN_SESSION_IDLE_MINUTES (default 15, 5-240),
 *         ADMIN_SESSION_HOURS (default 8, 1-24).
 */
export type SessionPolicy = Readonly<{
  idleMs: number;
  absoluteMs: number;
}>;

export type SessionTimes = Readonly<{
  createdAt: number;
  expiresAt: number;
}>;

/** Expiry writes are skipped unless they move the deadline by at least this. */
export const SESSION_REFRESH_GRANULARITY_MS = 60_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Range = Readonly<{ name: string; fallback: number; min: number; max: number }>;

export const SESSION_SETTINGS = {
  vendorIdleMinutes: { name: "VENDOR_SESSION_IDLE_MINUTES", fallback: 30, min: 5, max: 1_440 },
  vendorHours: { name: "VENDOR_SESSION_HOURS", fallback: 12, min: 1, max: 168 },
  adminIdleMinutes: { name: "ADMIN_SESSION_IDLE_MINUTES", fallback: 15, min: 5, max: 240 },
  adminHours: { name: "ADMIN_SESSION_HOURS", fallback: 8, min: 1, max: 24 },
} as const satisfies Record<string, Range>;

function numberSetting(range: Range): number {
  const raw = process.env[range.name]?.trim();
  if (!raw) return range.fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= range.min && value <= range.max
    ? value
    : range.fallback;
}

function policy(idleMinutes: number, hours: number): SessionPolicy {
  const absoluteMs = hours * HOUR;
  return { idleMs: Math.min(idleMinutes * MINUTE, absoluteMs), absoluteMs };
}

export function vendorSessionPolicy(): SessionPolicy {
  return policy(
    numberSetting(SESSION_SETTINGS.vendorIdleMinutes),
    numberSetting(SESSION_SETTINGS.vendorHours),
  );
}

export function adminSessionPolicy(): SessionPolicy {
  return policy(
    numberSetting(SESSION_SETTINGS.adminIdleMinutes),
    numberSetting(SESSION_SETTINGS.adminHours),
  );
}

/** The idle deadline stored at sign-in. */
export function initialSessionExpiry(createdAt: number, rules: SessionPolicy): number {
  return createdAt + Math.min(rules.idleMs, rules.absoluteMs);
}

/** Live = before its idle deadline and within its absolute lifetime. */
export function sessionIsLive(
  session: SessionTimes,
  now: number,
  rules: SessionPolicy,
): boolean {
  return session.expiresAt > now && session.createdAt + rules.absoluteMs > now;
}

/**
 * The new idle deadline to persist for a live session, or null when the
 * stored one is already within the refresh granularity. Sessions created
 * before idle timeouts existed are shortened to now + idle here.
 */
export function refreshedSessionExpiry(
  session: SessionTimes,
  now: number,
  rules: SessionPolicy,
): number | null {
  if (!sessionIsLive(session, now, rules)) return null;
  const target = Math.min(now + rules.idleMs, session.createdAt + rules.absoluteMs);
  return Math.abs(target - session.expiresAt) >= SESSION_REFRESH_GRANULARITY_MS
    ? target
    : null;
}
