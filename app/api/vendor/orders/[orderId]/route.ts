import type { NextRequest } from "next/server";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
  requireVendorRequest,
} from "@/server/vendor/api";
import { orderTransitionSchema } from "@/server/vendor/schemas";
import { transitionVendorOrder } from "@/server/vendor/service";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

type Context = { params: Promise<{ orderId: string }> };

export const PATCH = withRequestContext(async function PATCH(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const [user, input, params] = await Promise.all([
      requireVendorRequest(request),
      parseJson(request, orderTransitionSchema),
      context.params,
    ]);
    return jsonResponse({
      order: await transitionVendorOrder(
        params.orderId,
        input.status,
        input.version,
        user,
        input.note,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
});
