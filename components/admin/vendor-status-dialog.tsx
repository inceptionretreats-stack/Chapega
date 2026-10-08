"use client";

import { LoaderCircle, PauseCircle, PlayCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  AdminVendorMutationResult,
  AdminVendorSummary,
} from "@/types/admin";
import { adminRequest } from "./admin-client";
import { AdminDialog } from "./admin-dialog";

type VendorStatusDialogProps = {
  vendor: AdminVendorSummary;
  onClose: () => void;
  onSaved: (result: AdminVendorMutationResult) => void;
};

export function VendorStatusDialog({
  vendor,
  onClose,
  onSaved,
}: VendorStatusDialogProps) {
  // Open on the safe action: Cancel, never the destructive confirm.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suspending = vendor.status === "active";

  // The confirm button is disabled while saving, which drops focus; on
  // failure move it to the announced error.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await adminRequest<AdminVendorMutationResult>(
        `/api/admin/vendors/${encodeURIComponent(vendor.id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: suspending ? "suspended" : "active",
            revision: vendor.revision,
          }),
        },
      );
      onSaved(result);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Could not ${suspending ? "suspend" : "reactivate"} this vendor.`,
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <AdminDialog
      title={suspending ? "Suspend vendor" : "Reactivate vendor"}
      description={suspending
        ? `Suspend ${vendor.displayName} and stop new kiosk orders.`
        : `Restore ${vendor.displayName} and allow its team to operate again.`}
      onClose={onClose}
      busy={pending}
      initialFocusRef={cancelRef}
      compact
      role={suspending ? "alertdialog" : "dialog"}
    >
      <div className="admin-confirm-dialog">
        <span className={`admin-confirm-dialog__icon${suspending ? " is-danger" : ""}`} aria-hidden="true">
          {suspending ? <PauseCircle size={28} /> : <PlayCircle size={28} />}
        </span>
        <p>
          {suspending
            ? "Existing products, orders and account history will be preserved. The storefront can be reactivated later."
            : "The vendor storefront and owner access will return immediately."}
        </p>
        {error ? <p ref={errorRef} tabIndex={-1} className="admin-form-error" role="alert">{error}</p> : null}
      </div>
      <footer className="admin-dialog__actions">
        <button ref={cancelRef} className="admin-secondary" type="button" onClick={onClose} disabled={pending}>Cancel</button>
        <button
          className={suspending ? "admin-danger" : "admin-primary"}
          type="button"
          onClick={confirm}
          disabled={pending}
        >
          {pending ? <LoaderCircle className="admin-spin" size={18} /> : suspending ? <PauseCircle size={18} /> : <PlayCircle size={18} />}
          {pending ? "Updating…" : suspending ? `Suspend ${vendor.displayName}` : `Reactivate ${vendor.displayName}`}
        </button>
      </footer>
    </AdminDialog>
  );
}
