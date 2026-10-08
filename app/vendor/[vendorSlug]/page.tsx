import { notFound, redirect } from "next/navigation";
import { VendorPortal } from "@/components/vendor/vendor-portal";
import { getCurrentVendorContext, getCurrentVendorUser } from "@/server/vendor/auth";
import { getVendorBootstrap } from "@/server/vendor/service";

export const dynamic = "force-dynamic";

type PageProps = Readonly<{
  params: Promise<{ vendorSlug: string }>;
}>;

export default async function VendorWorkspacePage({ params }: PageProps) {
  const { vendorSlug } = await params;
  const user = await getCurrentVendorUser();
  if (!user) {
    redirect(`/vendor/login?vendor=${encodeURIComponent(vendorSlug)}`);
  }
  const access = await getCurrentVendorContext(vendorSlug);
  if (!access) notFound();
  const data = await getVendorBootstrap(access);
  return <VendorPortal initialData={data} />;
}
