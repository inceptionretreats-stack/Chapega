import type { NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  destroyAdminSession,
} from "@/server/admin/auth";
import {
  adminApiError,
  adminJsonResponse,
  assertAdminSameOrigin,
} from "@/server/admin/api";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertAdminSameOrigin(request);
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (token) await destroyAdminSession(token);
    const response = adminJsonResponse({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
      priority: "high",
    });
    return response;
  } catch (error) {
    const response = adminApiError(error);
    response.cookies.set(ADMIN_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
      priority: "high",
    });
    return response;
  }
});
