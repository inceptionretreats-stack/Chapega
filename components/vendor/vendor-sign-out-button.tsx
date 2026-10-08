"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { vendorRequest } from "./vendor-client";

/** Sign-out control for pages that render outside the Vendor Studio shell. */
export function VendorSignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await vendorRequest("/api/vendor/logout", {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.replace("/vendor/login");
      router.refresh();
    } catch (caught) {
      setPending(false);
      setError(caught instanceof Error ? caught.message : "Could not sign out. Try again.");
    }
  };

  return (
    <>
      <button className="vendor-secondary" type="button" onClick={signOut} disabled={pending}>
        {pending ? <LoaderCircle className="vendor-spin" size={18} /> : <LogOut size={18} />}
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <div className="vendor-inline-error" role="alert">
          {error}
        </div>
      ) : null}
    </>
  );
}
