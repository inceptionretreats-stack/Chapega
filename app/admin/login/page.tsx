import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { getCurrentAdmin } from "@/server/admin/auth";
import { getAdminCredentialConfiguration } from "@/server/admin/config";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const currentAdmin = await getCurrentAdmin();
  if (currentAdmin) redirect("/admin");

  const configuration = getAdminCredentialConfiguration();
  return (
    <AdminLoginForm
      authenticationAvailable={configuration.available}
      previewCredentials={configuration.credentials}
    />
  );
}
