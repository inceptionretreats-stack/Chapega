import type { NextRequest } from "next/server";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
  requireVendorRequest,
} from "@/server/vendor/api";
import { vendorProductSchema } from "@/server/vendor/schemas";
import { createVendorProduct } from "@/server/vendor/service";

export const runtime = "nodejs";
type Context = Readonly<{ params: Promise<{ vendorSlug: string }> }>;

export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const [{ vendorSlug }, input] = await Promise.all([
      context.params,
      parseJson(request, vendorProductSchema),
    ]);
    const access = await requireVendorRequest(request, vendorSlug);
    return jsonResponse({ product: await createVendorProduct(input, access) }, 201);
  } catch (error) {
    return apiError(error);
  }
}
