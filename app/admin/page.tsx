import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminPortal } from "@/components/admin/admin-portal";
import { AdminSkeleton } from "@/components/skeletons";
import { getCurrentAdmin } from "@/server/admin/auth";
import { getAdminBootstrap } from "@/server/admin/service";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const context = await getCurrentAdmin();
  if (!context) redirect("/admin/login");

  // The session check runs before anything is streamed (real redirect);
  // only the platform data load shows the skeleton.
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <AdminWorkspace context={context} />
    </Suspense>
  );
}

async function AdminWorkspace({
  context,
}: Readonly<{ context: Parameters<typeof getAdminBootstrap>[0] }>) {
  const initialData = await getAdminBootstrap(context);
  return <AdminPortal initialData={initialData} />;
}
