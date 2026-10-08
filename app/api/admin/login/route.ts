import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, authenticateAdminLogin } from "@/server/admin/auth";
import {
  adminApiError,
  adminJsonResponse,
  assertAdminSameOrigin,
  parseAdminJson,
} from "@/server/admin/api";
import { AdminServiceError } from "@/server/admin/errors";
import { adminLoginSchema } from "@/server/admin/schemas";
import { sha256 } from "@/server/vendor/crypto";
import { beginLoginAttempt } from "@/server/vendor/throttle";
import { logger } from "@/server/observability/logger";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertAdminSameOrigin(request);
    const input = await parseAdminJson(request, adminLoginSchema);
    // Throws RateLimitExceededError (429 + Retry-After) when throttled.
    const attempt = await beginLoginAttempt("admin", request, input.email);
    const login = await authenticateAdminLogin(input.email, input.password);
    if (!login) {
      logger.warn("auth.login_failed", {
        scope: "admin",
        emailHash: sha256(input.email).slice(0, 16),
      });
      throw new AdminServiceError(
        401,
        "INVALID_ADMIN_CREDENTIALS",
        "The email or password is incorrect, or this account is not a platform administrator.",
      );
    }
    await attempt.succeeded();
    const response = adminJsonResponse({ user: login.user });
    response.cookies.set(ADMIN_SESSION_COOKIE, login.token, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "strict",
      // Browser-session cookie: the server enforces idle and absolute expiry.
      path: "/",
      priority: "high",
    });
    return response;
  } catch (error) {
    return adminApiError(error);
  }
});
