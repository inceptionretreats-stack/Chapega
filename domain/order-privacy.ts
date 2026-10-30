import type { VendorOrder } from "@/types/vendor";

/**
 * Customer details on an order are kept for this long. The same rule runs in
 * Postgres (private.redact_order_personal_data, scheduled daily by migration
 * 20261030120000) and in the local JSON store on every save, and the privacy
 * notice states it.
 */
export const ORDER_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1_000;

/** Must equal the text the SQL function writes. */
export const RETENTION_REDACTION_MESSAGE = "Customer details removed after the retention period.";

export const REQUEST_REDACTION_MESSAGE = "Customer details removed at the customer's request.";

type PrivacyFields = Pick<VendorOrder, "customer" | "whatsappMessage" | "whatsappUrl">;

/** True while the order still carries anything that identifies the customer. */
export function orderHasPersonalData(order: PrivacyFields): boolean {
  const { customerName, customerPhone, giftNote, orderNote } = order.customer;
  return Boolean(
    customerName || customerPhone || giftNote || orderNote || order.whatsappUrl.includes("?"),
  );
}

/** Whether the shop can still see who placed the order. */
export function hasCustomerDetails(order: Pick<VendorOrder, "customer">): boolean {
  const { customerName, customerPhone, giftNote, orderNote } = order.customer;
  return Boolean(customerName || customerPhone || giftNote || orderNote);
}

export function customerDetailsRemoved(order: Pick<VendorOrder, "whatsappMessage">): boolean {
  return (
    order.whatsappMessage === RETENTION_REDACTION_MESSAGE ||
    order.whatsappMessage === REQUEST_REDACTION_MESSAGE
  );
}

/**
 * Finished orders are cleared 30 days after they finished; orders the shop
 * never confirmed are cleared 30 days after they were prepared. Orders still
 * in progress keep their details until they finish.
 */
export function orderIsPastRetention(
  order: Pick<VendorOrder, "status" | "createdAt" | "updatedAt">,
  now = Date.now(),
): boolean {
  const cutoff = now - ORDER_RETENTION_DAYS * DAY_MS;
  if (order.status === "completed" || order.status === "cancelled") {
    return Date.parse(order.updatedAt) < cutoff;
  }
  if (order.status === "prepared") {
    return Date.parse(order.createdAt) < cutoff;
  }
  return false;
}

/** The order without customer details; items, amounts and status stay. */
export function withoutPersonalData<T extends PrivacyFields>(order: T, message: string): T {
  return {
    ...order,
    customer: { customerName: "", customerPhone: "", giftNote: "", orderNote: "" },
    whatsappMessage: message,
    whatsappUrl: order.whatsappUrl.replace(/\?.*$/, ""),
  };
}
