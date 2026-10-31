import type { NextRequest } from "next/server";
import { teamUpdate } from "@/server/vendor/account-api";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
type Context = { params: Promise<{ userId: string }> };

export const PATCH = withRequestContext(async function PATCH(
  request: NextRequest,
  context: Context,
) {
  return teamUpdate(request, (await context.params).userId);
});
