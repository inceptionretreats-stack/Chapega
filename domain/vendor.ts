import type { VendorOrderStatus } from "@/types/vendor";

export const VENDOR_ORDER_SEQUENCE: readonly VendorOrderStatus[] =
  Object.freeze([
    "prepared",
    "confirmed",
    "preparing",
    "ready",
    "completed",
  ]);

export const VENDOR_ORDER_LABELS: Readonly<
  Record<VendorOrderStatus, string>
> = Object.freeze({
  prepared: "Prepared on kiosk",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
});

export function getNextVendorOrderStatus(
  status: VendorOrderStatus,
): VendorOrderStatus | null {
  const index = VENDOR_ORDER_SEQUENCE.indexOf(status);
  if (index < 0 || index >= VENDOR_ORDER_SEQUENCE.length - 1) {
    return null;
  }
  return VENDOR_ORDER_SEQUENCE[index + 1];
}

export function canTransitionVendorOrder(
  from: VendorOrderStatus,
  to: VendorOrderStatus,
): boolean {
  if (from === "completed" || from === "cancelled" || from === to) {
    return false;
  }
  if (to === "cancelled") {
    return true;
  }
  return getNextVendorOrderStatus(from) === to;
}
