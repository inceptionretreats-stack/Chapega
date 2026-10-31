"use client";

import { X } from "lucide-react";
import { useId, useRef, type ReactNode, type RefObject } from "react";
import { useModalFocus } from "../use-modal-focus";

type VendorFormDialogProps = {
  title: string;
  description?: ReactNode;
  /** Usually the first field. On touch screens the dialog itself is focused instead. */
  initialFocusRef: RefObject<HTMLElement | null>;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * A Studio dialog that holds a form (change password, add a team member, set
 * a temporary password). Same focus rules as ConfirmDialog: Tab stays inside,
 * Escape closes unless busy, and focus returns to the control that opened it.
 */
export function VendorFormDialog({
  title,
  description,
  initialFocusRef,
  busy = false,
  onClose,
  children,
}: VendorFormDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  useModalFocus(dialogRef, initialFocusRef, () => {
    if (!busy) onClose();
  });

  return (
    <div
      className="vendor-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="vendor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <header className="vendor-dialog__header">
          <h2 id={titleId}>{title}</h2>
          <button
            className="vendor-dialog__close"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>
        {description ? (
          <p id={descriptionId} className="vendor-dialog__description">
            {description}
          </p>
        ) : null}
        {children}
      </section>
    </div>
  );
}
