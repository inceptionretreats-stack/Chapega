import type { NextRequest } from "next/server";
import { teamPasswordReset } from "@/server/vendor/account-api";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
type Context = Readonly<{ params: Promise<{ vendorSlug: string; userId: string }> }>;

/** Sets a temporary password for a team member (owners only). */
export const POST = withRequestContext(async function POST(request: NextRequest, context: Context) {
  const { vendorSlug, userId } = await context.params;
  return teamPasswordReset(request, userId, vendorSlug);
});
