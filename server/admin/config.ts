import "server-only";

import { getVendorCredentialConfiguration } from "@/server/vendor/config";

export type AdminCredentialConfiguration = Readonly<{
  available: boolean;
  preview: boolean;
  credentials: Readonly<{
    email: string;
    password: string;
  }> | null;
}>;

/**
 * The migrated/default owner is deliberately promoted to platform admin by
 * the database seed. Reusing the configured credential source keeps secrets
 * server-only and avoids a second hard-coded administrator account.
 */
export function getAdminCredentialConfiguration(): AdminCredentialConfiguration {
  const configuration = getVendorCredentialConfiguration();
  return {
    available: configuration.available,
    preview: configuration.preview,
    credentials: configuration.preview && configuration.credentials
      ? {
          email: configuration.credentials.email,
          password: configuration.credentials.password,
        }
      : null,
  };
}
