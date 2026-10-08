import type { NextRequest } from "next/server";
import { apiError, jsonResponse } from "@/server/vendor/api";
import { VendorServiceError } from "@/server/vendor/errors";
import { getKioskBootstrap } from "@/server/vendor/service";
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

export const GET = withRequestContext(async function GET(_request: NextRequest, context: Context) {
  try {
    const { vendorSlug } = await context.params;
    return jsonResponse(await getKioskBootstrap(normalizedVendorSlug(vendorSlug)));
  } catch (error) {
    return apiError(error);
  }
});
