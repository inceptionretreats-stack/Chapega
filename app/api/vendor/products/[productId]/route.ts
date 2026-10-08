import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
  requireVendorRequest,
} from "@/server/vendor/api";
import { archiveVendorProduct, updateVendorProduct } from "@/server/vendor/service";
import { vendorProductSchema } from "@/server/vendor/schemas";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

type Context = { params: Promise<{ productId: string }> };

export const PATCH = withRequestContext(async function PATCH(
  request: NextRequest,
  context: Context,
) {
  try {
    assertSameOrigin(request);
    const [user, input, params] = await Promise.all([
      requireVendorRequest(request),
      parseJson(request, vendorProductSchema),
      context.params,
    ]);
    return jsonResponse({
      product: await updateVendorProduct(params.productId, input, user),
    });
  } catch (error) {
    return apiError(error);
  }
});

export const DELETE = withRequestContext(async function DELETE(
  request: NextRequest,
  context: Context,
) {
  try {
    assertSameOrigin(request);
    const [user, input, params] = await Promise.all([
      requireVendorRequest(request),
      parseJson(request, z.object({ version: z.number().int().positive() }).strict()),
      context.params,
    ]);
    await archiveVendorProduct(params.productId, input.version, user);
    return jsonResponse({ ok: true });
  } catch (error) {
    return apiError(error);
  }
});
