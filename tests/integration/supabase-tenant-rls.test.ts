import { readdirSync, readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { VendorAccessContext, VendorIdentity } from "@/types/vendor";

vi.mock("server-only", () => ({}));

// A Postgres owner URL (for example postgresql://postgres:pw@localhost:54329/postgres).
// The suite creates and drops its own database, so it never touches real data.
const ADMIN_URL = process.env.CHAPEGA_IT_ADMIN_URL;
const APP_PASSWORD = "it-app-password-2026";
const CHAPEGA_ID = "00000000-0000-4000-8000-000000000001";
const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const ROLE_MIGRATION = "20260917120500_chapega_app_role.sql";
const MULTI_VENDOR_MIGRATION = "20260918071609_multi_vendor_platform.sql";
const OWNER = {
  email: "owner@integration.test",
  password: "Integration-Owner-Pass-2026",
  name: "Integration Owner",
};
const SUPABASE_STUBS = `
  do $$ begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  end $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
`;

type Services = typeof import("@/server/vendor/service");

function clientOptions() {
  return { ssl: "require" as const, max: 1, prepare: false, onnotice: () => {} };
}

async function blanketPolicies(sql: postgres.Sql): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    select tablename || '.' || policyname as name
    from pg_policies
    where schemaname = 'private'
      and roles @> array['chapega_app']::name[]
      and coalesce(qual, '') in ('true', '(true)')
      and tablename <> 'rate_limit_buckets'
    order by 1
  `;
  return rows.map((row) => row.name);
}

function ownerContext(
  vendor: VendorIdentity,
  userId: string,
  capabilities: VendorAccessContext["capabilities"],
): VendorAccessContext {
  return {
    user: {
      id: userId,
      email: OWNER.email,
      name: OWNER.name,
      platformRole: "super_admin",
      role: "owner",
      activeVendor: vendor,
      memberships: [{ vendor, role: "owner", active: true, isDefault: true }],
      capabilities,
    },
    vendor,
    membership: { vendorId: vendor.id, userId, role: "owner" },
    capabilities,
  };
}

describe.skipIf(!ADMIN_URL)("Supabase tenant policies on a real Postgres", () => {
  const databaseName = `chapega_it_${Date.now()}`;
  let root: postgres.Sql;
  let admin: postgres.Sql;
  let appUrl: URL;
  let blanketBeforeRepair: string[] = [];
  let services: Services;
  let context: VendorAccessContext;
  let vendorB: { id: string; slug: string };

  beforeAll(async () => {
    root = postgres(ADMIN_URL!, clientOptions());
    await root.unsafe(`create database ${databaseName}`);
    const databaseUrl = new URL(ADMIN_URL!);
    databaseUrl.pathname = `/${databaseName}`;
    admin = postgres(databaseUrl.toString(), clientOptions());

    await admin.unsafe(SUPABASE_STUBS);
    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();
    for (const file of migrations) {
      await admin.unsafe(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
      if (file === MULTI_VENDOR_MIGRATION) {
        // What `npm run supabase:provision` used to do after `db push`.
        await admin.unsafe(readFileSync(path.join(MIGRATIONS_DIR, ROLE_MIGRATION), "utf8"));
        blanketBeforeRepair = await blanketPolicies(admin);
      }
    }

    const { provisionRuntimeRole } = await import("@/scripts/provision-supabase-role");
    await provisionRuntimeRole(admin, APP_PASSWORD);

    appUrl = new URL(databaseUrl);
    appUrl.username = "chapega_app";
    appUrl.password = APP_PASSWORD;
    process.env.CHAPEGA_DATA_BACKEND = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://integration.invalid";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_integration";
    process.env.SUPABASE_DATABASE_URL = appUrl.toString();

    const { derivePasswordHash } = await import("@/server/vendor/crypto");
    const { bootstrapFirstOwner } = await import("@/scripts/bootstrap-supabase-owner");
    const { userId } = await bootstrapFirstOwner(
      admin,
      { vendorSlug: "chapega", ...OWNER },
      (password) => derivePasswordHash(password),
    );

    services = await import("@/server/vendor/service");
    const { capabilitiesForVendorRole } = await import("@/server/vendor/auth");
    const [vendor] = await admin<{ displayName: string }[]>`
      select display_name as "displayName" from private.vendors where id = ${CHAPEGA_ID}
    `;
    context = ownerContext(
      { id: CHAPEGA_ID, slug: "chapega", displayName: vendor.displayName, status: "active" },
      userId,
      capabilitiesForVendorRole("owner"),
    );

    // A second tenant created through the real platform path.
    const token = randomUUID();
    const sessionHash = createHash("sha256").update(token).digest("hex");
    await admin`
      insert into private.vendor_sessions
        (id_hash, user_id, session_scope, active_vendor_id, created_at, expires_at)
      values (${sessionHash}, ${userId}, 'platform', null, now(), now() + interval '1 hour')
    `;
    const { createAdminVendor } = await import("@/server/admin/service");
    const created = await createAdminVendor(
      {
        user: { id: userId, email: OWNER.email, name: OWNER.name, role: "super_admin" },
        sessionHash,
      },
      {
        displayName: "Second Shop",
        slug: "second-shop",
        ownerName: "Second Owner",
        ownerEmail: "second@integration.test",
        ownerWhatsAppNumber: "9876501234",
        temporaryPassword: "Second-Shop-Owner-2026",
      },
    );
    vendorB = { id: created.vendor.id, slug: created.vendor.slug };
  }, 180_000);

  afterAll(async () => {
    const { getSupabasePostgres } = await import("@/server/supabase/postgres");
    await getSupabasePostgres().end({ timeout: 5 }).catch(() => undefined);
    await admin?.end({ timeout: 5 });
    await root?.unsafe(`drop database if exists ${databaseName} with (force)`);
    await root?.end({ timeout: 5 });
  });

  it("removes blanket runtime policies left by the former provisioning step (AUD-2)", async () => {
    expect(blanketBeforeRepair.length).toBeGreaterThan(10);
    expect(await blanketPolicies(admin)).toEqual([]);
  });

  it("never recreates blanket policies when provisioning runs again (AUD-2)", async () => {
    const { provisionRuntimeRole } = await import("@/scripts/provision-supabase-role");
    await provisionRuntimeRole(admin, APP_PASSWORD);
    expect(await blanketPolicies(admin)).toEqual([]);
  });

  it("persists catalogue, settings, kiosk orders and transitions under tenant policies (AUD-1)", async () => {
    const product = await services.createVendorProduct(
      {
        name: "Integration Frame",
        shortDescription: "A frame for the integration suite.",
        description: "Created by the real-database integration suite.",
        category: "Photo Frames",
        pricePaise: 49_900,
        image: "/generated-products/table-frame-5x7.png",
        stock: 3,
        featured: false,
        tags: [],
        recipientTags: [],
        occasionTags: [],
        variants: [],
        preparationTime: "Same day",
        giftWrapEligible: true,
        visible: true,
      },
      context,
    );
    const edited = await services.updateVendorProduct(
      product.id,
      { ...product, pricePaise: 59_900, version: product.version },
      context,
    );
    expect(edited.pricePaise).toBe(59_900);

    const bootstrap = await services.getVendorBootstrap(context);
    const published = await services.updateVendorSettings(
      { ...bootstrap.settings, kioskName: "Integration Desk" },
      context,
    );
    expect(published.kioskName).toBe("Integration Desk");

    const order = await services.recordKioskOrder(
      {
        idempotencyKey: randomUUID(),
        orderNumber: "GFT-20261008-4321",
        createdAt: new Date().toISOString(),
        kioskName: "Integration Desk",
        customer: { customerName: "Asha", customerPhone: "", giftNote: "", orderNote: "" },
        items: [{ productId: product.id, quantity: 1, giftWrapped: false }],
      },
      "chapega",
    );
    const confirmed = await services.transitionVendorOrder(
      order.id,
      "confirmed",
      order.version,
      context,
    );
    expect(confirmed.status).toBe("confirmed");

    const [row] = await admin<{ stock: number }[]>`
      select stock from private.products where vendor_id = ${CHAPEGA_ID} and id = ${product.id}
    `;
    expect(row.stock).toBe(2);
  });

  it("serves the public catalogue from visible products only (AUD-14)", async () => {
    const base = {
      shortDescription: "Catalogue reader check.",
      description: "Used to verify the kiosk catalogue query.",
      category: "Keepsakes",
      pricePaise: 19_900,
      image: "/generated-products/acrylic-sketch-lamp.png" as const,
      stock: 4,
      featured: false,
      tags: [],
      recipientTags: [],
      occasionTags: [],
      variants: [{ id: "small", name: "Small", priceAdjustmentPaise: 0, stock: 2 }],
      preparationTime: "Same day",
      giftWrapEligible: false,
    };
    const shown = await services.createVendorProduct(
      { ...base, name: "Catalogue Shown", visible: true },
      context,
    );
    const hidden = await services.createVendorProduct(
      { ...base, name: "Catalogue Hidden", visible: false },
      context,
    );

    const bootstrap = await services.getKioskBootstrap("chapega");
    const ids = bootstrap.products.map((item) => item.id);
    expect(ids).toContain(shown.id);
    expect(ids).not.toContain(hidden.id);
    expect(bootstrap.products.find((item) => item.id === shown.id)?.variants).toEqual(
      shown.variants,
    );
    await expect(services.getKioskBootstrap(vendorB.slug)).resolves.toMatchObject({
      vendor: { slug: vendorB.slug },
    });
  });

  it("lets a tenant bump only its own revision, never its identity or status (AUD-1)", async () => {
    const app = postgres(appUrl.toString(), clientOptions());
    try {
      const scoped = <T>(run: (sql: postgres.TransactionSql) => Promise<T>) =>
        app.begin(async (sql) => {
          await sql`select set_config('app.vendor_id', ${CHAPEGA_ID}, true)`;
          return run(sql);
        });
      await expect(
        scoped((sql) => sql`update private.vendors set revision = revision + 1 where id = ${CHAPEGA_ID}`),
      ).resolves.toBeDefined();
      await expect(
        scoped((sql) => sql`update private.vendors set slug = 'hijacked' where id = ${CHAPEGA_ID}`),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        scoped((sql) => sql`update private.vendors set status = 'suspended' where id = ${CHAPEGA_ID}`),
      ).rejects.toMatchObject({ code: "42501" });
      const otherTenant = await scoped(
        (sql) => sql`update private.vendors set revision = revision + 1 where id = ${vendorB.id} returning id`,
      );
      expect(otherTenant).toHaveLength(0);
    } finally {
      await app.end({ timeout: 5 });
    }
  });

  it("keeps a tenant-scoped connection away from another tenant's data (AUD-2)", async () => {
    const app = postgres(appUrl.toString(), clientOptions());
    try {
      const outcome = await app.begin(async (sql) => {
        await sql`select set_config('app.vendor_id', ${vendorB.id}, true),
                         set_config('app.vendor_slug', ${vendorB.slug}, true)`;
        const [orders] = await sql<{ count: number }[]>`
          select count(*)::int as count from private.orders where vendor_id = ${CHAPEGA_ID}`;
        const users = await sql<{ email: string }[]>`select email from private.vendor_users`;
        const repriced = await sql`
          update private.products set price_paise = 1 where vendor_id = ${CHAPEGA_ID} returning id`;
        const promoted = await sql`
          update private.vendor_users set platform_role = 'super_admin'
          where platform_role is null returning id`;
        return { orders: orders.count, users: users.map((user) => user.email), repriced, promoted };
      });
      expect(outcome.orders).toBe(0);
      expect(outcome.users).not.toContain(OWNER.email);
      expect(outcome.repriced).toHaveLength(0);
      expect(outcome.promoted).toHaveLength(0);
    } finally {
      await app.end({ timeout: 5 });
    }
  });

  it("refuses to bootstrap a second super administrator (AUD-3)", async () => {
    const { bootstrapFirstOwner } = await import("@/scripts/bootstrap-supabase-owner");
    const { derivePasswordHash } = await import("@/server/vendor/crypto");
    await expect(
      bootstrapFirstOwner(
        admin,
        { vendorSlug: "chapega", email: "another@integration.test", password: "Another-Owner-Pass-2026", name: "Another" },
        (password) => derivePasswordHash(password),
      ),
    ).rejects.toThrow(/already exists/);
  });
});
