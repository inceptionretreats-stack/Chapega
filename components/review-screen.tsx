import Image from "next/image";
import { AlertCircle, LoaderCircle, MessageCircle, ShieldCheck } from "lucide-react";
import { formatInr } from "@/domain/money";
import { maskWhatsAppNumber } from "@/domain/whatsapp";
import type { CartLine, CartTotals, CustomerDetails, PresenterSettings } from "@/types/kiosk";
import { CheckoutStepper } from "./checkout-stepper";

type ReviewScreenProps = {
  cart: readonly CartLine[];
  totals: CartTotals;
  customer: CustomerDetails;
  settings: PresenterSettings;
  creating: boolean;
  onEdit: () => void;
  onCreateOrder: () => void;
  onOpenSettings: () => void;
};

export function ReviewScreen({ cart, totals, customer, settings, creating, onEdit, onCreateOrder, onOpenSettings }: ReviewScreenProps) {
  const numberConfigured = Boolean(settings.ownerWhatsAppNumber.trim());
  return (
    <main className="screen-page narrow">
      <CheckoutStepper active={3} />
      <h1 className="screen-heading">Review before creating the QR</h1>
      <p className="screen-subtitle">We’ll use this exact selection to prepare your WhatsApp message.</p>
      <div className="review-grid">
        <section className="surface-panel panel-padding">
          <h2 className="panel-title">Selected gifts</h2>
          <ul className="review-items">
            {cart.map((line) => (
              <li className="review-item" key={line.key}>
                <Image src={line.productImage} alt="" width={132} height={132} />
                <div><h3>{line.productName}</h3><p>{line.variantName ? `${line.variantName} · ` : ""}{line.quantity} × {formatInr(line.unitPricePaise)}{line.giftWrapped ? " · Gift wrapped" : ""}</p></div>
                <strong>{formatInr(line.quantity * line.unitPricePaise)}</strong>
              </li>
            ))}
          </ul>
          {customer.customerName || customer.giftNote || customer.orderNote ? (
            <dl className="summary-list" style={{ marginTop: 18 }}>
              {customer.customerName ? <div><dt>Customer</dt><dd>{customer.customerName}</dd></div> : null}
              {customer.giftNote ? <div><dt>Gift note</dt><dd>{customer.giftNote}</dd></div> : null}
              {customer.orderNote ? <div><dt>Order note</dt><dd>{customer.orderNote}</dd></div> : null}
            </dl>
          ) : null}
        </section>
        <aside className="surface-panel panel-padding sticky-summary">
          <h2 className="panel-title">Final total</h2>
          <div className="totals-row"><span>Subtotal</span><strong>{formatInr(totals.subtotalPaise)}</strong></div>
          <div className="totals-row"><span>Gift wrapping</span><strong>{formatInr(totals.giftWrapPaise)}</strong></div>
          <div className="totals-row total"><span>Total</span><strong>{formatInr(totals.totalPaise)}</strong></div>
          <dl className="summary-list" style={{ marginTop: 12 }}>
            <div><dt>Payment</dt><dd>Pay at Counter</dd></div>
            <div><dt>Kiosk</dt><dd>{settings.kioskName}</dd></div>
            <div><dt>Destination</dt><dd>{numberConfigured ? `${settings.shopName} WhatsApp ${maskWhatsAppNumber(settings.ownerWhatsAppNumber)}` : "Not configured"}</dd></div>
          </dl>
          {numberConfigured ? (
            <div className="success-notice" style={{ marginTop: 18 }}><ShieldCheck size={18} /><span>The QR and Open WhatsApp button will use the same prepared order link.</span></div>
          ) : (
            <div className="error-notice" style={{ marginTop: 18 }}><AlertCircle size={18} /><span>The shop WhatsApp number has not been configured. Open Presenter Settings to continue.</span></div>
          )}
          <button className="primary-button" style={{ width: "100%", marginTop: 20 }} disabled={creating || !numberConfigured} onClick={onCreateOrder}>
            {creating ? <LoaderCircle size={19} className="loading-mark" /> : <MessageCircle size={19} />}
            {creating ? "Preparing order…" : "Create Order & Show QR"}
          </button>
          {!numberConfigured ? <button className="secondary-button" style={{ width: "100%", marginTop: 10 }} onClick={onOpenSettings}>Open Presenter Settings</button> : null}
          <button className="text-button" style={{ width: "100%", marginTop: 8 }} onClick={onEdit}>Back to edit</button>
        </aside>
      </div>
    </main>
  );
}
