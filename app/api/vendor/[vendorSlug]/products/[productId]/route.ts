import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
  requireVendorRequest,
} from "@/server/vendor/api";
import { vendorProductSchema } from "@/server/vendor/schemas";
import { archiveVendorProduct, updateVendorProduct } from "@/server/vendor/service";

export const runtime = "nodejs";
type Context = Readonly<{ params: Promise<{ vendorSlug: string; productId: string }> }>;

export async function PATCH(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const [params, input] = await Promise.all([
      context.params,
      parseJson(request, vendorProductSchema),
    ]);
    const access = await requireVendorRequest(request, params.vendorSlug);
    return jsonResponse({
      product: await updateVendorProduct(params.productId, input, access),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const [params, input] = await Promise.all([
      context.params,
      parseJson(request, z.object({ version: z.number().int().positive() }).strict()),
    ]);
    const access = await requireVendorRequest(request, params.vendorSlug);
    await archiveVendorProduct(params.productId, input.version, access);
    return jsonResponse({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
