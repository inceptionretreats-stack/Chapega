import type { NextRequest } from "next/server";
import { teamAdd, teamList } from "@/server/vendor/account-api";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = Readonly<{ params: Promise<{ vendorSlug: string }> }>;

export const GET = withRequestContext(async function GET(request: NextRequest, context: Context) {
  return teamList(request, (await context.params).vendorSlug);
});

export const POST = withRequestContext(async function POST(request: NextRequest, context: Context) {
  return teamAdd(request, (await context.params).vendorSlug);
});
