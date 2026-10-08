import { redirect } from "next/navigation";
import { getCurrentVendorUser } from "@/server/vendor/auth";

export const dynamic = "force-dynamic";

export default async function VendorPage() {
  const user = await getCurrentVendorUser();
  if (!user) redirect("/vendor/login");
  if (user.activeVendor?.slug) redirect(`/vendor/${user.activeVendor.slug}`);
  if (user.platformRole === "super_admin") redirect("/admin");
  redirect("/vendor/select");
}
