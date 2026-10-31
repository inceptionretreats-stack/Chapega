import type { NextRequest } from "next/server";
import { teamUpdate } from "@/server/vendor/account-api";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
type Context = Readonly<{ params: Promise<{ vendorSlug: string; userId: string }> }>;

export const PATCH = withRequestContext(async function PATCH(
  request: NextRequest,
  context: Context,
) {
  const { vendorSlug, userId } = await context.params;
  return teamUpdate(request, userId, vendorSlug);
});
