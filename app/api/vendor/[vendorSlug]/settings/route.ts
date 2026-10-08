import type { NextRequest } from "next/server";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
  requireVendorRequest,
} from "@/server/vendor/api";
import { vendorSettingsSchema } from "@/server/vendor/schemas";
import { updateVendorSettings } from "@/server/vendor/service";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
type Context = Readonly<{ params: Promise<{ vendorSlug: string }> }>;

export const PATCH = withRequestContext(async function PATCH(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const [params, input] = await Promise.all([
      context.params,
      parseJson(request, vendorSettingsSchema),
    ]);
    const access = await requireVendorRequest(request, params.vendorSlug);
    return jsonResponse({ settings: await updateVendorSettings(input, access) });
  } catch (error) {
    return apiError(error);
  }
});
