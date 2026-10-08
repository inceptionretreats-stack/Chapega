import "server-only";

import { randomInt, randomUUID } from "node:crypto";
import { getEffectiveMaxCartUnits } from "@/domain/cart";
import { calculateCartTotals } from "@/domain/money";
import { canTransitionVendorOrder } from "@/domain/vendor";
import {
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  normalizeWhatsAppNumber,
  WhatsAppNumberError,
} from "@/domain/whatsapp";
import {
  DEFAULT_VENDOR_SLUG,
  findVendorBySlug,
  findVendorSettings,
  newAuditRecord,
  readVendorDatabase,
  updateVendorDatabase,
  type VendorDatabase,
  type VendorOrderRecord,
  type VendorProductRecord,
  type VendorRecord,
  type VendorSettingsRecord,
} from "@/server/vendor/database";
import { usesSupabaseBackend } from "@/server/supabase/config";
import { vendorAccessContextFromUser } from "@/server/vendor/auth";
import { sha256 } from "@/server/vendor/crypto";
import { VendorServiceError } from "@/server/vendor/errors";
import { assertProductImageExists } from "@/server/vendor/image-lifecycle";
import type {
  KioskBootstrap,
  PresenterSettings,
  Product,
  ProductAvailability,
  ProductImagePath,
  ProductVariant,
} from "@/types/kiosk";
import type {
  KioskOrderSubmission,
  VendorAccessContext,
  VendorBootstrap,
  VendorCapability,
  VendorOrder,
  VendorOrderItem,
  VendorOrderStatus,
  VendorProduct,
  VendorProductInput,
  VendorSettings,
  VendorUser,
} from "@/types/vendor";

const MAX_STORED_ORDERS = 500;
const MAX_INVENTORY_STOCK = 100_000;

type VendorActor = VendorAccessContext | VendorUser;

type TenantState = Readonly<{
  vendor: VendorRecord;
  settings: VendorSettingsRecord;
}>;

function actorContext(actor: VendorActor): VendorAccessContext {
  return "user" in actor ? actor : vendorAccessContextFromUser(actor);
}

function requireCapability(
  context: VendorAccessContext,
  capability: VendorCapability,
  message: string,
): void {
  if (!context.capabilities[capability]) {
    throw new VendorServiceError(403, "FORBIDDEN", message);
  }
}

function activeTenantById(
  database: VendorDatabase,
  vendorId: string,
): TenantState {
  const vendor = database.vendors.find(
    (candidate) => candidate.id === vendorId,
  );
  if (!vendor || vendor.status !== "active") {
    throw new VendorServiceError(
      403,
      "VENDOR_SUSPENDED",
      "This vendor workspace is not available.",
    );
  }
  const settings = findVendorSettings(database, vendor.id);
  if (!settings) {
    throw new VendorServiceError(
      503,
      "VENDOR_NOT_CONFIGURED",
      "This vendor workspace is not configured yet.",
    );
  }
  return { vendor, settings };
}

function activeTenantBySlug(
  database: VendorDatabase,
  vendorSlug: string,
): TenantState {
  const vendor = findVendorBySlug(database, vendorSlug);
  if (!vendor) {
    throw new VendorServiceError(404, "VENDOR_NOT_FOUND", "Vendor not found.");
  }
  return activeTenantById(database, vendor.id);
}

function touchVendor(database: VendorDatabase, vendorId: string): void {
  const index = database.vendors.findIndex((vendor) => vendor.id === vendorId);
  if (index < 0) {
    throw new VendorServiceError(404, "VENDOR_NOT_FOUND", "Vendor not found.");
  }
  const current = database.vendors[index];
  database.vendors[index] = {
    ...current,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  database.revision += 1;
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze(
    Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))),
  );
}

function availability(stock: number, threshold: number): ProductAvailability {
  if (stock <= 0) return "unavailable";
  if (stock <= threshold) return "low_stock";
  return "available";
}

function toPublicProduct(product: VendorProduct, threshold: number): Product {
  return {
    id: product.id,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    category: product.category,
    pricePaise: product.pricePaise,
    ...(product.compareAtPricePaise !== undefined
      ? { compareAtPricePaise: product.compareAtPricePaise }
      : {}),
    image: product.image,
    availability: availability(product.stock, threshold),
    stock: product.stock,
    featured: product.featured,
    tags: product.tags,
    recipientTags: product.recipientTags,
    occasionTags: product.occasionTags,
    variants: product.variants,
    preparationTime: product.preparationTime,
    giftWrapEligible: product.giftWrapEligible,
  };
}

function publicSettings(settings: VendorSettings): PresenterSettings {
  return {
    shopName: settings.shopName,
    ownerWhatsAppNumber: settings.ownerWhatsAppNumber,
    defaultCountryCode: settings.defaultCountryCode,
    kioskName: settings.kioskName,
    maxCartQuantity: settings.maxCartQuantity,
    giftWrapFeePaise: settings.giftWrapFeePaise,
    qrResetSeconds: settings.qrResetSeconds,
    showPreviewLabel: settings.showPreviewLabel,
  };
}

function orderDto(order: VendorOrderRecord): VendorOrder {
  const {
    submissionFingerprint: _privateFingerprint,
    vendorId: _vendorId,
    ...safeOrder
  } = order;
  void _privateFingerprint;
  void _vendorId;
  return safeOrder;
}

function productDto(product: VendorProductRecord): VendorProduct {
  const { vendorId: _vendorId, ...safeProduct } = product;
  void _vendorId;
  return safeProduct;
}

function settingsDto(settings: VendorSettingsRecord): VendorSettings {
  const { vendorId: _vendorId, ...safeSettings } = settings;
  void _vendorId;
  return safeSettings;
}

function assertCatalogueAccess(context: VendorAccessContext): void {
  requireCapability(
    context,
    "manage_catalogue",
    "Your role cannot change the catalogue.",
  );
}

function assertSettingsAccess(context: VendorAccessContext): void {
  requireCapability(
    context,
    "manage_settings",
    "Only the shop owner can change these settings.",
  );
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return slug || "gift";
}

function normalizedProductVariants(
  variants: readonly ProductVariant[] | undefined,
): readonly ProductVariant[] {
  return Object.freeze(
    (variants ?? []).map((variant) =>
      Object.freeze({
        id: variant.id.trim(),
        name: variant.name.trim(),
        priceAdjustmentPaise: variant.priceAdjustmentPaise,
        ...(variant.stock === undefined ? {} : { stock: variant.stock }),
      }),
    ),
  );
}

type NormalizedVendorProductInput = Omit<
  VendorProductInput,
  "variants" | "version"
> &
  Readonly<{ variants: readonly ProductVariant[] }>;

function normalizedProductInput(
  input: VendorProductInput,
): NormalizedVendorProductInput {
  return {
    name: input.name.trim(),
    shortDescription: input.shortDescription.trim(),
    description: input.description.trim(),
    category: input.category.trim(),
    pricePaise: input.pricePaise,
    // Keep the explicit undefined so a full-form update can clear a previous
    // comparison price instead of inheriting it from the current product.
    compareAtPricePaise: input.compareAtPricePaise,
    image: input.image,
    stock: input.stock,
    featured: input.featured,
    tags: unique(input.tags),
    recipientTags: unique(input.recipientTags),
    occasionTags: unique(input.occasionTags),
    variants: normalizedProductVariants(input.variants),
    preparationTime: input.preparationTime.trim(),
    giftWrapEligible: input.giftWrapEligible,
    visible: input.visible,
  };
}

export async function getKioskBootstrap(
  vendorSlug = DEFAULT_VENDOR_SLUG,
): Promise<KioskBootstrap> {
  const database = await readVendorDatabase({ vendorSlug });
  const { vendor, settings } = activeTenantBySlug(database, vendorSlug);
  return {
    vendor: {
      id: vendor.id,
      slug: vendor.slug,
      displayName: vendor.displayName,
    },
    revision: String(vendor.revision),
    products: database.products
      .filter(
        (product) =>
          product.vendorId === vendor.id &&
          product.visible &&
          !product.archived,
      )
      .map((product) =>
        toPublicProduct(productDto(product), settings.lowStockThreshold),
      ),
    settings: publicSettings(settings),
    storeOpen: settings.storeOpen,
    syncedAt: new Date().toISOString(),
  };
}

export async function getVendorBootstrap(
  actor: VendorActor,
): Promise<VendorBootstrap> {
  const context = actorContext(actor);
  const database = await readVendorDatabase({ vendorId: context.vendor.id });
  const { vendor, settings } = activeTenantById(database, context.vendor.id);
  return {
    user: context.user,
    vendor: context.vendor,
    capabilities: context.capabilities,
    revision: vendor.revision,
    products: database.products
      .filter((product) => product.vendorId === vendor.id && !product.archived)
      .map((product) => ({
        ...productDto(product),
        availability: availability(product.stock, settings.lowStockThreshold),
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    orders: database.orders
      .filter((order) => order.vendorId === vendor.id)
      .map(orderDto)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    settings: settingsDto(settings),
  };
}

export async function createVendorProduct(
  input: VendorProductInput,
  actor: VendorActor,
): Promise<VendorProduct> {
  const context = actorContext(actor);
  assertCatalogueAccess(context);
  return updateVendorDatabase(
    async (database) => {
      const { vendor, settings } = activeTenantById(
        database,
        context.vendor.id,
      );
      const now = new Date().toISOString();
      const base = slugify(input.name);
      let id = base;
      let counter = 2;
      while (
        database.products.some(
          (product) => product.vendorId === vendor.id && product.id === id,
        )
      ) {
        id = `${base}-${counter}`;
        counter += 1;
      }
      const normalized = normalizedProductInput(input);
      await assertProductImageExists(normalized.image, vendor.id);
      const product: VendorProductRecord = {
        ...normalized,
        vendorId: vendor.id,
        id,
        availability: availability(
          normalized.stock,
          settings.lowStockThreshold,
        ),
        archived: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      database.products.push(product);
      touchVendor(database, vendor.id);
      database.audit.push(
        newAuditRecord(
          context.user.id,
          "product.created",
          "product",
          product.id,
          vendor.id,
        ),
      );
      return productDto(product);
    },
    { vendorId: context.vendor.id },
  );
}

export async function updateVendorProduct(
  productId: string,
  input: VendorProductInput,
  actor: VendorActor,
): Promise<VendorProduct> {
  const context = actorContext(actor);
  assertCatalogueAccess(context);
  return updateVendorDatabase(
    async (database) => {
      const { vendor, settings } = activeTenantById(
        database,
        context.vendor.id,
      );
      const index = database.products.findIndex(
        (product) =>
          product.vendorId === vendor.id &&
          product.id === productId &&
          !product.archived,
      );
      if (index < 0) {
        throw new VendorServiceError(
          404,
          "PRODUCT_NOT_FOUND",
          "Product not found.",
        );
      }
      const current = database.products[index];
      if (input.version !== current.version) {
        throw new VendorServiceError(
          409,
          "VERSION_CONFLICT",
          "This product changed in another session. Refresh before saving.",
        );
      }
      const normalized = normalizedProductInput(input);
      await assertProductImageExists(normalized.image, vendor.id);
      const product: VendorProductRecord = {
        ...current,
        ...normalized,
        availability: availability(
          normalized.stock,
          settings.lowStockThreshold,
        ),
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      database.products[index] = product;
      touchVendor(database, vendor.id);
      database.audit.push(
        newAuditRecord(
          context.user.id,
          "product.updated",
          "product",
          product.id,
          vendor.id,
        ),
      );
      return productDto(product);
    },
    { vendorId: context.vendor.id },
  );
}

export async function archiveVendorProduct(
  productId: string,
  version: number,
  actor: VendorActor,
): Promise<void> {
  const context = actorContext(actor);
  assertCatalogueAccess(context);
  await updateVendorDatabase(
    (database) => {
      const { vendor } = activeTenantById(database, context.vendor.id);
      const index = database.products.findIndex(
        (product) =>
          product.vendorId === vendor.id &&
          product.id === productId &&
          !product.archived,
      );
      if (index < 0) {
        throw new VendorServiceError(
          404,
          "PRODUCT_NOT_FOUND",
          "Product not found.",
        );
      }
      const current = database.products[index];
      if (current.version !== version) {
        throw new VendorServiceError(
          409,
          "VERSION_CONFLICT",
          "This product changed in another session. Refresh before archiving.",
        );
      }
      database.products[index] = {
        ...current,
        visible: false,
        archived: true,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      touchVendor(database, vendor.id);
      database.audit.push(
        newAuditRecord(
          context.user.id,
          "product.archived",
          "product",
          productId,
          vendor.id,
        ),
      );
    },
    { vendorId: context.vendor.id },
  );
}

function findProduct(
  database: VendorDatabase,
  vendorId: string,
  productId: string,
): VendorProductRecord {
  const product = database.products.find(
    (candidate) =>
      candidate.vendorId === vendorId &&
      candidate.id === productId &&
      candidate.visible &&
      !candidate.archived,
  );
  if (!product) {
    throw new VendorServiceError(
      409,
      "PRODUCT_UNAVAILABLE",
      "One of the selected gifts is no longer available.",
    );
  }
  return product;
}

const ORDER_NUMBER_TIME_ZONE = "Asia/Kolkata";

function orderNumberDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ORDER_NUMBER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts.replaceAll("-", "");
}

/**
 * Assigns the friendly display number on the server, inside the tenant lock,
 * so two kiosks can never be handed the same number. Four digits are tried
 * first; a busy day falls back to six.
 */
function nextOrderNumber(
  orders: readonly VendorOrderRecord[],
  vendorId: string,
  now = new Date(),
): string {
  const prefix = `GFT-${orderNumberDate(now)}-`;
  const taken = new Set(
    orders
      .filter(
        (order) =>
          order.vendorId === vendorId && order.orderNumber.startsWith(prefix),
      )
      .map((order) => order.orderNumber),
  );
  for (const [minimum, maximum, attempts] of [
    [1_000, 10_000, 40],
    [100_000, 1_000_000, 200],
  ] as const) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const candidate = `${prefix}${randomInt(minimum, maximum)}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
  throw new VendorServiceError(
    503,
    "ORDER_NUMBER_UNAVAILABLE",
    "A new order number could not be assigned. Please try again.",
  );
}

export async function recordKioskOrder(
  submission: KioskOrderSubmission,
  vendorSlug = DEFAULT_VENDOR_SLUG,
): Promise<VendorOrder> {
  // Only what the customer chose identifies a retry. The kiosk's suggested
  // number and timestamp may legitimately change between attempts.
  const fingerprint = sha256(
    JSON.stringify({
      kioskName: submission.kioskName,
      customer: submission.customer,
      items: submission.items,
    }),
  );
  return updateVendorDatabase(
    (database) => {
      const { vendor, settings } = activeTenantBySlug(database, vendorSlug);
      const duplicate = database.orders.find(
        (order) =>
          order.vendorId === vendor.id &&
          order.idempotencyKey === submission.idempotencyKey,
      );
      if (duplicate) {
        if (duplicate.submissionFingerprint !== fingerprint) {
          throw new VendorServiceError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This order key was already used for different contents.",
          );
        }
        return orderDto(duplicate);
      }
      if (!settings.storeOpen) {
        throw new VendorServiceError(
          409,
          "SHOP_PAUSED",
          "The shop has paused new kiosk orders.",
        );
      }
      const orderNumber = nextOrderNumber(database.orders, vendor.id);

      const maxUnits = getEffectiveMaxCartUnits(settings.maxCartQuantity);
      const totalUnits = submission.items.reduce(
        (total, item) => total + item.quantity,
        0,
      );
      if (totalUnits > maxUnits) {
        throw new VendorServiceError(
          400,
          "MAX_UNITS_EXCEEDED",
          `This kiosk accepts at most ${maxUnits} gift units.`,
        );
      }

      const productTotals = new Map<string, number>();
      const variantTotals = new Map<string, number>();
      const cartLines = submission.items.map((item, index) => {
        const product = findProduct(database, vendor.id, item.productId);
        const variant = item.variantId
          ? product.variants.find(
              (candidate) => candidate.id === item.variantId,
            )
          : undefined;
        if (
          (product.variants.length > 0 && !variant) ||
          (product.variants.length === 0 && item.variantId)
        ) {
          throw new VendorServiceError(
            409,
            "VARIANT_UNAVAILABLE",
            `A selection for ${product.name} is no longer available.`,
          );
        }
        if (item.giftWrapped && !product.giftWrapEligible) {
          throw new VendorServiceError(
            409,
            "GIFT_WRAP_UNAVAILABLE",
            `${product.name} cannot be gift wrapped.`,
          );
        }
        const nextProductTotal =
          (productTotals.get(product.id) ?? 0) + item.quantity;
        if (nextProductTotal > product.stock) {
          throw new VendorServiceError(
            409,
            "OUT_OF_STOCK",
            `Only ${product.stock} unit${product.stock === 1 ? " is" : "s are"} available for ${product.name}.`,
          );
        }
        productTotals.set(product.id, nextProductTotal);
        const variantKey = `${product.id}:${variant?.id ?? "default"}`;
        const nextVariantTotal =
          (variantTotals.get(variantKey) ?? 0) + item.quantity;
        if (variant?.stock !== undefined && nextVariantTotal > variant.stock) {
          throw new VendorServiceError(
            409,
            "OUT_OF_STOCK",
            `The selected ${product.name} option has insufficient stock.`,
          );
        }
        variantTotals.set(variantKey, nextVariantTotal);
        const unitPricePaise =
          product.pricePaise + (variant?.priceAdjustmentPaise ?? 0);
        return {
          key: `${product.id}:${variant?.id ?? "default"}:${item.giftWrapped}:${index}`,
          productId: product.id,
          productName: product.name,
          productImage: product.image,
          variantId: variant?.id,
          variantName: variant?.name,
          quantity: item.quantity,
          unitPricePaise,
          giftWrapped: item.giftWrapped,
          productStockLimit: product.stock,
          variantStockLimit: variant?.stock,
          stockLimit: variant?.stock ?? product.stock,
        };
      });

      const totals = calculateCartTotals(cartLines, settings.giftWrapFeePaise);
      const items: readonly VendorOrderItem[] = Object.freeze(
        cartLines.map((line) => ({
          productId: line.productId,
          name: line.productName,
          image: line.productImage,
          ...(line.variantId ? { variantId: line.variantId } : {}),
          ...(line.variantName ? { variant: line.variantName } : {}),
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
          giftWrapped: line.giftWrapped,
          lineTotalPaise: line.quantity * line.unitPricePaise,
        })),
      );
      const whatsappItems = items.map((item) => ({
        productId: item.productId,
        name: item.name,
        variant: item.variant,
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
        giftWrapped: item.giftWrapped,
        lineTotalPaise: item.lineTotalPaise,
      }));
      const whatsappMessage = buildWhatsAppMessage({
        shopName: settings.shopName,
        orderNumber,
        kioskName: settings.kioskName,
        customerName: submission.customer.customerName || undefined,
        items: whatsappItems,
        giftWrapPaise: totals.giftWrapPaise,
        totalPaise: totals.totalPaise,
        giftNote: submission.customer.giftNote || undefined,
        orderNote: submission.customer.orderNote || undefined,
      });
      const whatsappUrl = buildWhatsAppUrl({
        rawNumber: settings.ownerWhatsAppNumber,
        defaultCountryCode: settings.defaultCountryCode,
        message: whatsappMessage,
      });
      const now = new Date().toISOString();
      const order: VendorOrderRecord = {
        vendorId: vendor.id,
        id: randomUUID(),
        orderNumber,
        idempotencyKey: submission.idempotencyKey,
        submissionFingerprint: fingerprint,
        createdAt: now,
        updatedAt: now,
        customer: submission.customer,
        kioskName: settings.kioskName,
        paymentMethod: "pay_later",
        items,
        subtotalPaise: totals.subtotalPaise,
        giftWrapPaise: totals.giftWrapPaise,
        totalPaise: totals.totalPaise,
        whatsappMessage,
        whatsappUrl,
        status: "prepared",
        version: 1,
        inventoryCommitted: false,
        events: [
          {
            id: randomUUID(),
            from: null,
            to: "prepared",
            actorName: `Kiosk · ${settings.kioskName}`,
            createdAt: now,
            note: "WhatsApp message prepared; sending is not yet verified.",
          },
        ],
      };

      // The JSON preview backend is deliberately bounded. Supabase is the durable
      // production archive and must not silently delete completed order history.
      const tenantOrderCount = database.orders.filter(
        (candidate) => candidate.vendorId === vendor.id,
      ).length;
      if (!usesSupabaseBackend() && tenantOrderCount >= MAX_STORED_ORDERS) {
        const removableIndex = database.orders.findIndex(
          (candidate) =>
            candidate.vendorId === vendor.id &&
            (candidate.status === "completed" ||
              candidate.status === "cancelled"),
        );
        if (removableIndex < 0) {
          throw new VendorServiceError(
            507,
            "ORDER_CAPACITY_REACHED",
            "The local order archive is full. Export or migrate it before accepting more orders.",
          );
        }
        database.orders.splice(removableIndex, 1);
      }
      database.orders.push(order);
      touchVendor(database, vendor.id);
      database.audit.push(
        newAuditRecord("kiosk", "order.prepared", "order", order.id, vendor.id),
      );
      return orderDto(order);
    },
    { vendorSlug },
  );
}

function applyInventoryCommit(
  database: VendorDatabase,
  settings: VendorSettingsRecord,
  order: VendorOrderRecord,
  direction: -1 | 1,
): void {
  for (const item of order.items) {
    const index = database.products.findIndex(
      (product) =>
        product.vendorId === order.vendorId && product.id === item.productId,
    );
    if (index < 0) {
      throw new VendorServiceError(
        409,
        "PRODUCT_MISSING",
        `The product snapshot for ${item.name} no longer has a catalogue record.`,
      );
    }
    const product = database.products[index];
    const adjustedStock = product.stock + direction * item.quantity;
    const nextStock =
      direction === 1
        ? Math.min(MAX_INVENTORY_STOCK, adjustedStock)
        : adjustedStock;
    if (nextStock < 0) {
      throw new VendorServiceError(
        409,
        "OUT_OF_STOCK",
        `${item.name} no longer has enough stock to confirm this order.`,
      );
    }
    const nextVariants = product.variants.map((variant) => {
      if (variant.id !== item.variantId || variant.stock === undefined) {
        return variant;
      }
      const adjustedVariantStock = variant.stock + direction * item.quantity;
      const stock =
        direction === 1
          ? Math.min(MAX_INVENTORY_STOCK, adjustedVariantStock)
          : adjustedVariantStock;
      if (stock < 0) {
        throw new VendorServiceError(
          409,
          "OUT_OF_STOCK",
          `${item.name} no longer has enough variant stock to confirm this order.`,
        );
      }
      return { ...variant, stock };
    });
    database.products[index] = {
      ...product,
      stock: nextStock,
      variants: nextVariants,
      availability: availability(nextStock, settings.lowStockThreshold),
      version: product.version + 1,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function transitionVendorOrder(
  orderId: string,
  target: VendorOrderStatus,
  expectedVersion: number,
  actor: VendorActor,
  note?: string,
): Promise<VendorOrder> {
  const context = actorContext(actor);
  requireCapability(
    context,
    "manage_orders",
    "Your role cannot update orders.",
  );
  return updateVendorDatabase(
    (database) => {
      const { vendor, settings } = activeTenantById(
        database,
        context.vendor.id,
      );
      const index = database.orders.findIndex(
        (order) => order.vendorId === vendor.id && order.id === orderId,
      );
      if (index < 0) {
        throw new VendorServiceError(
          404,
          "ORDER_NOT_FOUND",
          "Order not found.",
        );
      }
      const current = database.orders[index];
      if (current.version !== expectedVersion) {
        throw new VendorServiceError(
          409,
          "VERSION_CONFLICT",
          "This order changed in another session. Refresh before updating it.",
        );
      }
      if (!canTransitionVendorOrder(current.status, target)) {
        throw new VendorServiceError(
          409,
          "INVALID_TRANSITION",
          "That status change is not allowed.",
        );
      }

      let inventoryCommitted = current.inventoryCommitted;
      if (target === "confirmed" && !inventoryCommitted) {
        applyInventoryCommit(database, settings, current, -1);
        inventoryCommitted = true;
      } else if (target === "cancelled" && inventoryCommitted) {
        applyInventoryCommit(database, settings, current, 1);
        inventoryCommitted = false;
      }
      const now = new Date().toISOString();
      const order: VendorOrderRecord = {
        ...current,
        status: target,
        inventoryCommitted,
        updatedAt: now,
        version: current.version + 1,
        events: [
          ...current.events,
          {
            id: randomUUID(),
            from: current.status,
            to: target,
            actorName: context.user.name,
            createdAt: now,
            ...(note ? { note } : {}),
          },
        ],
      };
      database.orders[index] = order;
      touchVendor(database, vendor.id);
      database.audit.push(
        newAuditRecord(
          context.user.id,
          `order.status.${target}`,
          "order",
          order.id,
          vendor.id,
        ),
      );
      return orderDto(order);
    },
    { vendorId: context.vendor.id },
  );
}

export async function updateVendorSettings(
  input: Omit<VendorSettings, "updatedAt">,
  actor: VendorActor,
): Promise<VendorSettings> {
  const context = actorContext(actor);
  assertSettingsAccess(context);
  let number: string;
  try {
    number = normalizeWhatsAppNumber(
      input.ownerWhatsAppNumber,
      input.defaultCountryCode,
    );
  } catch (error) {
    if (error instanceof WhatsAppNumberError) {
      throw new VendorServiceError(400, error.code, error.message);
    }
    throw error;
  }

  return updateVendorDatabase(
    (database) => {
      const { vendor, settings: current } = activeTenantById(
        database,
        context.vendor.id,
      );
      if (current.version !== input.version) {
        throw new VendorServiceError(
          409,
          "VERSION_CONFLICT",
          "Settings changed in another session. Refresh before saving.",
        );
      }
      const settings: VendorSettingsRecord = {
        ...input,
        vendorId: vendor.id,
        ownerWhatsAppNumber: number,
        version: input.version + 1,
        updatedAt: new Date().toISOString(),
      };
      const settingsIndex = database.settings.findIndex(
        (candidate) => candidate.vendorId === vendor.id,
      );
      database.settings[settingsIndex] = settings;
      database.products = database.products.map((product) => ({
        ...product,
        availability:
          product.vendorId === vendor.id
            ? availability(product.stock, settings.lowStockThreshold)
            : product.availability,
      }));
      touchVendor(database, vendor.id);
      database.audit.push(
        newAuditRecord(
          context.user.id,
          "settings.updated",
          "settings",
          "shop",
          vendor.id,
        ),
      );
      return settingsDto(settings);
    },
    { vendorId: context.vendor.id },
  );
}

export function imagePath(value: string): ProductImagePath {
  return value as ProductImagePath;
}
