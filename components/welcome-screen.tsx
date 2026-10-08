import Image from "next/image";
import Link from "next/link";
import {
  ChevronRight,
  Gift,
  LogIn,
  MessageCircle,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { BrandLogo } from "./brand-logo";

type WelcomeScreenProps = {
  shopName: string;
  kioskName: string;
  showPreviewLabel: boolean;
  online: boolean;
  onStart: () => void;
  /** False while the page is still hydrating: the buttons are inert until then. */
  ready?: boolean;
  onSettings: () => void;
};

export function WelcomeScreen({ shopName, kioskName, showPreviewLabel, online, onStart, onSettings, ready = true }: WelcomeScreenProps) {
  const steps = [
    { icon: Gift, label: "Choose gifts" },
    { icon: ShoppingBag, label: "Review cart" },
    { icon: QrCode, label: "Scan QR" },
    { icon: MessageCircle, label: "Send on WhatsApp" },
  ];

  return (
    <main className="welcome-screen">
      <header className="welcome-header">
        <div className="welcome-brand">
          <BrandLogo />
          <span className="kiosk-store-identity"><strong>{shopName}</strong><small>{kioskName}</small></span>
        </div>
        <div className="welcome-header__actions">
          <div className={`welcome-network ${online ? "" : "offline"}`}>
            {online ? <Wifi size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
            <span>{online ? "Online" : "Offline"}</span>
          </div>
          <button className="kiosk-vendor-access welcome-settings" onClick={onSettings} aria-label="Vendor login">
            <LogIn size={19} aria-hidden="true" />
            <span>Vendor login</span>
          </button>
        </div>
      </header>

      <div className="welcome-hero">
        <section className="welcome-copy">
          {showPreviewLabel ? <span className="preview-chip">Approval preview</span> : null}
          <h1 className="welcome-title" data-screen-heading tabIndex={-1}>
            Find the <span>Perfect Gift</span>
          </h1>
          <p className="welcome-lede">Choose your gifts from {shopName} and prepare the order on WhatsApp.</p>
          <div className="welcome-actions">
            <button className="primary-button" onClick={onStart} disabled={!ready}>
              Start Shopping <ChevronRight size={20} aria-hidden="true" />
            </button>
            <button className="secondary-button" onClick={onSettings}>
              <LogIn size={18} aria-hidden="true" /> Vendor login
            </button>
          </div>
        </section>

        <section className="welcome-visual" aria-label="Premium gift selection">
          <Image
            src="/art/gift-atelier-hero.png"
            alt="A curated gift display with a flower keepsake frame, acrylic lamp, gift box, and wooden clock"
            width={1448}
            height={1086}
            sizes="(max-width: 900px) 100vw, 56vw"
            preload
            fetchPriority="high"
          />
        </section>
      </div>

      <ul className="welcome-assurance" aria-label="Ordering assurances">
        <li><Sparkles size={18} aria-hidden="true" /><span>Personalisation confirmed on WhatsApp</span></li>
        <li><ShieldCheck size={18} aria-hidden="true" /><span>No online payment</span></li>
        <li><MessageCircle size={18} aria-hidden="true" /><span>Nothing is sent until you tap Send</span></li>
      </ul>

      <nav className="welcome-footer" aria-label="How ordering works">
        <ol className="steps-row">
          {steps.map(({ icon: Icon, label }, index) => (
            <li className={`step-item step-item--${index + 1}`} key={label}>
              <span className="step-item__number" aria-hidden="true">{index + 1}</span>
              <span className="step-item__icon" aria-hidden="true"><Icon size={24} /></span>
              <span className="step-item__label">{label}</span>
            </li>
          ))}
        </ol>
      </nav>
      <Link className="welcome-privacy-link" href="/privacy">Privacy notice</Link>
    </main>
  );
}
