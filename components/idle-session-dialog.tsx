"use client";

import { Clock3, RotateCcw, ShieldCheck } from "lucide-react";
import { useRef } from "react";
import { useModalFocus } from "./use-modal-focus";

type IdleSessionDialogProps = {
  secondsRemaining: number;
  onContinue: () => void;
  onReset: () => void;
};

export function IdleSessionDialog({
  secondsRemaining,
  onContinue,
  onReset,
}: IdleSessionDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  useModalFocus(dialogRef, continueRef, onContinue);

  return (
    <div className="modal-backdrop kiosk-idle-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="modal-panel kiosk-idle-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="kiosk-idle-title"
        aria-describedby="kiosk-idle-description"
        tabIndex={-1}
      >
        <span className="kiosk-idle-icon" aria-hidden="true">
          <Clock3 size={30} />
        </span>
        <p className="kiosk-idle-eyebrow"><ShieldCheck size={15} /> Privacy check</p>
        <h2 id="kiosk-idle-title">Are you still choosing?</h2>
        <p id="kiosk-idle-description">
          This kiosk will clear the cart and customer details in {secondsRemaining} {secondsRemaining === 1 ? "second" : "seconds"}.
        </p>
        <div className="kiosk-idle-actions">
          <button type="button" className="secondary-button" onClick={onReset}>
            <RotateCcw size={18} aria-hidden="true" /> Start over now
          </button>
          <button ref={continueRef} type="button" className="primary-button" onClick={onContinue}>
            Keep my session
          </button>
        </div>
      </section>
    </div>
  );
}
