import "server-only";

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import {
  parseJsonBytes,
  readBodyWithLimit,
  readMultipartWithLimit,
  RequestBodyTooLargeError,
} from "@/server/http/body";
import {
  clientAddressLabel,
  sameOriginRejection,
} from "@/server/http/request-identity";
import { logger, serializeError } from "@/server/observability/logger";
import { getRequestVendorContext } from "@/server/vendor/auth";
import { sha256 } from "@/server/vendor/crypto";
import { VendorServiceError } from "@/server/vendor/errors";
import { RateLimitExceededError } from "@/server/vendor/rate-limit";
import type { KioskBootstrap } from "@/types/kiosk";
import type { VendorAccessContext } from "@/types/vendor";

const MAX_JSON_BYTES = 128 * 1024;

export function jsonResponse(data: unknown, status = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

/**
 * Identifies the code that shaped a cached catalogue, so a deploy that changes
 * the bootstrap format never revalidates an old copy. Stable per deployment on
 * Vercel; per process elsewhere (costs one full response after a restart).
 */
const CATALOGUE_BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  randomUUID();

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((candidate) => {
    const value = candidate.trim();
    return value === "*" || value.replace(/^W\//, "") === etag;
  });
}

/**
 * Public catalogue response. The ETag is derived from the vendor id and its
 * revision (bumped by every product, order, settings or status change), so a
 * kiosk that revalidates gets a body-less 304 until something changes.
 * `private, no-cache` lets a browser keep a copy but forces revalidation on
 * every use; shared caches never store it.
 */
export function catalogueResponse(
  request: NextRequest,
  bootstrap: KioskBootstrap,
): NextResponse {
  const etag = `"${sha256(
    `${CATALOGUE_BUILD_ID}:${bootstrap.vendor.id}:${bootstrap.revision}`,
  ).slice(0, 32)}"`;
  if (etagMatches(request.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const response = jsonResponse(bootstrap);
  response.headers.set("Cache-Control", "private, no-cache");
  response.headers.set("ETag", etag);
  return response;
}

/** CSRF check shared with the admin API (see server/http/request-identity). */
export function assertSameOrigin(request: NextRequest): void {
  const rejection = sameOriginRejection(request);
  if (rejection) {
    throw new VendorServiceError(403, rejection.code, "Request rejected.");
  }
}

export async function parseJson<T>(
  request: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  let bytes: Buffer;
  try {
    bytes = await readBodyWithLimit(request, MAX_JSON_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new VendorServiceError(
        413,
        "PAYLOAD_TOO_LARGE",
        "Request is too large.",
      );
    }
    throw error;
  }
  const parsed = parseJsonBytes(bytes);
  if (!parsed.ok) {
    throw new VendorServiceError(
      400,
      "INVALID_JSON",
      "Enter valid request data.",
    );
  }
  return schema.parse(parsed.value);
}

/** Maximum multipart upload: an 8 MB image plus multipart framing. */
export const MAX_UPLOAD_BYTES = 9 * 1024 * 1024;

/** Read multipart/form-data, aborting the stream as soon as it passes the cap. */
export async function parseMultipart(
  request: NextRequest,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    await request.body?.cancel().catch(() => undefined);
    throw new VendorServiceError(
      400,
      "INVALID_UPLOAD",
      "Upload the image as a multipart form.",
    );
  }
  try {
    return await readMultipartWithLimit(request, maxBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new VendorServiceError(413, "PAYLOAD_TOO_LARGE", "Image is too large.");
    }
    if (error instanceof TypeError) {
      // The platform parser rejects malformed multipart bodies with TypeError.
      const invalid = new VendorServiceError(
        400,
        "INVALID_UPLOAD",
        "The upload could not be read. Choose the image again.",
      );
      invalid.cause = error;
      throw invalid;
    }
    throw error;
  }
}

export async function requireVendorRequest(
  request: NextRequest,
  vendorSlug?: string,
): Promise<VendorAccessContext> {
  const context = await getRequestVendorContext(request, vendorSlug);
  if (!context) {
    throw new VendorServiceError(
      401,
      "UNAUTHENTICATED",
      "Sign in to continue.",
    );
  }
  return context;
}

export function clientAddress(request: NextRequest): string {
  return clientAddressLabel(request);
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof VendorServiceError) {
    if (error.status >= 500) {
      logger.error("api.dependency_failed", {
        status: error.status,
        code: error.code,
        error: serializeError(error),
      });
    }
    const response = jsonResponse(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
    if (error instanceof RateLimitExceededError) {
      response.headers.set("Retry-After", String(error.retryAfterSeconds));
    }
    return response;
  }
  if (error instanceof ZodError) {
    return jsonResponse(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Check the highlighted information and try again.",
          fields: error.flatten().fieldErrors,
        },
      },
      400,
    );
  }
  logger.error("api.unhandled_error", { error: serializeError(error) });
  return jsonResponse(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    },
    500,
  );
}
