import "server-only";

import type postgres from "postgres";
import { getSupabasePostgres } from "@/server/supabase/postgres";
import {
  DEFAULT_VENDOR_ID,
  type VendorAuditRecord,
  type VendorDatabase,
  type VendorDatabaseAccess,
  type VendorMembershipRecord,
  type VendorOrderRecord,
  type VendorProductRecord,
  type VendorRecord,
  type VendorSessionRecord,
  type VendorSettingsRecord,
  type VendorUserRecord,
} from "@/server/vendor/database";
import { VendorServiceError } from "@/server/vendor/errors";
import type { ProductAvailability, ProductVariant } from "@/types/kiosk";
import type { VendorOrderEvent, VendorOrderItem } from "@/types/vendor";

type QueryClient = postgres.Sql | postgres.TransactionSql;
type DateValue = Date | string;
type ResolvedAccess = Readonly<{
  vendorId: string | null;
  platformSessionHash?: string;
}>;

type VendorRow = {
  id: string;
  slug: string;
  display_name: string;
  status: VendorRecord["status"];
  revision: number;
  created_at: DateValue;
  updated_at: DateValue;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  platform_role: VendorUserRecord["platformRole"];
  password_salt: string;
  password_hash: string;
  active: boolean;
  created_at: DateValue;
};

type MembershipRow = {
  vendor_id: string;
  user_id: string;
  role: VendorMembershipRecord["role"];
  active: boolean;
  is_default: boolean;
  created_at: DateValue;
};

type SessionRow = {
  id_hash: string;
  user_id: string;
  session_scope: VendorSessionRecord["scope"];
  active_vendor_id: string | null;
  created_at: DateValue;
  expires_at: DateValue;
};

type ProductRow = {
  vendor_id: string;
  id: string;
  name: string;
  short_description: string;
  description: string;
  category: string;
  price_paise: number;
  compare_at_price_paise: number | null;
  image: string;
  stock: number;
  featured: boolean;
  tags: string[];
  recipient_tags: string[];
  occasion_tags: string[];
  preparation_time: string;
  gift_wrap_eligible: boolean;
  visible: boolean;
  archived: boolean;
  version: number;
  created_at: DateValue;
  updated_at: DateValue;
};

type VariantRow = {
  vendor_id: string;
  product_id: string;
  id: string;
  name: string;
  price_adjustment_paise: number;
  stock: number | null;
  position: number;
};

type OrderRow = {
  vendor_id: string;
  id: string;
  order_number: string;
  idempotency_key: string;
  submission_fingerprint: string;
  created_at: DateValue;
  updated_at: DateValue;
  customer_name: string;
  customer_phone: string;
  gift_note: string;
  order_note: string;
  kiosk_name: string;
  payment_method: "pay_later";
  subtotal_paise: number;
  gift_wrap_paise: number;
  total_paise: number;
  whatsapp_message: string;
  whatsapp_url: string;
  status: VendorOrderRecord["status"];
  version: number;
  inventory_committed: boolean;
};

type OrderItemRow = {
  vendor_id: string;
  order_id: string;
  position: number;
  product_id: string;
  name: string;
  image: string;
  variant_id: string | null;
  variant_name: string | null;
  quantity: number;
  unit_price_paise: number;
  gift_wrapped: boolean;
  line_total_paise: number;
};

type OrderEventRow = {
  vendor_id: string;
  id: string;
  order_id: string;
  from_status: VendorOrderEvent["from"];
  to_status: VendorOrderEvent["to"];
  actor_name: string;
  created_at: DateValue;
  note: string | null;
};

type SettingsRow = {
  vendor_id: string;
  shop_name: string;
  owner_whatsapp_number: string;
  default_country_code: string;
  kiosk_name: string;
  max_cart_quantity: number;
  gift_wrap_fee_paise: number;
  qr_reset_seconds: number;
  show_preview_label: boolean;
  store_open: boolean;
  low_stock_threshold: number;
  version: number;
  updated_at: DateValue;
};

type AuditRow = {
  id: string;
  vendor_id: string | null;
  actor_id: string;
  action: string;
  entity_type: VendorAuditRecord["entityType"];
  entity_id: string;
  created_at: DateValue;
};

type SnapshotRow = {
  revision: number | string | null;
  vendors: VendorRow[];
  users: UserRow[];
  memberships: MembershipRow[];
  sessions: SessionRow[];
  settings: SettingsRow[];
  products: ProductRow[];
  variants: VariantRow[];
  orders: OrderRow[];
  items: OrderItemRow[];
  events: OrderEventRow[];
};

export type SupabaseKioskSnapshot = Readonly<{
  vendor: VendorRecord;
  revision: number;
  settings: VendorSettingsRecord;
  products: readonly VendorProductRecord[];
}>;

function iso(value: DateValue): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function availability(stock: number, threshold: number): ProductAvailability {
  if (stock <= 0) return "unavailable";
  if (stock <= threshold) return "low_stock";
  return "available";
}

function backendUnavailable(message: string, cause?: unknown): VendorServiceError {
  const error = new VendorServiceError(503, "BACKEND_UNAVAILABLE", message);
  if (cause !== undefined) error.cause = cause;
  return error;
}

function vendorNotFound(): VendorServiceError {
  return new VendorServiceError(
    404,
    "VENDOR_NOT_FOUND",
    "This vendor kiosk is not available.",
  );
}

function vendorFromRow(row: VendorRow): VendorRecord {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    status: row.status,
    revision: Number(row.revision),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function settingsFromRow(row: SettingsRow): VendorSettingsRecord {
  return {
    vendorId: row.vendor_id,
    shopName: row.shop_name,
    ownerWhatsAppNumber: row.owner_whatsapp_number,
    defaultCountryCode: row.default_country_code,
    kioskName: row.kiosk_name,
    maxCartQuantity: Number(row.max_cart_quantity),
    giftWrapFeePaise: Number(row.gift_wrap_fee_paise),
    qrResetSeconds: Number(row.qr_reset_seconds),
    showPreviewLabel: row.show_preview_label,
    storeOpen: row.store_open,
    lowStockThreshold: Number(row.low_stock_threshold),
    version: Number(row.version),
    updatedAt: iso(row.updated_at),
  };
}

function compositeKey(vendorId: string, id: string): string {
  return `${vendorId}\u0000${id}`;
}

function productsFromRows(
  productRows: readonly ProductRow[],
  variantRows: readonly VariantRow[],
  thresholds: ReadonlyMap<string, number>,
): VendorProductRecord[] {
  const variants = new Map<string, ProductVariant[]>();
  for (const row of variantRows) {
    const key = compositeKey(row.vendor_id, row.product_id);
    const productVariants = variants.get(key) ?? [];
    productVariants.push({
      id: row.id,
      name: row.name,
      priceAdjustmentPaise: Number(row.price_adjustment_paise),
      ...(row.stock === null ? {} : { stock: Number(row.stock) }),
    });
    variants.set(key, productVariants);
  }
  return productRows.map((row) => ({
    vendorId: row.vendor_id,
    id: row.id,
    name: row.name,
    shortDescription: row.short_description,
    description: row.description,
    category: row.category,
    pricePaise: Number(row.price_paise),
    ...(row.compare_at_price_paise === null
      ? {}
      : { compareAtPricePaise: Number(row.compare_at_price_paise) }),
    image: row.image as VendorProductRecord["image"],
    availability: availability(
      Number(row.stock),
      thresholds.get(row.vendor_id) ?? 0,
    ),
    stock: Number(row.stock),
    featured: row.featured,
    tags: row.tags,
    recipientTags: row.recipient_tags,
    occasionTags: row.occasion_tags,
    variants: variants.get(compositeKey(row.vendor_id, row.id)) ?? [],
    preparationTime: row.preparation_time,
    giftWrapEligible: row.gift_wrap_eligible,
    visible: row.visible,
    archived: row.archived,
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }));
}

async function setTransactionSetting(
  sql: QueryClient,
  name: string,
  value: string,
): Promise<void> {
  await sql`select set_config(${name}, ${value}, true)`;
}

async function configureAccess(
  sql: QueryClient,
  access: VendorDatabaseAccess | undefined,
): Promise<ResolvedAccess> {
  const platformSessionHash = access?.platformSessionHash?.trim() || undefined;
  if (platformSessionHash) {
    await setTransactionSetting(sql, "app.session_hash", platformSessionHash);
  }

  let vendorId = access?.vendorId?.trim() || null;
  const vendorSlug = access?.vendorSlug?.trim().toLowerCase();
  if (vendorSlug) {
    await setTransactionSetting(sql, "app.vendor_slug", vendorSlug);
    const [vendor] = await sql<Array<{ id: string }>>`
      select id
      from private.vendors
      where slug = ${vendorSlug}
        and status = 'active'
      limit 1
    `;
    if (!vendor || (vendorId && vendor.id !== vendorId)) throw vendorNotFound();
    vendorId = vendor.id;
  }
  if (!vendorId && !platformSessionHash) vendorId = DEFAULT_VENDOR_ID;
  if (vendorId) await setTransactionSetting(sql, "app.vendor_id", vendorId);
  return { vendorId, ...(platformSessionHash ? { platformSessionHash } : {}) };
}

async function readSnapshot(
  sql: QueryClient,
  access: ResolvedAccess,
): Promise<VendorDatabase> {
  const platform = Boolean(access.platformSessionHash);
  const vendorId = access.vendorId ?? DEFAULT_VENDOR_ID;
  const [snapshot] = await sql<SnapshotRow[]>`
    select
      coalesce((
        select max(state.revision)
        from private.app_state state
        where ${platform} or state.vendor_id = ${vendorId}
      ), 1) as revision,
      coalesce((
        select jsonb_agg(to_jsonb(vendor_row) order by vendor_row.created_at, vendor_row.id)
        from (
          select id, slug, display_name, status, revision, created_at, updated_at
          from private.vendors
          where ${platform} or id = ${vendorId}
        ) vendor_row
      ), '[]'::jsonb) as vendors,
      coalesce((
        select jsonb_agg(to_jsonb(user_row) order by user_row.created_at, user_row.id)
        from (
          select id, email, name, platform_role, password_salt, password_hash, active, created_at
          from private.vendor_users users
          where ${platform}
             or exists (
               select 1
               from private.vendor_memberships memberships
               where memberships.user_id = users.id
                 and memberships.vendor_id = ${vendorId}
             )
        ) user_row
      ), '[]'::jsonb) as users,
      coalesce((
        select jsonb_agg(to_jsonb(membership_row) order by membership_row.created_at, membership_row.user_id)
        from (
          select vendor_id, user_id, role, active, is_default, created_at
          from private.vendor_memberships
          where ${platform} or vendor_id = ${vendorId}
        ) membership_row
      ), '[]'::jsonb) as memberships,
      coalesce((
        select jsonb_agg(to_jsonb(session_row) order by session_row.created_at, session_row.id_hash)
        from (
          select id_hash, user_id, session_scope, active_vendor_id, created_at, expires_at
          from private.vendor_sessions
          where expires_at > now()
            and (${platform} or active_vendor_id = ${vendorId})
        ) session_row
      ), '[]'::jsonb) as sessions,
      coalesce((
        select jsonb_agg(to_jsonb(settings_row) order by settings_row.vendor_id)
        from (
          select *
          from private.shop_settings
          where ${platform} or vendor_id = ${vendorId}
        ) settings_row
      ), '[]'::jsonb) as settings,
      coalesce((
        select jsonb_agg(to_jsonb(product_row) order by product_row.created_at, product_row.id)
        from (
          select *
          from private.products
          where ${platform} or vendor_id = ${vendorId}
        ) product_row
      ), '[]'::jsonb) as products,
      coalesce((
        select jsonb_agg(to_jsonb(variant_row) order by variant_row.vendor_id, variant_row.product_id, variant_row.position, variant_row.id)
        from (
          select vendor_id, product_id, id, name, price_adjustment_paise, stock, position
          from private.product_variants
          where ${platform} or vendor_id = ${vendorId}
        ) variant_row
      ), '[]'::jsonb) as variants,
      coalesce((
        select jsonb_agg(to_jsonb(order_row) order by order_row.created_at, order_row.id)
        from (
          select *
          from private.orders
          where ${platform} or vendor_id = ${vendorId}
        ) order_row
      ), '[]'::jsonb) as orders,
      coalesce((
        select jsonb_agg(to_jsonb(item_row) order by item_row.vendor_id, item_row.order_id, item_row.position)
        from (
          select *
          from private.order_items
          where ${platform} or vendor_id = ${vendorId}
        ) item_row
      ), '[]'::jsonb) as items,
      coalesce((
        select jsonb_agg(to_jsonb(event_row) order by event_row.vendor_id, event_row.order_id, event_row.created_at, event_row.id)
        from (
          select vendor_id, id, order_id, from_status, to_status, actor_name, created_at, note
          from private.order_events
          where ${platform} or vendor_id = ${vendorId}
        ) event_row
      ), '[]'::jsonb) as events
  `;
  if (!snapshot) {
    throw backendUnavailable(
      "The Supabase backend is not initialized. Apply the multi-vendor migration first.",
    );
  }

  const vendors = snapshot.vendors.map(vendorFromRow);
  if (!platform && vendors.length !== 1) throw vendorNotFound();
  const settings = snapshot.settings.map(settingsFromRow);
  const thresholds = new Map(
    settings.map((record) => [record.vendorId, record.lowStockThreshold]),
  );
  const products = productsFromRows(snapshot.products, snapshot.variants, thresholds);
  const auditRows = platform
    ? await sql<AuditRow[]>`
        select
          id, vendor_id, actor_id, action, entity_type, entity_id, created_at
        from private.audit_log
        order by created_at desc, id desc
        limit 500
      `
    : [];

  const items = new Map<string, VendorOrderItem[]>();
  for (const row of snapshot.items) {
    const key = compositeKey(row.vendor_id, row.order_id);
    const records = items.get(key) ?? [];
    records.push({
      productId: row.product_id,
      name: row.name,
      image: row.image as VendorOrderItem["image"],
      ...(row.variant_id ? { variantId: row.variant_id } : {}),
      ...(row.variant_name ? { variant: row.variant_name } : {}),
      quantity: Number(row.quantity),
      unitPricePaise: Number(row.unit_price_paise),
      giftWrapped: row.gift_wrapped,
      lineTotalPaise: Number(row.line_total_paise),
    });
    items.set(key, records);
  }

  const events = new Map<string, VendorOrderEvent[]>();
  for (const row of snapshot.events) {
    const key = compositeKey(row.vendor_id, row.order_id);
    const records = events.get(key) ?? [];
    records.push({
      id: row.id,
      from: row.from_status,
      to: row.to_status,
      actorName: row.actor_name,
      createdAt: iso(row.created_at),
      ...(row.note ? { note: row.note } : {}),
    });
    events.set(key, records);
  }

  const orders: VendorOrderRecord[] = snapshot.orders.map((row) => ({
    vendorId: row.vendor_id,
    id: row.id,
    orderNumber: row.order_number,
    idempotencyKey: row.idempotency_key,
    submissionFingerprint: row.submission_fingerprint,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    customer: {
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      giftNote: row.gift_note,
      orderNote: row.order_note,
    },
    kioskName: row.kiosk_name,
    paymentMethod: row.payment_method,
    items: items.get(compositeKey(row.vendor_id, row.id)) ?? [],
    subtotalPaise: Number(row.subtotal_paise),
    giftWrapPaise: Number(row.gift_wrap_paise),
    totalPaise: Number(row.total_paise),
    whatsappMessage: row.whatsapp_message,
    whatsappUrl: row.whatsapp_url,
    status: row.status,
    version: Number(row.version),
    inventoryCommitted: row.inventory_committed,
    events: events.get(compositeKey(row.vendor_id, row.id)) ?? [],
  }));

  return {
    version: 2,
    revision: Number(snapshot.revision),
    vendors,
    users: snapshot.users.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      platformRole: row.platform_role,
      passwordSalt: row.password_salt,
      passwordHash: row.password_hash,
      active: row.active,
      createdAt: iso(row.created_at),
    })),
    memberships: snapshot.memberships.map((row) => ({
      vendorId: row.vendor_id,
      userId: row.user_id,
      role: row.role,
      active: row.active,
      isDefault: row.is_default,
      createdAt: iso(row.created_at),
    })),
    sessions: snapshot.sessions.map((row) => ({
      idHash: row.id_hash,
      userId: row.user_id,
      scope: row.session_scope,
      activeVendorId: row.active_vendor_id,
      createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at),
    })),
    products,
    orders,
    settings,
    audit: auditRows.map((row) => ({
      id: row.id,
      vendorId: row.vendor_id,
      actorId: row.actor_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: iso(row.created_at),
    })),
  };
}

function changed<T>(left: T, right: T): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

/** Every vendor column except the revision bookkeeping a tenant may update. */
function vendorIdentityFields(vendor: VendorRecord) {
  return {
    id: vendor.id,
    slug: vendor.slug,
    displayName: vendor.displayName,
    status: vendor.status,
    createdAt: vendor.createdAt,
  };
}

function assertTenantScoped(database: VendorDatabase, vendorId: string): void {
  const tenantIds = [
    ...database.vendors.map((record) => record.id),
    ...database.memberships.map((record) => record.vendorId),
    ...database.products.map((record) => record.vendorId),
    ...database.orders.map((record) => record.vendorId),
    ...database.settings.map((record) => record.vendorId),
    ...database.sessions.flatMap((record) =>
      record.activeVendorId ? [record.activeVendorId] : [],
    ),
    ...database.audit.flatMap((record) =>
      record.vendorId ? [record.vendorId] : [],
    ),
  ];
  if (tenantIds.some((candidate) => candidate !== vendorId)) {
    throw new VendorServiceError(
      403,
      "TENANT_SCOPE_VIOLATION",
      "The update attempted to cross a vendor boundary.",
    );
  }
}

async function persistVendorsAndIdentity(
  sql: postgres.TransactionSql,
  current: VendorDatabase,
  next: VendorDatabase,
): Promise<void> {
  const currentVendors = new Map(current.vendors.map((record) => [record.id, record]));
  for (const vendor of next.vendors) {
    const previous = currentVendors.get(vendor.id);
    if (previous && !changed(previous, vendor)) continue;
    if (previous && !changed(vendorIdentityFields(previous), vendorIdentityFields(vendor))) {
      // Ordinary tenant writes only bump the revision. An upsert would need
      // INSERT permission, which tenant policies deliberately don't grant.
      await sql`
        update private.vendors
        set revision = ${vendor.revision}, updated_at = ${vendor.updatedAt}
        where id = ${vendor.id}
      `;
      continue;
    }
    await sql`
      insert into private.vendors
        (id, slug, display_name, status, revision, created_at, updated_at)
      values
        (${vendor.id}, ${vendor.slug}, ${vendor.displayName}, ${vendor.status},
         ${vendor.revision}, ${vendor.createdAt}, ${vendor.updatedAt})
      on conflict (id) do update set
        slug = excluded.slug,
        display_name = excluded.display_name,
        status = excluded.status,
        revision = excluded.revision,
        updated_at = excluded.updated_at
    `;
  }

  const currentUsers = new Map(current.users.map((record) => [record.id, record]));
  for (const user of next.users) {
    const previous = currentUsers.get(user.id);
    if (previous && !changed(previous, user)) continue;
    await sql`
      insert into private.vendor_users
        (id, email, name, platform_role, password_salt, password_hash, active, created_at)
      values
        (${user.id}, ${user.email}, ${user.name}, ${user.platformRole},
         ${user.passwordSalt}, ${user.passwordHash}, ${user.active}, ${user.createdAt})
      on conflict (id) do update set
        email = excluded.email,
        name = excluded.name,
        platform_role = excluded.platform_role,
        password_salt = excluded.password_salt,
        password_hash = excluded.password_hash,
        active = excluded.active
    `;
  }

  const membershipKey = (record: VendorMembershipRecord) =>
    compositeKey(record.vendorId, record.userId);
  const nextMemberships = new Set(next.memberships.map(membershipKey));
  for (const membership of current.memberships) {
    if (nextMemberships.has(membershipKey(membership))) continue;
    await sql`
      delete from private.vendor_memberships
      where vendor_id = ${membership.vendorId} and user_id = ${membership.userId}
    `;
  }
  const currentMemberships = new Map(
    current.memberships.map((record) => [membershipKey(record), record]),
  );
  for (const membership of next.memberships) {
    const previous = currentMemberships.get(membershipKey(membership));
    if (previous && !changed(previous, membership)) continue;
    await sql`
      insert into private.vendor_memberships
        (vendor_id, user_id, role, active, is_default, created_at)
      values
        (${membership.vendorId}, ${membership.userId}, ${membership.role},
         ${membership.active}, ${membership.isDefault}, ${membership.createdAt})
      on conflict (vendor_id, user_id) do update set
        role = excluded.role,
        active = excluded.active,
        is_default = excluded.is_default
    `;
  }
}

async function persistSessions(
  sql: postgres.TransactionSql,
  current: VendorDatabase,
  next: VendorDatabase,
): Promise<void> {
  const nextIds = new Set(next.sessions.map((record) => record.idHash));
  for (const session of current.sessions) {
    if (nextIds.has(session.idHash)) continue;
    await sql`delete from private.vendor_sessions where id_hash = ${session.idHash}`;
  }
  const currentSessions = new Map(
    current.sessions.map((record) => [record.idHash, record]),
  );
  for (const session of next.sessions) {
    const previous = currentSessions.get(session.idHash);
    if (previous && !changed(previous, session)) continue;
    await sql`
      insert into private.vendor_sessions
        (id_hash, user_id, session_scope, active_vendor_id, created_at, expires_at)
      values
        (${session.idHash}, ${session.userId}, ${session.scope},
         ${session.activeVendorId}, ${session.createdAt}, ${session.expiresAt})
      on conflict (id_hash) do update set
        session_scope = excluded.session_scope,
        active_vendor_id = excluded.active_vendor_id,
        expires_at = excluded.expires_at
    `;
  }
}

async function persistProducts(
  sql: postgres.TransactionSql,
  current: VendorDatabase,
  next: VendorDatabase,
): Promise<void> {
  const key = (record: VendorProductRecord) =>
    compositeKey(record.vendorId, record.id);
  const nextIds = new Set(next.products.map(key));
  for (const product of current.products) {
    if (nextIds.has(key(product))) continue;
    await sql`
      delete from private.products
      where vendor_id = ${product.vendorId} and id = ${product.id}
    `;
  }
  const currentById = new Map(current.products.map((record) => [key(record), record]));
  for (const product of next.products) {
    const previous = currentById.get(key(product));
    if (previous && previous.version === product.version) continue;
    await sql`
      insert into private.products (
        vendor_id, id, name, short_description, description, category, price_paise,
        compare_at_price_paise, image, stock, featured, tags, recipient_tags,
        occasion_tags, preparation_time, gift_wrap_eligible, visible, archived,
        version, created_at, updated_at
      ) values (
        ${product.vendorId}, ${product.id}, ${product.name}, ${product.shortDescription},
        ${product.description}, ${product.category}, ${product.pricePaise},
        ${product.compareAtPricePaise ?? null}, ${product.image}, ${product.stock},
        ${product.featured}, ${sql.array([...product.tags])},
        ${sql.array([...product.recipientTags])}, ${sql.array([...product.occasionTags])},
        ${product.preparationTime}, ${product.giftWrapEligible}, ${product.visible},
        ${product.archived}, ${product.version}, ${product.createdAt}, ${product.updatedAt}
      )
      on conflict (vendor_id, id) do update set
        name = excluded.name,
        short_description = excluded.short_description,
        description = excluded.description,
        category = excluded.category,
        price_paise = excluded.price_paise,
        compare_at_price_paise = excluded.compare_at_price_paise,
        image = excluded.image,
        stock = excluded.stock,
        featured = excluded.featured,
        tags = excluded.tags,
        recipient_tags = excluded.recipient_tags,
        occasion_tags = excluded.occasion_tags,
        preparation_time = excluded.preparation_time,
        gift_wrap_eligible = excluded.gift_wrap_eligible,
        visible = excluded.visible,
        archived = excluded.archived,
        version = excluded.version,
        updated_at = excluded.updated_at
    `;
    await sql`
      delete from private.product_variants
      where vendor_id = ${product.vendorId} and product_id = ${product.id}
    `;
    for (const [position, variant] of product.variants.entries()) {
      await sql`
        insert into private.product_variants
          (vendor_id, product_id, id, name, price_adjustment_paise, stock, position)
        values
          (${product.vendorId}, ${product.id}, ${variant.id}, ${variant.name},
           ${variant.priceAdjustmentPaise}, ${variant.stock ?? null}, ${position})
      `;
    }
  }
}

async function persistOrders(
  sql: postgres.TransactionSql,
  current: VendorDatabase,
  next: VendorDatabase,
): Promise<void> {
  const key = (record: VendorOrderRecord) =>
    compositeKey(record.vendorId, record.id);
  const currentById = new Map(current.orders.map((record) => [key(record), record]));
  for (const order of next.orders) {
    const previous = currentById.get(key(order));
    if (previous && previous.version === order.version) continue;
    await sql`
      insert into private.orders (
        vendor_id, id, order_number, idempotency_key, submission_fingerprint,
        created_at, updated_at, customer_name, customer_phone, gift_note,
        order_note, kiosk_name, payment_method, subtotal_paise, gift_wrap_paise,
        total_paise, whatsapp_message, whatsapp_url, status, version,
        inventory_committed
      ) values (
        ${order.vendorId}, ${order.id}, ${order.orderNumber}, ${order.idempotencyKey},
        ${order.submissionFingerprint}, ${order.createdAt}, ${order.updatedAt},
        ${order.customer.customerName}, ${order.customer.customerPhone},
        ${order.customer.giftNote}, ${order.customer.orderNote}, ${order.kioskName},
        ${order.paymentMethod}, ${order.subtotalPaise}, ${order.giftWrapPaise},
        ${order.totalPaise}, ${order.whatsappMessage}, ${order.whatsappUrl},
        ${order.status}, ${order.version}, ${order.inventoryCommitted}
      )
      on conflict (id) do update set
        updated_at = excluded.updated_at,
        status = excluded.status,
        version = excluded.version,
        inventory_committed = excluded.inventory_committed
      where private.orders.vendor_id = excluded.vendor_id
    `;
    await sql`
      delete from private.order_items
      where vendor_id = ${order.vendorId} and order_id = ${order.id}
    `;
    for (const [position, item] of order.items.entries()) {
      await sql`
        insert into private.order_items (
          vendor_id, order_id, position, product_id, name, image, variant_id,
          variant_name, quantity, unit_price_paise, gift_wrapped, line_total_paise
        ) values (
          ${order.vendorId}, ${order.id}, ${position}, ${item.productId}, ${item.name},
          ${item.image}, ${item.variantId ?? null}, ${item.variant ?? null},
          ${item.quantity}, ${item.unitPricePaise}, ${item.giftWrapped},
          ${item.lineTotalPaise}
        )
      `;
    }
    await sql`
      delete from private.order_events
      where vendor_id = ${order.vendorId} and order_id = ${order.id}
    `;
    for (const event of order.events) {
      await sql`
        insert into private.order_events
          (vendor_id, id, order_id, from_status, to_status, actor_name, created_at, note)
        values
          (${order.vendorId}, ${event.id}, ${order.id}, ${event.from}, ${event.to},
           ${event.actorName}, ${event.createdAt}, ${event.note ?? null})
      `;
    }
  }
}

async function persistSettingsAuditAndRevision(
  sql: postgres.TransactionSql,
  current: VendorDatabase,
  next: VendorDatabase,
  vendorId: string,
): Promise<void> {
  const currentSettings = new Map(
    current.settings.map((record) => [record.vendorId, record]),
  );
  for (const settings of next.settings) {
    const previous = currentSettings.get(settings.vendorId);
    if (previous && !changed(previous, settings)) continue;
    await sql`
      insert into private.shop_settings (
        vendor_id, id, shop_name, owner_whatsapp_number, default_country_code,
        kiosk_name, max_cart_quantity, gift_wrap_fee_paise, qr_reset_seconds,
        show_preview_label, store_open, low_stock_threshold, version, updated_at
      ) values (
        ${settings.vendorId}, 1, ${settings.shopName}, ${settings.ownerWhatsAppNumber},
        ${settings.defaultCountryCode}, ${settings.kioskName}, ${settings.maxCartQuantity},
        ${settings.giftWrapFeePaise}, ${settings.qrResetSeconds},
        ${settings.showPreviewLabel}, ${settings.storeOpen},
        ${settings.lowStockThreshold}, ${settings.version}, ${settings.updatedAt}
      )
      on conflict (vendor_id) do update set
        shop_name = excluded.shop_name,
        owner_whatsapp_number = excluded.owner_whatsapp_number,
        default_country_code = excluded.default_country_code,
        kiosk_name = excluded.kiosk_name,
        max_cart_quantity = excluded.max_cart_quantity,
        gift_wrap_fee_paise = excluded.gift_wrap_fee_paise,
        qr_reset_seconds = excluded.qr_reset_seconds,
        show_preview_label = excluded.show_preview_label,
        store_open = excluded.store_open,
        low_stock_threshold = excluded.low_stock_threshold,
        version = excluded.version,
        updated_at = excluded.updated_at
    `;
  }

  const previousIds = new Set(current.audit.map((record) => record.id));
  for (const record of next.audit) {
    if (previousIds.has(record.id)) continue;
    await sql`
      insert into private.audit_log
        (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
      values
        (${record.id}, ${record.vendorId ?? vendorId}, ${record.actorId},
         ${record.action}, ${record.entityType}, ${record.entityId}, ${record.createdAt})
      on conflict (id) do nothing
    `;
  }
  await sql`
    update private.app_state
    set revision = ${next.revision}, updated_at = now()
    where vendor_id = ${vendorId}
  `;
}

async function persistSnapshot(
  sql: postgres.TransactionSql,
  current: VendorDatabase,
  next: VendorDatabase,
  vendorId: string,
): Promise<void> {
  await persistVendorsAndIdentity(sql, current, next);
  await persistSessions(sql, current, next);
  await persistProducts(sql, current, next);
  await persistOrders(sql, current, next);
  await persistSettingsAuditAndRevision(sql, current, next, vendorId);
}

function ids<T>(records: readonly T[], id: (record: T) => string): Set<string> {
  return new Set(records.map(id));
}

function assertNothingRemoved<T>(
  current: readonly T[],
  next: readonly T[],
  id: (record: T) => string,
  label: string,
): void {
  const nextIds = ids(next, id);
  if (current.some((record) => !nextIds.has(id(record)))) {
    throw new VendorServiceError(
      403,
      "PLATFORM_MUTATION_REJECTED",
      `Platform ${label} records cannot be deleted from this workflow.`,
    );
  }
}

function assertPlatformMutation(
  current: VendorDatabase,
  next: VendorDatabase,
): Readonly<{ newVendorIds: Set<string>; changedVendorIds: Set<string> }> {
  if (
    changed(current.products, next.products) ||
    changed(current.orders, next.orders) ||
    changed(current.sessions, next.sessions)
  ) {
    throw new VendorServiceError(
      403,
      "PLATFORM_MUTATION_REJECTED",
      "Platform administration cannot mutate tenant commerce data or sessions.",
    );
  }
  assertNothingRemoved(current.vendors, next.vendors, (record) => record.id, "vendor");
  assertNothingRemoved(current.users, next.users, (record) => record.id, "user");
  assertNothingRemoved(
    current.memberships,
    next.memberships,
    (record) => compositeKey(record.vendorId, record.userId),
    "membership",
  );
  assertNothingRemoved(
    current.settings,
    next.settings,
    (record) => record.vendorId,
    "settings",
  );

  const currentVendors = new Map(current.vendors.map((record) => [record.id, record]));
  const newVendors = next.vendors.filter((record) => !currentVendors.has(record.id));
  if (newVendors.length > 1) {
    throw new VendorServiceError(
      400,
      "PLATFORM_MUTATION_REJECTED",
      "Create one vendor workspace at a time.",
    );
  }
  const newVendorIds = new Set(newVendors.map((record) => record.id));
  const changedVendorIds = new Set<string>();
  for (const vendor of next.vendors) {
    const previous = currentVendors.get(vendor.id);
    if (!previous || !changed(previous, vendor)) {
      if (!previous) changedVendorIds.add(vendor.id);
      continue;
    }
    const stablePrevious = {
      id: previous.id,
      slug: previous.slug,
      displayName: previous.displayName,
      createdAt: previous.createdAt,
    };
    const stableNext = {
      id: vendor.id,
      slug: vendor.slug,
      displayName: vendor.displayName,
      createdAt: vendor.createdAt,
    };
    if (changed(stablePrevious, stableNext)) {
      throw new VendorServiceError(
        403,
        "PLATFORM_MUTATION_REJECTED",
        "Existing vendor identity fields cannot be rewritten.",
      );
    }
    changedVendorIds.add(vendor.id);
  }

  const currentUsers = new Map(current.users.map((record) => [record.id, record]));
  for (const user of next.users) {
    const previous = currentUsers.get(user.id);
    if (previous && changed(previous, user)) {
      throw new VendorServiceError(
        403,
        "PLATFORM_MUTATION_REJECTED",
        "Existing identities cannot be rewritten from vendor administration.",
      );
    }
    if (!previous && user.platformRole !== null) {
      throw new VendorServiceError(
        403,
        "PLATFORM_MUTATION_REJECTED",
        "Vendor creation cannot grant platform administrator authority.",
      );
    }
  }

  const currentMemberships = ids(
    current.memberships,
    (record) => compositeKey(record.vendorId, record.userId),
  );
  for (const membership of next.memberships) {
    if (currentMemberships.has(compositeKey(membership.vendorId, membership.userId))) {
      const previous = current.memberships.find(
        (record) =>
          record.vendorId === membership.vendorId &&
          record.userId === membership.userId,
      );
      if (previous && changed(previous, membership)) {
        throw new VendorServiceError(
          403,
          "PLATFORM_MUTATION_REJECTED",
          "Existing memberships cannot be rewritten from this workflow.",
        );
      }
    } else if (!newVendorIds.has(membership.vendorId)) {
      throw new VendorServiceError(
        403,
        "PLATFORM_MUTATION_REJECTED",
        "New memberships must belong to the vendor being created.",
      );
    }
  }

  const currentSettings = new Map(
    current.settings.map((record) => [record.vendorId, record]),
  );
  for (const settings of next.settings) {
    const previous = currentSettings.get(settings.vendorId);
    if (previous && changed(previous, settings)) {
      throw new VendorServiceError(
        403,
        "PLATFORM_MUTATION_REJECTED",
        "Tenant settings must be changed from the vendor workspace.",
      );
    }
    if (!previous && !newVendorIds.has(settings.vendorId)) {
      throw new VendorServiceError(
        403,
        "PLATFORM_MUTATION_REJECTED",
        "New settings must belong to the vendor being created.",
      );
    }
  }
  return { newVendorIds, changedVendorIds };
}

async function persistPlatformSnapshot(
  sql: postgres.TransactionSql,
  current: VendorDatabase,
  next: VendorDatabase,
): Promise<void> {
  const { newVendorIds, changedVendorIds } = assertPlatformMutation(current, next);
  await persistVendorsAndIdentity(sql, current, next);

  for (const vendorId of newVendorIds) {
    const vendor = next.vendors.find((record) => record.id === vendorId);
    if (!vendor) continue;
    await sql`
      insert into private.app_state (vendor_id, id, revision, updated_at)
      values (${vendorId}, 1, ${vendor.revision}, ${vendor.updatedAt})
      on conflict (vendor_id) do nothing
    `;
  }

  for (const settings of next.settings) {
    if (!newVendorIds.has(settings.vendorId)) continue;
    await sql`
      insert into private.shop_settings (
        vendor_id, id, shop_name, owner_whatsapp_number, default_country_code,
        kiosk_name, max_cart_quantity, gift_wrap_fee_paise, qr_reset_seconds,
        show_preview_label, store_open, low_stock_threshold, version, updated_at
      ) values (
        ${settings.vendorId}, 1, ${settings.shopName}, ${settings.ownerWhatsAppNumber},
        ${settings.defaultCountryCode}, ${settings.kioskName},
        ${settings.maxCartQuantity}, ${settings.giftWrapFeePaise},
        ${settings.qrResetSeconds}, ${settings.showPreviewLabel},
        ${settings.storeOpen}, ${settings.lowStockThreshold}, ${settings.version},
        ${settings.updatedAt}
      )
    `;
  }

  for (const vendorId of changedVendorIds) {
    const vendor = next.vendors.find((record) => record.id === vendorId);
    if (!vendor || newVendorIds.has(vendorId)) continue;
    await sql`
      update private.app_state
      set revision = ${vendor.revision}, updated_at = ${vendor.updatedAt}
      where vendor_id = ${vendorId}
    `;
  }

  for (const record of next.audit) {
    await sql`
      insert into private.audit_log
        (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
      values
        (${record.id}, ${record.vendorId}, ${record.actorId}, ${record.action},
         ${record.entityType}, ${record.entityId}, ${record.createdAt})
      on conflict (id) do nothing
    `;
  }
}

export async function readSupabaseVendorDatabase(
  access?: VendorDatabaseAccess,
): Promise<VendorDatabase> {
  try {
    const result = await getSupabasePostgres().begin(async (transaction) => {
      const resolved = await configureAccess(transaction, access);
      return readSnapshot(transaction, resolved);
    });
    return structuredClone(result);
  } catch (error) {
    if (error instanceof VendorServiceError) throw error;
    throw backendUnavailable("The Supabase database could not be reached.", error);
  }
}

export async function readSupabaseKioskSnapshot(
  vendorSlug = "chapega",
): Promise<SupabaseKioskSnapshot> {
  try {
    const result = await getSupabasePostgres().begin(async (transaction) => {
      const access = await configureAccess(transaction, { vendorSlug });
      if (!access.vendorId) throw vendorNotFound();
      const database = await readSnapshot(transaction, access);
      const vendor = database.vendors[0];
      const settings = database.settings[0];
      if (!vendor || !settings || vendor.status !== "active") throw vendorNotFound();
      return {
        vendor,
        revision: database.revision,
        settings,
        products: database.products.filter(
          (product) => product.visible && !product.archived,
        ),
      };
    });
    return structuredClone(result);
  } catch (error) {
    if (error instanceof VendorServiceError) throw error;
    throw backendUnavailable("The Supabase database could not be reached.", error);
  }
}

export async function updateSupabaseVendorDatabase<T>(
  mutation: (draft: VendorDatabase) => T | Promise<T>,
  access?: VendorDatabaseAccess,
): Promise<T> {
  try {
    const transactionResult = await getSupabasePostgres().begin(async (transaction) => {
      const resolved = await configureAccess(transaction, access);
      if (resolved.platformSessionHash) {
        if (resolved.vendorId) {
          await transaction`
            select revision
            from private.app_state
            where vendor_id = ${resolved.vendorId}
            for update
          `;
        }
        const current = await readSnapshot(transaction, resolved);
        const draft = structuredClone(current);
        const value = await mutation(draft);
        await persistPlatformSnapshot(transaction, current, draft);
        return { value: structuredClone(value) };
      }
      if (!resolved.vendorId) {
        throw new VendorServiceError(
          400,
          "VENDOR_SCOPE_REQUIRED",
          "A vendor scope is required for this update.",
        );
      }
      await transaction`
        select revision
        from private.app_state
        where vendor_id = ${resolved.vendorId}
        for update
      `;
      const current = await readSnapshot(transaction, resolved);
      const draft = structuredClone(current);
      const value = await mutation(draft);
      assertTenantScoped(draft, resolved.vendorId);
      await persistSnapshot(transaction, current, draft, resolved.vendorId);
      return { value: structuredClone(value) };
    });
    return transactionResult.value;
  } catch (error) {
    if (error instanceof VendorServiceError) throw error;
    throw backendUnavailable("The Supabase update could not be completed.", error);
  }
}

function scopedSource(source: VendorDatabase, vendorId: string): VendorDatabase {
  const vendors = source.vendors.filter((record) => record.id === vendorId);
  const memberships = source.memberships.filter(
    (record) => record.vendorId === vendorId,
  );
  const memberIds = new Set(memberships.map((record) => record.userId));
  return {
    ...structuredClone(source),
    vendors,
    users: source.users.filter((record) => memberIds.has(record.id)),
    memberships,
    sessions: source.sessions.filter(
      (record) => record.activeVendorId === vendorId,
    ),
    products: source.products.filter((record) => record.vendorId === vendorId),
    orders: source.orders.filter((record) => record.vendorId === vendorId),
    settings: source.settings.filter((record) => record.vendorId === vendorId),
    audit: source.audit.filter((record) => record.vendorId === vendorId),
  };
}

export async function replaceSupabaseVendorDatabase(
  source: VendorDatabase,
  importMetadata?: Readonly<{ sourceName: string; sourceChecksum: string }>,
  access?: VendorDatabaseAccess,
): Promise<"imported" | "already_imported"> {
  const sql = getSupabasePostgres();
  let resolvedVendorId = access?.vendorId ?? DEFAULT_VENDOR_ID;
  try {
    return await sql.begin(async (transaction) => {
      const resolved = await configureAccess(transaction, access);
      if (!resolved.vendorId) {
        throw new VendorServiceError(
          400,
          "VENDOR_SCOPE_REQUIRED",
          "A vendor scope is required for an import.",
        );
      }
      resolvedVendorId = resolved.vendorId;
      await transaction`
        select revision from private.app_state
        where vendor_id = ${resolved.vendorId}
        for update
      `;

      if (importMetadata) {
        const [prior] = await transaction<Array<{ status: string }>>`
          select status
          from private.import_runs
          where vendor_id = ${resolved.vendorId}
            and source_checksum = ${importMetadata.sourceChecksum}
          for update
        `;
        if (prior?.status === "completed") return "already_imported" as const;
        await transaction`
          insert into private.import_runs (
            vendor_id, source_name, source_checksum, source_version, status,
            row_counts, error_message, started_at, completed_at
          ) values (
            ${resolved.vendorId}, ${importMetadata.sourceName},
            ${importMetadata.sourceChecksum}, ${source.version}, 'running',
            '{}'::jsonb, null, now(), null
          )
          on conflict (vendor_id, source_checksum) do update set
            source_name = excluded.source_name,
            source_version = excluded.source_version,
            status = 'running',
            row_counts = '{}'::jsonb,
            error_message = null,
            started_at = now(),
            completed_at = null
        `;
      }

      const current = await readSnapshot(transaction, resolved);
      const incoming = scopedSource(source, resolved.vendorId);
      if (incoming.vendors.length !== 1 || incoming.settings.length !== 1) {
        throw new VendorServiceError(
          400,
          "INVALID_IMPORT_SCOPE",
          "The import does not contain the selected vendor and settings.",
        );
      }

      // Explicit imports replace only this tenant's business records.
      // Global identities and every other vendor remain untouched.
      await transaction`delete from private.order_events where vendor_id = ${resolved.vendorId}`;
      await transaction`delete from private.order_items where vendor_id = ${resolved.vendorId}`;
      await transaction`delete from private.orders where vendor_id = ${resolved.vendorId}`;
      await transaction`delete from private.product_variants where vendor_id = ${resolved.vendorId}`;
      await transaction`delete from private.products where vendor_id = ${resolved.vendorId}`;
      await transaction`delete from private.audit_log where vendor_id = ${resolved.vendorId}`;

      const empty: VendorDatabase = {
        ...current,
        products: [],
        orders: [],
        audit: [],
      };
      const replacement: VendorDatabase = {
        ...incoming,
        users: current.users,
        memberships: current.memberships,
        sessions: current.sessions,
      };
      await persistSnapshot(transaction, empty, replacement, resolved.vendorId);

      if (importMetadata) {
        const rowCounts = {
          products: replacement.products.length,
          variants: replacement.products.reduce(
            (total, product) => total + product.variants.length,
            0,
          ),
          orders: replacement.orders.length,
          orderItems: replacement.orders.reduce(
            (total, order) => total + order.items.length,
            0,
          ),
          orderEvents: replacement.orders.reduce(
            (total, order) => total + order.events.length,
            0,
          ),
          audit: replacement.audit.length,
        };
        await transaction`
          update private.import_runs
          set status = 'completed',
              row_counts = ${transaction.json(rowCounts)},
              completed_at = now()
          where vendor_id = ${resolved.vendorId}
            and source_checksum = ${importMetadata.sourceChecksum}
        `;
      }
      return "imported" as const;
    });
  } catch (error) {
    if (importMetadata) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 4_000)
          : "Unknown import error";
      try {
        await sql.begin(async (transaction) => {
          const resolved = await configureAccess(transaction, {
            ...access,
            vendorId: resolvedVendorId,
          });
          if (!resolved.vendorId) return;
          await transaction`
            insert into private.import_runs (
              vendor_id, source_name, source_checksum, source_version, status,
              error_message, completed_at
            ) values (
              ${resolved.vendorId}, ${importMetadata.sourceName},
              ${importMetadata.sourceChecksum}, ${source.version}, 'failed',
              ${message}, now()
            )
            on conflict (vendor_id, source_checksum) do update set
              source_name = excluded.source_name,
              source_version = excluded.source_version,
              status = 'failed',
              error_message = excluded.error_message,
              completed_at = now()
            where private.import_runs.status <> 'completed'
          `;
        });
      } catch {
        // Preserve the original import error if failure tracking also fails.
      }
    }
    throw error;
  }
}
