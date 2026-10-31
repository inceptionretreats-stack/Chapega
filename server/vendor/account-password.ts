import "server-only";

import { usesSupabaseBackend } from "@/server/supabase/config";
import { newPasswordProblem } from "@/server/security/password-policy";
import {
  derivePasswordHash,
  DUMMY_PASSWORD_HASH,
  DUMMY_PASSWORD_SALT,
  verifyPassword,
} from "@/server/vendor/crypto";
import {
  isVendorSessionScope,
  newAuditRecord,
  readLocalVendorDatabase,
  updateLocalVendorDatabase,
} from "@/server/vendor/database";
import { fieldError, VendorServiceError } from "@/server/vendor/errors";
import type { PasswordChangePayload } from "@/server/vendor/schemas";

/**
 * Changing your own password, in Vendor Studio or the admin portal. The
 * current password is re-checked; the new one follows the NIST-based policy
 * (server/security/password-policy.ts). On success the session that asked is
 * kept, every other session of that person ends (other devices, and the
 * Studio or admin session of a super admin), and a temporary password stops
 * being temporary.
 */
export type PasswordChangeActor = Readonly<{
  scope: "vendor" | "platform";
  userId: string;
  email: string;
  name: string;
  /** Hash of the session that asked; it stays signed in. */
  sessionHash: string;
}>;

type StoredCredential = Readonly<{ salt: string; hash: string }>;

/** Checks that need no database, so they run before any attempt is counted. */
export function assertNewPasswordAcceptable(
  actor: PasswordChangeActor,
  input: PasswordChangePayload,
): void {
  if (input.newPassword === input.currentPassword) {
    throw fieldError(
      "newPassword",
      "PASSWORD_UNCHANGED",
      "Choose a new password, not your current one.",
    );
  }
  const problem = newPasswordProblem(input.newPassword, { email: actor.email, name: actor.name });
  if (problem) throw fieldError("newPassword", "WEAK_PASSWORD", problem);
}

async function storedCredential(actor: PasswordChangeActor): Promise<StoredCredential | null> {
  if (usesSupabaseBackend()) {
    const { withAccountTransaction } = await import("@/server/vendor/supabase-accounts");
    return withAccountTransaction(
      { sessionHash: actor.sessionHash, userId: actor.userId },
      async (sql) => {
        const [row] = await sql<Array<{ password_salt: string; password_hash: string }>>`
          select password_salt, password_hash
          from private.vendor_users
          where id = ${actor.userId} and active
          limit 1
        `;
        return row ? { salt: row.password_salt, hash: row.password_hash } : null;
      },
    );
  }
  const database = await readLocalVendorDatabase();
  const user = database.users.find(
    (candidate) => candidate.id === actor.userId && candidate.active,
  );
  return user ? { salt: user.passwordSalt, hash: user.passwordHash } : null;
}

async function saveSupabase(
  actor: PasswordChangeActor,
  expectedHash: string,
  next: StoredCredential,
): Promise<boolean> {
  const { withAccountTransaction } = await import("@/server/vendor/supabase-accounts");
  return withAccountTransaction(
    { sessionHash: actor.sessionHash, userId: actor.userId },
    async (sql) => {
      const [row] = await sql<Array<{ changed: boolean }>>`
        select private.change_own_password(
          ${actor.userId}::uuid, ${expectedHash}, ${next.salt}, ${next.hash}
        ) as changed
      `;
      return Boolean(row?.changed);
    },
  );
}

/** The local store's copy of private.change_own_password (compare-and-swap). */
async function saveLocal(
  actor: PasswordChangeActor,
  expectedHash: string,
  next: StoredCredential,
): Promise<boolean> {
  return updateLocalVendorDatabase((database) => {
    const session = database.sessions.find(
      (candidate) =>
        candidate.idHash === actor.sessionHash &&
        candidate.userId === actor.userId &&
        (actor.scope === "platform"
          ? candidate.scope === "platform"
          : isVendorSessionScope(candidate.scope)) &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    const index = database.users.findIndex((candidate) => candidate.id === actor.userId);
    const user = database.users[index];
    if (!session || !user?.active || user.passwordHash !== expectedHash) return false;
    database.users[index] = {
      ...user,
      passwordSalt: next.salt,
      passwordHash: next.hash,
      mustChangePassword: false,
    };
    database.sessions = database.sessions.filter(
      (candidate) => candidate.userId !== actor.userId || candidate.idHash === actor.sessionHash,
    );
    database.audit.push(
      newAuditRecord(
        actor.userId,
        `${actor.scope}.password.changed`,
        "auth",
        actor.userId,
        actor.scope === "vendor" ? session.activeVendorId : null,
      ),
    );
    database.revision += 1;
    return true;
  });
}

export async function changeOwnPassword(
  actor: PasswordChangeActor,
  input: PasswordChangePayload,
): Promise<void> {
  const stored = await storedCredential(actor);
  // Verify outside any transaction or write queue: the hash is slow on purpose.
  const valid = await verifyPassword(
    input.currentPassword,
    stored?.salt ?? DUMMY_PASSWORD_SALT,
    stored?.hash ?? DUMMY_PASSWORD_HASH,
  );
  // 400, not 401: the portal treats 401 as "signed out".
  if (!stored || !valid) {
    throw fieldError(
      "currentPassword",
      "CURRENT_PASSWORD_INCORRECT",
      "That is not your current password.",
    );
  }
  const next = await derivePasswordHash(input.newPassword);
  const saved = usesSupabaseBackend()
    ? await saveSupabase(actor, stored.hash, next)
    : await saveLocal(actor, stored.hash, next);
  if (!saved) {
    throw new VendorServiceError(
      409,
      "PASSWORD_CHANGED_ELSEWHERE",
      "Your password or session changed in another window. Sign in again and retry.",
    );
  }
}
