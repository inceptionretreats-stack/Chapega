import "server-only";

import { sign } from "node:crypto";
import type { PushConfiguration } from "@/server/push/config";

/**
 * An OAuth access token for FCM from the service account: a JWT signed with
 * its private key (RS256) exchanged at Google's token endpoint. One request
 * at a time, cached until five minutes before it expires; after a failure,
 * no new attempt for a minute.
 */
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const AUDIENCE = "https://oauth2.googleapis.com/token";
const ASSERTION_LIFETIME_SECONDS = 3_600;
const EARLY_REFRESH_MS = 5 * 60_000;
const FAILURE_BACKOFF_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5_000;

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/** The signed assertion; only exported for tests. */
export function serviceAccountAssertion(
  configuration: PushConfiguration,
  nowSeconds: number,
): string {
  const header = base64url(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: configuration.privateKeyId }),
  );
  const claims = base64url(
    JSON.stringify({
      iss: configuration.clientEmail,
      scope: SCOPE,
      aud: AUDIENCE,
      iat: nowSeconds,
      exp: nowSeconds + ASSERTION_LIFETIME_SECONDS,
    }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), configuration.privateKey);
  return `${header}.${claims}.${base64url(signature)}`;
}

type CachedToken = Readonly<{
  value: string;
  refreshAt: number;
  configuration: PushConfiguration;
}>;

let cachedToken: CachedToken | null = null;
let pending: Promise<string> | null = null;
let failedUntil = 0;

async function exchange(configuration: PushConfiguration): Promise<string> {
  const startedAt = Date.now();
  try {
    const response = await fetch(configuration.oauthTokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: serviceAccountAssertion(configuration, Math.floor(startedAt / 1000)),
      }).toString(),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as {
      access_token?: unknown;
      expires_in?: unknown;
      error?: unknown;
    } | null;
    if (!response.ok || typeof body?.access_token !== "string") {
      const reason = typeof body?.error === "string" ? ` ${body.error.slice(0, 40)}` : "";
      throw new GoogleAuthError(`Google token exchange failed (${response.status}${reason}).`);
    }
    const lifetimeMs =
      (typeof body.expires_in === "number" ? body.expires_in : ASSERTION_LIFETIME_SECONDS) * 1000;
    cachedToken = {
      value: body.access_token,
      refreshAt: startedAt + Math.max(lifetimeMs - EARLY_REFRESH_MS, 60_000),
      configuration,
    };
    return body.access_token;
  } catch (error) {
    failedUntil = Date.now() + FAILURE_BACKOFF_MS;
    if (error instanceof GoogleAuthError) throw error;
    throw new GoogleAuthError(
      `Google token exchange failed (${error instanceof Error ? error.name : "error"}).`,
    );
  }
}

export async function getGoogleAccessToken(configuration: PushConfiguration): Promise<string> {
  const now = Date.now();
  if (cachedToken?.configuration === configuration && cachedToken.refreshAt > now) {
    return cachedToken.value;
  }
  if (failedUntil > now) {
    throw new GoogleAuthError("Google token exchange is backing off after a failure.");
  }
  pending ??= exchange(configuration).finally(() => {
    pending = null;
  });
  return pending;
}

/** After FCM refused the token: the next call exchanges a new one. */
export function invalidateGoogleAccessToken(): void {
  cachedToken = null;
}

/** Tests only. */
export function resetGoogleAccessTokenCache(): void {
  cachedToken = null;
  pending = null;
  failedUntil = 0;
}
