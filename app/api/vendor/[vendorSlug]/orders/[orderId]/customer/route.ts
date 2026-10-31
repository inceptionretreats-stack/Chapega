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
type Context = Readonly<{ params: Promise<{ vendorSlug: string; orderId: string }> }>;

/** Removes the customer's details from one order (a deletion request). */
export const DELETE = withRequestContext(async function DELETE(
  request: NextRequest,
  context: Context,
) {
  try {
    assertSameOrigin(request);
    const [params, input] = await Promise.all([
      context.params,
      parseJson(request, orderCustomerRemovalSchema),
    ]);
    const access = await requireVendorRequest(request, params.vendorSlug);
    return jsonResponse({
      order: await removeOrderCustomerDetails(params.orderId, input.version, access),
    });
  } catch (error) {
    return apiError(error);
  }
});
