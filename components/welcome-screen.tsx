import Image from "next/image";
import Link from "next/link";
import { ChevronRight, LogIn, Wifi, WifiOff } from "lucide-react";
import { BrandLogo } from "./brand-logo";

type WelcomeScreenProps = {
  shopName: string;
  kioskName: string;
  showPreviewLabel: boolean;
  online: boolean;
  onStart: () => void;
  /** False while the page is still hydrating: the buttons are inert until then. */
  ready?: boolean;
  /** A real link, so it works even before the page has hydrated. */
  vendorLoginHref: string;
};

const steps = ["Choose gifts", "Review your cart", "Scan the QR code", "Tap Send in WhatsApp"];

export function WelcomeScreen({
  shopName,
  kioskName,
  showPreviewLabel,
  online,
  onStart,
  vendorLoginHref,
  ready = true,
}: WelcomeScreenProps) {
  return (
    <main className="welcome-screen">
      <header className="welcome-header">
        <div className="welcome-brand">
          <BrandLogo />
          <span className="kiosk-store-identity">
            <strong>{shopName}</strong>
            <small>{kioskName}</small>
          </span>
        </div>
        <div className="welcome-header__actions">
          <div className={`welcome-network ${online ? "" : "offline"}`}>
            {online ? (
              <Wifi size={16} aria-hidden="true" />
            ) : (
              <WifiOff size={16} aria-hidden="true" />
            )}
            <span>{online ? "Online" : "Offline"}</span>
          </div>
        </div>
      </header>

      <div className="welcome-hero">
        <section className="welcome-copy">
          {showPreviewLabel ? <span className="preview-chip">Approval preview</span> : null}
          <h1 className="welcome-title" data-screen-heading tabIndex={-1}>
            Choose a gift. Send the order on WhatsApp.
          </h1>
          <p className="welcome-lede">
            Gifts from {shopName}. Personalisation is confirmed on WhatsApp, and you pay at the
            counter.
          </p>
          <div className="welcome-actions">
            <button className="primary-button" onClick={onStart} disabled={!ready}>
              Start Shopping <ChevronRight size={20} aria-hidden="true" />
            </button>
            {/* No prefetch: staff rarely use it, and on the public kiosk it would
                compete with the first paint (AUD-24). */}
            <Link className="welcome-vendor-link" href={vendorLoginHref} prefetch={false}>
              <LogIn size={16} aria-hidden="true" /> Vendor login
            </Link>
          </div>
        </section>

        <section className="welcome-visual" aria-label="Gifts on display">
          <Image
            src="/art/gift-atelier-hero.png"
            alt="A gift display with a flower keepsake frame, acrylic lamp, gift box, and wooden clock"
            width={1448}
            height={1086}
            sizes="(max-width: 900px) 100vw, 56vw"
            preload
            fetchPriority="high"
          />
        </section>
      </div>

      {/* One compact line: the four steps, then the one promise that matters. */}
      <div className="welcome-strip">
        <nav className="welcome-footer" aria-label="How ordering works">
          <ol className="steps-row">
            {steps.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ol>
        </nav>
        <p className="welcome-assurance">Nothing is sent until you tap Send.</p>
      </div>
      <Link className="welcome-privacy-link" href="/privacy">
        Privacy notice
      </Link>
    </main>
  );
}
