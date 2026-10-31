import type { NextRequest } from "next/server";
import { ownPasswordChange } from "@/server/vendor/account-api";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

export const POST = withRequestContext(async function POST(request: NextRequest) {
  return ownPasswordChange(request);
});
