import { notFound } from "next/navigation";
import { KioskApp } from "@/components/kiosk-app";

type PageProps = Readonly<{
  params: Promise<{ vendorSlug: string }>;
}>;

const VENDOR_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function VendorKioskPage({ params }: PageProps) {
  const { vendorSlug } = await params;
  const normalized = vendorSlug.trim().toLocaleLowerCase("en-IN");
  if (!VENDOR_SLUG_PATTERN.test(normalized)) notFound();
  return <KioskApp vendorSlug={normalized} />;
}
