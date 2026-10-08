import type { NextRequest } from "next/server";
import { requireRequestAdmin } from "@/server/admin/auth";
import {
  adminApiError,
  adminJsonResponse,
  assertAdminSameOrigin,
  parseAdminJson,
} from "@/server/admin/api";
import {
  adminVendorIdSchema,
  updateAdminVendorStatusSchema,
} from "@/server/admin/schemas";
import { updateAdminVendorStatus } from "@/server/admin/service";

export const runtime = "nodejs";

type RouteContext = Readonly<{
  params: Promise<{ vendorId: string }>;
}>;

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    assertAdminSameOrigin(request);
    const admin = await requireRequestAdmin(request);
    const { vendorId: rawVendorId } = await context.params;
    const vendorId = adminVendorIdSchema.parse(rawVendorId);
    const input = await parseAdminJson(request, updateAdminVendorStatusSchema);
    return adminJsonResponse(
      await updateAdminVendorStatus(admin, vendorId, input.status, input.revision),
    );
  } catch (error) {
    return adminApiError(error);
  }
}
