import type { NextRequest } from "next/server";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
  requireVendorRequest,
} from "@/server/vendor/api";
import { createVendorProduct } from "@/server/vendor/service";
import { vendorProductSchema } from "@/server/vendor/schemas";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireVendorRequest(request);
    const input = await parseJson(request, vendorProductSchema);
    return jsonResponse({ product: await createVendorProduct(input, user) }, 201);
  } catch (error) {
    return apiError(error);
  }
});
