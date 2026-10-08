import "server-only";

import { randomUUID } from "node:crypto";
import { logger, serializeError } from "@/server/observability/logger";
import { requestContextStore, type RequestContext } from "@/server/observability/request-id-store";

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Incoming identifiers are echoed into headers and logs, so only a short,
 * printable token is accepted. Vercel's x-vercel-id uses "::" separators.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function requestIdFrom(headers: Headers): string {
  for (const name of [REQUEST_ID_HEADER, "x-vercel-id"]) {
    const candidate = headers.get(name)?.trim();
    if (candidate && SAFE_REQUEST_ID.test(candidate)) return candidate;
  }
  return randomUUID();
}

function withRequestIdHeader(response: Response, requestId: string): Response {
  try {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  } catch {
    // Some platform responses (e.g. Response.redirect) have immutable headers.
    const copy = new Response(response.body, response);
    copy.headers.set(REQUEST_ID_HEADER, requestId);
    return copy;
  }
}

/**
 * Wrap a route handler so every log line it produces carries a request ID,
 * the ID is echoed to the client, and an exception that escapes the handler
 * becomes a logged, generic 500 instead of an unlogged framework error page.
 */
export function withRequestContext<Req extends Request, Rest extends unknown[]>(
  handler: (request: Req, ...rest: Rest) => Promise<Response>,
): (request: Req, ...rest: Rest) => Promise<Response> {
  return async (request: Req, ...rest: Rest) => {
    let path = "";
    try {
      path = new URL(request.url).pathname;
    } catch {
      path = "";
    }
    const context: RequestContext = {
      requestId: requestIdFrom(request.headers),
      method: request.method,
      path,
      startedAt: Date.now(),
    };
    return requestContextStore.run(context, async () => {
      let response: Response;
      try {
        response = await handler(request, ...rest);
      } catch (error) {
        logger.error("http.unhandled_exception", {
          method: context.method,
          path: context.path,
          error: serializeError(error),
        });
        response = Response.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Something went wrong. Please try again.",
            },
          },
          {
            status: 500,
            headers: { "Cache-Control": "private, no-store, max-age=0" },
          },
        );
      }
      if (response.status >= 500) {
        logger.error("http.request_failed", {
          method: context.method,
          path: context.path,
          status: response.status,
          durationMs: Date.now() - context.startedAt,
        });
      }
      return withRequestIdHeader(response, context.requestId);
    });
  };
}
