import type { NextRequest } from "next/server";
import { apiError, jsonResponse, requireVendorRequest } from "@/server/vendor/api";
import { getVendorBootstrap } from "@/server/vendor/service";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestContext(async function GET(request: NextRequest) {
  try {
    const user = await requireVendorRequest(request);
    return jsonResponse(await getVendorBootstrap(user));
  } catch (error) {
    return apiError(error);
  }
});
