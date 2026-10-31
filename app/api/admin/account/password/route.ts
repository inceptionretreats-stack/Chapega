import type { NextRequest } from "next/server";
import { requireRequestAdmin } from "@/server/admin/auth";
import {
  adminApiError,
  adminJsonResponse,
  assertAdminSameOrigin,
  parseAdminJson,
} from "@/server/admin/api";
import { logger } from "@/server/observability/logger";
import { withRequestContext } from "@/server/observability/request-context";
import { assertNewPasswordAcceptable, changeOwnPassword } from "@/server/vendor/account-password";
import { passwordChangeSchema } from "@/server/vendor/schemas";
import { beginPasswordChangeAttempt } from "@/server/vendor/throttle";

export const runtime = "nodejs";

/** Changes the signed-in platform admin's own password. */
export const POST = withRequestContext(async function POST(request: NextRequest) {
  try {
    assertAdminSameOrigin(request);
    const input = await parseAdminJson(request, passwordChangeSchema);
    const admin = await requireRequestAdmin(request);
    const actor = {
      scope: "platform" as const,
      userId: admin.user.id,
      email: admin.user.email,
      name: admin.user.name,
      sessionHash: admin.sessionHash,
    };
    assertNewPasswordAcceptable(actor, input);
    const attempt = await beginPasswordChangeAttempt("admin", admin.user.id);
    await changeOwnPassword(actor, input);
    await attempt.succeeded();
    logger.info("auth.password_changed", { scope: "platform", userId: admin.user.id });
    return adminJsonResponse({ ok: true });
  } catch (error) {
    return adminApiError(error);
  }
});
