import "server-only";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { usesSupabaseBackend } from "@/server/supabase/config";
import {
  newAuditRecord,
  readLocalVendorDatabase,
  updateLocalVendorDatabase,
} from "@/server/vendor/database";
import { isRejectedLoginCredential } from "@/server/vendor/config";
import {
  derivePasswordHash,
  DUMMY_PASSWORD_HASH,
  DUMMY_PASSWORD_SALT,
  passwordHashNeedsRehash,
  randomToken,
  sha256,
  verifyPassword,
} from "@/server/vendor/crypto";
import type { PlatformAdminUser } from "@/types/admin";
import { getAdminCredentialConfiguration } from "./config";
import { AdminServiceError } from "./errors";

export const ADMIN_SESSION_COOKIE = "chapega_admin_session";

// Unknown accounts verify against a dummy hash with the current parameters.
const DUMMY_SALT = DUMMY_PASSWORD_SALT;
const DUMMY_HASH = DUMMY_PASSWORD_HASH;

export type AdminAuthContext = Readonly<{
  user: PlatformAdminUser;
  /** A SHA-256 digest, never the raw browser credential. */
  sessionHash: string;
}>;

function adminSessionHours(): number {
  const candidate = Number(process.env.ADMIN_SESSION_HOURS ?? 8);
  return Number.isFinite(candidate) && candidate >= 1 && candidate <= 24
    ? candidate
    : 8;
}

function platformAdminUser(user: {
  id: string;
  email: string;
  name: string;
  platformRole: "super_admin" | null;
  active: boolean;
}): PlatformAdminUser | null {
  if (!user.active || user.platformRole !== "super_admin") return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: "super_admin",
  };
}

export async function authenticateAdminLogin(
  email: string,
  password: string,
): Promise<
  Readonly<{ user: PlatformAdminUser; token: string; expiresAt: Date }> | null
> {
  const configuration = getAdminCredentialConfiguration();
  if (!configuration.available) {
    throw new AdminServiceError(
      503,
      "AUTH_NOT_CONFIGURED",
      "Platform sign-in is not configured on this server.",
    );
  }

  // Same guard as vendor sign-in: no preview pair outside preview, and never
  // the .env.example placeholder, whatever the stored hash says.
  if (isRejectedLoginCredential(email, password)) return null;

  const normalizedEmail = email.trim().toLocaleLowerCase("en-IN");
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + adminSessionHours() * 60 * 60 * 1_000,
  );

  if (usesSupabaseBackend()) {
    const { authenticateSupabasePlatformLogin } = await import(
      "@/server/vendor/supabase-auth"
    );
    const user = await authenticateSupabasePlatformLogin({
      email: normalizedEmail,
      password,
      dummySalt: DUMMY_SALT,
      dummyHash: DUMMY_HASH,
      tokenHash,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return user ? { user, token, expiresAt } : null;
  }

  // Credential discovery is intentionally confined to the local adapter. All
  // authenticated platform reads use the scoped database API below.
  // The slow hash runs outside the serialized write queue.
  const snapshot = await readLocalVendorDatabase();
  const verified = snapshot.users.find(
    (record) => record.email === normalizedEmail,
  );
  const validPassword = await verifyPassword(
    password,
    verified?.passwordSalt ?? DUMMY_SALT,
    verified?.passwordHash ?? DUMMY_HASH,
  );
  if (!verified || !validPassword || !platformAdminUser(verified)) return null;
  // Upgrade hashes stored with older scrypt parameters (outside the queue).
  const rehashed = passwordHashNeedsRehash(verified.passwordHash)
    ? await derivePasswordHash(password)
    : null;

  const user = await updateLocalVendorDatabase(async (database) => {
    // Re-check under the write lock so a concurrent rotation/deactivation wins.
    const index = database.users.findIndex((record) => record.id === verified.id);
    const current = database.users[index];
    if (
      !current ||
      current.passwordHash !== verified.passwordHash ||
      current.passwordSalt !== verified.passwordSalt
    ) {
      return null;
    }
    const publicUser = platformAdminUser(current);
    if (!publicUser) return null;
    const candidate = rehashed
      ? { ...current, passwordSalt: rehashed.salt, passwordHash: rehashed.hash }
      : current;
    database.users[index] = candidate;

    const now = Date.now();
    database.sessions = database.sessions.filter(
      (session) =>
        Date.parse(session.expiresAt) > now &&
        !(session.userId === candidate.id && session.scope === "platform"),
    );
    database.sessions.push({
      idHash: tokenHash,
      userId: candidate.id,
      scope: "platform",
      activeVendorId: null,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    database.audit.push(
      newAuditRecord(
        candidate.id,
        "platform.login",
        "auth",
        candidate.id,
        null,
      ),
    );
    database.revision += 1;
    return publicUser;
  });

  return user ? { user, token, expiresAt } : null;
}

export async function getAdminByToken(
  token: string | undefined,
): Promise<AdminAuthContext | null> {
  if (!token || !getAdminCredentialConfiguration().available) return null;
  const sessionHash = sha256(token);

  if (usesSupabaseBackend()) {
    const { getSupabasePlatformUserByToken } = await import(
      "@/server/vendor/supabase-auth"
    );
    const user = await getSupabasePlatformUserByToken(sessionHash);
    return user ? { user, sessionHash } : null;
  }

  const database = await readLocalVendorDatabase();
  const session = database.sessions.find(
    (candidate) =>
      candidate.idHash === sessionHash &&
      candidate.scope === "platform" &&
      candidate.activeVendorId === null &&
      Date.parse(candidate.expiresAt) > Date.now(),
  );
  if (!session) return null;
  const record = database.users.find((candidate) => candidate.id === session.userId);
  const user = record ? platformAdminUser(record) : null;
  return user ? { user, sessionHash } : null;
}

export async function getRequestAdmin(
  request: NextRequest,
): Promise<AdminAuthContext | null> {
  return getAdminByToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function requireRequestAdmin(
  request: NextRequest,
): Promise<AdminAuthContext> {
  const context = await getRequestAdmin(request);
  if (!context) {
    throw new AdminServiceError(
      401,
      "ADMIN_AUTH_REQUIRED",
      "Your platform session has ended. Sign in again.",
    );
  }
  return context;
}

export async function getCurrentAdmin(): Promise<AdminAuthContext | null> {
  const cookieStore = await cookies();
  return getAdminByToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function destroyAdminSession(token: string): Promise<void> {
  if (!token) return;
  const tokenHash = sha256(token);

  if (usesSupabaseBackend()) {
    const { destroySupabasePlatformSession } = await import(
      "@/server/vendor/supabase-auth"
    );
    await destroySupabasePlatformSession(tokenHash);
    return;
  }

  await updateLocalVendorDatabase((database) => {
    const session = database.sessions.find(
      (candidate) =>
        candidate.idHash === tokenHash && candidate.scope === "platform",
    );
    database.sessions = database.sessions.filter(
      (candidate) =>
        candidate.idHash !== tokenHash || candidate.scope !== "platform",
    );
    if (!session) return;
    database.audit.push(
      newAuditRecord(
        session.userId,
        "platform.logout",
        "auth",
        session.userId,
        null,
      ),
    );
    database.revision += 1;
  });
}
