import type { NextRequest } from "next/server";
import { VENDOR_SESSION_COOKIE, destroyVendorSession } from "@/server/vendor/auth";
import { apiError, assertSameOrigin, jsonResponse } from "@/server/vendor/api";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const token = request.cookies.get(VENDOR_SESSION_COOKIE)?.value;
    if (token) await destroyVendorSession(token);
    const response = jsonResponse({ ok: true });
    response.cookies.set(VENDOR_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
});
