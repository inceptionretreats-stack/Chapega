"use client";

import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

type VendorErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function VendorError({ retry }: VendorErrorProps) {
  return (
    <main className="vendor-login-shell">
      <section className="vendor-login-art" aria-label="Chapega.com Vendor Studio">
        <div className="vendor-login-brand">
          <span className="vendor-wordmark">Chapega.com</span>
          <span>Vendor Studio</span>
        </div>
        <div className="vendor-login-art-copy">
          <p>Studio connection</p>
          <strong>Your catalogue and orders remain protected while the studio reconnects.</strong>
        </div>
      </section>

      <section className="vendor-login-panel">
        <div className="vendor-login-card">
          <Link className="vendor-login-back" href="/">
            <ArrowLeft size={17} aria-hidden="true" /> Back to kiosk
          </Link>
          <div className="vendor-login-mobile-brand">
            <span className="vendor-wordmark">Chapega.com</span>
            <span>Vendor Studio</span>
          </div>
          <AlertTriangle size={34} className="icon-danger" aria-hidden="true" />
          <header>
            <h1>Vendor Studio could not load</h1>
            <p>
              The catalogue service may be temporarily unavailable. No product, order, or setting
              was changed.
            </p>
          </header>
          <button className="vendor-primary vendor-login-submit" type="button" onClick={retry}>
            <RefreshCw size={19} aria-hidden="true" />
            <span>Retry Vendor Studio</span>
          </button>
          <p className="vendor-secure-note">
            If this continues, check the Supabase connection and server logs.
          </p>
        </div>
      </section>
    </main>
  );
}
