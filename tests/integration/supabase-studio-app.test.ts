import { createHash, randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { VendorAccessContext, VendorIdentity } from "@/types/vendor";
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
  productInput,
  useApplicationDatabase,
} from "./helpers";

vi.mock("server-only", () => ({}));

type Auth = typeof import("@/server/vendor/auth");
type Push = typeof import("@/server/push/registrations");
type Services = typeof import("@/server/vendor/service");
type Team = typeof import("@/server/vendor/team");

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
// Shaped like a Firebase Cloud Messaging registration token.
const fcmToken = (seed: string) => `${seed}:APA91b${"x".repeat(140)}`;

/**
 * Migration 20261101120000 on a real Postgres: phone sessions are their own
 * scope ('vendor_app') that web sign-in never touches, and push tokens are
 * reachable only through the definer functions and end with their session.
 */
describe.skipIf(!ADMIN_URL)("Chapega Studio app sessions and push on a real Postgres", () => {
  const databaseName = `chapega_studio_app_${Date.now()}`;
  let root: postgres.Sql;
  let admin: postgres.Sql;
  let appUrl: URL;
  let auth: Auth;
  let push: Push;
  let services: Services;
  let team: Team;
  let ownerId: string;
  let chapega: VendorIdentity;
  let context: VendorAccessContext;
  let productId: string;

  async function phoneSignIn(
    installationId: string = randomUUID(),
    email = OWNER.email,
    password = OWNER.password,
  ) {
    const login = await auth.authenticateVendorAppLogin({
      email,
      password,
      device: { installationId, platform: "android", model: "Pixel 8", appVersion: "1.0.0+1" },
    });
    expect(login).not.toBeNull();
    return login!;
  }

  function phone(token: string) {
    return auth.getVendorSessionByToken(token, undefined, { scope: "vendor_app" });
  }

  /** Runs statements as the runtime role with the given request settings. */
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

  function placeOrder() {
    return services.placeKioskOrder(
      {
        idempotencyKey: randomUUID(),
        kioskName: "Main Entrance",
        customer: { customerName: "Asha", customerPhone: "", giftNote: "", orderNote: "" },
        items: [{ productId, quantity: 1, giftWrapped: false }],
      },
      "chapega",
    );
  }

  async function registrationOf(token: string) {
    const [row] = await admin<Array<{ session_id_hash: string }>>`
      select session_id_hash
      from private.vendor_push_registrations
      where fcm_token_hash = ${sha256(token)}
    `;
    return row?.session_id_hash ?? null;
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

    const hash = (await import("@/server/vendor/crypto")).derivePasswordHash;
    const { bootstrapFirstOwner } = await import("@/scripts/bootstrap-supabase-owner");
    ({ userId: ownerId } = await bootstrapFirstOwner(
      admin,
      { vendorSlug: "chapega", ...OWNER },
      hash,
    ));
    auth = await import("@/server/vendor/auth");
    push = await import("@/server/push/registrations");
    services = await import("@/server/vendor/service");
    team = await import("@/server/vendor/team");
    chapega = { id: CHAPEGA_ID, slug: "chapega", displayName: "Chapega.com", status: "active" };
    context = ownerContext(chapega, ownerId, auth.capabilitiesForVendorRole("owner"));
    const product = await services.createVendorProduct(
      { ...productInput("Push Frame"), stock: 100 },
      context,
    );
    productId = product.id;
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

  it("keeps the phone signed in while the web Studio signs in and out", async () => {
    const web = await auth.authenticateVendorLogin(OWNER.email, OWNER.password);
    const app = await phoneSignIn();
    const webAgain = await auth.authenticateVendorLogin(OWNER.email, OWNER.password);

    expect(await phone(app.token)).not.toBeNull();
    expect(await auth.getVendorUserByToken(webAgain!.token)).not.toBeNull();
    // One Studio (browser) session per person, as before.
    expect(await auth.getVendorUserByToken(web!.token)).toBeNull();
    // Each token works only the way it was issued.
    expect(await auth.getVendorUserByToken(app.token)).toBeNull();
    expect(
      await auth.getVendorSessionByToken(webAgain!.token, undefined, { scope: "vendor_app" }),
    ).toBeNull();
  });

  it("replaces a phone's own session and keeps at most three phones", async () => {
    await admin`
      delete from private.vendor_sessions
      where user_id = ${ownerId} and session_scope = 'vendor_app'
    `;
    const install = randomUUID();
    const first = await phoneSignIn(install);
    const second = await phoneSignIn(install);
    expect(await phone(first.token)).toBeNull();
    expect(await phone(second.token)).not.toBeNull();

    await phoneSignIn();
    await phoneSignIn();
    const fourth = await phoneSignIn();

    expect(fourth.signedOutDevices).toBe(1);
    expect(await phone(second.token)).toBeNull();
    const [{ count }] = await admin<Array<{ count: number }>>`
      select count(*)::int as count
      from private.vendor_sessions
      where user_id = ${ownerId} and session_scope = 'vendor_app'
    `;
    expect(count).toBe(3);
  });

  it("keeps phone sessions out of a shop's view and the push tables out of the app's reach", async () => {
    const app = await phoneSignIn();

    const visible = await asApp(
      { vendorId: CHAPEGA_ID },
      (sql) => sql<Array<{ id_hash: string }>>`
      select id_hash from private.vendor_sessions where session_scope = 'vendor_app'
    `,
    );
    expect(visible).toHaveLength(0);

    for (const table of ["vendor_push_registrations", "order_push_dispatches"]) {
      await expect(
        asApp({}, (sql) => sql.unsafe(`select * from private.${table}`)),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await expect(
      asApp(
        { sessionHash: sha256(app.token) },
        (sql) => sql`
        update private.vendor_sessions
        set session_scope = 'vendor'
        where id_hash = ${sha256(app.token)}
      `,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("caps sliding expiry at 90 days for phones and 168 hours for the web", async () => {
    const app = await phoneSignIn();
    const slide = (hash: string, interval: string) =>
      asApp(
        { sessionHash: hash },
        (sql) => sql<Array<{ id_hash: string }>>`
        update private.vendor_sessions
        set expires_at = created_at + ${interval}::interval
        where id_hash = ${hash}
        returning id_hash
      `,
      );

    await expect(slide(sha256(app.token), "80 days")).resolves.toHaveLength(1);
    await expect(slide(sha256(app.token), "91 days")).rejects.toMatchObject({
      code: expect.stringMatching(/^(42501|23514)$/),
    });

    const web = await auth.authenticateVendorLogin(OWNER.email, OWNER.password);
    await expect(slide(sha256(web!.token), "8 days")).rejects.toMatchObject({
      code: expect.stringMatching(/^(42501|23514)$/),
    });
  });

  it("registers a phone for notifications, moves a shared token, and drops it with the session", async () => {
    const owner = await phoneSignIn();
    const other = await phoneSignIn();
    const shared = fcmToken("shared");

    await push.registerSessionPushToken(
      { sessionHash: sha256(owner.token), userId: ownerId },
      shared,
    );
    expect(await registrationOf(shared)).toBe(sha256(owner.token));

    await push.registerSessionPushToken(
      { sessionHash: sha256(other.token), userId: ownerId },
      shared,
    );
    expect(await registrationOf(shared)).toBe(sha256(other.token));

    const web = await auth.authenticateVendorLogin(OWNER.email, OWNER.password);
    await expect(
      push.registerSessionPushToken(
        { sessionHash: sha256(web!.token), userId: ownerId },
        fcmToken("web"),
      ),
    ).rejects.toMatchObject({ status: 401 });

    await auth.destroyVendorSession(other.token, "vendor_app");
    expect(await registrationOf(shared)).toBeNull();
  });

  it("announces a new order once, to live phones only, and forgets rejected tokens", async () => {
    await admin`delete from private.vendor_push_registrations`;
    const live = await phoneSignIn();
    const ended = await phoneSignIn();
    await push.registerSessionPushToken(
      { sessionHash: sha256(live.token), userId: ownerId },
      fcmToken("live"),
    );
    await push.registerSessionPushToken(
      { sessionHash: sha256(ended.token), userId: ownerId },
      fcmToken("ended"),
    );
    await admin`
      update private.vendor_sessions
      set created_at = now() - interval '2 days', expires_at = now() - interval '1 second'
      where id_hash = ${sha256(ended.token)}
    `;

    const placed = await placeOrder();
    expect(placed.created).toBe(true);

    const targets = await push.claimOrderPushTargets(CHAPEGA_ID, placed.order.id);
    expect(targets?.map((target) => target.token)).toEqual([fcmToken("live")]);
    expect(await push.claimOrderPushTargets(CHAPEGA_ID, placed.order.id)).toEqual([]);

    const removed = await push.finishOrderPush(CHAPEGA_ID, placed.order.id, {
      sent: 0,
      failed: 0,
      unregistered: [sha256(fcmToken("live"))],
    });
    expect(removed).toBe(1);
    expect(await registrationOf(fcmToken("live"))).toBeNull();
    const [dispatch] = await admin<Array<{ completed: boolean }>>`
      select completed_at is not null as completed
      from private.order_push_dispatches
      where order_id = ${placed.order.id}
    `;
    expect(dispatch.completed).toBe(true);
  });

  it("lets an owner manage the team from the phone, and removing a member signs out their phones", async () => {
    const owner = await phoneSignIn();
    const actor = { access: context, sessionHash: sha256(owner.token) };
    const member = await team.addVendorTeamMember(actor, {
      name: "Counter Help",
      email: "counter@studio-app.test",
      role: "staff",
      temporaryPassword: "lanterns over the quiet river 2026",
    });
    const staffPhone = await phoneSignIn(
      randomUUID(),
      "counter@studio-app.test",
      "lanterns over the quiet river 2026",
    );
    expect(await phone(staffPhone.token)).not.toBeNull();

    await team.setVendorTeamMemberActive(actor, member.userId, false);

    expect(await phone(staffPhone.token)).toBeNull();
  });

  it("purges ended phone sessions together with their registrations", async () => {
    const app = await phoneSignIn();
    await push.registerSessionPushToken(
      { sessionHash: sha256(app.token), userId: ownerId },
      fcmToken("purge"),
    );
    await admin`
      update private.vendor_sessions
      set created_at = now() - interval '5 days', expires_at = now() - interval '2 days'
      where id_hash = ${sha256(app.token)}
    `;

    await admin`select private.purge_expired_records()`;

    const sessions =
      await admin`select 1 from private.vendor_sessions where id_hash = ${sha256(app.token)}`;
    expect(sessions).toHaveLength(0);
    expect(await registrationOf(fcmToken("purge"))).toBeNull();
  });
});
