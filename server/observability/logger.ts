import "server-only";

import { currentRequestId } from "@/server/observability/request-id-store";

/**
 * A deliberately tiny structured logger: one JSON object per line on
 * stdout/stderr, which Vercel, Docker and systemd all collect without an agent.
 *
 * Callers pass small, explicit field objects. The logger additionally redacts
 * any key that looks like a credential, so an accidental `{ password }` or a
 * nested cookie header can never reach the log stream. Never pass request
 * bodies, raw headers, or customer contact details.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Readonly<Record<string, unknown>>;
export type LogSink = (level: LogLevel, line: string) => void;

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY =
  /pass(?:word|wd|phrase)?$|password|secret|token|cookie|authori[sz]ation|^salt$|salt$|credential|session(?:id|hash)?$|^body$|^raw/i;
const MAX_STRING = 1_000;
const MAX_DEPTH = 4;

const defaultSink: LogSink = (level, line) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

let sink: LogSink = defaultSink;

/** Replace the output sink (tests). Pass null to restore stdout/stderr. */
export function setLogSink(next: LogSink | null): void {
  sink = next ?? defaultSink;
}

function minimumLevel(): number {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (configured === "silent") return Number.POSITIVE_INFINITY;
  if (configured && configured in LEVEL_ORDER) {
    return LEVEL_ORDER[configured as LogLevel];
  }
  return LEVEL_ORDER.info;
}

function truncate(value: string): string {
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
}

/**
 * Serialize an error and its cause chain using an allowlist of properties.
 * Database drivers attach the SQL text and bound parameters to their errors;
 * those can contain emails or password hashes, so they are never copied.
 */
export function serializeError(error: unknown, depth = 0): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: truncate(String(error)) };
  }
  const candidate = error as Error & {
    code?: unknown;
    status?: unknown;
    severity?: unknown;
    constraint_name?: unknown;
    table_name?: unknown;
    digest?: unknown;
  };
  const result: Record<string, unknown> = {
    name: candidate.name,
    message: truncate(candidate.message),
  };
  if (typeof candidate.code === "string" || typeof candidate.code === "number") {
    result.code = candidate.code;
  }
  if (typeof candidate.status === "number") result.status = candidate.status;
  if (typeof candidate.severity === "string") result.severity = candidate.severity;
  if (typeof candidate.constraint_name === "string") {
    result.constraint = candidate.constraint_name;
  }
  if (typeof candidate.table_name === "string") result.table = candidate.table_name;
  if (typeof candidate.digest === "string") result.digest = candidate.digest;
  if (candidate.stack && depth === 0) {
    result.stack = truncate(candidate.stack.split("\n").slice(0, 8).join("\n"));
  }
  if (candidate.cause !== undefined && depth < 3) {
    result.cause = serializeError(candidate.cause, depth + 1);
  }
  return result;
}

function sanitize(value: unknown, depth: number): unknown {
  if (value instanceof Error) return serializeError(value);
  if (typeof value === "string") return truncate(value);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitize(entry, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitize(entry, depth + 1);
    }
    return output;
  }
  return undefined;
}

function write(level: LogLevel, event: string, fields?: LogFields): void {
  if (LEVEL_ORDER[level] < minimumLevel()) return;
  const requestId = currentRequestId();
  const payload = {
    time: new Date().toISOString(),
    level,
    event,
    ...(requestId ? { requestId } : {}),
    ...(fields ? (sanitize(fields, 0) as Record<string, unknown>) : {}),
  };
  let line: string;
  try {
    line = JSON.stringify(payload);
  } catch {
    line = JSON.stringify({ time: payload.time, level, event, requestId, unserializable: true });
  }
  try {
    sink(level, line);
  } catch {
    // Logging must never take a request down with it.
  }
}

export const logger = Object.freeze({
  debug: (event: string, fields?: LogFields) => write("debug", event, fields),
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
});
