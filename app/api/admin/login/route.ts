import type { NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  authenticateAdminLogin,
} from "@/server/admin/auth";
import {
  adminApiError,
  adminClientAddress,
  adminJsonResponse,
  assertAdminSameOrigin,
  parseAdminJson,
} from "@/server/admin/api";
import { AdminServiceError } from "@/server/admin/errors";
import { adminLoginSchema } from "@/server/admin/schemas";
import { sha256 } from "@/server/vendor/crypto";
import { consumeRateLimit, resetRateLimit } from "@/server/vendor/rate-limit";
import { logger } from "@/server/observability/logger";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertAdminSameOrigin(request);
    const input = await parseAdminJson(request, adminLoginSchema);
    const address = adminClientAddress(request);
    const emailHash = sha256(input.email);
    const accountBucket = `admin-login-account:${address}:${emailHash}`;
    const [addressRate, accountRate] = await Promise.all([
      consumeRateLimit(`admin-login-address:${address}`, 30, 15 * 60 * 1_000),
      consumeRateLimit(accountBucket, 6, 15 * 60 * 1_000),
    ]);
    if (!addressRate.allowed || !accountRate.allowed) {
      logger.warn("security.rate_limited", {
        scope: "admin-login",
        emailHash: emailHash.slice(0, 16),
        retryAfterSeconds: Math.max(
          addressRate.retryAfterSeconds,
          accountRate.retryAfterSeconds,
        ),
      });
      const response = adminJsonResponse(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many sign-in attempts. Wait a moment and try again.",
          },
        },
        429,
      );
      response.headers.set(
        "Retry-After",
        String(Math.max(addressRate.retryAfterSeconds, accountRate.retryAfterSeconds)),
      );
      return response;
    }

    const login = await authenticateAdminLogin(input.email, input.password);
    if (!login) {
      logger.warn("auth.login_failed", {
        scope: "admin",
        emailHash: emailHash.slice(0, 16),
      });
      throw new AdminServiceError(
        401,
        "INVALID_ADMIN_CREDENTIALS",
        "The email or password is incorrect, or this account is not a platform administrator.",
      );
    }
    await resetRateLimit(accountBucket);
    const response = adminJsonResponse({ user: login.user });
    response.cookies.set(ADMIN_SESSION_COOKIE, login.token, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "strict",
      expires: login.expiresAt,
      path: "/",
      priority: "high",
    });
    return response;
  } catch (error) {
    return adminApiError(error);
  }
});
