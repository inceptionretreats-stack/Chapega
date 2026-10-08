import "server-only";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { usesSupabaseBackend } from "@/server/supabase/config";
import {
  newAuditRecord,
  readVendorDatabase,
  updateVendorDatabase,
  type VendorDatabase,
  type VendorMembershipRecord,
  type VendorRecord,
  type VendorUserRecord,
} from "@/server/vendor/database";
import {
  getVendorCredentialConfiguration,
  isRejectedLoginCredential,
} from "@/server/vendor/config";
import { randomToken, sha256, verifyPassword } from "@/server/vendor/crypto";
import { VendorServiceError } from "@/server/vendor/errors";
import type {
  VendorAccessContext,
  VendorCapabilities,
  VendorIdentity,
  VendorRole,
  VendorUser,
} from "@/types/vendor";

export const VENDOR_SESSION_COOKIE = "chapega_vendor_session";

const DUMMY_SALT = "v9r5N8vpY2h1bGt0c2FsdA==";
const DUMMY_HASH =
  "BNH0RAvPGCKOsKbr6HzrvcwgPGvpAl91FN7vNxwsg6qQX5VYYVE3L89Bg4FPmIz2zxaiZMT7WhHf93PSvtiNGQ==";

function sessionHours(): number {
  const candidate = Number(process.env.VENDOR_SESSION_HOURS ?? 12);
  return Number.isFinite(candidate) && candidate >= 1 && candidate <= 168
    ? candidate
    : 12;
}

export function capabilitiesForVendorRole(
  role: VendorRole,
): VendorCapabilities {
  return Object.freeze({
    view_dashboard: true,
    manage_orders: true,
    manage_catalogue: role === "owner" || role === "manager",
    manage_settings: role === "owner",
    manage_team: role === "owner",
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
): Array<
  Readonly<{ membership: VendorMembershipRecord; vendor: VendorRecord }>
> {
  const vendors = new Map(
    database.vendors.map((vendor) => [vendor.id, vendor]),
  );
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
      membership.vendorId === activeVendorId &&
      membership.active &&
      vendor.status === "active",
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
  };
}

export function vendorAccessContextFromUser(
  user: VendorUser,
): VendorAccessContext {
  if (user.activeVendor.status !== "active") {
    throw new VendorServiceError(
      403,
      "VENDOR_SUSPENDED",
      "This vendor account is currently suspended.",
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
  const pairs = membershipPairs(database, userId).filter(
    ({ membership }) => membership.active,
  );
  if (requestedSlug) {
    const normalized = requestedSlug.trim().toLowerCase();
    const selected = pairs.find(({ vendor }) => vendor.slug === normalized);
    if (!selected || selected.vendor.status !== "active") return null;
    return selected.vendor.id;
  }
  const active = pairs.filter(({ vendor }) => vendor.status === "active");
  return (
    active.find(({ membership }) => membership.isDefault)?.vendor.id ??
    active[0]?.vendor.id ??
    null
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
  const expiresAt = new Date(now.getTime() + sessionHours() * 60 * 60 * 1_000);

  if (usesSupabaseBackend()) {
    const { authenticateSupabaseVendorLogin } =
      await import("@/server/vendor/supabase-auth");
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
  const verified = snapshot.users.find(
    (record) => record.email === normalizedEmail,
  );
  const valid = await verifyPassword(
    password,
    verified?.passwordSalt ?? DUMMY_SALT,
    verified?.passwordHash ?? DUMMY_HASH,
  );
  if (!verified || !verified.active || !valid) return null;

  const user = await updateVendorDatabase(async (database) => {
    // Re-check under the write lock: a rotation or deactivation that landed
    // while the hash was computed must win.
    const candidate = database.users.find((record) => record.id === verified.id);
    if (
      !candidate ||
      !candidate.active ||
      candidate.passwordHash !== verified.passwordHash ||
      candidate.passwordSalt !== verified.passwordSalt
    ) {
      return null;
    }
    const activeVendorId = selectActiveVendorId(
      database,
      candidate.id,
      normalizedSlug,
    );
    if (!activeVendorId) {
      throw new VendorServiceError(
        403,
        "VENDOR_ACCESS_UNAVAILABLE",
        "No active vendor workspace is available for this account.",
      );
    }

    const otherSessions = database.sessions.filter(
      (session) =>
        session.userId !== candidate.id || session.scope !== "vendor",
    );
    const recentVendorSessions = database.sessions
      .filter(
        (session) =>
          session.userId === candidate.id && session.scope === "vendor",
      )
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
      newAuditRecord(
        candidate.id,
        "vendor.login",
        "auth",
        candidate.id,
        activeVendorId,
      ),
    );
    return vendorUserFromDatabase(database, candidate, activeVendorId);
  });
  return user ? { user, token, expiresAt } : null;
}

export async function destroyVendorSession(token: string): Promise<void> {
  if (!token) return;
  const tokenHash = sha256(token);
  if (usesSupabaseBackend()) {
    const { destroySupabaseVendorSession } =
      await import("@/server/vendor/supabase-auth");
    await destroySupabaseVendorSession(tokenHash);
    return;
  }
  await updateVendorDatabase((database) => {
    const session = database.sessions.find(
      (candidate) =>
        candidate.idHash === tokenHash && candidate.scope === "vendor",
    );
    database.sessions = database.sessions.filter(
      (candidate) =>
        candidate.idHash !== tokenHash || candidate.scope !== "vendor",
    );
    if (session) {
      database.audit.push(
        newAuditRecord(
          session.userId,
          "vendor.logout",
          "auth",
          session.userId,
          session.activeVendorId,
        ),
      );
    }
  });
}

export async function getVendorUserByToken(
  token: string | undefined,
  vendorSlug?: string,
): Promise<VendorUser | null> {
  if (!token || !getVendorCredentialConfiguration().available) return null;
  const tokenHash = sha256(token);
  if (usesSupabaseBackend()) {
    const { getSupabaseVendorUserByToken } =
      await import("@/server/vendor/supabase-auth");
    return getSupabaseVendorUserByToken(tokenHash, vendorSlug);
  }
  const database = await readVendorDatabase();
  const session = database.sessions.find(
    (candidate) =>
      candidate.idHash === tokenHash &&
      candidate.scope === "vendor" &&
      Date.parse(candidate.expiresAt) > Date.now(),
  );
  if (!session) return null;
  const user = database.users.find(
    (candidate) => candidate.id === session.userId && candidate.active,
  );
  if (!user) return null;
  const activeVendorId = vendorSlug
    ? selectActiveVendorId(database, user.id, vendorSlug)
    : session.activeVendorId;
  return activeVendorId
    ? vendorUserFromDatabase(database, user, activeVendorId)
    : null;
}

export async function getRequestVendorUser(
  request: NextRequest,
  vendorSlug?: string,
): Promise<VendorUser | null> {
  return getVendorUserByToken(
    request.cookies.get(VENDOR_SESSION_COOKIE)?.value,
    vendorSlug,
  );
}

export async function getRequestVendorContext(
  request: NextRequest,
  vendorSlug?: string,
): Promise<VendorAccessContext | null> {
  const user = await getRequestVendorUser(request, vendorSlug);
  return user ? vendorAccessContextFromUser(user) : null;
}

export async function getCurrentVendorUser(
  vendorSlug?: string,
): Promise<VendorUser | null> {
  const cookieStore = await cookies();
  return getVendorUserByToken(
    cookieStore.get(VENDOR_SESSION_COOKIE)?.value,
    vendorSlug,
  );
}

export async function getCurrentVendorContext(
  vendorSlug?: string,
): Promise<VendorAccessContext | null> {
  const user = await getCurrentVendorUser(vendorSlug);
  return user ? vendorAccessContextFromUser(user) : null;
}
