import type { NextRequest } from "next/server";
import { ownPasswordChange } from "@/server/vendor/account-api";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
type Context = Readonly<{ params: Promise<{ vendorSlug: string }> }>;

/** Changes the signed-in user's own password. */
export const POST = withRequestContext(async function POST(request: NextRequest, context: Context) {
  return ownPasswordChange(request, (await context.params).vendorSlug);
});
