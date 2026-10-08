"use client";

import Image from "next/image";
import { MessageCircle, ShieldCheck, X } from "lucide-react";
import { useRef, useState } from "react";
import type { PresenterSettings } from "@/types/kiosk";
import { useModalFocus } from "./use-modal-focus";

type SetupModalProps = {
  settings: PresenterSettings;
  onSave: (patch: Partial<PresenterSettings>) => string | null;
  onSkip: () => void;
};

export function SetupModal({ settings, onSave, onSkip }: SetupModalProps) {
  const [shopName, setShopName] = useState(settings.shopName);
  const [number, setNumber] = useState(settings.ownerWhatsAppNumber);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const initialFocusRef = useRef<HTMLInputElement>(null);

  useModalFocus(dialogRef, initialFocusRef, onSkip);

  const save = () => {
    const result = onSave({ shopName, ownerWhatsAppNumber: number });
    setError(result);
  };

  return (
    <div className="modal-backdrop">
      <section ref={dialogRef} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="setup-title" tabIndex={-1}>
        <button className="icon-button modal-close" onClick={onSkip} aria-label="Continue without a number"><X size={21} /></button>
        <div className="setup-modal">
          <div className="setup-modal__visual"><Image src="/generated-products/full-varmala-preservation-25x26.png" alt="Personalized wedding keepsake" width={1448} height={1086} sizes="(max-width: 900px) 100vw, 310px" loading="eager" /></div>
          <div className="setup-modal__content">
            <MessageCircle size={34} color="#7A263A" />
            <h2 id="setup-title">Connect the shop WhatsApp</h2>
            <p>Add the owner’s number now, or continue with the catalogue and add it later. No message is sent by this setup.</p>
            <div className="form-grid">
              <label className="field full"><span>Shop name</span><input ref={initialFocusRef} value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Chapega.com" /></label>
              <label className="field full"><span>Owner WhatsApp number</span><input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="9876543210" inputMode="tel" /><small>Indian 10-digit numbers are saved with country code 91.</small></label>
            </div>
            {error ? <div className="error-notice" style={{ marginTop: 14 }} role="alert">{error}</div> : null}
            <div className="success-notice" style={{ marginTop: 14 }}><ShieldCheck size={17} /><span>The public kiosk masks this number. You can change it anytime in Presenter Settings.</span></div>
            <div className="setup-modal__actions">
              <button className="primary-button" onClick={save}>Save WhatsApp setup</button>
              <button className="text-button" onClick={onSkip}>I’ll add it later</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
