"use client";

import { AlertCircle, RotateCcw } from "lucide-react";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="screen-page narrow">
      <div className="empty-state">
        <AlertCircle size={46} />
        <div><h1>The kiosk needs a quick refresh</h1><p>Your cart and kiosk session remain in this browser. Try loading the current screen again.</p><button className="primary-button" onClick={retry}><RotateCcw size={18} /> Try again</button></div>
      </div>
    </main>
  );
}
