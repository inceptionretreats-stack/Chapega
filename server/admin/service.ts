import "server-only";

import { randomUUID } from "node:crypto";
import { normalizeWhatsAppNumber, WhatsAppNumberError } from "@/domain/whatsapp";
import {
  newAuditRecord,
  readVendorDatabase,
  updateVendorDatabase,
  type VendorAuditRecord,
  type VendorDatabase,
  type VendorRecord,
  type VendorUserRecord,
} from "@/server/vendor/database";
import { usesSupabaseBackend } from "@/server/supabase/config";
import { newPasswordProblem } from "@/server/security/password-policy";
import { derivePasswordHash } from "@/server/vendor/crypto";
import type {
  AdminActivityItem,
  AdminBootstrap,
  AdminPlatformMetrics,
  AdminVendorMutationResult,
  AdminVendorSummary,
  CreateAdminVendorInput,
  PlatformAdminUser,
} from "@/types/admin";
import type { VendorStatus } from "@/types/vendor";
import type { AdminAuthContext } from "./auth";
import { AdminServiceError } from "./errors";

function assertLivePlatformAdmin(
  database: VendorDatabase,
  context: AdminAuthContext,
): VendorUserRecord {
  const session = database.sessions.find(
    (candidate) =>
      candidate.idHash === context.sessionHash &&
      candidate.userId === context.user.id &&
      candidate.scope === "platform" &&
      candidate.activeVendorId === null &&
      Date.parse(candidate.expiresAt) > Date.now(),
  );
  const user = database.users.find((candidate) => candidate.id === context.user.id);
  if (!session || !user || !user.active || user.platformRole !== "super_admin") {
    throw new AdminServiceError(
      401,
      "ADMIN_AUTH_REQUIRED",
      "Your platform session has ended. Sign in again.",
    );
  }
  return user;
}

function adminUser(record: VendorUserRecord): PlatformAdminUser {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    role: "super_admin",
  };
}

function latestTimestamp(values: readonly (string | undefined)[]): string {
  const valid = values.filter((value): value is string =>
    Boolean(value && Number.isFinite(Date.parse(value))),
  );
  return (
    valid.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ??
    new Date(0).toISOString()
  );
}

function vendorSummary(database: VendorDatabase, vendor: VendorRecord): AdminVendorSummary {
  const ownerMembership = database.memberships
    .filter((membership) => membership.vendorId === vendor.id && membership.role === "owner")
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))[0];
  const owner = ownerMembership
    ? database.users.find((user) => user.id === ownerMembership.userId)
    : undefined;
  const products = database.products.filter(
    (product) => product.vendorId === vendor.id && !product.archived,
  );
  const orders = database.orders.filter((order) => order.vendorId === vendor.id);
  const audit = database.audit.filter((record) => record.vendorId === vendor.id);

  return {
    id: vendor.id,
    slug: vendor.slug,
    displayName: vendor.displayName,
    status: vendor.status,
    revision: vendor.revision,
    owner: owner
      ? { id: owner.id, name: owner.name, email: owner.email }
      : { id: "", name: "Owner not assigned", email: "Not available" },
    productCount: products.length,
    orderCount: orders.length,
    createdAt: vendor.createdAt,
    updatedAt: vendor.updatedAt,
    lastActivityAt: latestTimestamp([
      vendor.updatedAt,
      ...products.map((product) => product.updatedAt),
      ...orders.map((order) => order.updatedAt),
      ...audit.map((record) => record.createdAt),
    ]),
  };
}

function platformMetrics(database: VendorDatabase): AdminPlatformMetrics {
  return {
    totalVendors: database.vendors.length,
    activeVendors: database.vendors.filter((vendor) => vendor.status === "active").length,
    orderCount: database.orders.length,
    productCount: database.products.filter((product) => !product.archived).length,
  };
}

const ACCOUNT_ACTIVITY_TITLES: Readonly<Record<string, string>> = {
  "team.member.added": "Team member added",
  "team.member.deactivated": "Team member deactivated",
  "team.member.reactivated": "Team member reactivated",
  "team.member.password_reset": "Team password reset",
  "platform.owner.password_reset": "Owner password reset",
};

function accountRoleTitle(action: string): string {
  return action.startsWith("team.member.role.") ? "Team role changed" : "Vendor account updated";
}

function activityKind(record: VendorAuditRecord): AdminActivityItem["kind"] | null {
  if (record.action === "platform.vendor.created") return "vendor_created";
  if (record.action === "platform.vendor.suspended") return "vendor_suspended";
  if (record.action === "platform.vendor.reactivated") return "vendor_reactivated";
  if (record.entityType === "order") return "order";
  if (record.entityType === "product") return "product";
  if (record.entityType === "membership") return "account";
  if (record.entityType === "settings") return "settings";
  return null;
}

function activityFromAudit(
  database: VendorDatabase,
  record: VendorAuditRecord,
): AdminActivityItem | null {
  const kind = activityKind(record);
  if (!kind) return null;
  const vendor = record.vendorId
    ? database.vendors.find((candidate) => candidate.id === record.vendorId)
    : undefined;
  const vendorName = vendor?.displayName ?? "A storefront";

  if (kind === "vendor_created") {
    return {
      id: record.id,
      kind,
      title: "Vendor added",
      detail: `${vendorName} joined the platform`,
      createdAt: record.createdAt,
      ...(record.vendorId ? { vendorId: record.vendorId } : {}),
    };
  }
  if (kind === "vendor_suspended" || kind === "vendor_reactivated") {
    const reactivated = kind === "vendor_reactivated";
    return {
      id: record.id,
      kind,
      title: reactivated ? "Store reactivated" : "Store suspended",
      detail: `${vendorName} is ${reactivated ? "open again" : "temporarily paused"}`,
      createdAt: record.createdAt,
      ...(record.vendorId ? { vendorId: record.vendorId } : {}),
    };
  }
  if (kind === "order") {
    const order = database.orders.find((candidate) => candidate.id === record.entityId);
    return {
      id: record.id,
      kind,
      title: record.action === "order.prepared" ? "New kiosk order" : "Order updated",
      detail: `${vendorName}${order ? ` · ${order.orderNumber}` : ""}`,
      createdAt: record.createdAt,
      ...(record.vendorId ? { vendorId: record.vendorId } : {}),
    };
  }
  if (kind === "product") {
    const product = database.products.find(
      (candidate) => candidate.id === record.entityId && candidate.vendorId === record.vendorId,
    );
    return {
      id: record.id,
      kind,
      title: record.action === "product.created" ? "Product added" : "Catalogue updated",
      detail: `${vendorName}${product ? ` · ${product.name}` : ""}`,
      createdAt: record.createdAt,
      ...(record.vendorId ? { vendorId: record.vendorId } : {}),
    };
  }
  if (kind === "account") {
    const person = database.users.find((user) => user.id === record.entityId);
    return {
      id: record.id,
      kind,
      title: ACCOUNT_ACTIVITY_TITLES[record.action] ?? accountRoleTitle(record.action),
      detail: person ? `${vendorName} · ${person.name}` : vendorName,
      createdAt: record.createdAt,
      ...(record.vendorId ? { vendorId: record.vendorId } : {}),
    };
  }
  return {
    id: record.id,
    kind,
    title: "Store settings updated",
    detail: vendorName,
    createdAt: record.createdAt,
    ...(record.vendorId ? { vendorId: record.vendorId } : {}),
  };
}

function recentActivity(database: VendorDatabase): AdminActivityItem[] {
  return database.audit
    .slice()
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .map((record) => activityFromAudit(database, record))
    .filter((record): record is AdminActivityItem => Boolean(record))
    .slice(0, 12);
}

function bootstrapFromDatabase(database: VendorDatabase, user: VendorUserRecord): AdminBootstrap {
  return {
    user: adminUser(user),
    metrics: platformMetrics(database),
    vendors: database.vendors
      .map((vendor) => vendorSummary(database, vendor))
      .sort((left, right) => Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt)),
    recentActivity: recentActivity(database),
  };
}

export async function getAdminBootstrap(context: AdminAuthContext): Promise<AdminBootstrap> {
  const database = await readVendorDatabase({
    platformSessionHash: context.sessionHash,
  });
  const user = assertLivePlatformAdmin(database, context);
  return bootstrapFromDatabase(database, user);
}

function mutationResult(
  database: VendorDatabase,
  vendorId: string,
  auditId: string,
): AdminVendorMutationResult {
  const vendor = database.vendors.find((candidate) => candidate.id === vendorId);
  const audit = database.audit.find((candidate) => candidate.id === auditId);
  const activity = audit ? activityFromAudit(database, audit) : null;
  if (!vendor || !activity) {
    throw new Error("The platform mutation did not produce a complete result.");
  }
  return {
    vendor: vendorSummary(database, vendor),
    metrics: platformMetrics(database),
    activity,
  };
}

export async function createAdminVendor(
  context: AdminAuthContext,
  input: CreateAdminVendorInput,
): Promise<AdminVendorMutationResult> {
  let ownerWhatsAppNumber: string;
  try {
    ownerWhatsAppNumber = normalizeWhatsAppNumber(input.ownerWhatsAppNumber, "91");
  } catch (error) {
    if (error instanceof WhatsAppNumberError) {
      throw new AdminServiceError(400, error.code, error.message);
    }
    throw error;
  }

  const credentials = await derivePasswordHash(input.temporaryPassword);
  const vendorId = randomUUID();
  const ownerId = randomUUID();
  const auditId = randomUUID();
  const now = new Date().toISOString();

  return updateVendorDatabase(
    (database) => {
      assertLivePlatformAdmin(database, context);
      if (
        database.vendors.some((vendor) => vendor.slug.toLocaleLowerCase("en-IN") === input.slug)
      ) {
        throw new AdminServiceError(
          409,
          "VENDOR_SLUG_EXISTS",
          "That vendor URL is already in use.",
        );
      }
      if (
        database.users.some((user) => user.email.toLocaleLowerCase("en-IN") === input.ownerEmail)
      ) {
        throw new AdminServiceError(
          409,
          "OWNER_EMAIL_EXISTS",
          "That email already belongs to a platform account.",
        );
      }

      database.vendors.push({
        id: vendorId,
        slug: input.slug,
        displayName: input.displayName,
        status: "active",
        revision: 1,
        createdAt: now,
        updatedAt: now,
      });
      database.users.push({
        id: ownerId,
        email: input.ownerEmail,
        name: input.ownerName,
        platformRole: null,
        passwordSalt: credentials.salt,
        passwordHash: credentials.hash,
        active: true,
        // The admin chose it: the owner replaces it at their first sign-in.
        mustChangePassword: true,
        createdAt: now,
      });
      database.memberships.push({
        vendorId,
        userId: ownerId,
        role: "owner",
        active: true,
        isDefault: true,
        createdAt: now,
      });
      database.settings.push({
        vendorId,
        shopName: input.displayName,
        ownerWhatsAppNumber,
        defaultCountryCode: "91",
        kioskName: "Main kiosk",
        maxCartQuantity: 5,
        giftWrapFeePaise: 2_500,
        qrResetSeconds: 120,
        showPreviewLabel: false,
        storeOpen: true,
        lowStockThreshold: 3,
        version: 1,
        updatedAt: now,
      });
      database.audit.push({
        ...newAuditRecord(context.user.id, "platform.vendor.created", "vendor", vendorId, vendorId),
        id: auditId,
      });
      database.revision += 1;
      return mutationResult(database, vendorId, auditId);
    },
    { platformSessionHash: context.sessionHash },
  );
}

/**
 * Change a vendor's status. The optimistic check is status-specific: the
 * caller states the status it saw (default: the opposite of the target), so
 * orders and catalogue edits - which bump vendor.revision - never block it,
 * while a duplicate or conflicting change from a stale screen is refused.
 */
export async function updateAdminVendorStatus(
  context: AdminAuthContext,
  vendorId: string,
  status: VendorStatus,
  expectedStatus: VendorStatus = status === "active" ? "suspended" : "active",
): Promise<AdminVendorMutationResult> {
  const auditId = randomUUID();
  return updateVendorDatabase(
    (database) => {
      assertLivePlatformAdmin(database, context);
      const index = database.vendors.findIndex((vendor) => vendor.id === vendorId);
      const current = database.vendors[index];
      if (!current) {
        throw new AdminServiceError(404, "VENDOR_NOT_FOUND", "Vendor not found.");
      }
      if (current.status === status) {
        throw new AdminServiceError(
          409,
          "VENDOR_STATUS_UNCHANGED",
          `This vendor is already ${status}.`,
        );
      }
      if (current.status !== expectedStatus) {
        throw new AdminServiceError(
          409,
          "VENDOR_STATUS_CHANGED",
          "This vendor's status changed in another session. Refresh and try again.",
        );
      }
      const now = new Date().toISOString();
      database.vendors[index] = {
        ...current,
        status,
        revision: current.revision + 1,
        updatedAt: now,
      };
      const action =
        status === "active" ? "platform.vendor.reactivated" : "platform.vendor.suspended";
      database.audit.push({
        ...newAuditRecord(context.user.id, action, "vendor", vendorId, vendorId),
        id: auditId,
      });
      database.revision += 1;
      return mutationResult(database, vendorId, auditId);
    },
    {
      vendorId,
      platformSessionHash: context.sessionHash,
    },
  );
}

/**
 * Sets a temporary password for a shop's owner (an owner who is locked out),
 * signs them out everywhere, and makes them choose their own password at the
 * next sign-in. Super admins change their own password from the account menu
 * instead; that keeps one admin from taking over another's account.
 */
export async function resetAdminVendorOwnerPassword(
  context: AdminAuthContext,
  vendorId: string,
  input: Readonly<{ ownerId: string; temporaryPassword: string }>,
): Promise<AdminVendorMutationResult> {
  const snapshot = await readVendorDatabase({ platformSessionHash: context.sessionHash });
  assertLivePlatformAdmin(snapshot, context);
  const owner = resetTarget(snapshot, vendorId, input.ownerId);
  const problem = newPasswordProblem(input.temporaryPassword, {
    email: owner.email,
    name: owner.name,
  });
  if (problem) {
    throw new AdminServiceError(400, "WEAK_PASSWORD", problem, { temporaryPassword: [problem] });
  }
  const credentials = await derivePasswordHash(input.temporaryPassword);
  const auditId = randomUUID();

  if (usesSupabaseBackend()) {
    const { withAccountTransaction } = await import("@/server/vendor/supabase-accounts");
    const outcome = await withAccountTransaction(
      { sessionHash: context.sessionHash },
      async (sql) => {
        const [row] = await sql<Array<{ outcome: string }>>`
          select private.reset_vendor_owner_password(
            ${vendorId}::uuid, ${input.ownerId}::uuid, ${credentials.salt}, ${credentials.hash},
            ${auditId}::uuid
          ) as outcome
        `;
        return row?.outcome ?? "forbidden";
      },
    );
    if (outcome !== "reset") throw ownerResetError(outcome);
    const database = await readVendorDatabase({ platformSessionHash: context.sessionHash });
    return mutationResult(database, vendorId, auditId);
  }

  return updateVendorDatabase(
    (database) => {
      assertLivePlatformAdmin(database, context);
      const current = resetTarget(database, vendorId, input.ownerId);
      const index = database.users.findIndex((user) => user.id === current.id);
      database.users[index] = {
        ...current,
        passwordSalt: credentials.salt,
        passwordHash: credentials.hash,
        mustChangePassword: true,
      };
      database.sessions = database.sessions.filter((session) => session.userId !== current.id);
      database.audit.push({
        ...newAuditRecord(
          context.user.id,
          "platform.owner.password_reset",
          "membership",
          current.id,
          vendorId,
        ),
        id: auditId,
      });
      database.revision += 1;
      return mutationResult(database, vendorId, auditId);
    },
    { platformSessionHash: context.sessionHash },
  );
}

function resetTarget(database: VendorDatabase, vendorId: string, ownerId: string) {
  if (!database.vendors.some((vendor) => vendor.id === vendorId)) {
    throw new AdminServiceError(404, "VENDOR_NOT_FOUND", "Vendor not found.");
  }
  const isOwner = database.memberships.some(
    (membership) =>
      membership.vendorId === vendorId &&
      membership.userId === ownerId &&
      membership.role === "owner",
  );
  const owner = database.users.find((user) => user.id === ownerId);
  if (!isOwner || !owner) throw ownerResetError("not_found");
  if (owner.platformRole !== null) throw ownerResetError("platform_admin");
  if (!owner.active) throw ownerResetError("inactive");
  return owner;
}

function ownerResetError(outcome: string): AdminServiceError {
  switch (outcome) {
    case "not_found":
      return new AdminServiceError(404, "OWNER_NOT_FOUND", "This shop's owner was not found.");
    case "platform_admin":
      return new AdminServiceError(
        409,
        "OWNER_IS_PLATFORM_ADMIN",
        "This owner is a platform admin. They change their own password from the account menu.",
      );
    case "inactive":
      return new AdminServiceError(
        409,
        "OWNER_ACCOUNT_INACTIVE",
        "This owner's account is deactivated.",
      );
    case "invalid_password":
      return new AdminServiceError(400, "WEAK_PASSWORD", "Choose a different temporary password.");
    default:
      return new AdminServiceError(
        401,
        "ADMIN_AUTH_REQUIRED",
        "Your platform session has ended. Sign in again.",
      );
  }
}
