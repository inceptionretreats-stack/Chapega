import "server-only";

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
import { VendorServiceError } from "@/server/vendor/errors";
import type { VendorAccessContext } from "@/types/vendor";

const MAX_JSON_BYTES = 128 * 1024;

export function jsonResponse(data: unknown, status = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
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
  try {
    return await readMultipartWithLimit(request, maxBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new VendorServiceError(413, "PAYLOAD_TOO_LARGE", "Image is too large.");
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
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
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
