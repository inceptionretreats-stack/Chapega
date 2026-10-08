import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { VendorStudioSkeleton } from "@/components/skeletons";
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
  // The session and tenant checks run before anything is streamed, so the
  // redirect and the 404 keep their HTTP status. Only the data load sits
  // behind a Suspense boundary (no loading.tsx, which would wrap the checks).
  return (
    <Suspense fallback={<VendorStudioSkeleton />}>
      <VendorWorkspace access={access} />
    </Suspense>
  );
}

async function VendorWorkspace({
  access,
}: Readonly<{ access: Parameters<typeof getVendorBootstrap>[0] }>) {
  const data = await getVendorBootstrap(access);
  return <VendorPortal initialData={data} />;
}
