"use client";

import { Check, CreditCard, Info } from "lucide-react";
import type { CartTotals, CustomerDetails } from "@/types/kiosk";
import { formatInr } from "@/domain/money";
import { CheckoutStepper } from "./checkout-stepper";

type CheckoutScreenProps = {
  customer: CustomerDetails;
  totals: CartTotals;
  unitCount: number;
  onChange: (patch: Partial<CustomerDetails>) => void;
  onReview: () => void;
};

export function CheckoutScreen({ customer, totals, unitCount, onChange, onReview }: CheckoutScreenProps) {
  return (
    <main className="screen-page narrow">
      <CheckoutStepper active={2} />
      <h1 className="screen-heading">A few optional details</h1>
      <p className="screen-subtitle">These help the shop prepare the gift. You can continue without entering personal information.</p>
      <div className="checkout-grid">
        <section className="surface-panel panel-padding">
          <h2 className="panel-title">Customer and gift details</h2>
          <div className="form-grid">
            <label className="field"><span>First name · optional</span><input value={customer.customerName} onChange={(e) => onChange({ customerName: e.target.value.slice(0, 40) })} placeholder="e.g. Rahul" autoComplete="given-name" /></label>
            <label className="field"><span>Mobile · optional</span><input value={customer.customerPhone} onChange={(e) => onChange({ customerPhone: e.target.value.slice(0, 20) })} placeholder="For staff reference only" inputMode="tel" autoComplete="tel" /><small>The QR works without this number.</small></label>
            <label className="field full"><span>Gift note · optional</span><textarea value={customer.giftNote} onChange={(e) => onChange({ giftNote: e.target.value.slice(0, 120) })} placeholder="A short note to include with the gift" /></label>
            <label className="field full"><span>Order note · optional</span><textarea value={customer.orderNote} onChange={(e) => onChange({ orderNote: e.target.value.slice(0, 140) })} placeholder="Color preference, collection timing, or another request" /></label>
          </div>
          <div className="payment-card">
            <span className="payment-card__icon"><CreditCard size={25} /></span>
            <div><h3>Pay Later / Pay at Counter</h3><p>Reserve your selected gifts now and pay after the shop confirms availability.</p></div>
            <span className="selected-check"><Check size={18} /></span>
          </div>
          <div className="notice" style={{ marginTop: 18 }}><Info size={18} /><span>This kiosk does not collect online payment. Your order is prepared for the shop through WhatsApp.</span></div>
        </section>
        <aside className="surface-panel panel-padding sticky-summary">
          <h2 className="panel-title">Ready to review</h2>
          <div className="totals-row"><span>Gift units</span><strong>{unitCount}</strong></div>
          <div className="totals-row total"><span>Total</span><strong>{formatInr(totals.totalPaise)}</strong></div>
          <p className="screen-subtitle">Nothing is charged now. The shop will confirm availability in WhatsApp.</p>
          <button className="primary-button" style={{ width: "100%", marginTop: 22 }} onClick={onReview}>Review Order</button>
        </aside>
      </div>
    </main>
  );
}
