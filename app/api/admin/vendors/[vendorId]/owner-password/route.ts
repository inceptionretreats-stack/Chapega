import type { NextRequest } from "next/server";
import { requireRequestAdmin } from "@/server/admin/auth";
import {
  adminApiError,
  adminJsonResponse,
  assertAdminSameOrigin,
  parseAdminJson,
} from "@/server/admin/api";
import { adminVendorIdSchema, resetOwnerPasswordSchema } from "@/server/admin/schemas";
import { resetAdminVendorOwnerPassword } from "@/server/admin/service";
import { logger } from "@/server/observability/logger";
import { withRequestContext } from "@/server/observability/request-context";
import { beginCredentialIssue } from "@/server/vendor/throttle";

export const runtime = "nodejs";

type RouteContext = Readonly<{
  params: Promise<{ vendorId: string }>;
}>;

/** Sets a temporary password for a shop owner who is locked out. */
export const POST = withRequestContext(async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    assertAdminSameOrigin(request);
    const admin = await requireRequestAdmin(request);
    const vendorId = adminVendorIdSchema.parse((await context.params).vendorId);
    const input = await parseAdminJson(request, resetOwnerPasswordSchema);
    await beginCredentialIssue("admin-owner-reset", admin.user.id);
    const result = await resetAdminVendorOwnerPassword(admin, vendorId, input);
    logger.info("admin.owner_password_reset", {
      actorId: admin.user.id,
      vendorId,
      ownerId: input.ownerId,
    });
    return adminJsonResponse(result);
  } catch (error) {
    return adminApiError(error);
  }
});
