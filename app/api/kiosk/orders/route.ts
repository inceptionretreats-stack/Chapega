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

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const rate = await consumeRateLimit(
      `kiosk-order:${clientAddress(request)}`,
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
    const input = await parseJson(request, kioskOrderSubmissionSchema);
    return jsonResponse({ order: await recordKioskOrder(input) }, 201);
  } catch (error) {
    return apiError(error);
  }
}
