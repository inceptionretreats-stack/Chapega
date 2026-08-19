import Image from "next/image";
import {
  ChevronRight,
  ClipboardCheck,
  Gift,
  QrCode,
  Send,
  Settings,
  Wifi,
  WifiOff,
} from "lucide-react";
import { BrandLogo } from "./brand-logo";

type WelcomeScreenProps = {
  showPreviewLabel: boolean;
  ownerConfigured: boolean;
  online: boolean;
  onStart: () => void;
  onSettings: () => void;
};

export function WelcomeScreen({ showPreviewLabel, ownerConfigured, online, onStart, onSettings }: WelcomeScreenProps) {
  const steps = [
    { icon: Gift, label: "Choose gifts" },
    { icon: ClipboardCheck, label: "Review cart" },
    { icon: QrCode, label: "Scan QR" },
    { icon: Send, label: "Send on WhatsApp" },
  ];

  return (
    <main className="welcome-screen">
      <section className="welcome-copy">
        <div className="welcome-brand"><BrandLogo /></div>
        <div className={`welcome-network ${online ? "" : "offline"}`}>{online ? <Wifi size={16} /> : <WifiOff size={16} />}<span>{online ? "Online" : "Offline"}</span></div>
        {showPreviewLabel ? <span className="preview-chip">Approval preview</span> : null}
        <h1 className="welcome-title">Find the Perfect Gift</h1>
        <div className="ribbon-rule" aria-hidden="true"><Gift size={18} /></div>
        <p className="welcome-lede">Choose up to 5 gifts and send your order to us on WhatsApp.</p>
        <div className="welcome-actions">
          <button className="primary-button" onClick={onStart}>Start Shopping <ChevronRight size={20} /></button>
          {!ownerConfigured ? (
            <button className="secondary-button" onClick={onSettings}><Settings size={18} /> Add WhatsApp number</button>
          ) : null}
        </div>
      </section>
      <section className="welcome-visual" aria-label="Premium gift selection">
        <Image src="/products/full-varmala-preservation-25x26.jpeg" alt="A personalized wedding garland preservation frame" width={720} height={983} priority />
        <button className="icon-button welcome-settings" onClick={onSettings} aria-label="Presenter settings"><Settings size={22} /></button>
        <div className="welcome-footer">
          <div className="steps-row">
            {steps.map(({ icon: Icon, label }) => <div className="step-item" key={label}><Icon size={20} /> {label}</div>)}
          </div>
        </div>
      </section>
    </main>
  );
}
