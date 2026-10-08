"use client";

import Image from "next/image";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Eye,
  Gift,
  Info,
  MessageCircle,
  NotebookPen,
  PencilLine,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import type { CartLine, CartTotals, CustomerDetails } from "@/types/kiosk";
import { optionalCustomerPhoneError } from "@/domain/customer";
import { formatInr } from "@/domain/money";
import { CheckoutStepper } from "./checkout-stepper";

type CheckoutScreenProps = {
  customer: CustomerDetails;
  cart: readonly CartLine[];
  totals: CartTotals;
  unitCount: number;
  onChange: (patch: Partial<CustomerDetails>) => void;
  onEditSelection: () => void;
  onReview: () => void;
};

export function CheckoutScreen({ customer, cart, totals, unitCount, onChange, onEditSelection, onReview }: CheckoutScreenProps) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const phoneError = optionalCustomerPhoneError(customer.customerPhone);

  return (
    <main className="screen-page narrow checkout-page">
      <CheckoutStepper active={2} />
      <header className="transaction-intro">
        <div className="checkout-intro__heading-row">
          <h1 className="screen-heading" data-screen-heading tabIndex={-1}>A few optional details</h1>
          <div className="checkout-optional-cue">
            <Check size={17} aria-hidden="true" />
            <span>Nothing here is required</span>
          </div>
        </div>
        <p className="screen-subtitle">These help the shop prepare the gift. You can continue without entering personal information.</p>
      </header>
      <div className="checkout-grid">
        <aside className="transaction-summary sticky-summary" aria-label="Order summary">
          <header className="transaction-summary__header">
            <div>
              <h2>Your Gifts</h2>
              <span>{unitCount} {unitCount === 1 ? "item" : "items"}</span>
            </div>
            <div className="checkout-summary__header-actions">
              <button
                type="button"
                className="checkout-summary__toggle"
                aria-expanded={summaryExpanded}
                aria-controls="checkout-order-summary-details"
                onClick={() => setSummaryExpanded((current) => !current)}
              >
                {summaryExpanded ? "Hide summary" : "View summary"}
                <ChevronDown size={17} aria-hidden="true" />
              </button>
              <button type="button" className="text-button checkout-summary__edit" onClick={onEditSelection}>
                <PencilLine size={15} aria-hidden="true" /> Edit selection
              </button>
            </div>
          </header>
          <div
            className={`checkout-summary__collapsible ${summaryExpanded ? "is-open" : ""}`}
            id="checkout-order-summary-details"
          >
            <div className="transaction-summary__body">
              <ul className="transaction-summary__items">
                {cart.map((line) => (
                  <li className="transaction-summary__item" key={line.key}>
                    <span className="transaction-summary__item-image"><Image src={line.productImage} alt="" width={112} height={112} sizes="56px" /></span>
                    <span className="transaction-summary__item-copy"><strong>{line.productName}</strong><small>{line.quantity} {line.quantity === 1 ? "unit" : "units"}</small></span>
                    <b>{formatInr(line.quantity * line.unitPricePaise)}</b>
                  </li>
                ))}
              </ul>
              <div className="transaction-summary__totals">
                <div className="totals-row"><span>Subtotal</span><strong>{formatInr(totals.subtotalPaise)}</strong></div>
                <div className="totals-row"><span>Gift wrapping</span><strong>{formatInr(totals.giftWrapPaise)}</strong></div>
                <div className="totals-row total"><span>Total</span><strong>{formatInr(totals.totalPaise)}</strong></div>
              </div>
            </div>
          </div>
        </aside>
        <form
          className="transaction-primary checkout-form-panel"
          onSubmit={(event) => {
            event.preventDefault();
            setPhoneTouched(true);
            if (phoneError) return;
            onReview();
          }}
        >
          <h2 className="sr-only">Customer and gift details</h2>
          <fieldset className="checkout-form-section">
            <legend className="checkout-form-section__heading">
              <span>Contact details</span>
              <span className="checkout-form-section__optional">Optional</span>
            </legend>
            <p className="checkout-form-section__helper">
              <ShieldCheck size={17} aria-hidden="true" />
              Only share the details you’re comfortable sending to the shop on WhatsApp.
            </p>
            <div className="form-grid">
              <label className="field">
                <span>First name</span>
                <span className="field-control">
                  <UserRound size={18} aria-hidden="true" />
                  <input
                    value={customer.customerName}
                    onChange={(event) => onChange({ customerName: event.target.value.slice(0, 40) })}
                    placeholder="e.g. Rahul"
                    autoComplete="given-name"
                    maxLength={40}
                  />
                </span>
              </label>
              <label className="field">
                <span>Mobile number</span>
                <span className="field-control">
                  <Phone size={18} aria-hidden="true" />
                  <input
                    value={customer.customerPhone}
                    onChange={(event) => {
                      onChange({ customerPhone: event.target.value.slice(0, 20) });
                      setPhoneTouched(true);
                    }}
                    onBlur={() => setPhoneTouched(true)}
                    placeholder="e.g. 98765 43210"
                    inputMode="tel"
                    type="tel"
                    autoComplete="tel"
                    maxLength={20}
                    aria-invalid={phoneTouched && Boolean(phoneError)}
                    aria-describedby={phoneTouched && phoneError ? "customer-phone-error" : undefined}
                  />
                </span>
                {phoneTouched && phoneError ? <small id="customer-phone-error" className="field-error" role="alert">{phoneError}</small> : null}
              </label>
            </div>
          </fieldset>

          <fieldset className="checkout-form-section">
            <legend className="checkout-form-section__heading">
              <span>Gift instructions</span>
              <span className="checkout-form-section__optional">Optional</span>
            </legend>
            <div className="form-grid">
              <label className="field full">
                <span>Gift note</span>
                <span className="field-control field-control--area">
                  <Gift size={18} aria-hidden="true" />
                  <textarea
                    value={customer.giftNote}
                    onChange={(event) => onChange({ giftNote: event.target.value.slice(0, 120) })}
                    placeholder="A short note for the recipient(s)"
                    maxLength={120}
                    aria-describedby="gift-note-count"
                  />
                  <small id="gift-note-count">{customer.giftNote.length}/120</small>
                </span>
              </label>
              <label className="field full">
                <span>Order note</span>
                <span className="field-control field-control--area">
                  <NotebookPen size={18} aria-hidden="true" />
                  <textarea
                    value={customer.orderNote}
                    onChange={(event) => onChange({ orderNote: event.target.value.slice(0, 140) })}
                    placeholder="Anything else we should know?"
                    maxLength={140}
                    aria-describedby="order-note-count"
                  />
                  <small id="order-note-count">{customer.orderNote.length}/140</small>
                </span>
              </label>
            </div>
          </fieldset>

          <div className="payment-card" role="group" aria-label="Payment method: Pay Later or Pay at Counter">
            <span className="payment-card__icon"><CreditCard size={25} aria-hidden="true" /></span>
            <div><h3>Pay Later / Pay at Counter</h3><p>No online payment is collected. Pay when the shop confirms your order.</p></div>
            <span className="selected-check" aria-hidden="true"><Check size={18} /></span>
          </div>

          <div className="checkout-final-actions">
            <div className="checkout-form-actions">
              <button type="submit" className="primary-button">Review Order <ChevronRight size={19} /></button>
              <p><Info size={16} /> You’ll check everything next before sending it to WhatsApp.</p>
            </div>
            <ul className="checkout-trust-row" aria-label="Order assurances">
              <li><CreditCard size={18} aria-hidden="true" /><span>No online payment</span></li>
              <li><Eye size={18} aria-hidden="true" /><span>Review before sending</span></li>
              <li><MessageCircle size={18} aria-hidden="true" /><span>You tap Send in WhatsApp</span></li>
            </ul>
          </div>
        </form>
      </div>
    </main>
  );
}
