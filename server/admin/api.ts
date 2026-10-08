import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import {
  clientAddressLabel,
  sameOriginRejection,
} from "@/server/http/request-identity";
import { logger, serializeError } from "@/server/observability/logger";
import { VendorServiceError } from "@/server/vendor/errors";
import { AdminServiceError } from "./errors";

const MAX_JSON_BYTES = 64 * 1024;

export function adminJsonResponse(data: unknown, status = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

/** Same CSRF rule as the vendor API (see server/http/request-identity). */
export function assertAdminSameOrigin(request: NextRequest): void {
  const rejection = sameOriginRejection(request);
  if (rejection) {
    throw new AdminServiceError(403, rejection.code, "Request rejected.");
  }
}

export async function parseAdminJson<T>(
  request: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_JSON_BYTES) {
    throw new AdminServiceError(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    throw new AdminServiceError(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AdminServiceError(400, "INVALID_JSON", "Enter valid request data.");
  }
  return schema.parse(value);
}

export function adminClientAddress(request: NextRequest): string {
  return clientAddressLabel(request);
}

export function adminApiError(error: unknown): NextResponse {
  if (error instanceof AdminServiceError || error instanceof VendorServiceError) {
    if (error.status >= 500) {
      logger.error("api.dependency_failed", {
        status: error.status,
        code: error.code,
        error: serializeError(error),
      });
    }
    return adminJsonResponse(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  }
  if (error instanceof ZodError) {
    return adminJsonResponse(
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
  return adminJsonResponse(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    },
    500,
  );
}
