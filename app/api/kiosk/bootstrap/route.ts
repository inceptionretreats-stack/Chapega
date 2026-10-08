import { jsonResponse } from "@/server/vendor/api";
import { getKioskBootstrap } from "@/server/vendor/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonResponse(await getKioskBootstrap());
  } catch {
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
}
