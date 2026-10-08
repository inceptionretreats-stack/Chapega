import "server-only";

import { randomUUID } from "node:crypto";
import { copyFile, mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { CATALOGUE_PRODUCTS } from "@/data/catalogue";
import { normalizeWhatsAppNumber } from "@/domain/whatsapp";
import { usesSupabaseBackend } from "@/server/supabase/config";
import { getVendorCredentialConfiguration } from "@/server/vendor/config";
import { derivePasswordHash, sha256 } from "@/server/vendor/crypto";
import type {
  PlatformRole,
  VendorOrder,
  VendorProduct,
  VendorRole,
  VendorSettings,
  VendorStatus,
} from "@/types/vendor";

export const DEFAULT_VENDOR_ID = "00000000-0000-4000-8000-000000000001";
export const DEFAULT_VENDOR_SLUG = "chapega";

export type VendorRecord = Readonly<{
  id: string;
  slug: string;
  displayName: string;
  status: VendorStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;

export type VendorUserRecord = Readonly<{
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole | null;
  passwordSalt: string;
  passwordHash: string;
  active: boolean;
  createdAt: string;
}>;

export type VendorMembershipRecord = Readonly<{
  vendorId: string;
  userId: string;
  role: VendorRole;
  active: boolean;
  isDefault: boolean;
  createdAt: string;
}>;

export type VendorSessionRecord = Readonly<{
  idHash: string;
  userId: string;
  scope: "vendor" | "platform";
  activeVendorId: string | null;
  createdAt: string;
  expiresAt: string;
}>;

export type VendorProductRecord = VendorProduct &
  Readonly<{ vendorId: string }>;

export type VendorOrderRecord = VendorOrder &
  Readonly<{ vendorId: string; submissionFingerprint: string }>;

export type VendorSettingsRecord = VendorSettings &
  Readonly<{ vendorId: string }>;

export type VendorAuditEntityType =
  | "auth"
  | "product"
  | "order"
  | "settings"
  | "vendor"
  | "membership"
  | "platform";

export type VendorAuditRecord = Readonly<{
  id: string;
  vendorId: string | null;
  actorId: string;
  action: string;
  entityType: VendorAuditEntityType;
  entityId: string;
  createdAt: string;
}>;

/** Normalized local representation shared by the local and Supabase adapters. */
export type VendorDatabase = {
  version: 2;
  /** Monotonic platform-level revision. Each vendor also has its own revision. */
  revision: number;
  vendors: VendorRecord[];
  users: VendorUserRecord[];
  memberships: VendorMembershipRecord[];
  sessions: VendorSessionRecord[];
  products: VendorProductRecord[];
  orders: VendorOrderRecord[];
  settings: VendorSettingsRecord[];
  audit: VendorAuditRecord[];
};

/** Trusted adapter context; never populate these values from request JSON. */
export type VendorDatabaseAccess = Readonly<{
  vendorId?: string;
  vendorSlug?: string;
  platformSessionHash?: string;
}>;

type LegacyVendorUserRecord = Omit<VendorUserRecord, "platformRole"> &
  Readonly<{ role: VendorRole }>;
type LegacyVendorSessionRecord = Omit<
  VendorSessionRecord,
  "scope" | "activeVendorId"
>;
type LegacyVendorOrderRecord = Omit<VendorOrderRecord, "vendorId">;
type LegacyVendorDatabase = {
  version: 1;
  revision: number;
  users: LegacyVendorUserRecord[];
  sessions: LegacyVendorSessionRecord[];
  products: VendorProduct[];
  orders: LegacyVendorOrderRecord[];
  settings: VendorSettings;
  audit: Array<Omit<VendorAuditRecord, "vendorId">>;
};

type DatabaseEnvelope = Readonly<{
  checksum: string;
  data: VendorDatabase;
}>;

type SnapshotResult =
  | Readonly<{ kind: "valid"; data: VendorDatabase; migrated: boolean }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "corrupt" }>;

type DatabaseRuntime = {
  queue: Promise<void>;
  state?: VendorDatabase;
};

const runtimeKey = "__chapegaVendorDatabaseRuntime";
const globalRuntime = globalThis as typeof globalThis & {
  [runtimeKey]?: DatabaseRuntime;
};
const runtime =
  globalRuntime[runtimeKey] ??
  (globalRuntime[runtimeKey] = { queue: Promise.resolve() });

function clone<T>(value: T): T {
  return structuredClone(value);
}

function dataDirectory(): string {
  const configured = process.env.CHAPEGA_DATA_DIR;
  return configured
    ? path.resolve(/*turbopackIgnore: true*/ configured)
    : path.join(process.cwd(), ".data");
}

function primaryPath(): string {
  return path.join(dataDirectory(), "vendor-db.json");
}

function backupPath(): string {
  return path.join(dataDirectory(), "vendor-db.backup.json");
}

function isLegacyDatabase(value: unknown): value is LegacyVendorDatabase {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LegacyVendorDatabase>;
  return (
    candidate.version === 1 &&
    Number.isSafeInteger(candidate.revision) &&
    Array.isArray(candidate.users) &&
    Array.isArray(candidate.sessions) &&
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.orders) &&
    Array.isArray(candidate.audit) &&
    Boolean(candidate.settings)
  );
}

function isDatabase(value: unknown): value is VendorDatabase {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VendorDatabase>;
  return (
    candidate.version === 2 &&
    Number.isSafeInteger(candidate.revision) &&
    Array.isArray(candidate.vendors) &&
    Array.isArray(candidate.users) &&
    Array.isArray(candidate.memberships) &&
    Array.isArray(candidate.sessions) &&
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.orders) &&
    Array.isArray(candidate.settings) &&
    Array.isArray(candidate.audit)
  );
}

function migrateLegacyDatabase(source: LegacyVendorDatabase): VendorDatabase {
  const now = new Date().toISOString();
  const owner = source.users.find(
    (user) => user.active && user.role === "owner",
  );
  const platformAdmin = owner ?? source.users.find((user) => user.active);
  return {
    version: 2,
    revision: Math.max(1, source.revision),
    vendors: [
      {
        id: DEFAULT_VENDOR_ID,
        slug: DEFAULT_VENDOR_SLUG,
        displayName: source.settings.shopName || "Chapega.com",
        status: "active",
        revision: Math.max(1, source.revision),
        createdAt: source.settings.updatedAt || now,
        updatedAt: source.settings.updatedAt || now,
      },
    ],
    users: source.users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.id === platformAdmin?.id ? "super_admin" : null,
      passwordSalt: user.passwordSalt,
      passwordHash: user.passwordHash,
      active: user.active,
      createdAt: user.createdAt,
    })),
    memberships: source.users.map((user) => ({
      vendorId: DEFAULT_VENDOR_ID,
      userId: user.id,
      role: user.role,
      active: user.active,
      isDefault: true,
      createdAt: user.createdAt,
    })),
    sessions: source.sessions.map((session) => ({
      ...session,
      scope: "vendor",
      activeVendorId: DEFAULT_VENDOR_ID,
    })),
    products: source.products.map((product) => ({
      ...product,
      vendorId: DEFAULT_VENDOR_ID,
    })),
    orders: source.orders.map((order) => ({
      ...order,
      vendorId: DEFAULT_VENDOR_ID,
    })),
    settings: [{ ...source.settings, vendorId: DEFAULT_VENDOR_ID }],
    audit: source.audit.map((record) => ({
      ...record,
      vendorId: DEFAULT_VENDOR_ID,
    })),
  };
}

function verifyEnvelope(
  raw: string,
): Readonly<{ data: VendorDatabase; migrated: boolean }> | null {
  try {
    const parsed = JSON.parse(raw) as { checksum?: unknown; data?: unknown };
    if (typeof parsed.checksum !== "string") return null;
    const payload = JSON.stringify(parsed.data);
    if (parsed.checksum !== sha256(payload)) return null;
    if (isDatabase(parsed.data)) {
      return { data: parsed.data, migrated: false };
    }
    if (isLegacyDatabase(parsed.data)) {
      return { data: migrateLegacyDatabase(parsed.data), migrated: true };
    }
    return null;
  } catch {
    return null;
  }
}

async function readSnapshot(filePath: string): Promise<SnapshotResult> {
  try {
    const result = verifyEnvelope(await readFile(filePath, "utf8"));
    return result ? { kind: "valid", ...result } : { kind: "corrupt" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "missing" };
    }
    throw error;
  }
}

function normalizedSeedNumber(): string {
  const configured =
    process.env.CHAPEGA_OWNER_WHATSAPP_NUMBER ?? "919876543210";
  try {
    return normalizeWhatsAppNumber(configured, "91");
  } catch {
    return "919876543210";
  }
}

async function seedDatabase(): Promise<VendorDatabase> {
  const now = new Date().toISOString();
  const credentialConfiguration = getVendorCredentialConfiguration();
  const seedCredentials = credentialConfiguration.credentials ?? {
    email: "vendor-login-disabled@chapega.invalid",
    password: randomUUID(),
    name: "Shop owner",
  };
  const credentials = await derivePasswordHash(seedCredentials.password);
  const userId = randomUUID();
  const products: VendorProductRecord[] = CATALOGUE_PRODUCTS.map((product) => ({
    ...product,
    vendorId: DEFAULT_VENDOR_ID,
    visible: true,
    archived: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    version: 2,
    revision: 1,
    vendors: [
      {
        id: DEFAULT_VENDOR_ID,
        slug: DEFAULT_VENDOR_SLUG,
        displayName: "Chapega.com",
        status: "active",
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
    users: [
      {
        id: userId,
        email: seedCredentials.email,
        name: seedCredentials.name,
        platformRole: "super_admin",
        passwordSalt: credentials.salt,
        passwordHash: credentials.hash,
        active: credentialConfiguration.available,
        createdAt: now,
      },
    ],
    memberships: [
      {
        vendorId: DEFAULT_VENDOR_ID,
        userId,
        role: "owner",
        active: credentialConfiguration.available,
        isDefault: true,
        createdAt: now,
      },
    ],
    sessions: [],
    products,
    orders: [],
    settings: [
      {
        vendorId: DEFAULT_VENDOR_ID,
        shopName: "Chapega.com",
        ownerWhatsAppNumber: normalizedSeedNumber(),
        defaultCountryCode: "91",
        kioskName: "Main Entrance",
        maxCartQuantity: 5,
        giftWrapFeePaise: 2_500,
        qrResetSeconds: 120,
        showPreviewLabel: false,
        storeOpen: true,
        lowStockThreshold: 3,
        version: 1,
        updatedAt: now,
      },
    ],
    audit: [],
  };
}

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch {
    // Directory fsync is unsupported on some filesystems. The file itself is
    // flushed before its same-directory atomic rename.
  } finally {
    await handle?.close();
  }
}

async function commitDatabase(
  state: VendorDatabase,
  rotateBackup = true,
): Promise<void> {
  const directory = dataDirectory();
  await mkdir(directory, { recursive: true });
  const payload = JSON.stringify(state);
  const envelope: DatabaseEnvelope = {
    checksum: sha256(payload),
    data: state,
  };
  const temporaryPath = path.join(
    directory,
    `vendor-db.${process.pid}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(envelope, null, 2), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  if (rotateBackup) {
    const currentPrimary = await readSnapshot(primaryPath());
    if (currentPrimary.kind === "valid") {
      await copyFile(primaryPath(), backupPath());
    }
  }
  await rename(temporaryPath, primaryPath());
  await syncDirectory(directory);
}

async function loadDatabase(): Promise<VendorDatabase> {
  if (runtime.state) {
    if (isDatabase(runtime.state)) return runtime.state;
    if (isLegacyDatabase(runtime.state as unknown)) {
      const migrated = migrateLegacyDatabase(
        runtime.state as unknown as LegacyVendorDatabase,
      );
      await commitDatabase(migrated);
      runtime.state = migrated;
      return migrated;
    }
  }
  await mkdir(dataDirectory(), { recursive: true });

  const primary = await readSnapshot(primaryPath());
  if (primary.kind === "valid") {
    if (primary.migrated) await commitDatabase(primary.data);
    runtime.state = primary.data;
    return primary.data;
  }

  const backup = await readSnapshot(backupPath());
  if (backup.kind === "valid") {
    if (primary.kind === "corrupt") {
      const quarantinePath = path.join(
        dataDirectory(),
        `vendor-db.corrupt.${Date.now()}.json`,
      );
      await rename(primaryPath(), quarantinePath);
    }
    await commitDatabase(backup.data, false);
    runtime.state = backup.data;
    return backup.data;
  }

  if (primary.kind === "corrupt" || backup.kind === "corrupt") {
    throw new Error(
      `Vendor data is corrupt and no valid recovery snapshot is available in ${dataDirectory()}.`,
    );
  }

  const state = await seedDatabase();
  await commitDatabase(state);
  runtime.state = state;
  return state;
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = runtime.queue.then(operation, operation);
  runtime.queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function pruneExpiredSessions(state: VendorDatabase): void {
  const now = Date.now();
  state.sessions = state.sessions.filter(
    (session) => Date.parse(session.expiresAt) > now,
  );
}

export function findVendorBySlug(
  database: Pick<VendorDatabase, "vendors">,
  slug: string,
): VendorRecord | undefined {
  const normalized = slug.trim().toLowerCase();
  return database.vendors.find((vendor) => vendor.slug === normalized);
}

export function findVendorSettings(
  database: Pick<VendorDatabase, "settings">,
  vendorId: string,
): VendorSettingsRecord | undefined {
  return database.settings.find((settings) => settings.vendorId === vendorId);
}

export async function readLocalVendorDatabase(): Promise<VendorDatabase> {
  return serialized(async () => {
    const state = clone(await loadDatabase());
    pruneExpiredSessions(state);
    return state;
  });
}

const MAX_LOCAL_AUDIT_RECORDS = 5_000;

/**
 * Bounds the local audit log without letting anonymous kiosk orders push out
 * account and platform events: kiosk entries are trimmed first, oldest first.
 */
export function boundedAudit(
  records: readonly VendorAuditRecord[],
  limit: number,
): VendorAuditRecord[] {
  let excess = records.length - limit;
  if (excess <= 0) return [...records];
  const dropped = new Set<VendorAuditRecord>();
  for (const record of records) {
    if (excess === 0) break;
    if (record.actorId === "kiosk") {
      dropped.add(record);
      excess -= 1;
    }
  }
  const kept = records.filter((record) => !dropped.has(record));
  return kept.slice(Math.max(0, kept.length - limit));
}

export async function updateLocalVendorDatabase<T>(
  mutation: (draft: VendorDatabase) => T | Promise<T>,
): Promise<T> {
  return serialized(async () => {
    const current = await loadDatabase();
    const draft = clone(current);
    pruneExpiredSessions(draft);
    const result = await mutation(draft);
    draft.audit = boundedAudit(draft.audit, MAX_LOCAL_AUDIT_RECORDS);
    await commitDatabase(draft);
    runtime.state = draft;
    return clone(result);
  });
}

export async function readVendorDatabase(
  access?: VendorDatabaseAccess,
): Promise<VendorDatabase> {
  if (usesSupabaseBackend()) {
    const { readSupabaseVendorDatabase } =
      await import("@/server/vendor/supabase-database");
    return readSupabaseVendorDatabase(access);
  }
  return readLocalVendorDatabase();
}

export async function updateVendorDatabase<T>(
  mutation: (draft: VendorDatabase) => T | Promise<T>,
  access?: VendorDatabaseAccess,
): Promise<T> {
  if (usesSupabaseBackend()) {
    const { updateSupabaseVendorDatabase } =
      await import("@/server/vendor/supabase-database");
    return updateSupabaseVendorDatabase(mutation, access);
  }
  return updateLocalVendorDatabase(mutation);
}

export function newAuditRecord(
  actorId: string,
  action: string,
  entityType: VendorAuditRecord["entityType"],
  entityId: string,
  vendorId: string | null = null,
): VendorAuditRecord {
  return {
    id: randomUUID(),
    vendorId,
    actorId,
    action,
    entityType,
    entityId,
    createdAt: new Date().toISOString(),
  };
}
