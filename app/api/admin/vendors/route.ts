import type { NextRequest } from "next/server";
import { requireRequestAdmin } from "@/server/admin/auth";
import {
  adminApiError,
  adminJsonResponse,
  assertAdminSameOrigin,
  parseAdminJson,
} from "@/server/admin/api";
import { createAdminVendorSchema } from "@/server/admin/schemas";
import { createAdminVendor } from "@/server/admin/service";
import { logger } from "@/server/observability/logger";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertAdminSameOrigin(request);
    const context = await requireRequestAdmin(request);
    const input = await parseAdminJson(request, createAdminVendorSchema);
    const result = await createAdminVendor(context, input);
    logger.info("admin.vendor_created", {
      actorId: context.user.id,
      vendorId: result.vendor.id,
    });
    return adminJsonResponse(result, 201);
  } catch (error) {
    return adminApiError(error);
  }
});
