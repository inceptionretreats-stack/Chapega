import type { Metadata } from "next";

import type { KioskShopStatus } from "./shop-status";

/** Per-route metadata for the kiosk; names the shop where it is known. */
export function kioskMetadata(shop: KioskShopStatus): Metadata {
  if (shop.status === "ok") {
    const name = shop.bootstrap.vendor.displayName;
    return {
      title: { absolute: `${name} gift kiosk` },
      description: `Browse gifts at ${name} and prepare a Pay at Counter order on WhatsApp.`,
    };
  }
  if (shop.status === "suspended") {
    return {
      title: "Shop unavailable",
      description: "This shop isn’t taking orders right now.",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: "Gift kiosk",
    description: "Browse gifts and prepare a Pay at Counter order on WhatsApp.",
  };
}
