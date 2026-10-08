import "server-only";

import {
  getSupabaseConfiguration,
  getVendorDataBackend,
  type VendorDataBackend,
} from "@/server/supabase/config";
import { logger } from "@/server/observability/logger";
import { SESSION_SETTINGS, sessionSettingProblem } from "@/server/security/session-policy";
import { getVendorCredentialConfiguration } from "@/server/vendor/config";
import { warnIfClientAddressUnknown } from "@/server/vendor/throttle";
import { normalizeWhatsAppNumber } from "@/domain/whatsapp";

/**
 * Server configuration checked once at startup (instrumentation.ts) so a bad
 * deployment fails immediately with a clear message instead of failing - or
 * silently falling back to defaults - request by request.
 *
 * Environment variables (all server-only):
 *   CHAPEGA_DATA_BACKEND        local | supabase (default: supabase when the
 *                               Supabase variables are set or in production)
 *   SUPABASE_DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
 *   VENDOR_EMAIL, VENDOR_PASSWORD, VENDOR_NAME  (local backend credentials)
 *   VENDOR_SESSION_HOURS (1-168, 12)   VENDOR_SESSION_IDLE_MINUTES (5-1440, 30)
 *   ADMIN_SESSION_HOURS (1-24, 8)      ADMIN_SESSION_IDLE_MINUTES (5-240, 15)
 *   TRUST_PROXY_HEADERS, ALLOW_VENDOR_PREVIEW_LOGIN,
 *   ALLOW_LOCAL_VENDOR_BACKEND         true | false
 *   CHAPEGA_OWNER_WHATSAPP_NUMBER, LOG_LEVEL (debug|info|warn|error|silent)
 */
export type ConfigurationReport = Readonly<{
  errors: readonly string[];
  warnings: readonly string[];
}>;

export class ServerConfigurationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      `Invalid server configuration:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
    );
    this.name = "ServerConfigurationError";
  }
}

const BOOLEAN_SETTINGS = [
  "TRUST_PROXY_HEADERS",
  "ALLOW_VENDOR_PREVIEW_LOGIN",
  "ALLOW_LOCAL_VENDOR_BACKEND",
] as const;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function inspectServerConfiguration(): ConfigurationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = process.env.NODE_ENV === "production";

  for (const name of BOOLEAN_SETTINGS) {
    const value = process.env[name]?.trim();
    if (value && value !== "true" && value !== "false") {
      errors.push(`${name} must be "true" or "false" (got "${value.slice(0, 40)}").`);
    }
  }

  for (const range of Object.values(SESSION_SETTINGS)) {
    const problem = sessionSettingProblem(range);
    if (problem) errors.push(problem);
  }

  let backend: VendorDataBackend | null = null;
  try {
    backend = getVendorDataBackend();
  } catch (error) {
    errors.push(message(error));
  }

  if (backend === "supabase") {
    try {
      getSupabaseConfiguration();
    } catch (error) {
      errors.push(message(error));
    }
  }
  if (backend === "local") {
    try {
      const credentials = getVendorCredentialConfiguration();
      if (!credentials.available) {
        warnings.push(
          "Vendor sign-in is disabled: set VENDOR_EMAIL and VENDOR_PASSWORD for the local backend.",
        );
      }
    } catch (error) {
      errors.push(message(error));
    }
    if (production) {
      warnings.push(
        "ALLOW_LOCAL_VENDOR_BACKEND=true: production is using the single-process local JSON store. Use Supabase for a public deployment.",
      );
    }
  }

  if (production && process.env.ALLOW_VENDOR_PREVIEW_LOGIN === "true") {
    warnings.push(
      "ALLOW_VENDOR_PREVIEW_LOGIN=true: the published preview credentials are accepted in production.",
    );
  }

  const whatsapp = process.env.CHAPEGA_OWNER_WHATSAPP_NUMBER?.trim();
  if (whatsapp) {
    try {
      normalizeWhatsAppNumber(whatsapp, "91");
    } catch {
      warnings.push(
        "CHAPEGA_OWNER_WHATSAPP_NUMBER is not a valid WhatsApp number; new local stores fall back to a sample number.",
      );
    }
  }

  const logLevel = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (logLevel && !["debug", "info", "warn", "error", "silent"].includes(logLevel)) {
    warnings.push(`LOG_LEVEL "${logLevel.slice(0, 20)}" is not recognised; using "info".`);
  }

  return { errors, warnings };
}

/**
 * Called by instrumentation.ts#register. In production an invalid
 * configuration exits the process: Next.js would otherwise keep listening
 * and answer every request with 500, hiding the failed start. In
 * development the error is thrown so `next dev` shows it.
 */
export function validateServerConfigurationAtStartup(): void {
  try {
    validateServerConfiguration();
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      console.error(message(error));
      process.exit(1);
    }
    throw error;
  }
}

/** Log warnings and throw ServerConfigurationError if anything is invalid. */
export function validateServerConfiguration(): void {
  const { errors, warnings } = inspectServerConfiguration();
  for (const warning of warnings) logger.warn("config.warning", { message: warning });
  if (process.env.NODE_ENV === "production") warnIfClientAddressUnknown();
  if (errors.length > 0) {
    logger.error("config.invalid", { problems: errors });
    throw new ServerConfigurationError(errors);
  }
  logger.info("config.validated", {
    backend: getVendorDataBackend(),
    environment: process.env.NODE_ENV,
  });
}
