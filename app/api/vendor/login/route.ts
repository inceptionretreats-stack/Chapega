import type { NextRequest } from "next/server";
import {
  VENDOR_SESSION_COOKIE,
  authenticateVendorLogin,
} from "@/server/vendor/auth";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
} from "@/server/vendor/api";
import { VendorServiceError } from "@/server/vendor/errors";
import { sha256 } from "@/server/vendor/crypto";
import { beginLoginAttempt } from "@/server/vendor/throttle";
import { loginSchema } from "@/server/vendor/schemas";
import { logger } from "@/server/observability/logger";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, loginSchema);
    const normalizedEmail = input.email.trim().toLocaleLowerCase("en-IN");
    // Throws RateLimitExceededError (429 + Retry-After) when throttled.
    const attempt = await beginLoginAttempt("vendor", request, normalizedEmail);
    const login = await authenticateVendorLogin(
      input.email,
      input.password,
      input.vendorSlug,
    );
    if (!login) {
      logger.warn("auth.login_failed", {
        scope: "vendor",
        emailHash: sha256(normalizedEmail).slice(0, 16),
      });
      throw new VendorServiceError(
        401,
        "INVALID_CREDENTIALS",
        "The email or password is incorrect.",
      );
    }
    await attempt.succeeded();
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
