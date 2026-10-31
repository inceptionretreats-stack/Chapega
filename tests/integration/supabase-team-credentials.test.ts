import { createHash, randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { VendorIdentity } from "@/types/vendor";
import {
  ADMIN_URL,
  APP_PASSWORD,
  CHAPEGA_ID,
  MULTI_VENDOR_MIGRATION,
  OWNER,
  ROLE_MIGRATION,
  SUPABASE_STUBS,
  applyMigration,
  clientOptions,
  migrationFiles,
  ownerContext,
  useApplicationDatabase,
} from "./helpers";

vi.mock("server-only", () => ({}));

type Team = typeof import("@/server/vendor/team");
type Passwords = typeof import("@/server/vendor/account-password");

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Migration 20261030122000 on a real Postgres: every team and password
 * function proves the caller from the session it presented, never from
 * app.user_id or app.vendor_id alone.
 */
describe.skipIf(!ADMIN_URL)("team and credential functions on a real Postgres", () => {
  const databaseName = `chapega_team_${Date.now()}`;
  let root: postgres.Sql;
  let admin: postgres.Sql;
  let appUrl: URL;
  let team: Team;
  let passwords: Passwords;
  let ownerId: string;
  let chapega: VendorIdentity;
  let vendorB: VendorIdentity & { ownerId: string };
  let capabilities: (typeof import("@/server/vendor/auth"))["capabilitiesForVendorRole"];
  let hash: (typeof import("@/server/vendor/crypto"))["derivePasswordHash"];

  async function session(userId: string, vendorId: string | null, scope = "vendor", live = true) {
    const token = randomUUID();
    await admin`
      insert into private.vendor_sessions
        (id_hash, user_id, session_scope, active_vendor_id, created_at, expires_at)
      values (${sha256(token)}, ${userId}, ${scope}, ${vendorId},
              now() - interval '1 minute',
              ${live ? admin`now() + interval '1 hour'` : admin`now() - interval '1 second'`})
    `;
    return sha256(token);
  }

  function ownerActor(sessionHash: string, vendor = chapega, userId = ownerId) {
    return { access: ownerContext(vendor, userId, capabilities("owner")), sessionHash };
  }

  /** Calls one function as the runtime role with the given request settings. */
  async function asApp<T>(
    settings: Readonly<{ sessionHash?: string; userId?: string; vendorId?: string }>,
    run: (sql: postgres.TransactionSql) => Promise<T>,
  ): Promise<T> {
    const app = postgres(appUrl.toString(), clientOptions());
    try {
      return (await app.begin(async (sql) => {
        await sql`
          select set_config('app.session_hash', ${settings.sessionHash ?? ""}, true),
                 set_config('app.user_id', ${settings.userId ?? ""}, true),
                 set_config('app.vendor_id', ${settings.vendorId ?? ""}, true)`;
        return run(sql);
      })) as T;
    } finally {
      await app.end({ timeout: 5 });
    }
  }

  async function user(email: string) {
    const [row] = await admin<
      Array<{ id: string; must_change_password: boolean; password_hash: string; active: boolean }>
    >`select id, must_change_password, password_hash, active from private.vendor_users
      where email = ${email}`;
    return row;
  }

  beforeAll(async () => {
    root = postgres(ADMIN_URL!, clientOptions());
    await root.unsafe(`create database ${databaseName}`);
    const databaseUrl = new URL(ADMIN_URL!);
    databaseUrl.pathname = `/${databaseName}`;
    admin = postgres(databaseUrl.toString(), clientOptions());
    await admin.unsafe(SUPABASE_STUBS);
    for (const file of migrationFiles()) {
      await applyMigration(admin, file);
      if (file === MULTI_VENDOR_MIGRATION) await applyMigration(admin, ROLE_MIGRATION);
    }
    const { provisionRuntimeRole } = await import("@/scripts/provision-supabase-role");
    await provisionRuntimeRole(admin, APP_PASSWORD);
    appUrl = useApplicationDatabase(databaseUrl);

    hash = (await import("@/server/vendor/crypto")).derivePasswordHash;
    capabilities = (await import("@/server/vendor/auth")).capabilitiesForVendorRole;
    const { bootstrapFirstOwner } = await import("@/scripts/bootstrap-supabase-owner");
    ({ userId: ownerId } = await bootstrapFirstOwner(
      admin,
      { vendorSlug: "chapega", ...OWNER },
      hash,
    ));
    team = await import("@/server/vendor/team");
    passwords = await import("@/server/vendor/account-password");
    chapega = { id: CHAPEGA_ID, slug: "chapega", displayName: "Chapega.com", status: "active" };

    const platformSession = await session(ownerId, null, "platform");
    const { createAdminVendor } = await import("@/server/admin/service");
    const created = await createAdminVendor(
      {
        user: { id: ownerId, email: OWNER.email, name: OWNER.name, role: "super_admin" },
        sessionHash: platformSession,
      },
      {
        displayName: "Second Shop",
        slug: "second-shop",
        ownerName: "Second Owner",
        ownerEmail: "second@team.test",
        ownerWhatsAppNumber: "9876501234",
        temporaryPassword: "Second-Shop-Owner-2026",
      },
    );
    vendorB = {
      id: created.vendor.id,
      slug: created.vendor.slug,
      displayName: created.vendor.displayName,
      status: "active",
      ownerId: created.vendor.owner.id,
    };
  }, 180_000);

  afterAll(async () => {
    const { getSupabasePostgres } = await import("@/server/supabase/postgres");
    await getSupabasePostgres()
      .end({ timeout: 5 })
      .catch(() => undefined);
    await admin?.end({ timeout: 5 });
    await root?.unsafe(`drop database if exists ${databaseName} with (force)`);
    await root?.end({ timeout: 5 });
  });

  it("flags an admin-created owner until they choose their own password", async () => {
    expect((await user("second@team.test")).must_change_password).toBe(true);
    // A flagged owner cannot manage the team.
    const flagged = await session(vendorB.ownerId, vendorB.id);
    await expect(
      team.listVendorTeam(ownerActor(flagged, vendorB, vendorB.ownerId)),
    ).rejects.toMatchObject({
      status: 403,
    });

    const current = await user("second@team.test");
    await passwords.changeOwnPassword(
      {
        scope: "vendor",
        userId: vendorB.ownerId,
        email: "second@team.test",
        name: "Second Owner",
        sessionHash: flagged,
      },
      { currentPassword: "Second-Shop-Owner-2026", newPassword: "lighthouse keepers brew tea" },
    );
    const after = await user("second@team.test");
    expect(after.must_change_password).toBe(false);
    expect(after.password_hash).not.toBe(current.password_hash);
    const [{ count }] = await admin<{ count: number }[]>`
      select count(*)::int as count from private.audit_log
      where action = 'vendor.password.changed' and entity_id = ${vendorB.ownerId}`;
    expect(count).toBe(1);
  });

  it("lets an owner add staff with a temporary password, once per email", async () => {
    const actor = ownerActor(await session(ownerId, CHAPEGA_ID));
    const member = await team.addVendorTeamMember(actor, {
      name: "Asha Staff",
      email: "asha@team.test",
      role: "staff",
      temporaryPassword: "mango orchards in monsoon",
    });
    expect(member).toMatchObject({
      role: "staff",
      active: true,
      passwordChangePending: true,
      canManage: true,
      canResetPassword: true,
    });
    const [membership] = await admin<{ role: string; is_default: boolean }[]>`
      select role, is_default from private.vendor_memberships
      where vendor_id = ${CHAPEGA_ID} and user_id = ${member.userId}`;
    expect(membership).toEqual({ role: "staff", is_default: true });

    await expect(
      team.addVendorTeamMember(actor, {
        name: "Asha Again",
        email: "asha@team.test",
        role: "manager",
        temporaryPassword: "mango orchards in monsoon",
      }),
    ).rejects.toMatchObject({ status: 409, code: "ALREADY_ON_TEAM" });
    // Another shop's account: refused without saying where it is used.
    await expect(
      team.addVendorTeamMember(actor, {
        name: "Second Owner",
        email: "second@team.test",
        role: "staff",
        temporaryPassword: "mango orchards in monsoon",
      }),
    ).rejects.toMatchObject({ status: 409, code: "EMAIL_UNAVAILABLE" });
  });

  it("refuses callers who are not the live owner behind the presented session", async () => {
    const add = (sql: postgres.TransactionSql) =>
      sql<{ outcome: string }[]>`
        select private.add_vendor_team_member(
          ${randomUUID()}::uuid, ${`spoof-${randomUUID()}@team.test`}, 'Spoof', 'staff',
          'spoof-salt-1234567890', 'scrypt$N=131072,r=8,p=1$c3Bvb2Zpbmc=') as outcome`;
    const asha = await user("asha@team.test");
    const staffSession = await session(asha.id, CHAPEGA_ID);
    const ownerSession = await session(ownerId, CHAPEGA_ID);
    const expired = await session(ownerId, CHAPEGA_ID, "vendor", false);

    const outcomes = await Promise.all([
      // Staff's own session.
      asApp({ sessionHash: staffSession, userId: asha.id, vendorId: CHAPEGA_ID }, add),
      // The owner's id with someone else's session.
      asApp({ sessionHash: staffSession, userId: ownerId, vendorId: CHAPEGA_ID }, add),
      // The owner's session pointed at another shop.
      asApp({ sessionHash: ownerSession, userId: ownerId, vendorId: vendorB.id }, add),
      // An expired session.
      asApp({ sessionHash: expired, userId: ownerId, vendorId: CHAPEGA_ID }, add),
    ]);
    expect(outcomes.map(([row]) => row.outcome)).toEqual([
      "forbidden",
      "forbidden",
      "forbidden",
      "forbidden",
    ]);
    await expect(
      asApp(
        { sessionHash: staffSession, userId: asha.id, vendorId: CHAPEGA_ID },
        (sql) => sql`select * from private.list_vendor_team()`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    // The tables themselves stay closed to the runtime role.
    const written = await asApp(
      { sessionHash: ownerSession, userId: ownerId, vendorId: CHAPEGA_ID },
      (sql) =>
        sql`update private.vendor_users set must_change_password = false
            where id = ${asha.id} returning id`,
    ).catch((error: { code?: string }) => error.code);
    expect(written === "42501" || (Array.isArray(written) && written.length === 0)).toBe(true);
  });

  it("changes roles and access for members, never for owners or the caller", async () => {
    const actor = ownerActor(await session(ownerId, CHAPEGA_ID));
    const asha = await user("asha@team.test");
    await expect(team.setVendorTeamMemberRole(actor, asha.id, "manager")).resolves.toMatchObject({
      role: "manager",
    });
    await expect(team.setVendorTeamMemberRole(actor, ownerId, "staff")).rejects.toMatchObject({
      code: "SELF_CHANGE",
    });
    await expect(
      team.setVendorTeamMemberRole(actor, vendorB.ownerId, "staff"),
    ).rejects.toMatchObject({ status: 404 });

    const ashaChapega = await session(asha.id, CHAPEGA_ID);
    const ashaOther = await session(asha.id, vendorB.id);
    await expect(team.setVendorTeamMemberActive(actor, asha.id, false)).resolves.toMatchObject({
      active: false,
    });
    const remaining = await admin<{ id_hash: string }[]>`
      select id_hash from private.vendor_sessions where user_id = ${asha.id}`;
    const hashes = remaining.map((row) => row.id_hash);
    expect(hashes).not.toContain(ashaChapega);
    expect(hashes).toContain(ashaOther);
    await expect(team.setVendorTeamMemberActive(actor, asha.id, true)).resolves.toMatchObject({
      active: true,
    });
  });

  it("sets temporary passwords only for accounts that belong to this shop alone", async () => {
    const actor = ownerActor(await session(ownerId, CHAPEGA_ID));
    const asha = await user("asha@team.test");
    await session(asha.id, CHAPEGA_ID);
    await expect(
      team.resetVendorTeamPassword(actor, asha.id, "harbour gulls at sunrise"),
    ).resolves.toMatchObject({ passwordChangePending: true });
    const [{ sessions }] = await admin<{ sessions: number }[]>`
      select count(*)::int as sessions from private.vendor_sessions where user_id = ${asha.id}`;
    expect(sessions).toBe(0);

    // Give Asha a second shop: the owner of the first can no longer reset her.
    await admin`
      insert into private.vendor_memberships (vendor_id, user_id, role, active, is_default)
      values (${vendorB.id}, ${asha.id}, 'staff', true, false)`;
    await expect(
      team.resetVendorTeamPassword(actor, asha.id, "harbour gulls at sunrise"),
    ).rejects.toMatchObject({ code: "PASSWORD_RESET_UNAVAILABLE" });
    await expect(
      team.listVendorTeam(actor).then((members) => members.find((m) => m.userId === asha.id)),
    ).resolves.toMatchObject({ canResetPassword: false });
    await admin`
      delete from private.vendor_memberships where vendor_id = ${vendorB.id} and user_id = ${asha.id}`;
  });

  it("swaps the caller's own password only against the hash it verified", async () => {
    const asha = await user("asha@team.test");
    const current = await session(asha.id, CHAPEGA_ID);
    const other = await session(asha.id, CHAPEGA_ID);
    const modern = "scrypt$N=131072,r=8,p=1$bmV3LWhhc2g=";
    const change = (settings: Parameters<typeof asApp>[0], userId: string, expected: string) =>
      asApp(
        settings,
        (sql) =>
          sql<{ changed: boolean }[]>`
          select private.change_own_password(${userId}::uuid, ${expected},
            'integration-new-salt', ${modern}) as changed`,
      ).then(([row]) => row.changed);

    await expect(change({ sessionHash: current, userId: asha.id }, asha.id, "stale")).resolves.toBe(
      false,
    );
    await expect(
      change({ sessionHash: current, userId: asha.id }, ownerId, asha.password_hash),
    ).resolves.toBe(false);
    const ownerSession = await session(ownerId, CHAPEGA_ID);
    await expect(
      change({ sessionHash: ownerSession, userId: asha.id }, asha.id, asha.password_hash),
    ).resolves.toBe(false);
    await expect(
      change({ sessionHash: current, userId: asha.id }, asha.id, asha.password_hash),
    ).resolves.toBe(true);

    const after = await user("asha@team.test");
    expect(after).toMatchObject({ must_change_password: false, password_hash: modern });
    const left = await admin<{ id_hash: string }[]>`
      select id_hash from private.vendor_sessions where user_id = ${asha.id}`;
    expect(left.map((row) => row.id_hash)).toEqual([current]);
    expect(left.map((row) => row.id_hash)).not.toContain(other);
  });

  it("lets a platform admin reset a shop owner's password, but not a super admin's", async () => {
    const platformSession = await session(ownerId, null, "platform");
    const context = {
      user: { id: ownerId, email: OWNER.email, name: OWNER.name, role: "super_admin" as const },
      sessionHash: platformSession,
    };
    const ownerSession = await session(vendorB.ownerId, vendorB.id);
    const { resetAdminVendorOwnerPassword } = await import("@/server/admin/service");
    const result = await resetAdminVendorOwnerPassword(context, vendorB.id, {
      ownerId: vendorB.ownerId,
      temporaryPassword: "copper kettles sing at dawn",
    });
    expect(result.activity).toMatchObject({ kind: "account", title: "Owner password reset" });
    expect((await user("second@team.test")).must_change_password).toBe(true);
    const [{ count }] = await admin<{ count: number }[]>`
      select count(*)::int as count from private.vendor_sessions where id_hash = ${ownerSession}`;
    expect(count).toBe(0);

    await expect(
      resetAdminVendorOwnerPassword(context, CHAPEGA_ID, {
        ownerId,
        temporaryPassword: "copper kettles sing at dawn",
      }),
    ).rejects.toMatchObject({ code: "OWNER_IS_PLATFORM_ADMIN" });
  });

  it("rotates a password through the owner connection (the recovery script)", async () => {
    const { rotateSupabasePassword } = await import("@/scripts/rotate-vendor-password");
    await session(vendorB.ownerId, vendorB.id);
    const credential = await hash("north wind over salt flats");
    const result = await rotateSupabasePassword(admin, "second@team.test", credential);
    expect(result.sessionsRevoked).toBeGreaterThanOrEqual(1);
    expect(await user("second@team.test")).toMatchObject({
      must_change_password: false,
      password_hash: credential.hash,
      active: true,
    });
    await expect(rotateSupabasePassword(admin, "nobody@team.test", credential)).rejects.toThrow(
      /No vendor account/,
    );
  });

  it("refuses account or session changes through a shop's ordinary writes", async () => {
    const { updateVendorDatabase } = await import("@/server/vendor/database");
    await expect(
      updateVendorDatabase(
        (database) => {
          database.sessions = [];
        },
        { vendorId: CHAPEGA_ID },
      ),
    ).rejects.toMatchObject({ status: 403, code: "IDENTITY_WRITE_REJECTED" });
  });
});
