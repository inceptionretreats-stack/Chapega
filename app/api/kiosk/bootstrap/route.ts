import type { NextRequest } from "next/server";
import { apiError, catalogueResponse, jsonResponse } from "@/server/vendor/api";
import { DEFAULT_VENDOR_SLUG } from "@/server/vendor/database";
import { VendorServiceError } from "@/server/vendor/errors";
import { getKioskBootstrap } from "@/server/vendor/service";
import { assertKioskBootstrapAllowed } from "@/server/vendor/throttle";
import { logger, serializeError } from "@/server/observability/logger";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestContext(async function GET(request: NextRequest) {
  try {
    // Throws RateLimitExceededError (429 + Retry-After) when flooded.
    assertKioskBootstrapAllowed(request, DEFAULT_VENDOR_SLUG);
    return catalogueResponse(request, await getKioskBootstrap());
  } catch (error) {
    if (error instanceof VendorServiceError) return apiError(error);
    logger.error("kiosk.catalogue_unavailable", { error: serializeError(error) });
    return jsonResponse(
      {
        error: {
          code: "CATALOGUE_UNAVAILABLE",
          message: "The live catalogue is temporarily unavailable.",
        },
      },
      503,
    );
  }
});
