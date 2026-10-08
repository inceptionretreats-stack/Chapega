"use client";

import { AlertTriangle, ArrowLeft, RefreshCw, Store } from "lucide-react";
import Link from "next/link";

type AdminErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function AdminError({ retry }: AdminErrorProps) {
  return (
    <main className="admin-login-shell">
      <section className="admin-login-art" aria-label="Chapega.com platform administration">
        <div className="admin-login-brand">
          <span className="admin-wordmark">Chapega.com</span>
          <span>Platform admin</span>
        </div>
        <div className="admin-login-art__mark" aria-hidden="true">
          <Store size={74} strokeWidth={1.05} />
        </div>
        <div className="admin-login-art__copy">
          <h2>Platform data is temporarily out of reach.</h2>
          <p>No vendor, order, or account was changed.</p>
        </div>
      </section>

      <section className="admin-login-panel">
        <div className="admin-login-card">
          <Link className="admin-login-back" href="/">
            <ArrowLeft size={17} aria-hidden="true" /> Back to kiosk
          </Link>
          <AlertTriangle size={34} color="#8f2e3b" aria-hidden="true" />
          <header>
            <h1>Platform admin could not load</h1>
            <p>The platform service may be temporarily unavailable. Try again in a moment.</p>
          </header>
          <button className="admin-primary admin-login-submit" type="button" onClick={retry}>
            <RefreshCw size={19} aria-hidden="true" />
            <span>Retry platform admin</span>
          </button>
        </div>
      </section>
    </main>
  );
}
