import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

const confirmationFlag = "--confirm-provision";

export type ProvisionSummary = Readonly<{
  tableCount: number;
  policyCount: number;
}>;

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function quoteLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Gives the runtime role its login and safety limits. It deliberately does not
 * replay any migration: the role, grants and tenant policies come from
 * `supabase db push`, and replaying the original role migration recreated
 * blanket `USING (true)` policies that cancelled tenant isolation.
 */
export async function provisionRuntimeRole(
  admin: postgres.Sql,
  appPassword: string,
): Promise<ProvisionSummary> {
  const [role] = await admin<{ exists: boolean }[]>`
    select exists (select 1 from pg_roles where rolname = 'chapega_app') as "exists"
  `;
  if (!role.exists) {
    throw new Error(
      "The chapega_app role is missing. Apply the migrations with `supabase db push` first.",
    );
  }

  await admin.unsafe(`
    alter role chapega_app
      login
      noinherit
      nocreatedb
      nocreaterole
      password ${quoteLiteral(appPassword)}
      connection limit 10;
    alter role chapega_app set statement_timeout = '15s';
    alter role chapega_app set lock_timeout = '5s';
    alter role chapega_app set idle_in_transaction_session_timeout = '15s';
  `);

  const [summary] = await admin<
    Array<{
      tableCount: number;
      policyCount: number;
      blanketPolicies: string[];
      membershipCount: number;
      canLogin: boolean;
      inherits: boolean;
      isSuperuser: boolean;
      canCreateDatabase: boolean;
      canCreateRole: boolean;
      canReplicate: boolean;
      bypassesRls: boolean;
    }>
  >`
    select
      (select count(*)::int from pg_tables where schemaname = 'private') as "tableCount",
      (
        select count(*)::int
        from pg_policies
        where schemaname = 'private'
          and roles @> array['chapega_app']::name[]
      ) as "policyCount",
      array(
        select tablename || '.' || policyname
        from pg_policies
        where schemaname = 'private'
          and roles @> array['chapega_app']::name[]
          and coalesce(qual, '') in ('true', '(true)')
          and tablename <> 'rate_limit_buckets'
        order by 1
      ) as "blanketPolicies",
      (
        select count(*)::int
        from pg_auth_members memberships
        join pg_roles members on members.oid = memberships.member
        where members.rolname = 'chapega_app'
      ) as "membershipCount",
      roles.rolcanlogin as "canLogin",
      roles.rolinherit as "inherits",
      roles.rolsuper as "isSuperuser",
      roles.rolcreatedb as "canCreateDatabase",
      roles.rolcreaterole as "canCreateRole",
      roles.rolreplication as "canReplicate",
      roles.rolbypassrls as "bypassesRls"
    from pg_roles roles
    where roles.rolname = 'chapega_app'
  `;

  if (
    !summary.canLogin ||
    summary.inherits ||
    summary.isSuperuser ||
    summary.canCreateDatabase ||
    summary.canCreateRole ||
    summary.canReplicate ||
    summary.bypassesRls ||
    summary.membershipCount !== 0
  ) {
    throw new Error("chapega_app retained unexpected database privileges.");
  }

  if (summary.blanketPolicies.length > 0) {
    throw new Error(
      `Tenant tables contain blanket runtime policies (${summary.blanketPolicies.join(", ")}). ` +
        "Apply the latest migrations with `supabase db push`, which removes them.",
    );
  }

  return { tableCount: summary.tableCount, policyCount: summary.policyCount };
}

async function main() {
  loadEnvConfig(process.cwd());

  if (!process.argv.includes(confirmationFlag)) {
    throw new Error(
      `Refusing to change a database role without ${confirmationFlag}.`,
    );
  }

  const adminDatabaseUrl = requireEnvironment("SUPABASE_ADMIN_DATABASE_URL");
  const appDatabaseUrl = requireEnvironment("SUPABASE_DATABASE_URL");
  const parsedAppUrl = new URL(appDatabaseUrl);

  if (!parsedAppUrl.username.startsWith("chapega_app.")) {
    throw new Error("SUPABASE_DATABASE_URL must use the chapega_app pooler role.");
  }

  const appPassword = decodeURIComponent(parsedAppUrl.password);
  const admin = postgres(adminDatabaseUrl, {
    connect_timeout: 15,
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ssl: "require",
  });

  try {
    const [identity] = await admin<{ currentUser: string }[]>`
      select current_user as "currentUser"
    `;

    if (identity.currentUser !== "postgres") {
      throw new Error("The provisioning connection must use the postgres owner.");
    }

    const summary = await provisionRuntimeRole(admin, appPassword);
    console.log(
      `Provisioned chapega_app across ${summary.tableCount} tables and ${summary.policyCount} tenant-scoped RLS policies.`,
    );
  } finally {
    await admin.end({ timeout: 5 });
  }

  await new Promise((resolve) => setTimeout(resolve, 1_500));

  const app = postgres(appDatabaseUrl, {
    connect_timeout: 15,
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ssl: "require",
  });

  try {
    const [verification] = await app<{ currentUser: string; tableCount: number }[]>`
      select
        current_user as "currentUser",
        (select count(*)::int from pg_tables where schemaname = 'private') as "tableCount"
    `;

    if (
      verification.currentUser !== "chapega_app" ||
      verification.tableCount < 1
    ) {
      throw new Error("The application role verification returned unexpected data.");
    }

    console.log("Verified the restricted chapega_app database connection.");
  } finally {
    await app.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
