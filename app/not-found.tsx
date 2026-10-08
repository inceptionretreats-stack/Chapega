import Link from "next/link";
import { Gift } from "lucide-react";

export default function NotFound() {
  return (
    <main className="screen-page narrow">
      <div className="empty-state">
        <Gift size={46} />
        <div>
          <h1>This gift aisle isn’t here</h1>
          <p>Return to the kiosk welcome screen and start a fresh order.</p>
          <Link className="primary-button" href="/">
            Return to Chapega.com
          </Link>
        </div>
      </div>
    </main>
  );
}
