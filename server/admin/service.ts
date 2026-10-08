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
  const user = database.users.find(
    (candidate) => candidate.id === context.user.id,
  );
  if (
    !session ||
    !user ||
    !user.active ||
    user.platformRole !== "super_admin"
  ) {
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
  const valid = values.filter(
    (value): value is string => Boolean(value && Number.isFinite(Date.parse(value))),
  );
  return valid.sort((left, right) => Date.parse(right) - Date.parse(left))[0]
    ?? new Date(0).toISOString();
}

function vendorSummary(
  database: VendorDatabase,
  vendor: VendorRecord,
): AdminVendorSummary {
  const ownerMembership = database.memberships
    .filter(
      (membership) =>
        membership.vendorId === vendor.id && membership.role === "owner",
    )
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
    return {
      id: record.id,
      kind,
      title: "Vendor account updated",
      detail: vendorName,
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

function bootstrapFromDatabase(
  database: VendorDatabase,
  user: VendorUserRecord,
): AdminBootstrap {
  return {
    user: adminUser(user),
    metrics: platformMetrics(database),
    vendors: database.vendors
      .map((vendor) => vendorSummary(database, vendor))
      .sort((left, right) => Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt)),
    recentActivity: recentActivity(database),
  };
}

export async function getAdminBootstrap(
  context: AdminAuthContext,
): Promise<AdminBootstrap> {
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
    ownerWhatsAppNumber = normalizeWhatsAppNumber(
      input.ownerWhatsAppNumber,
      "91",
    );
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

  return updateVendorDatabase((database) => {
    assertLivePlatformAdmin(database, context);
    if (
      database.vendors.some(
        (vendor) => vendor.slug.toLocaleLowerCase("en-IN") === input.slug,
      )
    ) {
      throw new AdminServiceError(
        409,
        "VENDOR_SLUG_EXISTS",
        "That vendor URL is already in use.",
      );
    }
    if (
      database.users.some(
        (user) => user.email.toLocaleLowerCase("en-IN") === input.ownerEmail,
      )
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
      ...newAuditRecord(
        context.user.id,
        "platform.vendor.created",
        "vendor",
        vendorId,
        vendorId,
      ),
      id: auditId,
    });
    database.revision += 1;
    return mutationResult(database, vendorId, auditId);
  }, { platformSessionHash: context.sessionHash });
}

export async function updateAdminVendorStatus(
  context: AdminAuthContext,
  vendorId: string,
  status: VendorStatus,
  expectedRevision: number,
): Promise<AdminVendorMutationResult> {
  const auditId = randomUUID();
  return updateVendorDatabase((database) => {
    assertLivePlatformAdmin(database, context);
    const index = database.vendors.findIndex((vendor) => vendor.id === vendorId);
    const current = database.vendors[index];
    if (!current) {
      throw new AdminServiceError(404, "VENDOR_NOT_FOUND", "Vendor not found.");
    }
    if (current.revision !== expectedRevision) {
      throw new AdminServiceError(
        409,
        "VENDOR_CHANGED",
        "This vendor changed in another session. Refresh and try again.",
      );
    }
    if (current.status === status) {
      throw new AdminServiceError(
        409,
        "VENDOR_STATUS_UNCHANGED",
        `This vendor is already ${status}.`,
      );
    }
    const now = new Date().toISOString();
    database.vendors[index] = {
      ...current,
      status,
      revision: current.revision + 1,
      updatedAt: now,
    };
    const action = status === "active"
      ? "platform.vendor.reactivated"
      : "platform.vendor.suspended";
    database.audit.push({
      ...newAuditRecord(
        context.user.id,
        action,
        "vendor",
        vendorId,
        vendorId,
      ),
      id: auditId,
    });
    database.revision += 1;
    return mutationResult(database, vendorId, auditId);
  }, {
    vendorId,
    platformSessionHash: context.sessionHash,
  });
}
