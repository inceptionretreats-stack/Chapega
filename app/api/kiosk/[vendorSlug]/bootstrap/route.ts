import type { NextRequest } from "next/server";
import { apiError, catalogueResponse } from "@/server/vendor/api";
import { VendorServiceError } from "@/server/vendor/errors";
import { getKioskBootstrap } from "@/server/vendor/service";
import { assertKioskBootstrapAllowed } from "@/server/vendor/throttle";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = Readonly<{ params: Promise<{ vendorSlug: string }> }>;
const VENDOR_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizedVendorSlug(value: string): string {
  const slug = value.trim().toLocaleLowerCase("en-IN");
  if (!VENDOR_SLUG_PATTERN.test(slug)) {
    throw new VendorServiceError(404, "VENDOR_NOT_FOUND", "This storefront could not be found.");
  }
  return slug;
}

export const GET = withRequestContext(async function GET(request: NextRequest, context: Context) {
  try {
    const slug = normalizedVendorSlug((await context.params).vendorSlug);
    // Throws RateLimitExceededError (429 + Retry-After) when flooded.
    assertKioskBootstrapAllowed(request, slug);
    return catalogueResponse(request, await getKioskBootstrap(slug));
  } catch (error) {
    return apiError(error);
  }
});
