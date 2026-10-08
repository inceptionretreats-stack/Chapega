"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

type AdminDialogProps = {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  compact?: boolean;
  /** "alertdialog" for confirmations of destructive actions. */
  role?: "dialog" | "alertdialog";
};

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function AdminDialog({
  title,
  description,
  children,
  onClose,
  busy = false,
  initialFocusRef,
  compact = false,
  role = "dialog",
}: AdminDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  const titleId = `admin-dialog-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const descriptionId = `${titleId}-description`;

  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  }, [busy, onClose]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      initialFocusRef?.current?.focus();
      if (!initialFocusRef?.current) closeRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = priorOverflow;
      window.requestAnimationFrame(() => {
        const opener = returnFocusRef.current;
        // If the opener was removed (the list re-rendered), land on the main
        // region instead of letting focus fall back to <body>.
        if (opener?.isConnected) opener.focus();
        else document.getElementById("admin-main")?.focus();
      });
    };
  }, [initialFocusRef]);

  return (
    <div
      className="admin-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`admin-dialog${compact ? " admin-dialog--compact" : ""}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        tabIndex={-1}
      >
        {/* A div, not <header>: inside a dialog a header is a second banner landmark. */}
        <div className="admin-dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button
            ref={closeRef}
            className="admin-icon-button"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={`Close ${title.toLowerCase()}`}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
