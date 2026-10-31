import type { NextRequest } from "next/server";
import { teamAdd, teamList } from "@/server/vendor/account-api";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestContext(async function GET(request: NextRequest) {
  return teamList(request);
});

export const POST = withRequestContext(async function POST(request: NextRequest) {
  return teamAdd(request);
});
