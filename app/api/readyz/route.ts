import { checkReadiness } from "@/server/observability/health";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness: the selected data backend answers. Failure details are logged
 * server-side only; the probe response never includes connection errors.
 */
export const GET = withRequestContext(async function GET() {
  const result = await checkReadiness();
  return Response.json(
    {
      status: result.ready ? "ready" : "unavailable",
      backend: result.backend,
      checkedAt: result.checkedAt,
    },
    {
      status: result.ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
});
