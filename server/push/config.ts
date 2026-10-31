import "server-only";

import { createHash, createPrivateKey, type KeyObject } from "node:crypto";

/**
 * New-order push notifications through Firebase Cloud Messaging (HTTP v1).
 * Off unless FCM_SERVICE_ACCOUNT_JSON holds a service-account key (raw JSON
 * or base64) of the Firebase project the Chapega Studio app is built with.
 *
 *   FCM_SERVICE_ACCOUNT_JSON  service-account key; unset = push off
 *   FCM_PROJECT_ID            optional; overrides the key's project_id
 *   FCM_TEST_BASE_URL         tests only: a stub for Google's endpoints;
 *                             refused in production
 */
export type PushConfiguration = Readonly<{
  projectId: string;
  clientEmail: string;
  privateKeyId: string;
  privateKey: KeyObject;
  oauthTokenUrl: string;
  fcmBaseUrl: string;
}>;

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_BASE_URL = "https://fcm.googleapis.com";
// Firebase project ids: 6-30 lowercase letters, digits and hyphens.
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

type Parsed = Readonly<{ configuration: PushConfiguration | null; problem: string | null }>;

let cached: Readonly<{ key: string; parsed: Parsed }> | null = null;

function serviceAccount(raw: string): Record<string, unknown> | null {
  try {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function read(): Parsed {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return { configuration: null, problem: null };
  const testBase = process.env.FCM_TEST_BASE_URL?.trim().replace(/\/+$/, "");
  if (testBase && process.env.NODE_ENV === "production") {
    return {
      configuration: null,
      problem: "FCM_TEST_BASE_URL is for tests only; remove it in production. Push is off.",
    };
  }
  const account = serviceAccount(raw);
  if (!account) {
    return {
      configuration: null,
      problem:
        "FCM_SERVICE_ACCOUNT_JSON is not a service-account key (JSON or base64). Push is off.",
    };
  }
  const projectId = process.env.FCM_PROJECT_ID?.trim() || String(account.project_id ?? "");
  const clientEmail = String(account.client_email ?? "");
  const privateKeyId = String(account.private_key_id ?? "");
  if (
    account.type !== "service_account" ||
    !PROJECT_ID_PATTERN.test(projectId) ||
    !/^[^@\s]+@[^@\s]+$/.test(clientEmail) ||
    !privateKeyId
  ) {
    return {
      configuration: null,
      problem:
        "FCM_SERVICE_ACCOUNT_JSON needs type service_account, project_id, client_email and private_key_id. Push is off.",
    };
  }
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({ key: String(account.private_key ?? ""), format: "pem" });
  } catch {
    return {
      configuration: null,
      problem: "FCM_SERVICE_ACCOUNT_JSON has no usable private_key. Push is off.",
    };
  }
  return {
    configuration: {
      projectId,
      clientEmail,
      privateKeyId,
      privateKey,
      oauthTokenUrl: testBase ? `${testBase}/token` : GOOGLE_OAUTH_TOKEN_URL,
      fcmBaseUrl: testBase || FCM_BASE_URL,
    },
    problem: null,
  };
}

function current(): Parsed {
  const key = createHash("sha256")
    .update(
      [
        process.env.FCM_SERVICE_ACCOUNT_JSON ?? "",
        process.env.FCM_PROJECT_ID ?? "",
        process.env.FCM_TEST_BASE_URL ?? "",
        process.env.NODE_ENV ?? "",
      ].join("\u0000"),
    )
    .digest("hex");
  if (cached?.key !== key) cached = { key, parsed: read() };
  return cached.parsed;
}

/** The configuration to send with, or null when push is off. */
export function getPushConfiguration(): PushConfiguration | null {
  return current().configuration;
}

/** Why push is off despite being configured, or null. */
export function pushConfigurationProblem(): string | null {
  return current().problem;
}

export function pushNotificationsEnabled(): boolean {
  return getPushConfiguration() !== null;
}
