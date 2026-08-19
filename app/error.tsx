"use client";

import { AlertCircle, RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="screen-page narrow">
      <div className="empty-state">
        <AlertCircle size={46} />
        <div><h2>The kiosk needs a quick refresh</h2><p>Your saved presenter settings remain in this browser. Try loading the current screen again.</p><button className="primary-button" onClick={reset}><RotateCcw size={18} /> Try again</button></div>
      </div>
    </main>
  );
}
