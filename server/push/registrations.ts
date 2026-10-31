import "server-only";

import { logger } from "@/server/observability/logger";
import { vendorAppSessionPolicy } from "@/server/security/session-policy";
import { usesSupabaseBackend } from "@/server/supabase/config";
import { getSupabasePostgres } from "@/server/supabase/postgres";
import { sha256 } from "@/server/vendor/crypto";
import {
  readLocalVendorDatabase,
  updateLocalVendorDatabase,
  type VendorDatabase,
  type VendorSessionRecord,
} from "@/server/vendor/database";
import { fieldError, VendorServiceError } from "@/server/vendor/errors";
import { isMigrationError, withAccountTransaction } from "@/server/vendor/supabase-accounts";

/**
 * Which phones get a new-order notification. On Supabase this is the
 * definer-only private.vendor_push_registrations (migration 20261101120000);
 * the local store keeps the same data on the phone's session record. Both
 * follow the same rules: a token belongs to one live phone session, and goes
 * when that session ends.
 */
const MIGRATION = "20261101120000";
const FCM_TOKEN_PATTERN = /^[A-Za-z0-9_:.-]{32,4096}$/;
/** Only an order this fresh is announced. */
const ORDER_ALERT_WINDOW_MS = 15 * 60_000;
const MAX_TARGETS = 200;

export type PushSession = Readonly<{ sessionHash: string; userId: string }>;
export type PushTarget = Readonly<{ tokenHash: string; token: string }>;

type RegistrationOutcome = "registered" | "forbidden" | "invalid_token";

function assertRegistered(outcome: string | undefined): void {
  if (outcome === "registered") return;
  if (outcome === "invalid_token") {
    throw fieldError("fcmToken", "INVALID_PUSH_TOKEN", "Send a valid push token.");
  }
  throw new VendorServiceError(401, "UNAUTHENTICATED", "Sign in to continue.");
}

function liveLocalAppSession(database: VendorDatabase, session: PushSession, now: number): number {
  const index = database.sessions.findIndex(
    (candidate) =>
      candidate.idHash === session.sessionHash &&
      candidate.userId === session.userId &&
      candidate.scope === "vendor_app" &&
      Date.parse(candidate.expiresAt) > now,
  );
  const user = database.users.find((candidate) => candidate.id === session.userId);
  return user?.active ? index : -1;
}

function withoutPush(session: VendorSessionRecord): VendorSessionRecord {
  const next: { -readonly [Key in keyof VendorSessionRecord]: VendorSessionRecord[Key] } = {
    ...session,
  };
  delete next.push;
  return next;
}

/** The phone session presented receives notifications at this token. */
export async function registerSessionPushToken(
  session: PushSession,
  fcmToken: string,
): Promise<void> {
  if (usesSupabaseBackend()) {
    const outcome = await withAccountTransaction(
      session,
      async (sql) => {
        const [row] = await sql<Array<{ outcome: string }>>`
          select private.register_push_token(${fcmToken}) as outcome
        `;
        return row?.outcome;
      },
      { migration: MIGRATION },
    );
    assertRegistered(outcome);
    return;
  }
  const outcome = await updateLocalVendorDatabase((database): RegistrationOutcome => {
    if (!FCM_TOKEN_PATTERN.test(fcmToken)) return "invalid_token";
    const now = Date.now();
    const index = liveLocalAppSession(database, session, now);
    if (index < 0) return "forbidden";
    const tokenHash = sha256(fcmToken);
    const updatedAt = new Date(now).toISOString();
    // One session per token: on a shared phone the previous person stops getting them.
    database.sessions = database.sessions.map((candidate, position) => {
      if (position === index)
        return { ...candidate, push: { token: fcmToken, tokenHash, updatedAt } };
      return candidate.push?.tokenHash === tokenHash ? withoutPush(candidate) : candidate;
    });
    return "registered";
  });
  assertRegistered(outcome);
}

/** The phone session presented stops receiving notifications. */
export async function unregisterSessionPushToken(session: PushSession): Promise<void> {
  if (usesSupabaseBackend()) {
    await withAccountTransaction(
      session,
      async (sql) => {
        await sql`select private.unregister_push_token() as removed`;
      },
      { migration: MIGRATION },
    );
    return;
  }
  await updateLocalVendorDatabase((database) => {
    const index = liveLocalAppSession(database, session, Date.now());
    if (index >= 0) database.sessions[index] = withoutPush(database.sessions[index]);
  });
}

// The local store is single-process, so its "announced once" record can live in memory.
const locallyClaimed = new Map<string, number>();

function claimLocally(database: VendorDatabase, vendorId: string, orderId: string): PushTarget[] {
  const now = Date.now();
  for (const [key, claimedAt] of locallyClaimed) {
    if (claimedAt < now - ORDER_ALERT_WINDOW_MS) locallyClaimed.delete(key);
  }
  const order = database.orders.find(
    (candidate) => candidate.vendorId === vendorId && candidate.id === orderId,
  );
  const vendor = database.vendors.find((candidate) => candidate.id === vendorId);
  const key = `${vendorId}:${orderId}`;
  if (
    !order ||
    order.status !== "prepared" ||
    Date.parse(order.createdAt) <= now - ORDER_ALERT_WINDOW_MS ||
    vendor?.status !== "active" ||
    locallyClaimed.has(key)
  ) {
    return [];
  }
  locallyClaimed.set(key, now);
  const maxSessionAge = vendorAppSessionPolicy().absoluteMs;
  const users = new Map(database.users.map((user) => [user.id, user]));
  const members = new Set(
    database.memberships
      .filter((membership) => membership.vendorId === vendorId && membership.active)
      .map((membership) => membership.userId),
  );
  return database.sessions
    .flatMap((session) => {
      const user = users.get(session.userId);
      const live =
        session.scope === "vendor_app" &&
        Date.parse(session.expiresAt) > now &&
        Date.parse(session.createdAt) > now - maxSessionAge &&
        members.has(session.userId) &&
        user?.active &&
        !user.mustChangePassword;
      return live && session.push ? [session.push] : [];
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, MAX_TARGETS)
    .map((push) => ({ tokenHash: push.tokenHash, token: push.token }));
}

let migrationWarningLogged = false;

/**
 * Claim a new kiosk order for announcement and list where to send it. Empty
 * when it was already claimed, is no longer waiting, or nobody has a phone
 * registered; null when the database has not been migrated yet.
 */
export async function claimOrderPushTargets(
  vendorId: string,
  orderId: string,
): Promise<PushTarget[] | null> {
  if (!usesSupabaseBackend()) {
    return claimLocally(await readLocalVendorDatabase(), vendorId, orderId);
  }
  const maxSessionAgeSeconds = Math.ceil(vendorAppSessionPolicy().absoluteMs / 1000);
  try {
    return await getSupabasePostgres().begin(async (sql) => {
      await sql`
        select
          set_config('statement_timeout', '5s', true),
          set_config('lock_timeout', '2s', true)
      `;
      const rows = await sql<Array<{ fcm_token_hash: string; fcm_token: string }>>`
        select fcm_token_hash, fcm_token
        from private.claim_order_push_targets(
          ${vendorId}::uuid,
          ${orderId}::uuid,
          make_interval(secs => ${maxSessionAgeSeconds}::double precision)
        )
      `;
      return rows.map((row) => ({ tokenHash: row.fcm_token_hash, token: row.fcm_token }));
    });
  } catch (error) {
    if (!isMigrationError(error)) throw error;
    if (!migrationWarningLogged) {
      migrationWarningLogged = true;
      logger.warn("push.migration_required", {
        message: `New-order notifications need migration ${MIGRATION}; skipping them until it is applied.`,
      });
    }
    return null;
  }
}

/**
 * Record how an announcement went and forget the tokens FCM rejected (only
 * those of this shop's members). Returns how many registrations it removed.
 */
export async function finishOrderPush(
  vendorId: string,
  orderId: string,
  result: Readonly<{ sent: number; failed: number; unregistered: readonly string[] }>,
): Promise<number> {
  const unregistered = [...new Set(result.unregistered)].slice(0, MAX_TARGETS);
  if (!usesSupabaseBackend()) {
    if (unregistered.length === 0) return 0;
    const rejected = new Set(unregistered);
    return updateLocalVendorDatabase((database) => {
      const members = new Set(
        database.memberships
          .filter((membership) => membership.vendorId === vendorId)
          .map((membership) => membership.userId),
      );
      let removed = 0;
      database.sessions = database.sessions.map((session) => {
        if (!session.push || !rejected.has(session.push.tokenHash)) return session;
        if (!members.has(session.userId)) return session;
        removed += 1;
        return withoutPush(session);
      });
      return removed;
    });
  }
  return getSupabasePostgres().begin(async (sql) => {
    await sql`select set_config('statement_timeout', '5s', true)`;
    const [row] = await sql<Array<{ removed: number }>>`
      select private.finish_order_push(
        ${vendorId}::uuid,
        ${orderId}::uuid,
        ${result.sent}::integer,
        ${result.failed}::integer,
        ${sql.array(unregistered)}::text[]
      ) as removed
    `;
    return Number(row?.removed ?? 0);
  });
}
