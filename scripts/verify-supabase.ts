import { readdir } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

const EXPECTED_PRIVATE_TABLES = [
  "app_state",
  "audit_log",
  "import_runs",
  "order_events",
  "order_items",
  "orders",
  "product_variants",
  "products",
  "rate_limit_buckets",
  "shop_settings",
  "vendor_assets",
  "vendor_memberships",
  "vendor_sessions",
  "vendor_users",
  "vendors",
] as const;

const DEFAULT_VENDOR_ID = "00000000-0000-4000-8000-000000000001";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const admin = postgres(requiredEnvironment("SUPABASE_ADMIN_DATABASE_URL"), {
    ssl: "require",
    max: 1,
    prepare: false,
  });
  const runtime = postgres(requiredEnvironment("SUPABASE_DATABASE_URL"), {
    ssl: "require",
    max: 1,
    prepare: false,
  });

  try {
    const migrationFiles = (await readdir(path.join(process.cwd(), "supabase", "migrations")))
      .filter((file) => /^\d+_.+[.]sql$/.test(file))
      .sort();
    const localVersions = migrationFiles.map((file) => file.split("_", 1)[0]);
    const remoteMigrations = await admin<Array<{ version: string }>>`
      select version
      from supabase_migrations.schema_migrations
      order by version
    `;
    const remoteVersions = remoteMigrations.map((migration) => migration.version);
    assert(
      JSON.stringify(remoteVersions) === JSON.stringify(localVersions),
      `Migration drift detected. Local: ${localVersions.join(", ") || "none"}; remote: ${remoteVersions.join(", ") || "none"}.`,
    );

    const tables = await admin<
      Array<{
        table_name: string;
        row_security: boolean;
        force_row_security: boolean;
      }>
    >`
      select
        class.relname as table_name,
        class.relrowsecurity as row_security,
        class.relforcerowsecurity as force_row_security
      from pg_class class
      join pg_namespace namespace on namespace.oid = class.relnamespace
      where namespace.nspname = 'private' and class.relkind = 'r'
      order by class.relname
    `;
    const tableNames = new Set(tables.map((table) => table.table_name));
    const missingTables = EXPECTED_PRIVATE_TABLES.filter((table) => !tableNames.has(table));
    assert(missingTables.length === 0, `Missing private tables: ${missingTables.join(", ")}.`);
    assert(
      tables.every((table) => table.row_security && table.force_row_security),
      "Every private table must have enabled and forced row-level security.",
    );

    const [{ public_grants: publicGrants }] = await admin<Array<{ public_grants: number }>>`
      select count(*)::integer as public_grants
      from information_schema.role_table_grants
      where table_schema = 'private'
        and grantee in ('anon', 'authenticated', 'public')
    `;
    assert(publicGrants === 0, "Private tables expose public Data API grants.");

    const [{ policy_count: policyCount }] = await admin<Array<{ policy_count: number }>>`
      select count(*)::integer as policy_count
      from pg_policies
      where schemaname = 'private' and roles @> array['chapega_app']::name[]
    `;
    assert(
      policyCount >= EXPECTED_PRIVATE_TABLES.length,
      "The restricted runtime role is missing private-table policies.",
    );

    const unsafePolicies = await admin<
      Array<{
        tablename: string;
        policyname: string;
      }>
    >`
      select tablename, policyname
      from pg_policies
      where schemaname = 'private'
        and roles @> array['chapega_app']::name[]
        and coalesce(qual, '') in ('true', '(true)')
        and tablename <> 'rate_limit_buckets'
    `;
    assert(
      unsafePolicies.length === 0,
      `Tenant tables contain blanket runtime policies: ${unsafePolicies
        .map((policy) => `${policy.tablename}.${policy.policyname}`)
        .join(", ")}.`,
    );

    const [role] = await admin<
      Array<{
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolinherit: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
      }>
    >`
      select rolcanlogin, rolsuper, rolinherit, rolcreatedb, rolcreaterole,
             rolreplication, rolbypassrls
      from pg_roles
      where rolname = 'chapega_app'
    `;
    assert(role?.rolcanlogin, "The chapega_app runtime role cannot log in.");
    assert(
      !role.rolsuper &&
        !role.rolinherit &&
        !role.rolcreatedb &&
        !role.rolcreaterole &&
        !role.rolreplication &&
        !role.rolbypassrls,
      "The chapega_app runtime role has elevated privileges.",
    );

    const [bucket] = await admin<
      Array<{
        public: boolean;
        file_size_limit: number | null;
        allowed_mime_types: string[] | null;
      }>
    >`
      select public, file_size_limit, allowed_mime_types
      from storage.buckets
      where id = 'vendor-products'
    `;
    assert(bucket?.public, "The vendor-products Storage bucket is missing or private.");
    assert(
      Number(bucket.file_size_limit) === 8 * 1024 * 1024,
      "The vendor-products bucket must enforce an 8 MiB limit.",
    );
    assert(
      bucket.allowed_mime_types?.includes("image/png") &&
        bucket.allowed_mime_types.includes("image/jpeg"),
      "The vendor-products bucket MIME allow-list is incomplete.",
    );

    const [defaultVendor] = await admin<
      Array<{
        id: string;
        slug: string;
        products: number;
        orders: number;
        memberships: number;
        super_admins: number;
      }>
    >`
      select
        vendors.id,
        vendors.slug,
        (select count(*)::integer from private.products
          where vendor_id = vendors.id) as products,
        (select count(*)::integer from private.orders
          where vendor_id = vendors.id) as orders,
        (select count(*)::integer from private.vendor_memberships
          where vendor_id = vendors.id) as memberships,
        (select count(*)::integer from private.vendor_users
          where active and platform_role = 'super_admin') as super_admins
      from private.vendors vendors
      where vendors.id = ${DEFAULT_VENDOR_ID}
        and vendors.slug = 'chapega'
    `;
    assert(defaultVendor, "The deterministic Chapega tenant backfill is missing.");
    assert(
      defaultVendor.memberships > 0,
      "Legacy users were not backfilled into vendor memberships.",
    );
    assert(defaultVendor.super_admins > 0, "No active platform super administrator exists.");

    const [unscoped] = await admin<Array<{ row_count: number }>>`
      select (
        (select count(*) from private.app_state where vendor_id is null) +
        (select count(*) from private.shop_settings where vendor_id is null) +
        (select count(*) from private.products where vendor_id is null) +
        (select count(*) from private.product_variants where vendor_id is null) +
        (select count(*) from private.orders where vendor_id is null) +
        (select count(*) from private.order_items where vendor_id is null) +
        (select count(*) from private.order_events where vendor_id is null) +
        (select count(*) from private.import_runs where vendor_id is null)
      )::integer as row_count
    `;
    assert(unscoped?.row_count === 0, "Tenant business rows remain unscoped.");

    const runtimeState = await runtime.begin(async (transaction) => {
      await transaction`select set_config('app.vendor_id', ${DEFAULT_VENDOR_ID}, true)`;
      const [state] = await transaction<
        Array<{
          runtime_role: string;
          products: number;
          orders: number;
        }>
      >`
        select
          current_user as runtime_role,
          (select count(*)::integer from private.products
            where vendor_id = ${DEFAULT_VENDOR_ID}) as products,
          (select count(*)::integer from private.orders
            where vendor_id = ${DEFAULT_VENDOR_ID}) as orders
      `;
      return state;
    });
    assert(
      runtimeState?.runtime_role === "chapega_app",
      "Runtime traffic is not using the restricted chapega_app role.",
    );
    assert(
      runtimeState.products === defaultVendor.products &&
        runtimeState.orders === defaultVendor.orders,
      "Tenant-scoped runtime reads do not match the backfilled Chapega data.",
    );

    const isolated = await runtime.begin(async (transaction) => {
      await transaction`
        select set_config(
          'app.vendor_id',
          'ffffffff-ffff-4fff-8fff-ffffffffffff',
          true
        )
      `;
      const [state] = await transaction<Array<{ products: number; orders: number }>>`
        select
          (select count(*)::integer from private.products) as products,
          (select count(*)::integer from private.orders) as orders
      `;
      return state;
    });
    assert(
      isolated?.products === 0 && isolated.orders === 0,
      "Runtime RLS exposes another tenant without a matching vendor context.",
    );

    console.log("Supabase verification passed.");
    console.log(
      `- Migrations: ${remoteVersions.length}/${localVersions.length} applied with no drift`,
    );
    console.log(`- Private schema: ${tables.length} tables with forced RLS and no public grants`);
    console.log(
      `- Runtime role: chapega_app with restricted privileges and ${policyCount} policies`,
    );
    console.log("- Storage: vendor-products is public with the expected size/type limits");
    console.log(
      `- Tenant backfill: chapega has ${runtimeState.products} products, ${runtimeState.orders} orders, and ${defaultVendor.memberships} memberships`,
    );
    console.log("- Isolation: an unrelated tenant context can read no Chapega commerce rows");
  } finally {
    await Promise.allSettled([admin.end(), runtime.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? `Supabase verification failed: ${error.message}`
      : "Supabase verification failed.",
  );
  process.exitCode = 1;
});
