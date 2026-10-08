import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness: the process is up and serving. Deliberately touches nothing else. */
export const GET = withRequestContext(async function GET() {
  return Response.json(
    { status: "ok" },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
});
