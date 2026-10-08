import { cache } from "react";

import { VendorServiceError } from "@/server/vendor/errors";
import { getKioskBootstrap } from "@/server/vendor/service";
import type { KioskBootstrap } from "@/types/kiosk";

export type KioskShopStatus =
  | Readonly<{ status: "ok"; bootstrap: KioskBootstrap }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "suspended" }>
  | Readonly<{ status: "error" }>;

export const VENDOR_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Resolves a shop before any HTML is sent so pages can answer with a real
 * 404 (there must be no Suspense/loading boundary above the call site).
 * Deduplicated per request, so metadata and page share one read.
 */
export const loadKioskShop = cache(async (rawSlug: string): Promise<KioskShopStatus> => {
  const slug = rawSlug.trim().toLocaleLowerCase("en-IN");
  if (!VENDOR_SLUG_PATTERN.test(slug)) return { status: "not-found" };
  try {
    return { status: "ok", bootstrap: await getKioskBootstrap(slug) };
  } catch (error) {
    if (error instanceof VendorServiceError) {
      if (error.status === 404) return { status: "not-found" };
      if (error.status === 403) return { status: "suspended" };
    }
    return { status: "error" };
  }
});
