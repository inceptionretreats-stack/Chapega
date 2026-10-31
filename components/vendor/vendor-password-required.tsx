"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { VendorPasswordForm } from "./vendor-password-form";
import { VendorSignOutButton } from "./vendor-sign-out-button";

type VendorPasswordRequiredProps = {
  apiBase: string;
  name: string;
  email: string;
  shopName: string;
};

/**
 * Shown instead of the Studio while the account still has a password someone
 * else chose (a new owner or team member, or after a reset). Nothing else in
 * the Studio answers until it is replaced.
 */
export function VendorPasswordRequired({
  apiBase,
  name,
  email,
  shopName,
}: VendorPasswordRequiredProps) {
  const router = useRouter();
  return (
    <main className="vendor-select-shell">
      <section className="vendor-select-card vendor-password-card" aria-labelledby="password-title">
        <span className="vendor-wordmark">Chapega.com</span>
        <p className="vendor-select-kicker">Vendor Studio · {shopName}</p>
        <h1 id="password-title">
          <KeyRound size={24} aria-hidden="true" /> Set a new password
        </h1>
        <p>
          Hi {name}. You signed in with a temporary password that someone else chose. Choose your
          own password to open the Studio; only you will know it.
        </p>
        <VendorPasswordForm
          apiBase={apiBase}
          email={email}
          idPrefix="required-password"
          currentLabel="Temporary password"
          submitLabel="Save and open the Studio"
          onChanged={() => router.refresh()}
          onSessionEnded={() => router.replace("/vendor/login")}
        />
        <VendorSignOutButton />
      </section>
    </main>
  );
}
