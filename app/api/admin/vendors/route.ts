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

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertAdminSameOrigin(request);
    const context = await requireRequestAdmin(request);
    const input = await parseAdminJson(request, createAdminVendorSchema);
    return adminJsonResponse(await createAdminVendor(context, input), 201);
  } catch (error) {
    return adminApiError(error);
  }
}
