import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import type { VendorDatabase } from "../server/vendor/database";

const CONFIRMATION_FLAG = "--confirm-import";
const DRY_RUN_FLAG = "--dry-run";
const VENDOR_FLAG_PREFIX = "--vendor=";
const PRODUCT_BUCKET = "vendor-products";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const LEGACY_VENDOR_ID = "00000000-0000-4000-8000-000000000001";

type DatabaseEnvelope = Readonly<{
  checksum: string;
  data: VendorDatabase;
}>;

type VerifiedSnapshot = Readonly<{
  checksum: string;
  data: VendorDatabase;
  sourcePath: string;
}>;

type RuntimeImage = Readonly<{
  bytes: Buffer;
  objectPath: string;
  mimeType: "image/jpeg" | "image/png";
  reference: string;
}>;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isVendorDatabase(value: unknown): value is VendorDatabase {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VendorDatabase>;
  return (
    candidate.version === 2 &&
    Number.isSafeInteger(candidate.revision) &&
    Array.isArray(candidate.users) &&
    Array.isArray(candidate.vendors) &&
    Array.isArray(candidate.memberships) &&
    Array.isArray(candidate.sessions) &&
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.orders) &&
    Array.isArray(candidate.settings) &&
    Array.isArray(candidate.audit)
  );
}

async function verifySnapshot(filePath: string): Promise<VerifiedSnapshot | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DatabaseEnvelope>;
    if (!isVendorDatabase(parsed.data) || typeof parsed.checksum !== "string") {
      return null;
    }
    const checksum = sha256(JSON.stringify(parsed.data));
    if (checksum !== parsed.checksum) return null;
    return { checksum, data: parsed.data, sourcePath: filePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function loadVerifiedSnapshot(): Promise<VerifiedSnapshot> {
  const configuredDirectory = process.env.CHAPEGA_DATA_DIR?.trim();
  const dataDirectory = configuredDirectory
    ? path.resolve(configuredDirectory)
    : path.join(process.cwd(), ".data");
  const primaryPath = path.join(dataDirectory, "vendor-db.json");
  const backupPath = path.join(dataDirectory, "vendor-db.backup.json");

  const primary = await verifySnapshot(primaryPath);
  if (primary) return primary;
  const backup = await verifySnapshot(backupPath);
  if (backup) {
    console.warn(`Primary snapshot is unavailable or invalid; using ${backupPath}.`);
    return backup;
  }
  throw new Error(
    `No checksum-valid vendor snapshot was found at ${primaryPath} or ${backupPath}.`,
  );
}

function referencedRuntimeImages(
  database: VendorDatabase,
  vendorId: string,
): string[] {
  const references = new Set<string>();
  for (const product of database.products) {
    if (product.vendorId === vendorId) references.add(product.image);
  }
  for (const order of database.orders.filter(
    (record) => record.vendorId === vendorId,
  )) {
    for (const item of order.items) references.add(item.image);
  }
  return [...references].filter((image) => image.startsWith("/vendor-products/"));
}

function mimeTypeFor(filename: string): "image/jpeg" | "image/png" {
  return filename.endsWith(".png") ? "image/png" : "image/jpeg";
}

async function readRuntimeImages(
  database: VendorDatabase,
  vendorId: string,
): Promise<RuntimeImage[]> {
  const images: RuntimeImage[] = [];
  for (const imageReference of referencedRuntimeImages(database, vendorId)) {
    const match = imageReference.match(
      /^\/vendor-products\/(?:([0-9a-f-]{36})\/)?([0-9a-f]{64}\.(?:png|jpe?g))$/,
    );
    const referencedVendor = match?.[1];
    const filename = match?.[2];
    if (
      !filename ||
      (referencedVendor && referencedVendor !== vendorId) ||
      (!referencedVendor && vendorId !== LEGACY_VENDOR_ID)
    ) {
      throw new Error(`Unsafe or non-content-addressed product image: ${imageReference}`);
    }
    const objectPath = referencedVendor ? `${vendorId}/${filename}` : filename;
    const bytes = await readFile(
      path.join(
        process.cwd(),
        "public",
        "vendor-products",
        ...(referencedVendor ? [vendorId] : []),
        filename,
      ),
    );
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`${imageReference} exceeds the 8 MB storage limit.`);
    }
    const expectedHash = filename.slice(0, 64);
    if (sha256(bytes) !== expectedHash) {
      throw new Error(`${imageReference} does not match its content-addressed filename.`);
    }
    images.push({
      bytes,
      objectPath,
      mimeType: mimeTypeFor(filename),
      reference: imageReference,
    });
  }
  return images;
}

async function uploadRuntimeImages(
  images: readonly RuntimeImage[],
  projectUrl: string,
  secretKey: string,
): Promise<number> {
  const client = createClient(projectUrl, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data: buckets, error: listError } = await client.storage.listBuckets();
  if (listError) throw new Error(`Could not inspect Supabase Storage: ${listError.message}`);

  const bucketOptions = {
    public: true,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: ["image/png", "image/jpeg"],
  };
  const existingBucket = buckets.find((bucket) => bucket.id === PRODUCT_BUCKET);
  const bucketResult = existingBucket
    ? await client.storage.updateBucket(PRODUCT_BUCKET, bucketOptions)
    : await client.storage.createBucket(PRODUCT_BUCKET, bucketOptions);
  if (bucketResult.error) {
    throw new Error(`Could not configure Supabase Storage: ${bucketResult.error.message}`);
  }

  for (const image of images) {
    const { error } = await client.storage
      .from(PRODUCT_BUCKET)
      .upload(image.objectPath, image.bytes, {
        cacheControl: "31536000",
        contentType: image.mimeType,
        upsert: true,
      });
    if (error) {
      throw new Error(`Could not upload ${image.reference}: ${error.message}`);
    }
  }
  return images.length;
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const dryRun = process.argv.includes(DRY_RUN_FLAG);
  const vendorSlug = process.argv
    .find((argument) => argument.startsWith(VENDOR_FLAG_PREFIX))
    ?.slice(VENDOR_FLAG_PREFIX.length)
    .trim()
    .toLowerCase();
  if (!vendorSlug || !/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(vendorSlug)) {
    throw new Error(
      "A valid --vendor=<slug> is required so an import cannot replace another tenant.",
    );
  }
  if (!dryRun && !process.argv.includes(CONFIRMATION_FLAG)) {
    throw new Error(
      `Refusing to replace Supabase data without ${CONFIRMATION_FLAG}. Run the dry check first.`,
    );
  }

  const snapshot = await loadVerifiedSnapshot();
  const vendor = snapshot.data.vendors.find(
    (candidate) => candidate.slug === vendorSlug,
  );
  if (!vendor) {
    throw new Error(`The verified snapshot does not contain vendor ${vendorSlug}.`);
  }
  const runtimeImages = await readRuntimeImages(snapshot.data, vendor.id);
  const counts = {
    memberships: snapshot.data.memberships.filter(
      (record) => record.vendorId === vendor.id,
    ).length,
    products: snapshot.data.products.filter(
      (record) => record.vendorId === vendor.id,
    ).length,
    orders: snapshot.data.orders.filter(
      (record) => record.vendorId === vendor.id,
    ).length,
    audit: snapshot.data.audit.filter(
      (record) => record.vendorId === vendor.id,
    ).length,
    runtimeImages: runtimeImages.length,
  };
  console.log(
    `Verified ${snapshot.sourcePath} (${snapshot.checksum}) for ${vendorSlug} with ${JSON.stringify(counts)}.`,
  );
  if (dryRun) return;

  const { getSupabaseConfiguration } = await import("../server/supabase/config");
  const { replaceSupabaseVendorDatabase } = await import(
    "../server/vendor/supabase-database"
  );
  const configuration = getSupabaseConfiguration();
  const imageCount = await uploadRuntimeImages(
    runtimeImages,
    configuration.projectUrl,
    configuration.secretKey,
  );
  const outcome = await replaceSupabaseVendorDatabase(snapshot.data, {
    sourceName: path.basename(snapshot.sourcePath),
    sourceChecksum: snapshot.checksum,
  }, { vendorSlug });
  console.log(
    outcome === "already_imported"
      ? `Snapshot was already imported; verified ${imageCount} runtime images.`
      : `Imported the verified snapshot and uploaded ${imageCount} runtime images.`,
  );
  const skippedUsers = snapshot.data.users.length;
  if (skippedUsers > 0) {
    // Identities are global and may carry development passwords, so imports
    // only replace business records. Say so instead of implying a full copy.
    console.log(
      `Accounts are never imported: skipped ${skippedUsers} user(s) and ${snapshot.data.memberships.length} membership(s). ` +
        "Create the first owner with `npm run supabase:bootstrap-owner -- --vendor=<slug>`.",
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
