import type { NextRequest } from "next/server";
import {
  apiError,
  assertSameOrigin,
  clientAddress,
  jsonResponse,
  parseJson,
} from "@/server/vendor/api";
import { VendorServiceError } from "@/server/vendor/errors";
import { consumeRateLimit } from "@/server/vendor/rate-limit";
import { kioskOrderSubmissionSchema } from "@/server/vendor/schemas";
import { recordKioskOrder } from "@/server/vendor/service";

export const runtime = "nodejs";

type Context = Readonly<{ params: Promise<{ vendorSlug: string }> }>;
const VENDOR_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizedVendorSlug(value: string): string {
  const slug = value.trim().toLocaleLowerCase("en-IN");
  if (!VENDOR_SLUG_PATTERN.test(slug)) {
    throw new VendorServiceError(404, "VENDOR_NOT_FOUND", "This storefront could not be found.");
  }
  return slug;
}

export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const [{ vendorSlug }, input] = await Promise.all([
      context.params,
      parseJson(request, kioskOrderSubmissionSchema),
    ]);
    const slug = normalizedVendorSlug(vendorSlug);
    const rate = await consumeRateLimit(
      `kiosk-order:${slug}:${clientAddress(request)}`,
      30,
      60 * 1_000,
    );
    if (!rate.allowed) {
      throw new VendorServiceError(
        429,
        "RATE_LIMITED",
        "Too many orders were prepared. Please wait a moment.",
      );
    }
    return jsonResponse({ order: await recordKioskOrder(input, slug) }, 201);
  } catch (error) {
    return apiError(error);
  }
}
