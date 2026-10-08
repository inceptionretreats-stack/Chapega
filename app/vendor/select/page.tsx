import { Store } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorSignOutButton } from "@/components/vendor/vendor-sign-out-button";
import { getCurrentVendorUser } from "@/server/vendor/auth";

export const dynamic = "force-dynamic";

export default async function VendorSelectPage() {
  const user = await getCurrentVendorUser();
  if (!user) redirect("/vendor/login");
  const memberships = user.memberships.filter(
    (membership) => membership.active && membership.vendor.status === "active",
  );
  if (memberships.length === 1) redirect(`/vendor/${memberships[0].vendor.slug}`);

  return (
    <main className="vendor-select-shell">
      <section className="vendor-select-card" aria-labelledby="vendor-select-title">
        <span className="vendor-wordmark">Chapega.com</span>
        <p className="vendor-select-kicker">Vendor studio</p>
        <h1 id="vendor-select-title">Choose a workspace</h1>
        <p>Select the shop you want to manage. Your role and permissions are checked again for every action.</p>
        {memberships.length ? (
          <ul className="vendor-select-list">
            {memberships.map((membership) => (
              <li key={membership.vendor.id}>
                <Link href={`/vendor/${membership.vendor.slug}`}>
                  <span><Store size={21} aria-hidden="true" /></span>
                  <span><strong>{membership.vendor.displayName}</strong><small>{membership.role} · /{membership.vendor.slug}</small></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <div className="vendor-inline-error" role="status">No active vendor workspace is assigned to this account.</div>
            <VendorSignOutButton />
            <Link className="vendor-login-back" href="/">Back to kiosk</Link>
          </>
        )}
      </section>
    </main>
  );
}
