import type { NextRequest } from "next/server";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
  requireVendorRequest,
} from "@/server/vendor/api";
import { orderCustomerRemovalSchema } from "@/server/vendor/schemas";
import { removeOrderCustomerDetails } from "@/server/vendor/service";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

type Context = { params: Promise<{ orderId: string }> };

export const DELETE = withRequestContext(async function DELETE(
  request: NextRequest,
  context: Context,
) {
  try {
    assertSameOrigin(request);
    const [user, input, params] = await Promise.all([
      requireVendorRequest(request),
      parseJson(request, orderCustomerRemovalSchema),
      context.params,
    ]);
    return jsonResponse({
      order: await removeOrderCustomerDetails(params.orderId, input.version, user),
    });
  } catch (error) {
    return apiError(error);
  }
});
