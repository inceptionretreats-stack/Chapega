import type { NextRequest } from "next/server";
import { destroyVendorSession, presentedVendorToken } from "@/server/vendor/auth";
import { apiError, assertSameOrigin, jsonResponse } from "@/server/vendor/api";
import { VendorServiceError } from "@/server/vendor/errors";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

/** Ends the app session presented (and with it, its notifications). Idempotent. */
export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const presented = presentedVendorToken(request);
    if (presented?.scope !== "vendor_app") {
      throw new VendorServiceError(401, "UNAUTHENTICATED", "Sign in to continue.");
    }
    await destroyVendorSession(presented.token, "vendor_app");
    return jsonResponse({ ok: true });
  } catch (error) {
    return apiError(error);
  }
});
