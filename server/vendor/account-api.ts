import "server-only";

import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { logger } from "@/server/observability/logger";
import { assertNewPasswordAcceptable, changeOwnPassword } from "@/server/vendor/account-password";
import {
  apiError,
  assertSameOrigin,
  jsonResponse,
  parseJson,
  requireVendorActor,
  requireVendorSession,
} from "@/server/vendor/api";
import {
  passwordChangeSchema,
  teamMemberCreateSchema,
  teamMemberUpdateSchema,
  teamPasswordResetSchema,
  teamUserIdSchema,
} from "@/server/vendor/schemas";
import {
  addVendorTeamMember,
  listVendorTeam,
  resetVendorTeamPassword,
  setVendorTeamMemberActive,
  setVendorTeamMemberRole,
} from "@/server/vendor/team";
import { beginCredentialIssue, beginPasswordChangeAttempt } from "@/server/vendor/throttle";

/**
 * Handlers for the Team and change-password endpoints. Each exists as
 * /api/vendor/<slug>/… (the Studio uses these) and as /api/vendor/… for the
 * session's shop, like every other vendor endpoint; the route files only
 * pass the slug through.
 */

export async function teamList(request: NextRequest, vendorSlug?: string): Promise<NextResponse> {
  try {
    const actor = await requireVendorActor(request, vendorSlug);
    return jsonResponse({ members: await listVendorTeam(actor) });
  } catch (error) {
    return apiError(error);
  }
}

export async function teamAdd(request: NextRequest, vendorSlug?: string): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, teamMemberCreateSchema);
    const actor = await requireVendorActor(request, vendorSlug);
    const attempt = await beginCredentialIssue("team-add", actor.access.vendor.id);
    const member = await addVendorTeamMember(actor, input);
    // Only refusals count towards the limit.
    await attempt.refund();
    logger.info("team.member_added", {
      vendorId: actor.access.vendor.id,
      actorId: actor.access.user.id,
      memberId: member.userId,
    });
    return jsonResponse({ member }, 201);
  } catch (error) {
    return apiError(error);
  }
}

export async function teamUpdate(
  request: NextRequest,
  rawUserId: string,
  vendorSlug?: string,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const userId = teamUserIdSchema.parse(rawUserId);
    const input = await parseJson(request, teamMemberUpdateSchema);
    const actor = await requireVendorActor(request, vendorSlug);
    const member =
      "role" in input
        ? await setVendorTeamMemberRole(actor, userId, input.role)
        : await setVendorTeamMemberActive(actor, userId, input.active);
    return jsonResponse({ member });
  } catch (error) {
    return apiError(error);
  }
}

export async function teamPasswordReset(
  request: NextRequest,
  rawUserId: string,
  vendorSlug?: string,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const userId = teamUserIdSchema.parse(rawUserId);
    const input = await parseJson(request, teamPasswordResetSchema);
    const actor = await requireVendorActor(request, vendorSlug);
    await beginCredentialIssue("team-reset", actor.access.vendor.id);
    const member = await resetVendorTeamPassword(actor, userId, input.temporaryPassword);
    logger.info("team.password_reset", {
      vendorId: actor.access.vendor.id,
      actorId: actor.access.user.id,
      memberId: userId,
    });
    return jsonResponse({ member });
  } catch (error) {
    return apiError(error);
  }
}

/** Works while a temporary password must be replaced (no password-change gate). */
export async function ownPasswordChange(
  request: NextRequest,
  vendorSlug?: string,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, passwordChangeSchema);
    const { user, sessionHash } = await requireVendorSession(request, vendorSlug);
    const actor = {
      scope: "vendor" as const,
      userId: user.id,
      email: user.email,
      name: user.name,
      sessionHash,
    };
    assertNewPasswordAcceptable(actor, input);
    const attempt = await beginPasswordChangeAttempt("vendor", user.id);
    await changeOwnPassword(actor, input);
    await attempt.succeeded();
    logger.info("auth.password_changed", { scope: "vendor", userId: user.id });
    return jsonResponse({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
