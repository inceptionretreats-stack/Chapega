import type { Instrumentation } from "next";

/**
 * Runs once when a Next.js server instance starts (never during
 * `next build`). Invalid configuration stops the server here, with every
 * problem listed, instead of surfacing as per-request failures.
 *
 * In production the process exits (Next.js would otherwise keep listening
 * and answer every request with 500), so the platform reports a failed
 * start. In development the error is thrown and shown by `next dev`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { validateServerConfigurationAtStartup } = await import("./server/config/startup");
  validateServerConfigurationAtStartup();
}

/**
 * Server errors that escape a page, layout, server action or route handler.
 * Only the path, method and route are recorded: request headers can carry
 * session cookies, so they are never logged.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger, serializeError } = await import("./server/observability/logger");
  logger.error("next.request_error", {
    method: request.method,
    path: request.path.split("?", 1)[0],
    routePath: context.routePath,
    routeType: context.routeType,
    error: serializeError(error),
  });
};
