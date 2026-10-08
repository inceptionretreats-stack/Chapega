import Image from "next/image";
import { AlertCircle, LoaderCircle, MessageCircle, ShieldCheck } from "lucide-react";
import { formatInr } from "@/domain/money";
import { maskWhatsAppNumber } from "@/domain/whatsapp";
import type { CartLine, CartTotals, CustomerDetails, PresenterSettings } from "@/types/kiosk";
import { CheckoutStepper, HandoffStatusRail } from "./checkout-stepper";

type ReviewScreenProps = {
  cart: readonly CartLine[];
  totals: CartTotals;
  customer: CustomerDetails;
  settings: PresenterSettings;
  creating: boolean;
  onEditGifts: () => void;
  onEditDetails: () => void;
  onCreateOrder: () => void;
  onOpenSettings: () => void;
};

export function ReviewScreen({
  cart,
  totals,
  customer,
  settings,
  creating,
  onEditGifts,
  onEditDetails,
  onCreateOrder,
  onOpenSettings,
}: ReviewScreenProps) {
  const numberConfigured = Boolean(settings.ownerWhatsAppNumber.trim());
  return (
    <main className="screen-page narrow review-page">
      <CheckoutStepper active={3} />
      <header className="transaction-intro">
        <h1 className="screen-heading" data-screen-heading tabIndex={-1}>
          Review before creating the QR
        </h1>
        <p className="screen-subtitle">
          We’ll use this exact selection to prepare your WhatsApp message.
        </p>
      </header>
      <HandoffStatusRail active={1} />
      <div className="review-grid">
        <section
          className="transaction-primary review-selection"
          aria-labelledby="selected-gifts-heading"
        >
          <h2 className="panel-title" id="selected-gifts-heading">
            Selected gifts
          </h2>
          <ul className="review-items">
            {cart.map((line) => (
              <li className="review-item" key={line.key}>
                <div className="review-item__image">
                  <Image src={line.productImage} alt="" width={132} height={132} sizes="66px" />
                </div>
                <div>
                  <h3>{line.productName}</h3>
                  <p>
                    {line.variantName ? `${line.variantName} · ` : ""}
                    {line.quantity} × {formatInr(line.unitPricePaise)}
                    {line.giftWrapped ? " · Gift wrapped" : ""}
                  </p>
                </div>
                <strong>{formatInr(line.quantity * line.unitPricePaise)}</strong>
              </li>
            ))}
          </ul>
          <dl className="summary-list review-customer-details">
            {customer.customerName ? (
              <div>
                <dt>Customer</dt>
                <dd>{customer.customerName}</dd>
              </div>
            ) : null}
            {customer.customerPhone ? (
              <div>
                <dt>Mobile</dt>
                <dd>{customer.customerPhone}</dd>
              </div>
            ) : null}
            <div>
              <dt>Gift note</dt>
              <dd>{customer.giftNote || "No gift note added"}</dd>
            </div>
            <div>
              <dt>Order note</dt>
              <dd>{customer.orderNote || "No order note added"}</dd>
            </div>
          </dl>
        </section>
        <aside
          className="transaction-summary sticky-summary"
          aria-label="Final total and order destination"
        >
          <header className="transaction-summary__header">
            <h2 className="panel-title">Final total</h2>
          </header>
          <div className="transaction-summary__body">
            <div className="transaction-summary__totals">
              <div className="totals-row">
                <span>Subtotal</span>
                <strong>{formatInr(totals.subtotalPaise)}</strong>
              </div>
              <div className="totals-row">
                <span>Gift wrapping</span>
                <strong>{formatInr(totals.giftWrapPaise)}</strong>
              </div>
              <div className="totals-row total">
                <span>Total</span>
                <strong>{formatInr(totals.totalPaise)}</strong>
              </div>
            </div>
            <dl className="summary-list transaction-summary__details">
              <div>
                <dt>Payment</dt>
                <dd>Pay at Counter</dd>
              </div>
              <div>
                <dt>Kiosk</dt>
                <dd>{settings.kioskName}</dd>
              </div>
              <div>
                <dt>Destination</dt>
                <dd>
                  {numberConfigured
                    ? `${settings.shopName} WhatsApp ${maskWhatsAppNumber(settings.ownerWhatsAppNumber)}`
                    : "Not configured"}
                </dd>
              </div>
            </dl>
            <div className="notice transaction-summary__notice">
              <MessageCircle size={18} />
              <span>
                <strong>Nothing has been sent yet.</strong> Preparing the QR only creates the exact
                message for you to review and send in WhatsApp.
              </span>
            </div>
            {numberConfigured ? (
              <div className="success-notice transaction-summary__notice">
                <ShieldCheck size={18} />
                <span>The QR and Open WhatsApp button will use the same prepared order link.</span>
              </div>
            ) : (
              <div className="error-notice transaction-summary__notice">
                <AlertCircle size={18} />
                <span>
                  The shop WhatsApp number has not been configured. Ask the vendor to sign in and
                  update Shop settings.
                </span>
              </div>
            )}
          </div>
          <div className="transaction-summary__actions">
            <button
              className="primary-button"
              disabled={creating || !numberConfigured}
              onClick={onCreateOrder}
            >
              {creating ? (
                <LoaderCircle size={19} className="loading-mark" />
              ) : (
                <MessageCircle size={19} />
              )}
              {creating ? "Preparing WhatsApp QR…" : "Prepare WhatsApp QR"}
            </button>
            {!numberConfigured ? (
              <button className="secondary-button" onClick={onOpenSettings}>
                Vendor sign in
              </button>
            ) : null}
            <button className="text-button" onClick={onEditDetails}>
              Edit customer details
            </button>
            <button className="text-button" onClick={onEditGifts}>
              Edit gifts
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
