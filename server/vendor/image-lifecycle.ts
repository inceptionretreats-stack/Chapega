import "server-only";

import { stat, unlink } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdmin } from "@/server/supabase/admin";
import { usesSupabaseBackend } from "@/server/supabase/config";
import { getSupabasePostgres } from "@/server/supabase/postgres";
import {
  updateLocalVendorDatabase,
  type VendorDatabase,
} from "@/server/vendor/database";
import { VendorServiceError } from "@/server/vendor/errors";
import type { ProductImagePath } from "@/types/kiosk";

const VENDOR_PRODUCTS_DIRECTORY = "vendor-products";
const VENDOR_PRODUCTS_BUCKET = "vendor-products";
const LEGACY_DEFAULT_VENDOR_ID = "00000000-0000-4000-8000-000000000001";
const BUNDLED_IMAGE_PATH_PATTERN =
  /^\/(products|generated-products)\/([a-zA-Z0-9._-]+\.(?:png|jpe?g|webp))$/;

/**
 * Runtime uploads are SHA-256 content-addressed files created by saveVendorImage.
 * Keeping this expression narrow also makes it impossible for a delete request to
 * name a nested path, a bundled image, or a path outside the upload directory.
 */
export const VENDOR_UPLOAD_PATH_PATTERN =
  /^\/vendor-products\/(?:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/)?[a-f0-9]{64}\.(?:png|jpg)$/i;

export type VendorUploadPath =
  `/vendor-products/${string}.${"png" | "jpg"}`;

type ValidatedUpload = Readonly<{
  storageKey: string;
  pathVendorId: string | null;
}>;

function validatedUpload(imagePath: string): ValidatedUpload {
  const match = VENDOR_UPLOAD_PATH_PATTERN.exec(imagePath);
  if (!match) {
    throw new VendorServiceError(
      400,
      "INVALID_IMAGE_PATH",
      "Choose a valid uploaded catalogue image.",
    );
  }
  return {
    storageKey: imagePath.slice(`/${VENDOR_PRODUCTS_DIRECTORY}/`.length),
    pathVendorId: match[1]?.toLocaleLowerCase("en-IN") ?? null,
  };
}

function imageIsReferenced(
  database: Pick<VendorDatabase, "products" | "orders">,
  imagePath: string,
  vendorId: string,
): boolean {
  return (
    database.products.some((product) => (product.vendorId ?? LEGACY_DEFAULT_VENDOR_ID) === vendorId && product.image === imagePath) ||
    database.orders.some((order) => (order.vendorId ?? LEGACY_DEFAULT_VENDOR_ID) === vendorId &&
      order.items.some((item) => item.image === imagePath),
    )
  );
}

function assertImageIsUnused(referenced: boolean): void {
  if (referenced) {
    throw new VendorServiceError(
      409,
      "IMAGE_IN_USE",
      "This image is still used by a product or an order and cannot be deleted.",
    );
  }
}

function isMissingStorageObject(error: {
  message: string;
  status?: number;
  statusCode?: string;
}): boolean {
  return (
    error.status === 404 ||
    error.statusCode === "404" ||
    /(?:not found|no such (?:key|object)|does not exist)/i.test(error.message)
  );
}

/** Keep the storage failure as the cause so apiError can log it. */
function storageUnavailable(message: string, cause: unknown): VendorServiceError {
  const error = new VendorServiceError(503, "IMAGE_STORAGE_UNAVAILABLE", message);
  error.cause = cause;
  return error;
}

async function removeSupabaseObject(storageKey: string): Promise<void> {
  const { error } = await getSupabaseAdmin().storage
    .from(VENDOR_PRODUCTS_BUCKET)
    .remove([storageKey]);
  if (error && !isMissingStorageObject(error)) {
    throw storageUnavailable(
      "The product image could not be deleted. Please try again.",
      error,
    );
  }
}

async function deleteUnusedSupabaseImage(
  imagePath: VendorUploadPath,
  storageKey: string,
  vendorId: string,
): Promise<void> {
  try {
    const sql = getSupabasePostgres();
    await sql.begin(async (transaction) => {
      await transaction`select set_config('app.vendor_id', ${vendorId}, true)`;
      await transaction`
        select revision from private.app_state
        where vendor_id = ${vendorId} and id = 1
        for update
      `;
      const rows = await transaction<Array<{ referenced: boolean }>>`
        select (
          exists (
            select 1 from private.products
            where vendor_id = ${vendorId} and image = ${imagePath}
          ) or exists (
            select 1 from private.order_items
            where vendor_id = ${vendorId} and image = ${imagePath}
          )
        ) as referenced
      `;
      assertImageIsUnused(Boolean(rows[0]?.referenced));
      await removeSupabaseObject(storageKey);
      await transaction`
        delete from private.vendor_assets
        where vendor_id = ${vendorId}::uuid
          and public_path = ${imagePath}
      `;
    });
  } catch (error) {
    if (error instanceof VendorServiceError) throw error;
    throw storageUnavailable(
      "The product image could not be deleted. Please try again.",
      error,
    );
  }
}

function localUploadPath(storageKey: string): string {
  const directory = path.resolve(
    process.cwd(),
    "public",
    VENDOR_PRODUCTS_DIRECTORY,
  );
  const target = path.resolve(directory, storageKey);
  if (target !== directory && !target.startsWith(`${directory}${path.sep}`)) {
    // Defense in depth: validated filenames cannot reach this branch.
    throw new VendorServiceError(
      400,
      "INVALID_IMAGE_PATH",
      "Choose a valid uploaded catalogue image.",
    );
  }
  return target;
}

function safelyResolvedPublicFile(
  directoryName: "products" | "generated-products" | "vendor-products",
  filename: string,
): string {
  const directory = path.resolve(process.cwd(), "public", directoryName);
  const target = path.resolve(directory, filename);
  if (path.dirname(target) !== directory) {
    throw new VendorServiceError(
      400,
      "INVALID_IMAGE_PATH",
      "Choose a valid product image.",
    );
  }
  return target;
}

async function localFileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw storageUnavailable(
      "The product image could not be checked. Please try again.",
      error,
    );
  }
}

async function supabaseObjectExists(filename: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseAdmin().storage
      .from(VENDOR_PRODUCTS_BUCKET)
      .exists(filename);
    if (data) return true;
    if (
      error &&
      error.status !== 400 &&
      !isMissingStorageObject(error)
    ) {
      throw storageUnavailable(
        "The product image could not be checked. Please try again.",
        error,
      );
    }
    return false;
  } catch (error) {
    if (error instanceof VendorServiceError) throw error;
    throw storageUnavailable(
      "The product image could not be checked. Please try again.",
      error,
    );
  }
}

/**
 * Verify a product image reference while its caller holds the product mutation
 * lock. Bundled images must resolve to a real file under public/, while runtime
 * uploads must exist in the selected local or Supabase Storage backend.
 */
export async function assertProductImageExists(
  imagePath: ProductImagePath,
  requestedVendorId?: string,
): Promise<void> {
  const bundledMatch = BUNDLED_IMAGE_PATH_PATTERN.exec(imagePath);
  let exists = false;

  if (bundledMatch) {
    const directory = bundledMatch[1] as "products" | "generated-products";
    const filename = bundledMatch[2];
    exists = await localFileExists(safelyResolvedPublicFile(directory, filename));
  } else if (VENDOR_UPLOAD_PATH_PATTERN.test(imagePath)) {
    const { storageKey, pathVendorId } = validatedUpload(imagePath);
    if (
      requestedVendorId &&
      pathVendorId &&
      pathVendorId !== requestedVendorId.toLocaleLowerCase("en-IN")
    ) {
      throw new VendorServiceError(403, "FORBIDDEN", "This image belongs to another vendor.");
    }
    if (
      requestedVendorId &&
      !pathVendorId &&
      requestedVendorId !== LEGACY_DEFAULT_VENDOR_ID
    ) {
      throw new VendorServiceError(
        403,
        "FORBIDDEN",
        "Legacy catalogue uploads belong to the Chapega workspace.",
      );
    }
    exists = usesSupabaseBackend()
      ? await supabaseObjectExists(storageKey)
      : await localFileExists(localUploadPath(storageKey));
  } else {
    throw new VendorServiceError(
      400,
      "INVALID_IMAGE_PATH",
      "Choose a valid product image.",
    );
  }

  if (!exists) {
    throw new VendorServiceError(
      409,
      "IMAGE_NOT_FOUND",
      "The selected product image no longer exists. Upload or choose it again.",
    );
  }
}

async function removeLocalObject(filename: string): Promise<void> {
  try {
    await unlink(localUploadPath(filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw storageUnavailable(
      "The product image could not be deleted. Please try again.",
      error,
    );
  }
}

async function deleteUnusedLocalImage(
  imagePath: VendorUploadPath,
  storageKey: string,
  vendorId: string,
): Promise<void> {
  await updateLocalVendorDatabase(async (database) => {
    assertImageIsUnused(imageIsReferenced(database, imagePath, vendorId));
    await removeLocalObject(storageKey);
  });
}

/**
 * Permanently delete an unreferenced content-addressed vendor upload.
 *
 * Missing objects are treated as success so callers can safely retry a request.
 * References from archived products and historical order-item snapshots are
 * intentionally retained and block deletion.
 */
export async function deleteUnusedVendorImage(
  requestedPath: string,
  requestedVendorId?: string,
): Promise<Readonly<{ path: ProductImagePath }>> {
  const { storageKey, pathVendorId } = validatedUpload(requestedPath);
  const imagePath = requestedPath as VendorUploadPath;
  const vendorId = requestedVendorId ?? pathVendorId ?? LEGACY_DEFAULT_VENDOR_ID;
  if (pathVendorId && pathVendorId !== vendorId.toLocaleLowerCase("en-IN")) {
    throw new VendorServiceError(403, "FORBIDDEN", "This image belongs to another vendor.");
  }
  if (requestedVendorId && !pathVendorId) {
    throw new VendorServiceError(
      409,
      "LEGACY_IMAGE_READ_ONLY",
      "Legacy catalogue images are retained as read-only assets.",
    );
  }

  if (usesSupabaseBackend()) {
    await deleteUnusedSupabaseImage(imagePath, storageKey, vendorId);
  } else {
    await deleteUnusedLocalImage(imagePath, storageKey, vendorId);
  }

  return { path: imagePath as ProductImagePath };
}
