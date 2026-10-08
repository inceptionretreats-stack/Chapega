import type { NextRequest } from "next/server";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
} from "@/server/vendor/api";
import { VendorServiceError } from "@/server/vendor/errors";
import { kioskOrderSubmissionSchema } from "@/server/vendor/schemas";
import { recordKioskOrder } from "@/server/vendor/service";
import { assertKioskOrderAllowed } from "@/server/vendor/throttle";
import { withRequestContext } from "@/server/observability/request-context";

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

export const POST = withRequestContext(async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const [{ vendorSlug }, input] = await Promise.all([
      context.params,
      parseJson(request, kioskOrderSubmissionSchema),
    ]);
    const slug = normalizedVendorSlug(vendorSlug);
    // Throws RateLimitExceededError (429 + Retry-After) when throttled.
    await assertKioskOrderAllowed(request, slug, input.kioskName);
    return jsonResponse({ order: await recordKioskOrder(input, slug) }, 201);
  } catch (error) {
    return apiError(error);
  }
});
