import type { NextRequest } from "next/server";
import {
  VENDOR_SESSION_COOKIE,
  authenticateVendorLogin,
} from "@/server/vendor/auth";
import {
  apiError,
  assertSameOrigin,
  clientAddress,
  jsonResponse,
  parseJson,
} from "@/server/vendor/api";
import { VendorServiceError } from "@/server/vendor/errors";
import { sha256 } from "@/server/vendor/crypto";
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/server/vendor/rate-limit";
import { loginSchema } from "@/server/vendor/schemas";
import { logger } from "@/server/observability/logger";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, loginSchema);
    const address = clientAddress(request);
    const addressRate = await consumeRateLimit(
      `login-address:${address}`,
      30,
      15 * 60 * 1_000,
    );
    const emailHash = sha256(input.email.trim().toLocaleLowerCase("en-IN"));
    const rateBucket = `login-account:${address}:${emailHash}`;
    const accountRate = await consumeRateLimit(rateBucket, 6, 15 * 60 * 1_000);
    if (!addressRate.allowed || !accountRate.allowed) {
      logger.warn("security.rate_limited", {
        scope: "vendor-login",
        emailHash: emailHash.slice(0, 16),
        retryAfterSeconds: Math.max(
          addressRate.retryAfterSeconds,
          accountRate.retryAfterSeconds,
        ),
      });
      const response = jsonResponse(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many sign-in attempts. Please wait and try again.",
          },
        },
        429,
      );
      response.headers.set(
        "Retry-After",
        String(
          Math.max(
            addressRate.retryAfterSeconds,
            accountRate.retryAfterSeconds,
          ),
        ),
      );
      return response;
    }
    const login = await authenticateVendorLogin(
      input.email,
      input.password,
      input.vendorSlug,
    );
    if (!login) {
      logger.warn("auth.login_failed", {
        scope: "vendor",
        emailHash: emailHash.slice(0, 16),
      });
      throw new VendorServiceError(
        401,
        "INVALID_CREDENTIALS",
        "The email or password is incorrect.",
      );
    }
    await resetRateLimit(rateBucket);
    const response = jsonResponse({ user: login.user });
    response.cookies.set(VENDOR_SESSION_COOKIE, login.token, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "strict",
      expires: login.expiresAt,
      path: "/",
      priority: "high",
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
});
