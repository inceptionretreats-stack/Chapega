import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

import { newPasswordProblem } from "../server/security/password-policy";

const CONFIRMATION_FLAG = "--confirm-rotation";
const PLACEHOLDER_PASSWORD = "replace-with-a-long-unique-password";

type Credential = Readonly<{ salt: string; hash: string }>;

export type RotationResult = Readonly<{ userId: string; sessionsRevoked: number }>;

/** Everything checked before any data store is opened (opening one may seed it). */
export function validateRotationInput(
  rawEmail: string | undefined,
  password: string | undefined,
  preview: Readonly<{ email: string; password: string }>,
): Readonly<{ email: string; password: string }> {
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !password) {
    throw new Error("Set VENDOR_EMAIL and VENDOR_PASSWORD before rotating credentials.");
  }
  if (password.trim() === PLACEHOLDER_PASSWORD) {
    throw new Error(
      "Refusing to set the .env.example placeholder password. Choose a long, unique password.",
    );
  }
  if (email === preview.email && password === preview.password) {
    throw new Error("Refusing to set the public preview password.");
  }
  const problem = newPasswordProblem(password, { email });
  if (problem) throw new Error(`VENDOR_PASSWORD is not acceptable: ${problem}`);
  return { email, password };
}

/**
 * Supabase: runs as the postgres owner (SUPABASE_ADMIN_DATABASE_URL). The app's
 * restricted role cannot write accounts outside a platform-admin session, so
 * before this fix the command failed there and owners had no recovery path.
 * Re-enables the account, clears any pending forced change (when migration
 * 20261030122000 is applied), signs out every session and audits the change,
 * under the same advisory lock as sign-in.
 */
export async function rotateSupabasePassword(
  admin: postgres.Sql,
  email: string,
  credential: Credential,
): Promise<RotationResult> {
  return admin.begin(async (sql) => {
    const [user] = await sql<{ id: string }[]>`
      select id from private.vendor_users where lower(email) = ${email}
    `;
    if (!user) throw new Error(`No vendor account exists for ${email}.`);
    await sql`select pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`;
    const [flag] = await sql<{ present: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'private' and table_name = 'vendor_users'
          and column_name = 'must_change_password'
      ) as present
    `;
    if (flag.present) {
      await sql`
        update private.vendor_users
        set password_salt = ${credential.salt}, password_hash = ${credential.hash},
            active = true, must_change_password = false
        where id = ${user.id}
      `;
    } else {
      await sql`
        update private.vendor_users
        set password_salt = ${credential.salt}, password_hash = ${credential.hash}, active = true
        where id = ${user.id}
      `;
    }
    const revoked = await sql`
      delete from private.vendor_sessions where user_id = ${user.id} returning id_hash
    `;
    await sql`
      insert into private.audit_log
        (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
      values
        (${randomUUID()}, null, ${user.id}, 'vendor.password.rotated', 'auth', ${user.id}, now())
    `;
    return { userId: user.id, sessionsRevoked: revoked.length };
  });
}

async function rotateLocalPassword(email: string, credential: Credential): Promise<RotationResult> {
  const databaseModule = await import("../server/vendor/database");
  const result = await databaseModule.updateLocalVendorDatabase((database) => {
    const userIndex = database.users.findIndex((candidate) => candidate.email === email);
    const user = database.users[userIndex];
    if (!user) return null;
    database.users[userIndex] = {
      ...user,
      passwordSalt: credential.salt,
      passwordHash: credential.hash,
      active: true,
      mustChangePassword: false,
    };
    const before = database.sessions.length;
    database.sessions = database.sessions.filter((session) => session.userId !== user.id);
    database.audit.push(
      databaseModule.newAuditRecord(user.id, "vendor.password.rotated", "auth", user.id),
    );
    database.revision += 1;
    return { userId: user.id, sessionsRevoked: before - database.sessions.length };
  });
  if (!result) throw new Error(`No vendor account exists for ${email}.`);
  return result;
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  if (!process.argv.includes(CONFIRMATION_FLAG)) {
    throw new Error(`Refusing to rotate credentials without ${CONFIRMATION_FLAG}.`);
  }
  const { PREVIEW_VENDOR_EMAIL, PREVIEW_VENDOR_PASSWORD } = await import("../server/vendor/config");
  const { email, password } = validateRotationInput(
    process.env.VENDOR_EMAIL,
    process.env.VENDOR_PASSWORD,
    { email: PREVIEW_VENDOR_EMAIL, password: PREVIEW_VENDOR_PASSWORD },
  );

  const [{ derivePasswordHash }, { getVendorDataBackend }] = await Promise.all([
    import("../server/vendor/crypto"),
    import("../server/supabase/config"),
  ]);
  const credential = await derivePasswordHash(password);

  let result: RotationResult;
  if (getVendorDataBackend() === "supabase") {
    const url = process.env.SUPABASE_ADMIN_DATABASE_URL?.trim();
    if (!url) {
      throw new Error(
        "SUPABASE_ADMIN_DATABASE_URL (the postgres owner URL) is required to rotate a password on Supabase.",
      );
    }
    const admin = postgres(url, {
      connect_timeout: 15,
      idle_timeout: 5,
      max: 1,
      prepare: false,
      ssl: "require",
    });
    try {
      const [identity] = await admin<
        { currentUser: string }[]
      >`select current_user as "currentUser"`;
      if (identity.currentUser !== "postgres") {
        throw new Error("The rotation connection must use the postgres owner.");
      }
      result = await rotateSupabasePassword(admin, email, credential);
    } finally {
      await admin.end({ timeout: 5 });
    }
  } else {
    result = await rotateLocalPassword(email, credential);
  }
  console.log(
    `Rotated the password for ${email}, re-enabled the account and signed out ${result.sessionsRevoked} session(s).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
