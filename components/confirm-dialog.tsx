"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { useModalFocus } from "./use-modal-focus";

type ConfirmDialogProps = {
  title: string;
  /** What will happen, in plain words. Read out as the dialog description. */
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Accessible confirmation for destructive actions: an alertdialog that opens
 * on the safe choice, closes on Escape, traps Tab and hands focus back to the
 * control that opened it (via useModalFocus). Render it in the same tree as
 * the page (not a portal) so it inherits the surface's colour theme.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  useModalFocus(dialogRef, cancelRef, () => {
    if (!pending) onCancel();
  });

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !pending) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={pending || undefined}
        tabIndex={-1}
      >
        <span className="confirm-dialog__icon" aria-hidden="true">
          <AlertTriangle size={24} />
        </span>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="confirm-dialog__actions">
          <button
            ref={cancelRef}
            className="confirm-dialog__cancel"
            type="button"
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            className="confirm-dialog__confirm"
            type="button"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? <LoaderCircle className="confirm-dialog__spin" size={18} aria-hidden="true" /> : null}
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
