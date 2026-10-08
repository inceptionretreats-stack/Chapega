import type { NextRequest } from "next/server";
import { requireRequestAdmin } from "@/server/admin/auth";
import {
  adminApiError,
  adminJsonResponse,
  assertAdminSameOrigin,
  parseAdminJson,
} from "@/server/admin/api";
import { adminVendorIdSchema, updateAdminVendorStatusSchema } from "@/server/admin/schemas";
import { updateAdminVendorStatus } from "@/server/admin/service";
import { logger } from "@/server/observability/logger";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

type RouteContext = Readonly<{
  params: Promise<{ vendorId: string }>;
}>;

export const PATCH = withRequestContext(async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    assertAdminSameOrigin(request);
    const admin = await requireRequestAdmin(request);
    const { vendorId: rawVendorId } = await context.params;
    const vendorId = adminVendorIdSchema.parse(rawVendorId);
    const input = await parseAdminJson(request, updateAdminVendorStatusSchema);
    // `input.revision` (sent by existing clients) is intentionally ignored:
    // the check is on the status the admin saw, not on unrelated activity.
    const result = await updateAdminVendorStatus(
      admin,
      vendorId,
      input.status,
      input.expectedStatus,
    );
    logger.info("admin.vendor_status_changed", {
      actorId: admin.user.id,
      vendorId,
      status: input.status,
    });
    return adminJsonResponse(result);
  } catch (error) {
    return adminApiError(error);
  }
});
