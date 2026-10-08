import type { NextRequest } from "next/server";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
} from "@/server/vendor/api";
import { DEFAULT_VENDOR_SLUG } from "@/server/vendor/database";
import { kioskOrderSubmissionSchema } from "@/server/vendor/schemas";
import { recordKioskOrder } from "@/server/vendor/service";
import { assertKioskOrderAllowed } from "@/server/vendor/throttle";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, kioskOrderSubmissionSchema);
    // Throws RateLimitExceededError (429 + Retry-After) when throttled.
    await assertKioskOrderAllowed(request, DEFAULT_VENDOR_SLUG, input.kioskName);
    return jsonResponse({ order: await recordKioskOrder(input) }, 201);
  } catch (error) {
    return apiError(error);
  }
});
