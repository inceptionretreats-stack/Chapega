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
 * Phone (Chapega Studio app, session scope 'vendor_app'):
 *         VENDOR_APP_SESSION_IDLE_DAYS (default 14, 1-30),
 *         VENDOR_APP_SESSION_DAYS (default 30, 1-90),
 *         VENDOR_APP_MAX_DEVICES (default 3, 1-10): phones signed in per person.
 */
export type SessionPolicy = Readonly<{
  idleMs: number;
  absoluteMs: number;
  /** Expiry writes are skipped unless they move the deadline by at least this. */
  refreshGranularityMs?: number;
}>;

export type SessionTimes = Readonly<{
  createdAt: number;
  expiresAt: number;
}>;

/** Expiry writes are skipped unless they move the deadline by at least this. */
export const SESSION_REFRESH_GRANULARITY_MS = 60_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Range = Readonly<{
  name: string;
  fallback: number;
  min: number;
  max: number;
  integer?: boolean;
}>;

export const SESSION_SETTINGS = {
  vendorIdleMinutes: { name: "VENDOR_SESSION_IDLE_MINUTES", fallback: 30, min: 5, max: 1_440 },
  vendorHours: { name: "VENDOR_SESSION_HOURS", fallback: 12, min: 1, max: 168 },
  adminIdleMinutes: { name: "ADMIN_SESSION_IDLE_MINUTES", fallback: 15, min: 5, max: 240 },
  adminHours: { name: "ADMIN_SESSION_HOURS", fallback: 8, min: 1, max: 24 },
  vendorAppIdleDays: { name: "VENDOR_APP_SESSION_IDLE_DAYS", fallback: 14, min: 1, max: 30 },
  vendorAppDays: { name: "VENDOR_APP_SESSION_DAYS", fallback: 30, min: 1, max: 90 },
  vendorAppMaxDevices: {
    name: "VENDOR_APP_MAX_DEVICES",
    fallback: 3,
    min: 1,
    max: 10,
    integer: true,
  },
} as const satisfies Record<string, Range>;

/**
 * The longest any session may last, per scope. The database refuses longer
 * ones (vendor_sessions_lifetime_check and the chapega_sessions_refresh
 * policy, migration 20261101120000); a test keeps the two in step.
 */
export const SESSION_LIFETIME_CEILING_MS = {
  vendor: 168 * HOUR,
  platform: 168 * HOUR,
  vendor_app: 90 * DAY,
} as const;

/**
 * Problems with one session setting, or null. Invalid values are refused at
 * startup (server/config/startup.ts) rather than silently replaced.
 */
export function sessionSettingProblem(range: Range): string | null {
  const raw = process.env[range.name]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  const valid =
    Number.isFinite(value) &&
    value >= range.min &&
    value <= range.max &&
    (!range.integer || Number.isInteger(value));
  return valid
    ? null
    : `${range.name} must be ${range.integer ? "a whole number" : "a number"} between ${range.min} and ${range.max} (got "${raw.slice(0, 40)}").`;
}

function numberSetting(range: Range): number {
  const problem = sessionSettingProblem(range);
  if (problem) throw new Error(problem);
  const raw = process.env[range.name]?.trim();
  return raw ? Number(raw) : range.fallback;
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

/**
 * Phone sessions last days, not minutes. Their expiry is written at most
 * every 15 minutes, so polling phones don't write on every request.
 */
export function vendorAppSessionPolicy(): SessionPolicy {
  const absoluteMs = numberSetting(SESSION_SETTINGS.vendorAppDays) * DAY;
  return {
    idleMs: Math.min(numberSetting(SESSION_SETTINGS.vendorAppIdleDays) * DAY, absoluteMs),
    absoluteMs,
    refreshGranularityMs: 15 * MINUTE,
  };
}

/** How many phones one person can have signed in at once. */
export function vendorAppMaxDevices(): number {
  return numberSetting(SESSION_SETTINGS.vendorAppMaxDevices);
}

/** The idle deadline stored at sign-in. */
export function initialSessionExpiry(createdAt: number, rules: SessionPolicy): number {
  return createdAt + Math.min(rules.idleMs, rules.absoluteMs);
}

/** Live = before its idle deadline and within its absolute lifetime. */
export function sessionIsLive(session: SessionTimes, now: number, rules: SessionPolicy): boolean {
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
  const granularity = rules.refreshGranularityMs ?? SESSION_REFRESH_GRANULARITY_MS;
  return Math.abs(target - session.expiresAt) >= granularity ? target : null;
}
