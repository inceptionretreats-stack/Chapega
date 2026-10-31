import "server-only";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { isBackgroundRefresh } from "@/domain/session-activity";
import { usesSupabaseBackend } from "@/server/supabase/config";
import {
  newAuditRecord,
  readVendorDatabase,
  updateVendorDatabase,
  type VendorDatabase,
  type VendorMembershipRecord,
  type VendorRecord,
  type VendorSessionRecord,
  type VendorUserRecord,
} from "@/server/vendor/database";
import {
  getVendorCredentialConfiguration,
  isRejectedLoginCredential,
} from "@/server/vendor/config";
import {
  derivePasswordHash,
  DUMMY_PASSWORD_HASH,
  DUMMY_PASSWORD_SALT,
  passwordHashNeedsRehash,
  randomToken,
  sha256,
  verifyPassword,
} from "@/server/vendor/crypto";
import { VendorServiceError } from "@/server/vendor/errors";
import {
  initialSessionExpiry,
  refreshedSessionExpiry,
  sessionIsLive,
  vendorAppMaxDevices,
  vendorAppSessionPolicy,
  vendorSessionPolicy,
  type SessionPolicy,
} from "@/server/security/session-policy";
import type {
  VendorAccessContext,
  VendorCapabilities,
  VendorIdentity,
  VendorRole,
  VendorUser,
} from "@/types/vendor";

export const VENDOR_SESSION_COOKIE = "chapega_vendor_session";

/**
 * Every Chapega Studio app token starts with this, so the two kinds of token
 * can never be confused and a leaked app token is recognisable.
 */
export const VENDOR_APP_TOKEN_PREFIX = "chapega_app_";
const VENDOR_APP_TOKEN_PATTERN = /^chapega_app_[A-Za-z0-9_-]{43}$/;

/** 'vendor': a Studio browser (cookie). 'vendor_app': a phone (Bearer token). */
export type VendorClientScope = "vendor" | "vendor_app";

export type PresentedVendorToken = Readonly<{ token: string; scope: VendorClientScope }>;

function sessionPolicyFor(scope: VendorClientScope): SessionPolicy {
  return scope === "vendor_app" ? vendorAppSessionPolicy() : vendorSessionPolicy();
}

/**
 * The credential a request presents. An `Authorization: Bearer` header is the
 * Chapega Studio app's: when present it is the only credential considered
 * (the cookie is ignored, and a malformed token means no session). Other
 * Authorization schemes are ignored. Otherwise the Studio cookie, which never
 * carries an app token.
 */
export function presentedVendorToken(request: NextRequest): PresentedVendorToken | null {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearer = /^bearer(?:\s+(.*))?$/i.exec(authorization);
  if (bearer) {
    const token = bearer[1]?.trim() ?? "";
    return VENDOR_APP_TOKEN_PATTERN.test(token) ? { token, scope: "vendor_app" } : null;
  }
  const cookie = request.cookies.get(VENDOR_SESSION_COOKIE)?.value;
  if (!cookie || cookie.startsWith(VENDOR_APP_TOKEN_PREFIX)) return null;
  return { token: cookie, scope: "vendor" };
}

// Unknown accounts verify against a dummy hash with the current parameters,
// so they cost exactly as much as a real account.
const DUMMY_SALT = DUMMY_PASSWORD_SALT;
const DUMMY_HASH = DUMMY_PASSWORD_HASH;

export function capabilitiesForVendorRole(role: VendorRole): VendorCapabilities {
  return Object.freeze({
    view_dashboard: true,
    manage_orders: true,
    manage_catalogue: role === "owner" || role === "manager",
    manage_settings: role === "owner",
    manage_team: role === "owner",
    // Irreversible, so not for staff: removing details could hide who ordered.
    erase_customer_data: role === "owner" || role === "manager",
  });
}

function vendorIdentity(vendor: VendorRecord): VendorIdentity {
  return {
    id: vendor.id,
    slug: vendor.slug,
    displayName: vendor.displayName,
    status: vendor.status,
  };
}

function membershipPairs(
  database: Pick<VendorDatabase, "memberships" | "vendors">,
  userId: string,
): Array<Readonly<{ membership: VendorMembershipRecord; vendor: VendorRecord }>> {
  const vendors = new Map(database.vendors.map((vendor) => [vendor.id, vendor]));
  return database.memberships.flatMap((membership) => {
    if (membership.userId !== userId) return [];
    const vendor = vendors.get(membership.vendorId);
    return vendor ? [{ membership, vendor }] : [];
  });
}

/** Build the public user only after identity, membership, and tenant checks. */
export function vendorUserFromDatabase(
  database: Pick<VendorDatabase, "memberships" | "vendors">,
  user: VendorUserRecord,
  activeVendorId: string,
): VendorUser | null {
  if (!user.active) return null;
  const pairs = membershipPairs(database, user.id);
  const active = pairs.find(
    ({ membership, vendor }) =>
      membership.vendorId === activeVendorId && membership.active && vendor.status === "active",
  );
  if (!active) return null;
  const capabilities = capabilitiesForVendorRole(active.membership.role);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platformRole,
    role: active.membership.role,
    activeVendor: vendorIdentity(active.vendor),
    memberships: pairs
      .map(({ membership, vendor }) => ({
        vendor: vendorIdentity(vendor),
        role: membership.role,
        active: membership.active,
        isDefault: membership.isDefault,
      }))
      .sort((left, right) => {
        if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
        return left.vendor.displayName.localeCompare(right.vendor.displayName);
      }),
    capabilities,
    ...(user.mustChangePassword ? { mustChangePassword: true as const } : {}),
  };
}

/**
 * Every Studio read and write goes through here. A user holding a password
 * someone else chose gets nothing (the bootstrap carries customer details)
 * until they change it; only change-password and sign-out skip this.
 */
export function vendorAccessContextFromUser(user: VendorUser): VendorAccessContext {
  if (user.activeVendor.status !== "active") {
    throw new VendorServiceError(
      403,
      "VENDOR_SUSPENDED",
      "This vendor account is currently suspended.",
    );
  }
  if (user.mustChangePassword) {
    throw new VendorServiceError(
      403,
      "PASSWORD_CHANGE_REQUIRED",
      "Set a new password to continue.",
    );
  }
  const capabilities = capabilitiesForVendorRole(user.role);
  return {
    user: { ...user, capabilities },
    vendor: user.activeVendor,
    membership: {
      vendorId: user.activeVendor.id,
      userId: user.id,
      role: user.role,
    },
    capabilities,
  };
}

function selectActiveVendorId(
  database: Pick<VendorDatabase, "memberships" | "vendors">,
  userId: string,
  requestedSlug?: string,
): string | null {
  const pairs = membershipPairs(database, userId).filter(({ membership }) => membership.active);
  if (requestedSlug) {
    const normalized = requestedSlug.trim().toLowerCase();
    const selected = pairs.find(({ vendor }) => vendor.slug === normalized);
    if (!selected || selected.vendor.status !== "active") return null;
    return selected.vendor.id;
  }
  const active = pairs.filter(({ vendor }) => vendor.status === "active");
  return (
    active.find(({ membership }) => membership.isDefault)?.vendor.id ?? active[0]?.vendor.id ?? null
  );
}

export async function authenticateVendorLogin(
  email: string,
  password: string,
  vendorSlug?: string,
): Promise<Readonly<{
  user: VendorUser;
  token: string;
  expiresAt: Date;
}> | null> {
  const configuration = getVendorCredentialConfiguration();
  if (!configuration.available) {
    throw new VendorServiceError(
      503,
      "AUTH_NOT_CONFIGURED",
      "Vendor sign-in is not configured. Add private vendor credentials on the server.",
    );
  }
  if (isRejectedLoginCredential(email, password)) return null;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedSlug = vendorSlug?.trim().toLowerCase() || undefined;
  const token = randomToken(32);
  const now = new Date();
  // The stored expiry is the idle deadline; it slides with activity up to the
  // absolute lifetime (server/security/session-policy.ts).
  const expiresAt = new Date(initialSessionExpiry(now.getTime(), vendorSessionPolicy()));

  if (usesSupabaseBackend()) {
    const { authenticateSupabaseVendorLogin } = await import("@/server/vendor/supabase-auth");
    const user = await authenticateSupabaseVendorLogin({
      email: normalizedEmail,
      password,
      vendorSlug: normalizedSlug,
      dummySalt: DUMMY_SALT,
      dummyHash: DUMMY_HASH,
      tokenHash: sha256(token),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return user ? { user, token, expiresAt } : null;
  }

  // Verify outside the serialized write queue: the hash is deliberately slow
  // and must not stall every other write while it runs.
  const snapshot = await readVendorDatabase();
  const verified = snapshot.users.find((record) => record.email === normalizedEmail);
  const valid = await verifyPassword(
    password,
    verified?.passwordSalt ?? DUMMY_SALT,
    verified?.passwordHash ?? DUMMY_HASH,
  );
  if (!verified || !verified.active || !valid) return null;
  // Upgrade hashes stored with older scrypt parameters (also outside the queue).
  const rehashed = passwordHashNeedsRehash(verified.passwordHash)
    ? await derivePasswordHash(password)
    : null;

  const user = await updateVendorDatabase(async (database) => {
    // Re-check under the write lock: a rotation or deactivation that landed
    // while the hash was computed must win.
    const index = database.users.findIndex((record) => record.id === verified.id);
    const current = database.users[index];
    if (
      !current ||
      !current.active ||
      current.passwordHash !== verified.passwordHash ||
      current.passwordSalt !== verified.passwordSalt
    ) {
      return null;
    }
    const candidate = rehashed
      ? { ...current, passwordSalt: rehashed.salt, passwordHash: rehashed.hash }
      : current;
    database.users[index] = candidate;
    const activeVendorId = selectActiveVendorId(database, candidate.id, normalizedSlug);
    if (!activeVendorId) {
      throw new VendorServiceError(
        403,
        "VENDOR_ACCESS_UNAVAILABLE",
        "No active vendor workspace is available for this account.",
      );
    }

    const otherSessions = database.sessions.filter(
      (session) => session.userId !== candidate.id || session.scope !== "vendor",
    );
    const recentVendorSessions = database.sessions
      .filter((session) => session.userId === candidate.id && session.scope === "vendor")
      .slice(-4);
    database.sessions = [...otherSessions, ...recentVendorSessions];
    database.sessions.push({
      idHash: sha256(token),
      userId: candidate.id,
      scope: "vendor",
      activeVendorId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    database.audit.push(
      newAuditRecord(candidate.id, "vendor.login", "auth", candidate.id, activeVendorId),
    );
    return vendorUserFromDatabase(database, candidate, activeVendorId);
  });
  return user ? { user, token, expiresAt } : null;
}

export type VendorAppDevice = Readonly<{
  /** A random UUID the app creates once per installation. */
  installationId: string;
  platform: "android" | "ios";
  model?: string;
  appVersion?: string;
}>;

export type VendorAppLogin = Readonly<{
  user: VendorUser;
  token: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  /** Other phones of this person signed out to stay within the limit. */
  signedOutDevices: number;
}>;

/** The installation id itself is never stored, only this. */
export function vendorAppDeviceHash(installationId: string): string {
  return sha256(`chapega-device:v1:${installationId.trim().toLowerCase()}`);
}

/**
 * Chapega Studio app sign-in. Same checks and timing as Studio sign-in, but
 * the session is a phone's ('vendor_app'): it leaves the person's browser
 * sessions alone, replaces this phone's previous session, and beyond
 * VENDOR_APP_MAX_DEVICES phones signs out the one used least recently.
 */
export async function authenticateVendorAppLogin(input: {
  email: string;
  password: string;
  vendorSlug?: string;
  device: VendorAppDevice;
}): Promise<VendorAppLogin | null> {
  const configuration = getVendorCredentialConfiguration();
  if (!configuration.available) {
    throw new VendorServiceError(
      503,
      "AUTH_NOT_CONFIGURED",
      "Vendor sign-in is not configured. Add private vendor credentials on the server.",
    );
  }
  if (isRejectedLoginCredential(input.email, input.password)) return null;
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedSlug = input.vendorSlug?.trim().toLowerCase() || undefined;
  const token = `${VENDOR_APP_TOKEN_PREFIX}${randomToken(32)}`;
  const now = new Date();
  const rules = vendorAppSessionPolicy();
  const expiresAt = new Date(initialSessionExpiry(now.getTime(), rules));
  const absoluteExpiresAt = new Date(now.getTime() + rules.absoluteMs);
  const maxDevices = vendorAppMaxDevices();
  const device = {
    hash: vendorAppDeviceHash(input.device.installationId),
    platform: input.device.platform,
    ...(input.device.model ? { model: input.device.model } : {}),
    ...(input.device.appVersion ? { appVersion: input.device.appVersion } : {}),
  };

  if (usesSupabaseBackend()) {
    const { authenticateSupabaseVendorAppLogin } = await import("@/server/vendor/supabase-auth");
    const result = await authenticateSupabaseVendorAppLogin({
      email: normalizedEmail,
      password: input.password,
      vendorSlug: normalizedSlug,
      dummySalt: DUMMY_SALT,
      dummyHash: DUMMY_HASH,
      tokenHash: sha256(token),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      device: { ...device, maxDevices },
    });
    return result ? { ...result, token, expiresAt, absoluteExpiresAt } : null;
  }

  // Verify outside the serialized write queue, as Studio sign-in does.
  const snapshot = await readVendorDatabase();
  const verified = snapshot.users.find((record) => record.email === normalizedEmail);
  const valid = await verifyPassword(
    input.password,
    verified?.passwordSalt ?? DUMMY_SALT,
    verified?.passwordHash ?? DUMMY_HASH,
  );
  if (!verified || !verified.active || !valid) return null;
  const rehashed = passwordHashNeedsRehash(verified.passwordHash)
    ? await derivePasswordHash(input.password)
    : null;

  const result = await updateVendorDatabase(async (database) => {
    const index = database.users.findIndex((record) => record.id === verified.id);
    const current = database.users[index];
    if (
      !current ||
      !current.active ||
      current.passwordHash !== verified.passwordHash ||
      current.passwordSalt !== verified.passwordSalt
    ) {
      return null;
    }
    const candidate = rehashed
      ? { ...current, passwordSalt: rehashed.salt, passwordHash: rehashed.hash }
      : current;
    database.users[index] = candidate;
    const activeVendorId = selectActiveVendorId(database, candidate.id, normalizedSlug);
    if (!activeVendorId) {
      throw new VendorServiceError(
        403,
        "VENDOR_ACCESS_UNAVAILABLE",
        "No active vendor workspace is available for this account.",
      );
    }
    const isOwnPhone = (session: VendorSessionRecord) =>
      session.userId === candidate.id && session.scope === "vendor_app";
    // This phone's previous session and ended ones go; then keep the phones
    // used most recently (latest idle deadline), leaving room for this one.
    const otherPhones = database.sessions
      .filter(
        (session) =>
          isOwnPhone(session) &&
          session.device?.hash !== device.hash &&
          Date.parse(session.expiresAt) > now.getTime(),
      )
      .sort((left, right) => Date.parse(right.expiresAt) - Date.parse(left.expiresAt));
    const kept = otherPhones.slice(0, Math.max(maxDevices - 1, 0));
    database.sessions = [
      ...database.sessions.filter((session) => !isOwnPhone(session)),
      ...kept,
      {
        idHash: sha256(token),
        userId: candidate.id,
        scope: "vendor_app",
        activeVendorId,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        device,
      },
    ];
    database.audit.push(
      newAuditRecord(candidate.id, "vendor.app.login", "auth", candidate.id, activeVendorId),
    );
    const user = vendorUserFromDatabase(database, candidate, activeVendorId);
    return user ? { user, signedOutDevices: otherPhones.length - kept.length } : null;
  });
  return result ? { ...result, token, expiresAt, absoluteExpiresAt } : null;
}

export async function destroyVendorSession(
  token: string,
  scope: VendorClientScope = "vendor",
): Promise<void> {
  if (!token) return;
  const tokenHash = sha256(token);
  if (usesSupabaseBackend()) {
    const { destroySupabaseVendorSession } = await import("@/server/vendor/supabase-auth");
    await destroySupabaseVendorSession(tokenHash, scope);
    return;
  }
  await updateVendorDatabase((database) => {
    const session = database.sessions.find(
      (candidate) => candidate.idHash === tokenHash && candidate.scope === scope,
    );
    database.sessions = database.sessions.filter(
      (candidate) => candidate.idHash !== tokenHash || candidate.scope !== scope,
    );
    if (session) {
      database.audit.push(
        newAuditRecord(
          session.userId,
          scope === "vendor_app" ? "vendor.app.logout" : "vendor.logout",
          "auth",
          session.userId,
          session.activeVendorId,
        ),
      );
    }
  });
}

export type VendorSessionLookup = Readonly<{
  user: VendorUser;
  sessionHash: string;
  createdAt: number;
  /** The idle deadline, after this request's extension. */
  expiresAt: number;
  absoluteExpiresAt: number;
}>;

/**
 * The live session behind a token. `scope` says how the token arrived: a
 * cookie only matches a Studio session, a Bearer token only a phone's.
 * `countsAsActivity: false` authenticates without sliding the idle deadline;
 * timer-driven refreshes use it so an unattended tab or phone still times out.
 */
export async function getVendorSessionByToken(
  token: string | undefined,
  vendorSlug?: string,
  {
    countsAsActivity = true,
    scope = "vendor",
  }: { countsAsActivity?: boolean; scope?: VendorClientScope } = {},
): Promise<VendorSessionLookup | null> {
  if (!token || !getVendorCredentialConfiguration().available) return null;
  const tokenHash = sha256(token);
  const rules = sessionPolicyFor(scope);
  if (usesSupabaseBackend()) {
    const { getSupabaseVendorSessionByToken } = await import("@/server/vendor/supabase-auth");
    const session = await getSupabaseVendorSessionByToken(
      tokenHash,
      vendorSlug,
      rules,
      countsAsActivity,
      scope,
    );
    return session
      ? {
          ...session,
          sessionHash: tokenHash,
          absoluteExpiresAt: session.createdAt + rules.absoluteMs,
        }
      : null;
  }
  const database = await readVendorDatabase();
  const now = Date.now();
  const session = database.sessions.find(
    (candidate) => candidate.idHash === tokenHash && candidate.scope === scope,
  );
  const times = session
    ? { createdAt: Date.parse(session.createdAt), expiresAt: Date.parse(session.expiresAt) }
    : null;
  if (!session || !times || !sessionIsLive(times, now, rules)) return null;
  const user = database.users.find(
    (candidate) => candidate.id === session.userId && candidate.active,
  );
  if (!user) return null;
  const activeVendorId = vendorSlug
    ? selectActiveVendorId(database, user.id, vendorSlug)
    : session.activeVendorId;
  const vendorUser = activeVendorId ? vendorUserFromDatabase(database, user, activeVendorId) : null;
  if (!vendorUser) return null;

  // Slide the idle deadline (written only when it moves by the policy's granularity).
  const refreshed = countsAsActivity ? refreshedSessionExpiry(times, now, rules) : null;
  if (refreshed !== null) {
    await updateVendorDatabase((draft) => {
      const index = draft.sessions.findIndex(
        (candidate) => candidate.idHash === tokenHash && candidate.scope === scope,
      );
      const current = draft.sessions[index];
      if (current) {
        draft.sessions[index] = { ...current, expiresAt: new Date(refreshed).toISOString() };
      }
    });
  }
  return {
    user: vendorUser,
    sessionHash: tokenHash,
    createdAt: times.createdAt,
    expiresAt: refreshed ?? times.expiresAt,
    absoluteExpiresAt: times.createdAt + rules.absoluteMs,
  };
}

export async function getVendorUserByToken(
  token: string | undefined,
  vendorSlug?: string,
  options: { countsAsActivity?: boolean; scope?: VendorClientScope } = {},
): Promise<VendorUser | null> {
  return (await getVendorSessionByToken(token, vendorSlug, options))?.user ?? null;
}

export async function getRequestVendorUser(
  request: NextRequest,
  vendorSlug?: string,
): Promise<VendorUser | null> {
  const presented = presentedVendorToken(request);
  return getVendorUserByToken(presented?.token, vendorSlug, {
    countsAsActivity: !isBackgroundRefresh(request.headers),
    scope: presented?.scope,
  });
}

/**
 * The signed-in user and the hash of the session they presented, without the
 * password-change gate: only for changing that password.
 */
export async function getRequestVendorSession(
  request: NextRequest,
  vendorSlug?: string,
): Promise<Readonly<{ user: VendorUser; sessionHash: string; scope: VendorClientScope }> | null> {
  const presented = presentedVendorToken(request);
  if (!presented) return null;
  const session = await getVendorSessionByToken(presented.token, vendorSlug, {
    scope: presented.scope,
  });
  return session
    ? { user: session.user, sessionHash: session.sessionHash, scope: presented.scope }
    : null;
}

export async function getRequestVendorContext(
  request: NextRequest,
  vendorSlug?: string,
): Promise<VendorAccessContext | null> {
  const user = await getRequestVendorUser(request, vendorSlug);
  return user ? vendorAccessContextFromUser(user) : null;
}

/** Pages: the Studio cookie only (never an app token). */
export async function getCurrentVendorUser(vendorSlug?: string): Promise<VendorUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(VENDOR_SESSION_COOKIE)?.value;
  return token?.startsWith(VENDOR_APP_TOKEN_PREFIX)
    ? null
    : getVendorUserByToken(token, vendorSlug);
}

export async function getCurrentVendorContext(
  vendorSlug?: string,
): Promise<VendorAccessContext | null> {
  const user = await getCurrentVendorUser(vendorSlug);
  return user ? vendorAccessContextFromUser(user) : null;
}
