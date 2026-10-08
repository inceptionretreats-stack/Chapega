import type { NextRequest } from "next/server";
import { requireRequestAdmin } from "@/server/admin/auth";
import { adminApiError, adminJsonResponse } from "@/server/admin/api";
import { getAdminBootstrap } from "@/server/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const context = await requireRequestAdmin(request);
    return adminJsonResponse(await getAdminBootstrap(context));
  } catch (error) {
    return adminApiError(error);
  }
}
