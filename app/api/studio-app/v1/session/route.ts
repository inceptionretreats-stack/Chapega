import type { NextRequest } from "next/server";
import { isBackgroundRefresh } from "@/domain/session-activity";
import { pushNotificationsEnabled } from "@/server/push/config";
import { apiError, jsonResponse, requireVendorAppSession } from "@/server/vendor/api";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

/**
 * Who the app is signed in as. No password-change gate: the app sends a
 * person holding a temporary password to its change-password screen.
 */
export const GET = withRequestContext(async function GET(request: NextRequest) {
  try {
    const session = await requireVendorAppSession(request, {
      countsAsActivity: !isBackgroundRefresh(request.headers),
    });
    return jsonResponse({
      user: session.user,
      expiresAt: new Date(session.expiresAt).toISOString(),
      absoluteExpiresAt: new Date(session.absoluteExpiresAt).toISOString(),
      push: { serverEnabled: pushNotificationsEnabled() },
    });
  } catch (error) {
    return apiError(error);
  }
});
