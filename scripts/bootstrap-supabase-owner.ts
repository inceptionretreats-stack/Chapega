import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

import { newPasswordProblem } from "../server/security/password-policy";

const confirmationFlag = "--confirm-bootstrap";
const PLACEHOLDER_PASSWORD = "replace-with-a-long-unique-password";

export type BootstrapOwnerInput = Readonly<{
  vendorSlug: string;
  email: string;
  password: string;
  name: string;
}>;

export type BootstrapOwnerResult = Readonly<{
  userId: string;
  vendorId: string;
}>;

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function validateBootstrapOwnerInput(
  input: BootstrapOwnerInput,
  preview: Readonly<{ email: string; password: string }>,
): BootstrapOwnerInput {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim().slice(0, 80);
  const vendorSlug = input.vendorSlug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(vendorSlug)) {
    throw new Error("A valid --vendor=<slug> is required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    throw new Error("VENDOR_EMAIL must be a valid email address.");
  }
  if (!name) throw new Error("VENDOR_NAME is required.");
  // The same NIST policy as admin-issued passwords and rotation.
  const problem = newPasswordProblem(input.password, { email, name });
  if (problem) throw new Error(`VENDOR_PASSWORD: ${problem}`);
  if (
    input.password === PLACEHOLDER_PASSWORD ||
    input.password === preview.password ||
    email === preview.email
  ) {
    throw new Error(
      "Refusing to create the first owner with the published preview or placeholder credentials.",
    );
  }
  return { vendorSlug, email, password: input.password, name };
}

/**
 * Creates the first platform super administrator as the owner of one vendor.
 * Supabase imports never copy identities, so a new database has no account
 * that can sign in until this runs. It refuses once any super admin exists.
 */
export async function bootstrapFirstOwner(
  admin: postgres.Sql,
  input: BootstrapOwnerInput,
  hashPassword: (password: string) => Promise<Readonly<{ salt: string; hash: string }>>,
): Promise<BootstrapOwnerResult> {
  const credential = await hashPassword(input.password);
  return admin.begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtextextended('chapega.bootstrap-owner', 0))`;

    const [existing] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from private.vendor_users
      where platform_role = 'super_admin'
    `;
    if (existing.count > 0) {
      throw new Error(
        "A platform super administrator already exists. Sign in as that account instead.",
      );
    }

    const [emailTaken] = await sql<{ count: number }[]>`
      select count(*)::int as count from private.vendor_users where email = ${input.email}
    `;
    if (emailTaken.count > 0) {
      throw new Error(`An account already uses ${input.email}.`);
    }

    const [vendor] = await sql<{ id: string }[]>`
      select id from private.vendors
      where lower(slug) = ${input.vendorSlug} and status = 'active'
    `;
    if (!vendor) {
      throw new Error(`No active vendor uses the slug "${input.vendorSlug}".`);
    }

    const userId = randomUUID();
    await sql`
      insert into private.vendor_users
        (id, email, name, platform_role, password_salt, password_hash, active, created_at)
      values
        (${userId}, ${input.email}, ${input.name}, 'super_admin',
         ${credential.salt}, ${credential.hash}, true, now())
    `;
    await sql`
      insert into private.vendor_memberships
        (vendor_id, user_id, role, active, is_default, created_at)
      values (${vendor.id}, ${userId}, 'owner', true, true, now())
    `;
    await sql`
      insert into private.audit_log
        (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
      values
        (${randomUUID()}, ${vendor.id}, ${userId}, 'platform.owner_bootstrapped',
         'platform', ${userId}, now())
    `;
    return { userId, vendorId: vendor.id };
  });
}

async function main() {
  loadEnvConfig(process.cwd());
  if (!process.argv.includes(confirmationFlag)) {
    throw new Error(`Refusing to create an account without ${confirmationFlag}.`);
  }
  const vendorSlug =
    process.argv.find((argument) => argument.startsWith("--vendor="))?.slice("--vendor=".length) ?? "";

  const { derivePasswordHash } = await import("../server/vendor/crypto");
  const { PREVIEW_VENDOR_EMAIL, PREVIEW_VENDOR_PASSWORD } = await import(
    "../server/vendor/config"
  );
  const input = validateBootstrapOwnerInput(
    {
      vendorSlug,
      email: requireEnvironment("VENDOR_EMAIL"),
      password: process.env.VENDOR_PASSWORD ?? "",
      name: requireEnvironment("VENDOR_NAME"),
    },
    { email: PREVIEW_VENDOR_EMAIL, password: PREVIEW_VENDOR_PASSWORD },
  );

  const admin = postgres(requireEnvironment("SUPABASE_ADMIN_DATABASE_URL"), {
    connect_timeout: 15,
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ssl: "require",
  });
  try {
    const [identity] = await admin<{ currentUser: string }[]>`select current_user as "currentUser"`;
    if (identity.currentUser !== "postgres") {
      throw new Error("The bootstrap connection must use the postgres owner.");
    }
    const result = await bootstrapFirstOwner(admin, input, (password) =>
      derivePasswordHash(password),
    );
    console.log(
      `Created the first owner ${input.email} for "${input.vendorSlug}" (user ${result.userId}). ` +
        "Sign in at /admin/login and /vendor/login.",
    );
  } finally {
    await admin.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
