import type { NextRequest } from "next/server";
import { apiError, assertSameOrigin, jsonResponse, parseJson } from "@/server/vendor/api";
import { DEFAULT_VENDOR_SLUG } from "@/server/vendor/database";
import { kioskOrderSubmissionSchema } from "@/server/vendor/schemas";
import { placeKioskOrder } from "@/server/vendor/service";
import { assertKioskOrderAllowed } from "@/server/vendor/throttle";
import { withRequestContext } from "@/server/observability/request-context";
import { runAfterResponse } from "@/server/http/after-response";

export const runtime = "nodejs";
// Room for the new-order notification that runs after the response.
export const maxDuration = 30;

export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, kioskOrderSubmissionSchema);
    // Throws RateLimitExceededError (429 + Retry-After) when throttled.
    await assertKioskOrderAllowed(request, DEFAULT_VENDOR_SLUG, input.kioskName);
    const placed = await placeKioskOrder(input, DEFAULT_VENDOR_SLUG);
    if (placed.created) {
      // A retry of the same order is not announced again.
      runAfterResponse("push.new_order", async () => {
        const { notifyNewKioskOrder } = await import("@/server/push/order-alert");
        await notifyNewKioskOrder(placed.vendor, placed.order);
      });
    }
    return jsonResponse({ order: placed.order }, 201);
  } catch (error) {
    return apiError(error);
  }
});
