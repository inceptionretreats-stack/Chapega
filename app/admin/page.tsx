import { redirect } from "next/navigation";
import { AdminPortal } from "@/components/admin/admin-portal";
import { getCurrentAdmin } from "@/server/admin/auth";
import { getAdminBootstrap } from "@/server/admin/service";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const context = await getCurrentAdmin();
  if (!context) redirect("/admin/login");

  const initialData = await getAdminBootstrap(context);
  return <AdminPortal initialData={initialData} />;
}
