import "server-only";

import type { PushConfiguration } from "@/server/push/config";
import { getGoogleAccessToken, invalidateGoogleAccessToken } from "@/server/push/google-oauth";
import { logger } from "@/server/observability/logger";

/** One FCM HTTP v1 message (https://firebase.google.com/docs/reference/fcm/rest). */
export type FcmMessage = Readonly<{
  token: string;
  notification: Readonly<{ title: string; body: string }>;
  /** FCM data values must all be strings. */
  data: Readonly<Record<string, string>>;
  android: Readonly<{
    priority: "high" | "normal";
    ttl: string;
    notification: Readonly<{ channel_id: string; tag: string }>;
  }>;
  apns: Readonly<{
    headers: Readonly<Record<string, string>>;
    payload: Readonly<{ aps: Readonly<Record<string, string>> }>;
  }>;
}>;

/** What one send came to. "unregistered": the token is dead; forget it. */
export type FcmDelivery = "sent" | "unregistered" | "failed";

type FailureKind = "unregistered" | "reauthenticate" | "retry" | "apns" | "failed";

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RETRY_WAIT_MS = 2_000;

type FcmErrorBody = {
  error?: {
    status?: unknown;
    details?: Array<{
      errorCode?: unknown;
      fieldViolations?: Array<{ field?: unknown }>;
    }>;
  };
};

function fcmErrorCode(body: unknown): string | null {
  const details = (body as FcmErrorBody | null)?.error?.details;
  if (!Array.isArray(details)) return null;
  for (const detail of details) {
    if (typeof detail?.errorCode === "string") return detail.errorCode;
  }
  return null;
}

function rejectsTokenField(body: unknown): boolean {
  const details = (body as FcmErrorBody | null)?.error?.details;
  return (
    Array.isArray(details) &&
    details.some((detail) =>
      detail?.fieldViolations?.some((violation) => violation?.field === "message.token"),
    )
  );
}

/**
 * How to treat a failed send. Only an explicit verdict on the token clears
 * it: a misconfigured project gives other errors, and must not wipe every
 * phone's registration.
 */
export function classifyFcmFailure(status: number, body: unknown): FailureKind {
  const code = fcmErrorCode(body);
  if (code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH") return "unregistered";
  if (status === 400 && rejectsTokenField(body)) return "unregistered";
  if (code === "THIRD_PARTY_AUTH_ERROR") return "apns";
  if (status === 401) return "reauthenticate";
  if (status === 429 || status >= 500) return "retry";
  return "failed";
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 500;
}

let apnsWarningLogged = false;

/**
 * Send one message: at most one retry (a fresh access token after a 401, or
 * after a 429 or 5xx when the deadline allows), never throws.
 */
export async function deliverFcmMessage(
  configuration: PushConfiguration,
  message: FcmMessage,
  deadline: number,
): Promise<FcmDelivery> {
  const url = `${configuration.fcmBaseUrl}/v1/projects/${configuration.projectId}/messages:send`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return "failed";
    let response: Response;
    try {
      const accessToken = await getGoogleAccessToken(configuration);
      response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ message }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
      });
    } catch (error) {
      logger.warn("push.send_failed", {
        reason: error instanceof Error ? error.name : "error",
      });
      return "failed";
    }
    if (response.ok) return "sent";
    const body: unknown = await response.json().catch(() => null);
    const kind = classifyFcmFailure(response.status, body);
    if (kind === "unregistered") return "unregistered";
    if (kind === "reauthenticate" && attempt === 0) {
      invalidateGoogleAccessToken();
      continue;
    }
    if (kind === "retry" && attempt === 0) {
      const wait = Math.min(retryAfterMs(response), MAX_RETRY_WAIT_MS);
      if (deadline - Date.now() > wait) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
    }
    if (kind === "apns" && !apnsWarningLogged) {
      apnsWarningLogged = true;
      logger.warn("push.apns_not_configured", {
        message: "FCM could not reach Apple: upload the APNs key in the Firebase project settings.",
      });
    }
    logger.warn("push.send_failed", { status: response.status, code: fcmErrorCode(body) });
    return "failed";
  }
  return "failed";
}
