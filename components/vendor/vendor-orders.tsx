"use client";

import Image from "next/image";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatInr } from "@/domain/money";
import {
  getNextVendorOrderStatus,
  VENDOR_ORDER_LABELS,
} from "@/domain/vendor";
import type { VendorOrder, VendorOrderStatus } from "@/types/vendor";
import { vendorRequest } from "./vendor-client";
import {
  formatVendorDate,
  relativeVendorTime,
  VendorOrderStatusBadge,
} from "./vendor-shared";

type OrdersProps = {
  apiBase?: string;
  orders: readonly VendorOrder[];
  focusOrderId: string | null;
  onOrderSaved: (order: VendorOrder, message: string) => void;
};

export function VendorOrders({ apiBase = "/api/vendor", orders, focusOrderId, onOrderSaved }: OrdersProps) {
  const [scope, setScope] = useState<"active" | "all">("active");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | VendorOrderStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(focusOrderId);
  const [pending, setPending] = useState(false);
  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusAfterSave, setFocusAfterSave] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const ordersAtSaveRef = useRef<readonly VendorOrder[] | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orders.filter((order) => {
      const active = order.status !== "completed" && order.status !== "cancelled";
      if (scope === "active" && !active) return false;
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      return (
        !normalized ||
        [
          order.orderNumber,
          order.customer.customerName,
          order.customer.customerPhone,
          order.kioskName,
          ...order.items.map((item) => item.name),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized)
      );
    });
  }, [orders, query, scope, statusFilter]);

  const selected =
    filtered.find((order) => order.id === selectedId) ?? filtered[0] ?? null;
  const nextStatus = selected ? getNextVendorOrderStatus(selected.status) : null;
  const confirmingSelectedCancellation = Boolean(
    selected && confirmCancelOrderId === selected.id,
  );

  // Escape backs out of the inline cancellation confirmation and returns
  // focus to the button that started it.
  useEffect(() => {
    if (!confirmCancelOrderId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setConfirmCancelOrderId(null);
      window.requestAnimationFrame(() => cancelButtonRef.current?.focus());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmCancelOrderId]);

  // The action button that was clicked is disabled (or removed) while saving,
  // which drops focus to <body>. Land on the order detail once the saved order
  // arrives, or on the list heading if no detail remains.
  useEffect(() => {
    if (!focusAfterSave) return;
    (detailHeadingRef.current ?? listHeadingRef.current)?.focus();
    if (ordersAtSaveRef.current !== orders) setFocusAfterSave(false);
  }, [focusAfterSave, orders]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const transition = async (status: VendorOrderStatus) => {
    if (!selected || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await vendorRequest<{ order: VendorOrder }>(`${apiBase}/orders/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status, version: selected.version }),
      });
      ordersAtSaveRef.current = orders;
      onOrderSaved(
        result.order,
        `Order ${selected.orderNumber} is now ${VENDOR_ORDER_LABELS[status].toLowerCase()}.`,
      );
      setConfirmCancelOrderId(null);
      setFocusAfterSave(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The order could not be updated.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="vendor-workspace vendor-orders-view">
      <section className="vendor-order-controls" aria-label="Order filters">
        <div className="vendor-segmented" role="group" aria-label="Order scope">
          <button type="button" className={scope === "active" ? "is-selected" : ""} onClick={() => { setScope("active"); setConfirmCancelOrderId(null); }} aria-pressed={scope === "active"}>Active <span>{orders.filter((order) => order.status !== "completed" && order.status !== "cancelled").length}</span></button>
          <button type="button" className={scope === "all" ? "is-selected" : ""} onClick={() => { setScope("all"); setConfirmCancelOrderId(null); }} aria-pressed={scope === "all"}>All orders <span>{orders.length}</span></button>
        </div>
        <label className="vendor-search-field"><Search size={18} /><span className="sr-only">Search orders</span><input value={query} onChange={(event) => { setQuery(event.target.value); setConfirmCancelOrderId(null); }} placeholder="Search number, customer, or gift" /></label>
        <label className="vendor-select-field"><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as "all" | VendorOrderStatus); setConfirmCancelOrderId(null); }}><option value="all">All statuses</option>{Object.entries(VENDOR_ORDER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={17} /></label>
      </section>

      {error ? <div ref={errorRef} tabIndex={-1} className="vendor-inline-error" role="alert">{error}</div> : null}

      <div className={`vendor-orders-grid${selected ? " has-selection" : ""}`}>
        <section className="vendor-panel vendor-order-list" aria-labelledby="order-list-title">
          <header className="vendor-panel-header"><div><h2 id="order-list-title" ref={listHeadingRef} tabIndex={-1}>{scope === "active" ? "Active queue" : "Order history"}</h2><p>{filtered.length} {filtered.length === 1 ? "order" : "orders"} in this view</p></div></header>
          {filtered.length ? (
            <ul>
              {filtered.map((order) => (
                <li key={order.id}>
                  <button type="button" className={selected?.id === order.id ? "is-selected" : ""} onClick={() => { setSelectedId(order.id); setConfirmCancelOrderId(null); }} aria-pressed={selected?.id === order.id}>
                    <span className="vendor-order-list-main"><strong>{order.orderNumber}</strong><small suppressHydrationWarning>{relativeVendorTime(order.createdAt)} · {order.kioskName}</small></span>
                    <span className="vendor-order-list-customer"><strong>{order.customer.customerName || "Walk-in customer"}</strong><small>{order.items.reduce((total, item) => total + item.quantity, 0)} items · {formatInr(order.totalPaise)}</small></span>
                    <VendorOrderStatusBadge status={order.status} />
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="vendor-panel-empty"><span><ShoppingBag size={26} /></span><div><strong>No orders here yet</strong><p>Adjust the filters, or prepare a test order on the kiosk.</p></div></div>
          )}
        </section>

        {selected ? (
          <aside className="vendor-panel vendor-order-detail" aria-labelledby="order-detail-title">
            <header className="vendor-order-detail-header">
              <div><p>Order detail</p><h2 id="order-detail-title" ref={detailHeadingRef} tabIndex={-1}>{selected.orderNumber}</h2><span>{formatVendorDate(selected.createdAt)} · {selected.kioskName}</span></div>
              <VendorOrderStatusBadge status={selected.status} />
            </header>

            {selected.status === "prepared" ? (
              <div className="vendor-order-caution"><CircleAlert size={19} /><p><strong>Prepared does not mean sent.</strong> Confirm only after the customer’s WhatsApp message reaches the shop.</p></div>
            ) : null}

            <section className="vendor-order-customer" aria-labelledby="customer-title">
              <div><p id="customer-title">Customer</p><strong>{selected.customer.customerName || "Walk-in customer"}</strong>{selected.customer.customerPhone ? <span>{selected.customer.customerPhone}</span> : <span>No phone supplied</span>}</div>
              <a className="vendor-secondary vendor-icon-action" href={selected.whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Open prepared WhatsApp conversation"><MessageCircle size={18} /><ExternalLink size={15} /></a>
            </section>

            <section className="vendor-order-items" aria-labelledby="order-items-title">
              <p id="order-items-title">Items</p>
              <ul>
                {selected.items.map((item, index) => (
                  <li key={`${item.productId}-${item.variantId ?? "default"}-${index}`}>
                    <Image src={item.image} alt="" width={58} height={58} sizes="58px" />
                    <div><strong>{item.name}</strong><span>{item.variant ? `${item.variant} · ` : ""}Qty {item.quantity}{item.giftWrapped ? " · Gift wrapped" : ""}</span></div>
                    <strong>{formatInr(item.lineTotalPaise)}</strong>
                  </li>
                ))}
              </ul>
              <dl className="vendor-order-totals">
                <div><dt>Subtotal</dt><dd>{formatInr(selected.subtotalPaise)}</dd></div>
                <div><dt>Gift wrapping</dt><dd>{formatInr(selected.giftWrapPaise)}</dd></div>
                <div><dt>Total</dt><dd>{formatInr(selected.totalPaise)}</dd></div>
              </dl>
            </section>

            {selected.customer.giftNote || selected.customer.orderNote ? (
              <section className="vendor-order-notes" aria-label="Customer notes">
                {selected.customer.giftNote ? <div><p>Gift note</p><blockquote>{selected.customer.giftNote}</blockquote></div> : null}
                {selected.customer.orderNote ? <div><p>Order note</p><blockquote>{selected.customer.orderNote}</blockquote></div> : null}
              </section>
            ) : null}

            <section className="vendor-order-timeline" aria-labelledby="order-timeline-title">
              <p id="order-timeline-title">Timeline</p>
              <ol>
                {[...selected.events].reverse().map((event) => (
                  <li key={event.id}><i aria-hidden="true" /><div><strong>{VENDOR_ORDER_LABELS[event.to]}</strong><span>{event.actorName} · {formatVendorDate(event.createdAt)}</span>{event.note ? <small>{event.note}</small> : null}</div></li>
                ))}
              </ol>
            </section>

            {nextStatus || (selected.status !== "completed" && selected.status !== "cancelled") ? (
              <footer className="vendor-order-actions">
                {nextStatus ? (
                  <button className="vendor-primary" type="button" onClick={() => transition(nextStatus)} disabled={pending}>
                    {pending ? <LoaderCircle className="vendor-spin" size={18} /> : <Check size={18} />}
                    {pending ? "Updating…" : nextStatus === "confirmed" ? "Confirm order" : `Mark as ${VENDOR_ORDER_LABELS[nextStatus].toLowerCase()}`}
                  </button>
                ) : null}
                {confirmingSelectedCancellation ? (
                  <p id="vendor-cancel-consequence" className="vendor-field-help">
                    {selected.inventoryCommitted
                      ? "Cancelling restores this order’s stock to the catalogue and cannot be undone. Press Escape to keep the order."
                      : "No stock was reserved for this order. Cancelling cannot be undone. Press Escape to keep the order."}
                  </p>
                ) : null}
                <button ref={cancelButtonRef} className={confirmingSelectedCancellation ? "vendor-danger" : "vendor-quiet"} type="button" onClick={() => confirmingSelectedCancellation ? transition("cancelled") : setConfirmCancelOrderId(selected.id)} disabled={pending} aria-describedby={confirmingSelectedCancellation ? "vendor-cancel-consequence" : undefined}>
                  <X size={17} /> {confirmingSelectedCancellation ? "Confirm cancellation" : "Cancel order"}
                </button>
              </footer>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
