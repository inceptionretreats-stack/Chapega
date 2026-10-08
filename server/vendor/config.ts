import "server-only";

import { loginSchema } from "@/server/vendor/schemas";
import {
  isSupabaseConfigurationAvailable,
  usesSupabaseBackend,
} from "@/server/supabase/config";

export const PREVIEW_VENDOR_EMAIL = "owner@chapega.com";
export const PREVIEW_VENDOR_PASSWORD = "Chapega@2026";

type VendorCredentialConfiguration = Readonly<{
  available: boolean;
  preview: boolean;
  credentials: Readonly<{
    email: string;
    password: string;
    name: string;
  }> | null;
}>;

export function vendorPreviewAccessAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_VENDOR_PREVIEW_LOGIN === "true"
  );
}

export function isKnownPreviewCredentialPair(
  email: string,
  password: string,
): boolean {
  return (
    email.trim().toLowerCase() === PREVIEW_VENDOR_EMAIL &&
    password === PREVIEW_VENDOR_PASSWORD
  );
}

/** The sample value shipped in .env.example. It must never be a real password. */
export const ENV_EXAMPLE_PLACEHOLDER_PASSWORD = "replace-with-a-long-unique-password";

export function isPlaceholderPassword(password: string): boolean {
  return password.trim() === ENV_EXAMPLE_PLACEHOLDER_PASSWORD;
}

/**
 * The single credential guard shared by vendor and platform sign-in. It runs
 * before any password verification:
 * - the published preview pair is refused whenever preview access is not
 *   allowed (production without ALLOW_VENDOR_PREVIEW_LOGIN=true), even if an
 *   account still has that password;
 * - the .env.example placeholder is refused everywhere, always.
 */
export function isRejectedLoginCredential(email: string, password: string): boolean {
  if (isPlaceholderPassword(password)) return true;
  return !vendorPreviewAccessAllowed() && isKnownPreviewCredentialPair(email, password);
}

export function getVendorCredentialConfiguration(): VendorCredentialConfiguration {
  if (usesSupabaseBackend()) {
    return {
      available: isSupabaseConfigurationAvailable(),
      preview: false,
      credentials: null,
    };
  }
  const configuredEmail = process.env.VENDOR_EMAIL?.trim();
  const configuredPassword = process.env.VENDOR_PASSWORD;
  if (Boolean(configuredEmail) !== Boolean(configuredPassword)) {
    throw new Error("Set both VENDOR_EMAIL and VENDOR_PASSWORD, or leave both unset.");
  }
  if (configuredPassword && isPlaceholderPassword(configuredPassword)) {
    throw new Error(
      "VENDOR_PASSWORD is still the placeholder from .env.example. Set a long, unique password " +
        "(or unset VENDOR_EMAIL and VENDOR_PASSWORD to use the development preview account).",
    );
  }

  const previewAllowed = vendorPreviewAccessAllowed();
  const rawCredentials = configuredEmail && configuredPassword
    ? { email: configuredEmail, password: configuredPassword }
    : previewAllowed
      ? { email: PREVIEW_VENDOR_EMAIL, password: PREVIEW_VENDOR_PASSWORD }
      : null;

  if (!rawCredentials) {
    return { available: false, preview: false, credentials: null };
  }

  const parsed = loginSchema.safeParse(rawCredentials);
  if (!parsed.success) {
    throw new Error(
      "VENDOR_EMAIL must be a valid email and VENDOR_PASSWORD must contain 8 to 200 characters.",
    );
  }

  const preview = isKnownPreviewCredentialPair(
    parsed.data.email,
    parsed.data.password,
  );
  if (preview && !previewAllowed) {
    return { available: false, preview: false, credentials: null };
  }

  return {
    available: true,
    preview,
    credentials: {
      ...parsed.data,
      name: (process.env.VENDOR_NAME ?? "Aanya").trim().slice(0, 80) || "Shop owner",
    },
  };
}
