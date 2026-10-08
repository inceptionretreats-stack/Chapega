import { apiError, jsonResponse } from "@/server/vendor/api";
import { VendorServiceError } from "@/server/vendor/errors";
import { getKioskBootstrap } from "@/server/vendor/service";
import { logger, serializeError } from "@/server/observability/logger";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestContext(async function GET() {
  try {
    return jsonResponse(await getKioskBootstrap());
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
