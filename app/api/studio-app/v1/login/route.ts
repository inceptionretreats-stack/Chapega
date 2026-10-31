import type { NextRequest } from "next/server";
import { authenticateVendorAppLogin } from "@/server/vendor/auth";
import { apiError, assertSameOrigin, jsonResponse, parseJson } from "@/server/vendor/api";
import { VendorServiceError } from "@/server/vendor/errors";
import { sha256 } from "@/server/vendor/crypto";
import { beginLoginAttempt } from "@/server/vendor/throttle";
import { vendorAppLoginSchema } from "@/server/vendor/schemas";
import { logger } from "@/server/observability/logger";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

/**
 * Chapega Studio app sign-in. The session token is returned once, in this
 * body (never as a cookie); the app sends it as `Authorization: Bearer`.
 * Same rate limits as Studio sign-in, so a second endpoint gives no extra
 * guesses.
 */
export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, vendorAppLoginSchema);
    const normalizedEmail = input.email.trim().toLocaleLowerCase("en-IN");
    // Throws RateLimitExceededError (429 + Retry-After) when throttled.
    const attempt = await beginLoginAttempt("vendor", request, normalizedEmail);
    const login = await authenticateVendorAppLogin(input);
    if (!login) {
      logger.warn("auth.login_failed", {
        scope: "vendor",
        client: "app",
        emailHash: sha256(normalizedEmail).slice(0, 16),
      });
      throw new VendorServiceError(
        401,
        "INVALID_CREDENTIALS",
        "The email or password is incorrect.",
      );
    }
    await attempt.succeeded();
    logger.info("auth.app_login", {
      userId: login.user.id,
      vendorId: login.user.activeVendor.id,
      platform: input.device.platform,
      signedOutDevices: login.signedOutDevices,
    });
    return jsonResponse({
      token: login.token,
      tokenType: "Bearer",
      expiresAt: login.expiresAt.toISOString(),
      absoluteExpiresAt: login.absoluteExpiresAt.toISOString(),
      user: login.user,
      signedOutDevices: login.signedOutDevices,
    });
  } catch (error) {
    return apiError(error);
  }
});
