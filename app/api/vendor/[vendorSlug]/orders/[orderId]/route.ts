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
type Context = Readonly<{ params: Promise<{ vendorSlug: string; orderId: string }> }>;

export const PATCH = withRequestContext(async function PATCH(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const [params, input] = await Promise.all([
      context.params,
      parseJson(request, orderTransitionSchema),
    ]);
    const access = await requireVendorRequest(request, params.vendorSlug);
    return jsonResponse({
      order: await transitionVendorOrder(
        params.orderId,
        input.status,
        input.version,
        access,
        input.note,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
});
