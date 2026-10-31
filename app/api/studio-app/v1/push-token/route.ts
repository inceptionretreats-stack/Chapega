import type { NextRequest } from "next/server";
import { pushNotificationsEnabled } from "@/server/push/config";
import { registerSessionPushToken, unregisterSessionPushToken } from "@/server/push/registrations";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
  requireVendorAppSession,
} from "@/server/vendor/api";
import { pushTokenSchema } from "@/server/vendor/schemas";
import { beginPushTokenRegistration } from "@/server/vendor/throttle";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

/**
 * This phone's Firebase Cloud Messaging token for new-order notifications.
 * Kept even while the server has push turned off, so registered phones start
 * receiving them when it is turned on. Token refreshes happen in the
 * background, so neither call extends the session.
 */
export const PUT = withRequestContext(async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, pushTokenSchema);
    const session = await requireVendorAppSession(request, { countsAsActivity: false });
    await beginPushTokenRegistration(session.user.id);
    await registerSessionPushToken(
      { sessionHash: session.sessionHash, userId: session.user.id },
      input.fcmToken,
    );
    return jsonResponse({ registered: true, serverEnabled: pushNotificationsEnabled() });
  } catch (error) {
    return apiError(error);
  }
});

export const DELETE = withRequestContext(async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireVendorAppSession(request, { countsAsActivity: false });
    await unregisterSessionPushToken({
      sessionHash: session.sessionHash,
      userId: session.user.id,
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    return apiError(error);
  }
});
