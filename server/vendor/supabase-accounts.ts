import "server-only";

import type postgres from "postgres";
import { getSupabasePostgres } from "@/server/supabase/postgres";
import { VendorServiceError } from "@/server/vendor/errors";
import type { VendorRole } from "@/types/vendor";

/**
 * Team and password changes on Supabase. They never go through the generic
 * snapshot writer (row-level security keeps accounts and sessions away from a
 * shop's connection); each one calls a narrow SECURITY DEFINER function from
 * migration 20261030122000 that proves the caller from the session it
 * presented.
 */
export type AccountIdentity = Readonly<{
  sessionHash: string;
  userId?: string;
  vendorId?: string | null;
}>;

export type TeamRow = Readonly<{
  userId: string;
  name: string;
  email: string;
  role: VendorRole;
  active: boolean;
  accountActive: boolean;
  passwordChangePending: boolean;
  sharedAccount: boolean;
  memberSince: string;
}>;

type TeamFunctionRow = {
  member_id: string;
  member_name: string;
  member_email: string;
  member_role: VendorRole;
  membership_active: boolean;
  account_active: boolean;
  password_change_pending: boolean;
  shared_account: boolean;
  member_since: Date | string;
};

export function postgresCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/**
 * undefined_function, undefined_column, undefined_table: the app is ahead of
 * the database and a migration has not been applied yet.
 */
export function isMigrationError(error: unknown): boolean {
  const code = postgresCode(error);
  return code === "42883" || code === "42703" || code === "42P01";
}

export function migrationRequiredError(migration: string, cause: unknown): VendorServiceError {
  return wrapped(
    503,
    "MIGRATION_REQUIRED",
    `This needs a database update that has not been applied yet (migration ${migration}).`,
    cause,
  );
}

function wrapped(status: number, code: string, message: string, cause: unknown) {
  const error = new VendorServiceError(status, code, message);
  error.cause = cause;
  return error;
}

export async function withAccountTransaction<T>(
  identity: AccountIdentity,
  run: (sql: postgres.TransactionSql) => Promise<T>,
  { migration = "20261030122000" }: { migration?: string } = {},
): Promise<T> {
  try {
    return (await getSupabasePostgres().begin(async (sql) => {
      await sql`
        select
          set_config('statement_timeout', '15s', true),
          set_config('lock_timeout', '5s', true),
          set_config('idle_in_transaction_session_timeout', '15s', true),
          set_config('app.session_hash', ${identity.sessionHash}, true),
          set_config('app.user_id', ${identity.userId ?? ""}, true),
          set_config('app.vendor_id', ${identity.vendorId ?? ""}, true)
      `;
      return run(sql);
    })) as T;
  } catch (error) {
    if (error instanceof VendorServiceError) throw error;
    const code = postgresCode(error);
    if (code === "42501") {
      throw wrapped(403, "FORBIDDEN", "Only the shop owner can manage the team.", error);
    }
    if (isMigrationError(error)) throw migrationRequiredError(migration, error);
    throw wrapped(503, "BACKEND_UNAVAILABLE", "The account change could not be saved.", error);
  }
}

export async function readTeamRows(sql: postgres.TransactionSql): Promise<TeamRow[]> {
  const rows = await sql<TeamFunctionRow[]>`select * from private.list_vendor_team()`;
  return rows.map((row) => ({
    userId: row.member_id,
    name: row.member_name,
    email: row.member_email,
    role: row.member_role,
    active: row.membership_active,
    accountActive: row.account_active,
    passwordChangePending: row.password_change_pending,
    sharedAccount: row.shared_account,
    memberSince: new Date(row.member_since).toISOString(),
  }));
}
