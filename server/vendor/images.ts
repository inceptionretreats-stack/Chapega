import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "@/server/vendor/crypto";
import { VendorServiceError } from "@/server/vendor/errors";
import { usesSupabaseBackend } from "@/server/supabase/config";
import { getSupabaseAdmin } from "@/server/supabase/admin";
import { getSupabasePostgres } from "@/server/supabase/postgres";
import type { ProductImagePath } from "@/types/kiosk";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_EDGE = 5_000;
const MAX_IMAGE_PIXELS = 20_000_000;

type SanitizedImage = Readonly<{
  buffer: Buffer;
  extension: "png" | "jpg";
  width: number;
  height: number;
}>;

/** Keep the storage/database failure as the cause so apiError can log it. */
function storageUnavailable(message: string, cause: unknown): VendorServiceError {
  const error = new VendorServiceError(503, "IMAGE_STORAGE_UNAVAILABLE", message);
  error.cause = cause;
  return error;
}

function validateDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_EDGE ||
    height > MAX_IMAGE_EDGE ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new VendorServiceError(
      400,
      "INVALID_IMAGE_DIMENSIONS",
      "Use an image no larger than 5000 px per side and 20 megapixels.",
    );
  }
}

/**
 * PNG chunks that survive sanitising: the critical chunks plus the ancillary
 * chunks that affect how pixels look (transparency, gamma, chromaticities,
 * sRGB intent, ICC profile, pixel density). Everything else - text, EXIF,
 * timestamps, APNG animation, private/unknown ancillary chunks - is dropped,
 * as is anything after IEND. Unknown critical chunks make the file invalid.
 */
const PNG_KEPT_CHUNKS = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "pHYs",
]);

function invalidPng(message = "The PNG file is invalid."): VendorServiceError {
  return new VendorServiceError(400, "INVALID_IMAGE", message);
}

function sanitizePng(buffer: Buffer): SanitizedImage {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) {
    throw invalidPng();
  }
  const chunks: Buffer[] = [buffer.subarray(0, 8)];
  let offset = 8;
  let width = 0;
  let height = 0;
  let foundEnd = false;
  let foundData = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) throw invalidPng("The PNG file is incomplete.");
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw invalidPng();
    if (offset === 8 && type !== "IHDR") throw invalidPng();
    if (type === "IHDR") {
      if (length < 8) throw invalidPng();
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
    }
    if (type === "IDAT") foundData = true;
    if (PNG_KEPT_CHUNKS.has(type)) {
      chunks.push(buffer.subarray(offset, end));
    } else if ((type.charCodeAt(0) & 0x20) === 0) {
      // Upper-case first letter: a critical chunk we do not understand.
      throw invalidPng("The PNG file uses an unsupported feature.");
    }
    offset = end;
    if (type === "IEND") {
      foundEnd = true;
      break;
    }
  }
  if (!foundEnd || !foundData || !width || !height) throw invalidPng();
  validateDimensions(width, height);
  return { buffer: Buffer.concat(chunks), extension: "png", width, height };
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
  0xcf,
]);

function invalidJpeg(message = "The JPEG file is invalid."): VendorServiceError {
  return new VendorServiceError(400, "INVALID_IMAGE", message);
}

function startsWith(payload: Buffer, signature: string): boolean {
  return payload.subarray(0, signature.length).toString("latin1") === signature;
}

/**
 * APPn segments that are needed to display the image correctly: the JFIF/JFXX
 * header (APP0), an ICC colour profile (APP2 "ICC_PROFILE"; dropping it
 * shifts colours of wide-gamut phone photos) and the Adobe colour-transform
 * flag (APP14). Every other APPn (EXIF/GPS, XMP, MPF thumbnails, IPTC, maker
 * notes, …) and every COM comment is removed.
 */
function keepApplicationSegment(marker: number, payload: Buffer): boolean {
  if (marker === 0xe0) return startsWith(payload, "JFIF\0") || startsWith(payload, "JFXX\0");
  if (marker === 0xe2) return startsWith(payload, "ICC_PROFILE\0");
  if (marker === 0xee) return startsWith(payload, "Adobe");
  return false;
}

function sanitizeJpeg(buffer: Buffer): SanitizedImage {
  if (buffer.length < 16 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw invalidJpeg();
  }
  const chunks: Buffer[] = [buffer.subarray(0, 2)];
  let offset = 2;
  let width = 0;
  let height = 0;
  let scans = 0;
  let foundEnd = false;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) throw invalidJpeg("The JPEG file is malformed.");
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9) {
      // End of image: everything after it (appended files, motion-photo
      // payloads, trailers) is discarded.
      chunks.push(Buffer.from([0xff, 0xd9]));
      foundEnd = true;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(Buffer.from([0xff, marker]));
      continue;
    }
    if (offset + 2 > buffer.length) throw invalidJpeg("The JPEG file is incomplete.");
    const segmentLength = buffer.readUInt16BE(offset);
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > buffer.length) {
      throw invalidJpeg("The JPEG file is incomplete.");
    }
    if (SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) throw invalidJpeg("The JPEG dimensions are invalid.");
      height = buffer.readUInt16BE(offset + 3);
      width = buffer.readUInt16BE(offset + 5);
    }
    const payload = buffer.subarray(offset + 2, segmentEnd);
    const isApplication = marker >= 0xe0 && marker <= 0xef;
    const keep = isApplication
      ? keepApplicationSegment(marker, payload)
      : marker !== 0xfe;
    if (keep) chunks.push(Buffer.from([0xff, marker]), buffer.subarray(offset, segmentEnd));
    offset = segmentEnd;

    if (marker === 0xda) {
      // Entropy-coded scan data runs until the next real marker; 0xFF00 is a
      // stuffed byte and RST0-7 markers belong to the scan. Progressive JPEGs
      // continue with further tables and scans, which the loop handles.
      scans += 1;
      const scanStart = offset;
      while (offset < buffer.length) {
        if (buffer[offset] === 0xff) {
          const next = buffer[offset + 1];
          if (next === 0x00 || (next !== undefined && next >= 0xd0 && next <= 0xd7)) {
            offset += 2;
            continue;
          }
          break;
        }
        offset += 1;
      }
      chunks.push(buffer.subarray(scanStart, offset));
    }
  }

  if (!foundEnd || scans === 0 || !width || !height) throw invalidJpeg();
  validateDimensions(width, height);
  return { buffer: Buffer.concat(chunks), extension: "jpg", width, height };
}

/** Exported for tests; uploads go through saveVendorImage. */
export function sanitizeVendorImage(buffer: Buffer, mimeType: string): SanitizedImage {
  return sanitizeImage(buffer, mimeType);
}

function sanitizeImage(buffer: Buffer, mimeType: string): SanitizedImage {
  if (mimeType === "image/png") return sanitizePng(buffer);
  if (mimeType === "image/jpeg") return sanitizeJpeg(buffer);
  throw new VendorServiceError(
    400,
    "UNSUPPORTED_IMAGE_TYPE",
    "Upload a PNG or JPEG image.",
  );
}

export async function saveVendorImage(file: File): Promise<
  Readonly<{
    path: ProductImagePath;
    width: number;
    height: number;
  }>
>;
export async function saveVendorImage(file: File, vendorId?: string, createdBy?: string): Promise<
  Readonly<{
    path: ProductImagePath;
    width: number;
    height: number;
  }>
>;
export async function saveVendorImage(file: File, vendorId?: string, createdBy?: string): Promise<
  Readonly<{
    path: ProductImagePath;
    width: number;
    height: number;
  }>
> {
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new VendorServiceError(
      400,
      "INVALID_IMAGE_SIZE",
      "Choose a PNG or JPEG image smaller than 8 MB.",
    );
  }
  const raw = Buffer.from(await file.arrayBuffer());
  const image = sanitizeImage(raw, file.type);
  const hash = sha256(image.buffer);
  const filename = `${hash}.${image.extension}`;
  if (vendorId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(vendorId)) {
    throw new VendorServiceError(400, "INVALID_VENDOR", "The vendor workspace is invalid.");
  }
  const storageKey = vendorId ? `${vendorId}/${filename}` : filename;
  if (usesSupabaseBackend()) {
    const { error } = await getSupabaseAdmin().storage
      .from("vendor-products")
      .upload(storageKey, image.buffer, {
        cacheControl: "31536000",
        contentType: image.extension === "png" ? "image/png" : "image/jpeg",
        upsert: false,
      });
    if (error && !/duplicate|already exists/i.test(error.message)) {
      throw storageUnavailable(
        "The product image could not be stored. Please try again.",
        error,
      );
    }
    if (vendorId) {
      try {
        const sql = getSupabasePostgres();
        await sql.begin(async (transaction) => {
          await transaction`select set_config('app.vendor_id', ${vendorId}, true)`;
          await transaction`
            insert into private.vendor_assets (
              id,
              vendor_id,
              object_path,
              public_path,
              content_sha256,
              mime_type,
              byte_size,
              created_by
            ) values (
              ${randomUUID()}::uuid,
              ${vendorId}::uuid,
              ${storageKey},
              ${`/vendor-products/${storageKey}`},
              ${hash},
              ${image.extension === "png" ? "image/png" : "image/jpeg"},
              ${image.buffer.byteLength},
              ${createdBy ?? null}::uuid
            )
            on conflict (storage_bucket, object_path) do nothing
          `;
        });
      } catch (registrationError) {
        throw storageUnavailable(
          "The product image was stored but could not be registered. Please try again.",
          registrationError,
        );
      }
    }
    return {
      path: `/vendor-products/${storageKey}` as ProductImagePath,
      width: image.width,
      height: image.height,
    };
  }
  const directory = path.join(
    process.cwd(),
    "public",
    "vendor-products",
    ...(vendorId ? [vendorId] : []),
  );
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(
      path.join(/* turbopackIgnore: true */ directory, filename),
      image.buffer,
      {
      flag: "wx",
      mode: 0o600,
      },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return {
    path: `/vendor-products/${storageKey}` as ProductImagePath,
    width: image.width,
    height: image.height,
  };
}
