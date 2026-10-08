import { redirect } from "next/navigation";
import { VendorLoginForm } from "@/components/vendor/vendor-login-form";
import { getCurrentVendorContext, getCurrentVendorUser } from "@/server/vendor/auth";
import { getVendorCredentialConfiguration } from "@/server/vendor/config";

export const dynamic = "force-dynamic";

type PageProps = Readonly<{
  searchParams: Promise<{ vendor?: string | string[] }>;
}>;

const VENDOR_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function VendorLoginPage({ searchParams }: PageProps) {
  const rawVendor = (await searchParams).vendor;
  const candidate = Array.isArray(rawVendor) ? rawVendor[0] : rawVendor;
  const requestedVendorSlug = candidate?.trim().toLocaleLowerCase("en-IN");
  const safeVendorSlug =
    requestedVendorSlug && VENDOR_SLUG_PATTERN.test(requestedVendorSlug)
      ? requestedVendorSlug
      : undefined;
  const credentialConfiguration = getVendorCredentialConfiguration();
  const currentUser = await getCurrentVendorUser();
  if (currentUser) {
    if (safeVendorSlug && (await getCurrentVendorContext(safeVendorSlug))) {
      redirect(`/vendor/${safeVendorSlug}`);
    }
    redirect(
      currentUser.activeVendor?.slug
        ? `/vendor/${currentUser.activeVendor.slug}`
        : currentUser.platformRole === "super_admin"
          ? "/admin"
          : "/vendor",
    );
  }
  return (
    <VendorLoginForm
      authenticationAvailable={credentialConfiguration.available}
      requestedVendorSlug={safeVendorSlug}
      previewCredentials={
        credentialConfiguration.preview && credentialConfiguration.credentials
          ? credentialConfiguration.credentials
          : null
      }
    />
  );
}
