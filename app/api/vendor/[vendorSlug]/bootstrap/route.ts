import type { NextRequest } from "next/server";
import { apiError, jsonResponse, requireVendorRequest } from "@/server/vendor/api";
import { getVendorBootstrap } from "@/server/vendor/service";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = Readonly<{ params: Promise<{ vendorSlug: string }> }>;

export const GET = withRequestContext(async function GET(request: NextRequest, context: Context) {
  try {
    const { vendorSlug } = await context.params;
    const access = await requireVendorRequest(request, vendorSlug);
    return jsonResponse(await getVendorBootstrap(access));
  } catch (error) {
    return apiError(error);
  }
});
