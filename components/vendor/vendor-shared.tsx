import { CheckCircle2, CircleAlert, Clock3, PackageCheck, XCircle } from "lucide-react";
import { VENDOR_ORDER_LABELS } from "@/domain/vendor";
import type { VendorOrderStatus } from "@/types/vendor";

export function VendorOrderStatusBadge({ status }: { status: VendorOrderStatus }) {
  const Icon =
    status === "completed" || status === "ready"
      ? CheckCircle2
      : status === "cancelled"
        ? XCircle
        : status === "prepared"
          ? CircleAlert
          : status === "preparing"
            ? PackageCheck
            : Clock3;
  return (
    <span className={`vendor-status vendor-status--${status}`}>
      <Icon size={14} aria-hidden="true" />
      {VENDOR_ORDER_LABELS[status]}
    </span>
  );
}

/**
 * Move focus to the first field marked invalid inside `root`; when no field is
 * invalid (a non-field failure) fall back to the error summary.
 */
export function focusFirstInvalid(root: ParentNode | null, fallback: HTMLElement | null): void {
  const field = root?.querySelector<HTMLElement>('[aria-invalid="true"]:not(:disabled)');
  (field ?? fallback)?.focus();
}

export function formatVendorDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function relativeVendorTime(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
