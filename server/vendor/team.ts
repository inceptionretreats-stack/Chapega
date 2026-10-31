import "server-only";

import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { usesSupabaseBackend } from "@/server/supabase/config";
import { newPasswordProblem } from "@/server/security/password-policy";
import { derivePasswordHash } from "@/server/vendor/crypto";
import {
  isVendorSessionScope,
  newAuditRecord,
  readLocalVendorDatabase,
  updateLocalVendorDatabase,
  type VendorDatabase,
  type VendorUserRecord,
} from "@/server/vendor/database";
import { VendorServiceError } from "@/server/vendor/errors";
import type { TeamMemberCreatePayload } from "@/server/vendor/schemas";
import type { TeamRow } from "@/server/vendor/supabase-accounts";
import type { AssignableTeamRole, VendorAccessContext, VendorTeamMember } from "@/types/vendor";

/**
 * Owners manage who can sign in to their shop. The same rules run in Postgres
 * (migration 20261030122000) and in the local store below, and both answer
 * with the outcome codes mapped in outcomeError:
 * - only managers and staff are added or changed; owners (and the owner doing
 *   the change) never are, so a shop cannot lose its owner;
 * - an email already used anywhere on the platform is refused without saying
 *   where;
 * - a temporary password is set only for someone who belongs to this shop
 *   alone, so an owner never learns credentials that open another shop;
 * - every password someone else chose must be replaced at the next sign-in.
 */
export type TeamActor = Readonly<{ access: VendorAccessContext; sessionHash: string }>;

type TeamOutcome =
  | "created"
  | "updated"
  | "unchanged"
  | "reset"
  | "forbidden"
  | "invalid_role"
  | "invalid_password"
  | "invalid_state"
  | "already_member"
  | "email_unavailable"
  | "not_found"
  | "owner_protected"
  | "self"
  | "managed_elsewhere";

const SUCCESSFUL: ReadonlySet<string> = new Set(["created", "updated", "unchanged", "reset"]);

const EMAIL_UNAVAILABLE =
  "This email address can't be used for a new account. Ask them for a different address, or contact Chapega support.";

function outcomeError(outcome: string): VendorServiceError {
  switch (outcome) {
    case "already_member":
      return new VendorServiceError(
        409,
        "ALREADY_ON_TEAM",
        "This person is already on your team. Reactivate them instead.",
        { email: ["This person is already on your team. Reactivate them instead."] },
      );
    case "email_unavailable":
      return new VendorServiceError(409, "EMAIL_UNAVAILABLE", EMAIL_UNAVAILABLE, {
        email: [EMAIL_UNAVAILABLE],
      });
    case "not_found":
      return new VendorServiceError(
        404,
        "MEMBER_NOT_FOUND",
        "This team member was not found. Refresh and try again.",
      );
    case "owner_protected":
      return new VendorServiceError(
        409,
        "OWNER_PROTECTED",
        "Owner access can only be changed by Chapega support.",
      );
    case "self":
      return new VendorServiceError(409, "SELF_CHANGE", "You can't change your own access here.");
    case "managed_elsewhere":
      return new VendorServiceError(
        409,
        "PASSWORD_RESET_UNAVAILABLE",
        "This person's password can't be reset from your shop. They can change it themselves, or contact Chapega support.",
      );
    case "invalid_role":
    case "invalid_state":
    case "invalid_password":
      return new VendorServiceError(400, "INVALID_TEAM_CHANGE", "That change is not allowed.");
    default:
      return new VendorServiceError(403, "FORBIDDEN", "Only the shop owner can manage the team.");
  }
}

function requireTeamAccess(actor: TeamActor): void {
  if (!actor.access.capabilities.manage_team) throw outcomeError("forbidden");
}

function memberDto(row: TeamRow, actor: TeamActor): VendorTeamMember {
  const isCurrentUser = row.userId === actor.access.user.id;
  const canManage = row.role !== "owner" && !isCurrentUser;
  return {
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    passwordChangePending: row.passwordChangePending,
    isCurrentUser,
    canManage,
    canResetPassword: canManage && row.accountActive && !row.sharedAccount,
    memberSince: row.memberSince,
  };
}

// ---------------------------------------------------------------- local store

function localTeamRows(database: VendorDatabase, vendorId: string): TeamRow[] {
  return database.memberships
    .filter((membership) => membership.vendorId === vendorId)
    .flatMap((membership) => {
      const user = database.users.find((candidate) => candidate.id === membership.userId);
      if (!user) return [];
      return [
        {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: membership.role,
          active: membership.active,
          accountActive: user.active,
          passwordChangePending: Boolean(user.mustChangePassword),
          sharedAccount:
            user.platformRole !== null ||
            database.memberships.some(
              (other) => other.userId === user.id && other.vendorId !== vendorId,
            ),
          memberSince: membership.createdAt,
        },
      ];
    })
    .sort(
      (left, right) =>
        Number(right.role === "owner") - Number(left.role === "owner") ||
        Number(right.active) - Number(left.active) ||
        left.name.localeCompare(right.name) ||
        left.email.localeCompare(right.email),
    );
}

/** Mirrors private.current_vendor_owner_id(): the live owner behind this session. */
function liveLocalOwner(database: VendorDatabase, actor: TeamActor): VendorUserRecord | null {
  const vendorId = actor.access.vendor.id;
  const session = database.sessions.find(
    (candidate) =>
      candidate.idHash === actor.sessionHash &&
      candidate.userId === actor.access.user.id &&
      isVendorSessionScope(candidate.scope) &&
      Date.parse(candidate.expiresAt) > Date.now(),
  );
  const user = database.users.find((candidate) => candidate.id === session?.userId);
  const membership = database.memberships.find(
    (candidate) => candidate.vendorId === vendorId && candidate.userId === user?.id,
  );
  const vendor = database.vendors.find((candidate) => candidate.id === vendorId);
  if (
    !session ||
    !user?.active ||
    user.mustChangePassword ||
    !membership?.active ||
    membership.role !== "owner" ||
    vendor?.status !== "active"
  ) {
    return null;
  }
  return user;
}

async function localChange(
  actor: TeamActor,
  memberId: string,
  change: (database: VendorDatabase, ownerId: string) => TeamOutcome,
): Promise<VendorTeamMember> {
  const result = await updateLocalVendorDatabase((database) => {
    const owner = liveLocalOwner(database, actor);
    const outcome = owner ? change(database, owner.id) : "forbidden";
    if (SUCCESSFUL.has(outcome) && outcome !== "unchanged") database.revision += 1;
    return {
      outcome,
      row: localTeamRows(database, actor.access.vendor.id).find((row) => row.userId === memberId),
    };
  });
  if (!SUCCESSFUL.has(result.outcome)) throw outcomeError(result.outcome);
  if (!result.row) throw outcomeError("not_found");
  return memberDto(result.row, actor);
}

function audit(
  database: VendorDatabase,
  ownerId: string,
  action: string,
  memberId: string,
  vendorId: string,
) {
  database.audit.push(newAuditRecord(ownerId, action, "membership", memberId, vendorId));
}

// ------------------------------------------------------------------ Supabase

async function supabaseChange(
  actor: TeamActor,
  memberId: string,
  call: (sql: postgres.TransactionSql) => Promise<string>,
): Promise<VendorTeamMember> {
  const { readTeamRows, withAccountTransaction } =
    await import("@/server/vendor/supabase-accounts");
  return withAccountTransaction(identity(actor), async (sql) => {
    const outcome = await call(sql);
    if (!SUCCESSFUL.has(outcome)) throw outcomeError(outcome);
    const row = (await readTeamRows(sql)).find((candidate) => candidate.userId === memberId);
    if (!row) throw outcomeError("not_found");
    return memberDto(row, actor);
  });
}

function identity(actor: TeamActor) {
  return {
    sessionHash: actor.sessionHash,
    userId: actor.access.user.id,
    vendorId: actor.access.vendor.id,
  };
}

async function teamRows(actor: TeamActor): Promise<TeamRow[]> {
  if (usesSupabaseBackend()) {
    const { readTeamRows, withAccountTransaction } =
      await import("@/server/vendor/supabase-accounts");
    return withAccountTransaction(identity(actor), readTeamRows);
  }
  const database = await readLocalVendorDatabase();
  if (!liveLocalOwner(database, actor)) throw outcomeError("forbidden");
  return localTeamRows(database, actor.access.vendor.id);
}

// ---------------------------------------------------------------- operations

export async function listVendorTeam(actor: TeamActor): Promise<readonly VendorTeamMember[]> {
  requireTeamAccess(actor);
  return (await teamRows(actor)).map((row) => memberDto(row, actor));
}

export async function addVendorTeamMember(
  actor: TeamActor,
  input: TeamMemberCreatePayload,
): Promise<VendorTeamMember> {
  requireTeamAccess(actor);
  // Slow by design; never inside a transaction or the local write queue.
  const credentials = await derivePasswordHash(input.temporaryPassword);
  const memberId = randomUUID();

  if (usesSupabaseBackend()) {
    return supabaseChange(actor, memberId, async (sql) => {
      const [row] = await sql<Array<{ outcome: string }>>`
        select private.add_vendor_team_member(
          ${memberId}::uuid, ${input.email}, ${input.name}, ${input.role},
          ${credentials.salt}, ${credentials.hash}
        ) as outcome
      `;
      return row?.outcome ?? "forbidden";
    });
  }

  return localChange(actor, memberId, (database, ownerId) => {
    const vendorId = actor.access.vendor.id;
    const existing = database.users.find((user) => user.email.toLowerCase() === input.email);
    if (existing) {
      return database.memberships.some(
        (membership) => membership.vendorId === vendorId && membership.userId === existing.id,
      )
        ? "already_member"
        : "email_unavailable";
    }
    const now = new Date().toISOString();
    database.users.push({
      id: memberId,
      email: input.email,
      name: input.name,
      platformRole: null,
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
      active: true,
      mustChangePassword: true,
      createdAt: now,
    });
    database.memberships.push({
      vendorId,
      userId: memberId,
      role: input.role,
      active: true,
      isDefault: true,
      createdAt: now,
    });
    audit(database, ownerId, "team.member.added", memberId, vendorId);
    return "created";
  });
}

export async function setVendorTeamMemberRole(
  actor: TeamActor,
  memberId: string,
  role: AssignableTeamRole,
): Promise<VendorTeamMember> {
  requireTeamAccess(actor);
  if (usesSupabaseBackend()) {
    return supabaseChange(actor, memberId, async (sql) => {
      const [row] = await sql<Array<{ outcome: string }>>`
        select private.set_vendor_team_member_role(${memberId}::uuid, ${role}) as outcome
      `;
      return row?.outcome ?? "forbidden";
    });
  }
  return localChange(actor, memberId, (database, ownerId) => {
    const vendorId = actor.access.vendor.id;
    if (memberId === ownerId) return "self";
    const index = database.memberships.findIndex(
      (membership) => membership.vendorId === vendorId && membership.userId === memberId,
    );
    const membership = database.memberships[index];
    if (!membership) return "not_found";
    if (membership.role === "owner") return "owner_protected";
    if (membership.role === role) return "unchanged";
    database.memberships[index] = { ...membership, role };
    audit(database, ownerId, `team.member.role.${role}`, memberId, vendorId);
    return "updated";
  });
}

export async function setVendorTeamMemberActive(
  actor: TeamActor,
  memberId: string,
  active: boolean,
): Promise<VendorTeamMember> {
  requireTeamAccess(actor);
  if (usesSupabaseBackend()) {
    return supabaseChange(actor, memberId, async (sql) => {
      const [row] = await sql<Array<{ outcome: string }>>`
        select private.set_vendor_team_member_active(${memberId}::uuid, ${active}) as outcome
      `;
      return row?.outcome ?? "forbidden";
    });
  }
  return localChange(actor, memberId, (database, ownerId) => {
    const vendorId = actor.access.vendor.id;
    if (memberId === ownerId) return "self";
    const index = database.memberships.findIndex(
      (membership) => membership.vendorId === vendorId && membership.userId === memberId,
    );
    const membership = database.memberships[index];
    if (!membership) return "not_found";
    if (membership.role === "owner") return "owner_protected";
    if (membership.active === active) return "unchanged";
    const otherDefault = database.memberships.some(
      (other) =>
        other.userId === memberId && other.vendorId !== vendorId && other.active && other.isDefault,
    );
    database.memberships[index] = {
      ...membership,
      active,
      isDefault: membership.isDefault && !(active && otherDefault),
    };
    if (!active) {
      database.sessions = database.sessions.filter(
        (session) =>
          session.userId !== memberId ||
          !isVendorSessionScope(session.scope) ||
          session.activeVendorId !== vendorId,
      );
    }
    audit(
      database,
      ownerId,
      active ? "team.member.reactivated" : "team.member.deactivated",
      memberId,
      vendorId,
    );
    return "updated";
  });
}

export async function resetVendorTeamPassword(
  actor: TeamActor,
  memberId: string,
  temporaryPassword: string,
): Promise<VendorTeamMember> {
  requireTeamAccess(actor);
  const member = (await teamRows(actor)).find((row) => row.userId === memberId);
  if (!member) throw outcomeError("not_found");
  const problem = newPasswordProblem(temporaryPassword, { email: member.email, name: member.name });
  if (problem) {
    throw new VendorServiceError(400, "WEAK_PASSWORD", problem, { temporaryPassword: [problem] });
  }
  const credentials = await derivePasswordHash(temporaryPassword);

  if (usesSupabaseBackend()) {
    return supabaseChange(actor, memberId, async (sql) => {
      const [row] = await sql<Array<{ outcome: string }>>`
        select private.reset_vendor_team_password(
          ${memberId}::uuid, ${credentials.salt}, ${credentials.hash}
        ) as outcome
      `;
      return row?.outcome ?? "forbidden";
    });
  }
  return localChange(actor, memberId, (database, ownerId) => {
    const vendorId = actor.access.vendor.id;
    if (memberId === ownerId) return "self";
    const membership = database.memberships.find(
      (candidate) => candidate.vendorId === vendorId && candidate.userId === memberId,
    );
    if (!membership) return "not_found";
    if (membership.role === "owner") return "owner_protected";
    const index = database.users.findIndex((user) => user.id === memberId);
    const user = database.users[index];
    const elsewhere = database.memberships.some(
      (other) => other.userId === memberId && other.vendorId !== vendorId,
    );
    if (!user || user.platformRole !== null || !user.active || elsewhere) {
      return "managed_elsewhere";
    }
    database.users[index] = {
      ...user,
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
      mustChangePassword: true,
    };
    database.sessions = database.sessions.filter((session) => session.userId !== memberId);
    audit(database, ownerId, "team.member.password_reset", memberId, vendorId);
    return "reset";
  });
}
