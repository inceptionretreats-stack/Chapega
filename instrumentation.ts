import type { Instrumentation } from "next";

/**
 * Server errors that escape a page, layout, server action or route handler.
 * Only the path, method and route are recorded: request headers can carry
 * session cookies, so they are never logged.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
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
