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

export const PATCH = withRequestContext(async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const [user, input] = await Promise.all([
      requireVendorRequest(request),
      parseJson(request, vendorSettingsSchema),
    ]);
    return jsonResponse({ settings: await updateVendorSettings(input, user) });
  } catch (error) {
    return apiError(error);
  }
});
