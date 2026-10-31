import type { NextRequest } from "next/server";
import { teamPasswordReset } from "@/server/vendor/account-api";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
type Context = { params: Promise<{ userId: string }> };

export const POST = withRequestContext(async function POST(request: NextRequest, context: Context) {
  return teamPasswordReset(request, (await context.params).userId);
});
