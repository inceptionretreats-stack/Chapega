import "server-only";

import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
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

export function assertSameOrigin(request: NextRequest): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    logger.warn("security.origin_rejected", {
      reason: "cross-site",
      path: request.nextUrl.pathname,
    });
    throw new VendorServiceError(
      403,
      "CROSS_SITE_REQUEST",
      "Request rejected.",
    );
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    logger.warn("security.origin_rejected", {
      reason: "origin-mismatch",
      origin: origin.slice(0, 200),
      path: request.nextUrl.pathname,
    });
    throw new VendorServiceError(403, "INVALID_ORIGIN", "Request rejected.");
  }
}

export async function parseJson<T>(
  request: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_JSON_BYTES) {
    throw new VendorServiceError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Request is too large.",
    );
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    throw new VendorServiceError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Request is too large.",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new VendorServiceError(
      400,
      "INVALID_JSON",
      "Enter valid request data.",
    );
  }
  return schema.parse(value);
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
  const proxyPreference = process.env.TRUST_PROXY_HEADERS;
  if (proxyPreference === "false") return "direct";

  const onVercel = process.env.VERCEL === "1";
  if (!onVercel && proxyPreference !== "true") return "direct";

  const candidates = onVercel
    ? [
        request.headers.get("x-vercel-forwarded-for"),
        request.headers.get("x-forwarded-for"),
        request.headers.get("x-real-ip"),
      ]
    : [
        request.headers.get("x-forwarded-for"),
        request.headers.get("x-real-ip"),
      ];
  for (const candidate of candidates) {
    const address = candidate?.split(",", 1)[0]?.trim();
    if (address && isIP(address)) return address;
  }
  return "proxy";
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
