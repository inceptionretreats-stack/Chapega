import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import postgres from "postgres";

import type { VendorAccessContext, VendorIdentity } from "@/types/vendor";

// A Postgres owner URL (for example postgresql://postgres:pw@localhost:54329/postgres).
// Each suite creates and drops its own database, so it never touches real data.
export const ADMIN_URL = process.env.CHAPEGA_IT_ADMIN_URL;
export const APP_PASSWORD = "it-app-password-2026";
export const CHAPEGA_ID = "00000000-0000-4000-8000-000000000001";
export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
export const ROLE_MIGRATION = "20260917120500_chapega_app_role.sql";
export const MULTI_VENDOR_MIGRATION = "20260918071609_multi_vendor_platform.sql";
export const OWNER = {
  email: "owner@integration.test",
  password: "Integration-Owner-Pass-2026",
  name: "Integration Owner",
};
export const SUPABASE_STUBS = `
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

// CI sets CHAPEGA_IT_REQUIRED, so a missing database fails the job instead of
// skipping the whole suite and reporting green.
if (process.env.CHAPEGA_IT_REQUIRED === "true" && !ADMIN_URL) {
  throw new Error("CHAPEGA_IT_ADMIN_URL is required when CHAPEGA_IT_REQUIRED=true.");
}

export function clientOptions() {
  return { ssl: "require" as const, max: 1, prepare: false, onnotice: () => {} };
}

/** Migration file names in the order `supabase db push` applies them. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
}

export async function applyMigration(sql: postgres.Sql, file: string): Promise<void> {
  await sql.unsafe(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
}

export async function blanketPolicies(sql: postgres.Sql): Promise<string[]> {
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

/** Points the app's Supabase adapter at a test database as chapega_app. */
export function useApplicationDatabase(databaseUrl: URL): URL {
  const appUrl = new URL(databaseUrl);
  appUrl.username = "chapega_app";
  appUrl.password = APP_PASSWORD;
  process.env.CHAPEGA_DATA_BACKEND = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://integration.invalid";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_integration";
  process.env.SUPABASE_DATABASE_URL = appUrl.toString();
  return appUrl;
}

/** Closes the app's cached pool so the next query opens fresh sessions. */
export async function resetApplicationPool(): Promise<void> {
  const { getSupabasePostgres } = await import("@/server/supabase/postgres");
  await getSupabasePostgres().end({ timeout: 5 });
  const runtime = globalThis as typeof globalThis & {
    __chapegaSupabasePostgresRuntime?: { client?: unknown };
  };
  const shared = runtime.__chapegaSupabasePostgresRuntime;
  if (shared) shared.client = undefined;
}

export function ownerContext(
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

export function productInput(name: string) {
  return {
    name,
    shortDescription: "A product for the integration suite.",
    description: "Created by the real-database integration suite.",
    category: "Photo Frames",
    pricePaise: 49_900,
    image: "/generated-products/table-frame-5x7.png" as const,
    stock: 3,
    featured: false,
    tags: [],
    recipientTags: [],
    occasionTags: [],
    variants: [],
    preparationTime: "Same day",
    giftWrapEligible: true,
    visible: true,
  };
}
