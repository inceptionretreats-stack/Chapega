import type { Metadata } from "next";

import { KioskApp } from "@/components/kiosk-app";
import { ShopUnavailable } from "@/components/shop-unavailable";
import { DEFAULT_VENDOR_SLUG } from "@/server/vendor/database";
import { kioskMetadata } from "./kiosk/kiosk-metadata";
import { loadKioskShop } from "./kiosk/shop-status";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return kioskMetadata(await loadKioskShop(DEFAULT_VENDOR_SLUG));
}

export default async function Home() {
  const shop = await loadKioskShop(DEFAULT_VENDOR_SLUG);
  if (shop.status === "not-found") return <ShopUnavailable kind="not-found" />;
  if (shop.status === "suspended") return <ShopUnavailable kind="suspended" />;
  return <KioskApp initialBootstrap={shop.status === "ok" ? shop.bootstrap : null} />;
}
