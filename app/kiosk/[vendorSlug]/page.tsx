import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KioskApp } from "@/components/kiosk-app";
import { ShopUnavailable } from "@/components/shop-unavailable";
import { loadKioskShop } from "../shop-status";
import { kioskMetadata } from "../kiosk-metadata";

// The shop is looked up per request; never prerender it at build time.
export const dynamic = "force-dynamic";

type PageProps = Readonly<{
  params: Promise<{ vendorSlug: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { vendorSlug } = await params;
  const shop = await loadKioskShop(vendorSlug);
  return kioskMetadata(shop);
}

export default async function VendorKioskPage({ params }: PageProps) {
  const { vendorSlug } = await params;
  const shop = await loadKioskShop(vendorSlug);
  // No loading.tsx/Suspense boundary sits above this call, so notFound()
  // produces a genuine HTTP 404.
  if (shop.status === "not-found") notFound();
  if (shop.status === "suspended") return <ShopUnavailable kind="suspended" />;
  return (
    <KioskApp
      vendorSlug={vendorSlug.trim().toLocaleLowerCase("en-IN")}
      initialBootstrap={shop.status === "ok" ? shop.bootstrap : null}
    />
  );
}
