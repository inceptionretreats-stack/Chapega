"use client";

import { LoaderCircle, PauseCircle, PlayCircle } from "lucide-react";
import { useRef, useState } from "react";
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
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suspending = vendor.status === "active";

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
      initialFocusRef={confirmRef}
      compact
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
        {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
      </div>
      <footer className="admin-dialog__actions">
        <button className="admin-secondary" type="button" onClick={onClose} disabled={pending}>Cancel</button>
        <button
          ref={confirmRef}
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
