import "server-only";

import { after } from "next/server";
import { logger, serializeError } from "@/server/observability/logger";

/**
 * Run work after the response has been sent (Next's `after()`, which on
 * Vercel keeps the function alive with waitUntil). The task can never affect
 * the response: its errors are logged, and where `after()` is unavailable (no
 * request scope, as when a test calls a route handler directly) it runs
 * detached instead.
 */
export function runAfterResponse(label: string, task: () => Promise<void>): void {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      logger.warn("after.task_failed", { task: label, error: serializeError(error) });
    }
  };
  try {
    after(guarded);
  } catch (error) {
    logger.debug("after.unavailable", { task: label, error: serializeError(error) });
    void guarded();
  }
}
