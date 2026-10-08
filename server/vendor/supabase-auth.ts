import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabasePostgres } from "@/server/supabase/postgres";
import type {
  VendorMembershipRecord,
  VendorRecord,
  VendorUserRecord,
} from "@/server/vendor/database";
import { logger, serializeError } from "@/server/observability/logger";
import {
  adminSessionPolicy,
  refreshedSessionExpiry,
  sessionIsLive,
  vendorSessionPolicy,
  type SessionPolicy,
  type SessionTimes,
} from "@/server/security/session-policy";
import {
  derivePasswordHash,
  passwordHashNeedsRehash,
  verifyPassword,
} from "@/server/vendor/crypto";
import { VendorServiceError } from "@/server/vendor/errors";
import { vendorUserFromDatabase } from "@/server/vendor/auth";
import type { PlatformAdminUser } from "@/types/admin";
import type { VendorUser } from "@/types/vendor";
import type postgres from "postgres";

type QueryClient = postgres.Sql | postgres.TransactionSql;
type DateValue = Date | string;

type CredentialUserRow = {
  id: string;
  email: string;
  name: string;
  platform_role: VendorUserRecord["platformRole"];
  password_salt: string;
  password_hash: string;
  active: boolean;
  created_at: DateValue;
};

type MembershipRow = {
  vendor_id: string;
  user_id: string;
  role: VendorMembershipRecord["role"];
  active: boolean;
  is_default: boolean;
  created_at: DateValue;
};

type VendorRow = {
  id: string;
  slug: string;
  display_name: string;
  status: VendorRecord["status"];
  revision: number;
  created_at: DateValue;
  updated_at: DateValue;
};

type LoginInput = Readonly<{
  email: string;
  password: string;
  vendorSlug?: string;
  dummySalt: string;
  dummyHash: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}>;

type PlatformLoginInput = Omit<LoginInput, "vendorSlug">;

function iso(value: DateValue): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function backendUnavailable(message: string, cause: unknown): VendorServiceError {
  const error = new VendorServiceError(503, "BACKEND_UNAVAILABLE", message);
  error.cause = cause;
  return error;
}

async function setContext(
  sql: QueryClient,
  name: string,
  value: string,
): Promise<void> {
  await sql`select set_config(${name}, ${value}, true)`;
}

function userRecord(row: CredentialUserRow): VendorUserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    platformRole: row.platform_role,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    active: row.active,
    createdAt: iso(row.created_at),
  };
}

function membershipRecord(row: MembershipRow): VendorMembershipRecord {
  return {
    vendorId: row.vendor_id,
    userId: row.user_id,
    role: row.role,
    active: row.active,
    isDefault: row.is_default,
    createdAt: iso(row.created_at),
  };
}

function vendorRecord(row: VendorRow): VendorRecord {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    status: row.status,
    revision: Number(row.revision),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function credentialsByEmail(
  sql: QueryClient,
  email: string,
): Promise<CredentialUserRow | undefined> {
  await setContext(sql, "app.auth_email", email);
  const [user] = await sql<CredentialUserRow[]>`
    select
      id, email, name, platform_role, password_salt, password_hash, active,
      created_at
    from private.vendor_users
    where email = ${email}
    limit 1
  `;
  return user;
}

/**
 * Read the credential row in its own short transaction (app.auth_email is a
 * transaction-local setting), so the connection is released before the
 * deliberately slow password hash runs.
 */
async function loadCredentials(
  email: string,
  failureMessage: string,
): Promise<CredentialUserRow | undefined> {
  try {
    return await getSupabasePostgres().begin((transaction) =>
      credentialsByEmail(transaction, email),
    );
  } catch (error) {
    throw backendUnavailable(failureMessage, error);
  }
}

/**
 * Re-read the credential row under the per-user advisory lock. A password
 * rotation or deactivation that landed while the hash was being computed
 * must not be bypassed by the session we are about to create.
 */
async function credentialsStillValid(
  sql: QueryClient,
  verified: CredentialUserRow,
): Promise<CredentialUserRow | null> {
  const [current] = await sql<CredentialUserRow[]>`
    select
      id, email, name, platform_role, password_salt, password_hash, active,
      created_at
    from private.vendor_users
    where id = ${verified.id}
    limit 1
  `;
  if (
    !current ||
    !current.active ||
    current.password_hash !== verified.password_hash ||
    current.password_salt !== verified.password_salt
  ) {
    return null;
  }
  return current;
}

type Rehash = Readonly<{ salt: string; hash: string }>;

/** Compute an upgraded hash (outside any transaction) when one is due. */
async function rehashIfNeeded(
  password: string,
  user: CredentialUserRow,
): Promise<Rehash | null> {
  return passwordHashNeedsRehash(user.password_hash)
    ? derivePasswordHash(password)
    : null;
}

/**
 * Store the upgraded hash through private.rehash_own_password (migration
 * 20261008130000_auth_hardening). It runs in a savepoint so a missing or
 * failing function only skips the upgrade and never fails the sign-in.
 */
async function storeRehash(
  transaction: postgres.TransactionSql,
  user: CredentialUserRow,
  rehash: Rehash,
): Promise<void> {
  try {
    await transaction.savepoint(async (savepoint) => {
      await savepoint`
        select private.rehash_own_password(
          ${user.id}::uuid, ${user.password_hash}, ${rehash.salt}, ${rehash.hash}
        )
      `;
    });
  } catch (error) {
    logger.warn("auth.password_rehash_failed", {
      userId: user.id,
      error: serializeError(error),
    });
  }
}

async function membershipsForUser(
  sql: QueryClient,
  userId: string,
): Promise<VendorMembershipRecord[]> {
  const rows = await sql<MembershipRow[]>`
    select vendor_id, user_id, role, active, is_default, created_at
    from private.vendor_memberships
    where user_id = ${userId}
    order by is_default desc, created_at asc, vendor_id asc
  `;
  return rows.map(membershipRecord);
}

async function vendorById(
  sql: QueryClient,
  vendorId: string,
): Promise<VendorRecord | undefined> {
  await setContext(sql, "app.vendor_id", vendorId);
  const [row] = await sql<VendorRow[]>`
    select id, slug, display_name, status, revision, created_at, updated_at
    from private.vendors
    where id = ${vendorId}
    limit 1
  `;
  return row ? vendorRecord(row) : undefined;
}

async function vendorBySlug(
  sql: QueryClient,
  slug: string,
): Promise<VendorRecord | undefined> {
  await setContext(sql, "app.vendor_slug", slug);
  const [row] = await sql<VendorRow[]>`
    select id, slug, display_name, status, revision, created_at, updated_at
    from private.vendors
    where slug = ${slug}
      and status = 'active'
    limit 1
  `;
  return row ? vendorRecord(row) : undefined;
}

async function activeVendorForLogin(
  sql: QueryClient,
  memberships: readonly VendorMembershipRecord[],
  requestedSlug?: string,
): Promise<VendorRecord | undefined> {
  const activeMemberships = memberships.filter((record) => record.active);
  if (requestedSlug) {
    const vendor = await vendorBySlug(sql, requestedSlug);
    return vendor &&
      activeMemberships.some((record) => record.vendorId === vendor.id)
      ? vendor
      : undefined;
  }
  for (const membership of activeMemberships) {
    const vendor = await vendorById(sql, membership.vendorId);
    if (vendor?.status === "active") return vendor;
  }
  return undefined;
}

async function vendorsForMemberships(
  sql: QueryClient,
  memberships: readonly VendorMembershipRecord[],
  restoreVendorId: string,
): Promise<VendorRecord[]> {
  const vendors: VendorRecord[] = [];
  for (const membership of memberships) {
    const vendor = await vendorById(sql, membership.vendorId);
    if (vendor) vendors.push(vendor);
  }
  await setContext(sql, "app.vendor_id", restoreVendorId);
  return vendors;
}

async function publicVendorUser(
  sql: QueryClient,
  user: CredentialUserRow,
  activeVendorId: string,
): Promise<VendorUser | null> {
  await setContext(sql, "app.user_id", user.id);
  const memberships = await membershipsForUser(sql, user.id);
  const vendors = await vendorsForMemberships(sql, memberships, activeVendorId);
  return vendorUserFromDatabase(
    { memberships, vendors },
    userRecord(user),
    activeVendorId,
  );
}

export async function authenticateSupabaseVendorLogin(
  input: LoginInput,
): Promise<VendorUser | null> {
  const failureMessage = "Vendor sign-in could not reach Supabase.";
  const candidate = await loadCredentials(input.email, failureMessage);
  // Always run one full verification (against a dummy hash for unknown
  // accounts) so response time does not reveal which emails exist.
  const valid = await verifyPassword(
    input.password,
    candidate?.password_salt ?? input.dummySalt,
    candidate?.password_hash ?? input.dummyHash,
  );
  if (!candidate || !candidate.active || !valid) return null;
  const rehash = await rehashIfNeeded(input.password, candidate);

  try {
    return await getSupabasePostgres().begin(async (transaction) => {
      await setContext(transaction, "app.user_id", candidate.id);
      await transaction`
        select pg_advisory_xact_lock(hashtextextended(${candidate.id}, 0))
      `;
      const user = await credentialsStillValid(transaction, candidate);
      if (!user) return null;
      if (rehash) await storeRehash(transaction, user, rehash);
      const memberships = await membershipsForUser(transaction, user.id);
      const vendor = await activeVendorForLogin(
        transaction,
        memberships,
        input.vendorSlug,
      );
      if (!vendor) {
        throw new VendorServiceError(
          403,
          "VENDOR_ACCESS_UNAVAILABLE",
          "No active vendor workspace is available for this account.",
        );
      }
      await setContext(transaction, "app.vendor_id", vendor.id);
      await transaction`
        delete from private.vendor_sessions
        where user_id = ${user.id} and session_scope = 'vendor'
      `;
      await transaction`
        insert into private.vendor_sessions (
          id_hash, user_id, session_scope, active_vendor_id, created_at, expires_at
        ) values (
          ${input.tokenHash}, ${user.id}, 'vendor', ${vendor.id},
          ${input.createdAt}, ${input.expiresAt}
        )
      `;
      await transaction`
        insert into private.audit_log
          (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
        values
          (${randomUUID()}, ${vendor.id}, ${user.id}, 'vendor.login', 'auth',
           ${user.id}, now())
      `;
      await transaction`
        update private.app_state
        set revision = revision + 1, updated_at = now()
        where vendor_id = ${vendor.id}
      `;
      return publicVendorUser(transaction, user, vendor.id);
    });
  } catch (error) {
    if (error instanceof VendorServiceError) throw error;
    throw backendUnavailable(failureMessage, error);
  }
}

export async function destroySupabaseVendorSession(
  tokenHash: string,
): Promise<void> {
  try {
    await getSupabasePostgres().begin(async (transaction) => {
      await setContext(transaction, "app.session_hash", tokenHash);
      const [session] = await transaction<
        Array<{ user_id: string; active_vendor_id: string }>
      >`
        select user_id, active_vendor_id
        from private.vendor_sessions
        where id_hash = ${tokenHash}
          and session_scope = 'vendor'
        limit 1
      `;
      if (!session) return;
      await setContext(transaction, "app.user_id", session.user_id);
      await setContext(transaction, "app.vendor_id", session.active_vendor_id);
      await transaction`
        delete from private.vendor_sessions where id_hash = ${tokenHash}
      `;
      await transaction`
        insert into private.audit_log
          (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
        values
          (${randomUUID()}, ${session.active_vendor_id}, ${session.user_id},
           'vendor.logout', 'auth', ${session.user_id}, now())
      `;
      await transaction`
        update private.app_state
        set revision = revision + 1, updated_at = now()
        where vendor_id = ${session.active_vendor_id}
      `;
    });
  } catch (error) {
    if (error instanceof VendorServiceError) throw error;
    throw backendUnavailable("Vendor sign-out could not reach Supabase.", error);
  }
}

type SessionTimesRow = {
  created_at: DateValue;
  expires_at: DateValue;
  now: DateValue;
};

function sessionTimes(row: SessionTimesRow): Readonly<{ times: SessionTimes; now: number }> {
  return {
    times: {
      createdAt: new Date(row.created_at).getTime(),
      expiresAt: new Date(row.expires_at).getTime(),
    },
    now: new Date(row.now).getTime(),
  };
}

let refreshDeniedWarningLogged = false;

/**
 * Slide the session's idle deadline (database clock, capped by the absolute
 * lifetime). Needs the chapega_sessions_refresh policy from migration
 * 20261008130000_auth_hardening; runs in a savepoint so a failure never
 * turns a valid request into an error.
 */
async function slideSessionExpiry(
  transaction: postgres.TransactionSql,
  tokenHash: string,
  scope: "vendor" | "platform",
  row: SessionTimesRow,
  rules: SessionPolicy,
): Promise<void> {
  const { times, now } = sessionTimes(row);
  const refreshed = refreshedSessionExpiry(times, now, rules);
  if (refreshed === null) return;
  try {
    const updated = await transaction.savepoint(
      (savepoint) => savepoint<Array<{ id_hash: string }>>`
        update private.vendor_sessions
        set expires_at = ${new Date(refreshed).toISOString()}
        where id_hash = ${tokenHash} and session_scope = ${scope}
        returning id_hash
      `,
    );
    if (updated.length === 0 && !refreshDeniedWarningLogged) {
      refreshDeniedWarningLogged = true;
      logger.warn("auth.session_refresh_denied", {
        message:
          "Session expiry could not be extended (row-level security). Apply migration 20261008130000_auth_hardening.",
      });
    }
  } catch (error) {
    logger.warn("auth.session_refresh_failed", { scope, error: serializeError(error) });
  }
}

export async function getSupabaseVendorUserByToken(
  tokenHash: string,
  vendorSlug?: string,
  rules: SessionPolicy = vendorSessionPolicy(),
  countsAsActivity = true,
): Promise<VendorUser | null> {
  try {
    return await getSupabasePostgres().begin(async (transaction) => {
      await setContext(transaction, "app.session_hash", tokenHash);
      const [session] = await transaction<
        Array<{ user_id: string; active_vendor_id: string } & SessionTimesRow>
      >`
        select user_id, active_vendor_id, created_at, expires_at, now() as now
        from private.vendor_sessions
        where id_hash = ${tokenHash}
          and session_scope = 'vendor'
          and expires_at > now()
        limit 1
      `;
      if (!session) return null;
      const { times, now } = sessionTimes(session);
      if (!sessionIsLive(times, now, rules)) return null;
      await setContext(transaction, "app.user_id", session.user_id);
      await setContext(transaction, "app.vendor_id", session.active_vendor_id);
      const [user] = await transaction<CredentialUserRow[]>`
        select
          id, email, name, platform_role, password_salt, password_hash, active,
          created_at
        from private.vendor_users
        where id = ${session.user_id} and active
        limit 1
      `;
      if (!user) return null;
      const memberships = await membershipsForUser(transaction, user.id);
      const vendor = vendorSlug
        ? await activeVendorForLogin(
            transaction,
            memberships,
            vendorSlug.trim().toLowerCase(),
          )
        : await vendorById(transaction, session.active_vendor_id);
      if (!vendor || vendor.status !== "active") return null;
      const publicUser = await publicVendorUser(transaction, user, vendor.id);
      if (!publicUser) return null;
      if (countsAsActivity) {
        await slideSessionExpiry(transaction, tokenHash, "vendor", session, rules);
      }
      return publicUser;
    });
  } catch (error) {
    if (error instanceof VendorServiceError) throw error;
    throw backendUnavailable("The vendor session could not be verified.", error);
  }
}

function platformUser(row: CredentialUserRow): PlatformAdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: "super_admin",
  };
}

export async function authenticateSupabasePlatformLogin(
  input: PlatformLoginInput,
): Promise<PlatformAdminUser | null> {
  const failureMessage = "Platform sign-in could not reach Supabase.";
  const candidate = await loadCredentials(input.email, failureMessage);
  // One full verification even for unknown accounts (timing equalization).
  const valid = await verifyPassword(
    input.password,
    candidate?.password_salt ?? input.dummySalt,
    candidate?.password_hash ?? input.dummyHash,
  );
  if (
    !candidate ||
    !candidate.active ||
    candidate.platform_role !== "super_admin" ||
    !valid
  ) {
    return null;
  }
  const rehash = await rehashIfNeeded(input.password, candidate);

  try {
    return await getSupabasePostgres().begin(async (transaction) => {
      await setContext(transaction, "app.user_id", candidate.id);
      await transaction`
        select pg_advisory_xact_lock(hashtextextended(${candidate.id}, 0))
      `;
      const user = await credentialsStillValid(transaction, candidate);
      if (!user || user.platform_role !== "super_admin") return null;
      if (rehash) await storeRehash(transaction, user, rehash);
      await transaction`
        delete from private.vendor_sessions
        where user_id = ${user.id} and session_scope = 'platform'
      `;
      await transaction`
        insert into private.vendor_sessions (
          id_hash, user_id, session_scope, active_vendor_id, created_at, expires_at
        ) values (
          ${input.tokenHash}, ${user.id}, 'platform', null,
          ${input.createdAt}, ${input.expiresAt}
        )
      `;
      await setContext(transaction, "app.session_hash", input.tokenHash);
      await transaction`
        insert into private.audit_log
          (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
        values
          (${randomUUID()}, null, ${user.id}, 'platform.login', 'auth',
           ${user.id}, now())
      `;
      return platformUser(user);
    });
  } catch (error) {
    if (error instanceof VendorServiceError) throw error;
    throw backendUnavailable(failureMessage, error);
  }
}

export async function getSupabasePlatformUserByToken(
  tokenHash: string,
  rules: SessionPolicy = adminSessionPolicy(),
  countsAsActivity = true,
): Promise<PlatformAdminUser | null> {
  try {
    return await getSupabasePostgres().begin(async (transaction) => {
      await setContext(transaction, "app.session_hash", tokenHash);
      const [session] = await transaction<Array<{ user_id: string } & SessionTimesRow>>`
        select user_id, created_at, expires_at, now() as now
        from private.vendor_sessions
        where id_hash = ${tokenHash}
          and session_scope = 'platform'
          and active_vendor_id is null
          and expires_at > now()
        limit 1
      `;
      if (!session) return null;
      const { times, now } = sessionTimes(session);
      if (!sessionIsLive(times, now, rules)) return null;
      await setContext(transaction, "app.user_id", session.user_id);
      const [user] = await transaction<CredentialUserRow[]>`
        select
          id, email, name, platform_role, password_salt, password_hash, active,
          created_at
        from private.vendor_users
        where id = ${session.user_id}
          and active
          and platform_role = 'super_admin'
        limit 1
      `;
      if (!user) return null;
      if (countsAsActivity) {
        await slideSessionExpiry(transaction, tokenHash, "platform", session, rules);
      }
      return platformUser(user);
    });
  } catch (error) {
    if (error instanceof VendorServiceError) throw error;
    throw backendUnavailable("The platform session could not be verified.", error);
  }
}

export async function destroySupabasePlatformSession(
  tokenHash: string,
): Promise<void> {
  try {
    await getSupabasePostgres().begin(async (transaction) => {
      await setContext(transaction, "app.session_hash", tokenHash);
      const [session] = await transaction<
        Array<{ user_id: string; live: boolean }>
      >`
        select user_id, expires_at > now() as live
        from private.vendor_sessions
        where id_hash = ${tokenHash}
          and session_scope = 'platform'
        limit 1
      `;
      if (!session) return;
      await setContext(transaction, "app.user_id", session.user_id);
      if (!session.live) {
        await transaction`
          delete from private.vendor_sessions where id_hash = ${tokenHash}
        `;
        return;
      }
      await transaction`
        insert into private.audit_log
          (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
        values
          (${randomUUID()}, null, ${session.user_id}, 'platform.logout', 'auth',
           ${session.user_id}, now())
      `;
      await transaction`
        delete from private.vendor_sessions where id_hash = ${tokenHash}
      `;
    });
  } catch (error) {
    if (error instanceof VendorServiceError) throw error;
    throw backendUnavailable("Platform sign-out could not reach Supabase.", error);
  }
}
