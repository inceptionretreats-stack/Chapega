"use client";

import Image from "next/image";
import { Gift, Minus, PackageOpen, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { formatInr } from "@/domain/money";
import type { CartLine, CartTotals, Product } from "@/types/kiosk";
import { CheckoutStepper } from "./checkout-stepper";

type CartScreenProps = {
  cart: readonly CartLine[];
  products: readonly Product[];
  unitCount: number;
  maxUnits: number;
  totals: CartTotals;
  giftWrapFeePaise: number;
  onQuantityChange: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onToggleWrap: (key: string) => void;
  onContinueShopping: () => void;
  onCheckout: () => void;
};

export function CartScreen({
  cart,
  products,
  unitCount,
  maxUnits,
  totals,
  giftWrapFeePaise,
  onQuantityChange,
  onRemove,
  onToggleWrap,
  onContinueShopping,
  onCheckout,
}: CartScreenProps) {
  if (!cart.length) {
    return (
      <main className="screen-page narrow cart-page">
        <CheckoutStepper active={1} />
        <div className="empty-state">
          <PackageOpen size={46} />
          <div>
            <h2 data-screen-heading tabIndex={-1}>Your cart is empty</h2>
            <p>Add at least one thoughtful gift before continuing to Pay Later.</p>
            <button className="primary-button" onClick={onContinueShopping}>Browse gifts</button>
          </div>
        </div>
      </main>
    );
  }

  const remainingUnits = Math.max(0, maxUnits - unitCount);
  const capacityPercentage = maxUnits > 0 ? Math.min(100, (unitCount / maxUnits) * 100) : 0;

  return (
    <main className="screen-page narrow cart-page">
      <CheckoutStepper active={1} />
      <header className="transaction-intro">
        <h1 className="screen-heading" data-screen-heading tabIndex={-1}>Review your gifts</h1>
        <p className="screen-subtitle">Adjust quantities, add wrapping, and check your total before continuing.</p>
      </header>
      <div className="checkout-grid">
        <section className="transaction-primary cart-workspace" aria-labelledby="cart-selection-heading">
          <h2 className="sr-only" id="cart-selection-heading">Selected gifts</h2>
          <div className="capacity-meter">
            <div className="capacity-meter__label">
              <span>{unitCount} of {maxUnits} gifts selected</span>
              <span>{remainingUnits} remaining</span>
            </div>
            <div
              className="capacity-meter__track"
              role="progressbar"
              aria-label="Cart capacity"
              aria-valuemin={0}
              aria-valuemax={maxUnits}
              aria-valuenow={unitCount}
            >
              <div className="capacity-meter__fill" style={{ width: `${capacityPercentage}%` }} />
            </div>
          </div>
          <div className="cart-list">
            {cart.map((line) => {
              const product = products.find((item) => item.id === line.productId);
              const lineTotal = line.unitPricePaise * line.quantity + (line.giftWrapped ? giftWrapFeePaise * line.quantity : 0);
              return (
                <article className="cart-line" key={line.key}>
                  <div className="cart-line__image"><Image src={line.productImage} alt={line.productName} width={236} height={236} sizes="118px" /></div>
                  <div className="cart-line__content">
                    <h3>{line.productName}</h3>
                    {line.variantName ? <p>Style: {line.variantName}</p> : null}
                    <p>Unit price: {formatInr(line.unitPricePaise)}</p>
                    <div className="cart-line__actions">
                      <div className="quantity-control" aria-label={`Quantity for ${line.productName}`}>
                        <button onClick={() => onQuantityChange(line.key, line.quantity - 1)} aria-label="Decrease quantity"><Minus size={15} /></button>
                        <span>{line.quantity}</span>
                        <button onClick={() => onQuantityChange(line.key, line.quantity + 1)} disabled={unitCount >= maxUnits || line.quantity >= line.stockLimit} aria-label="Increase quantity"><Plus size={15} /></button>
                      </div>
                      {product?.giftWrapEligible ? (
                        <button className={`wrap-toggle ${line.giftWrapped ? "active" : ""}`} onClick={() => onToggleWrap(line.key)} aria-pressed={line.giftWrapped}>
                          <Gift size={16} /> {line.giftWrapped ? `Wrapped · ${formatInr(giftWrapFeePaise)} each` : "Add gift wrap"}
                        </button>
                      ) : null}
                      <button className="text-button" onClick={() => onRemove(line.key)} aria-label={`Remove ${line.productName}`}><Trash2 size={16} /> Remove</button>
                    </div>
                  </div>
                  <div className="cart-line__price"><strong>{formatInr(lineTotal)}</strong></div>
                </article>
              );
            })}
          </div>
        </section>
        <aside className="transaction-summary sticky-summary" aria-label="Order summary">
          <header className="transaction-summary__header">
            <div>
              <h2 className="panel-title">Order summary</h2>
              <p>{unitCount} gift {unitCount === 1 ? "unit" : "units"} in this order</p>
            </div>
            <span className="transaction-summary__icon" aria-hidden="true"><ShoppingBag size={20} /></span>
          </header>
          <div className="transaction-summary__body">
            <div className="transaction-summary__totals">
              <div className="totals-row"><span>Subtotal</span><strong>{formatInr(totals.subtotalPaise)}</strong></div>
              <div className="totals-row"><span>Gift wrapping</span><strong>{formatInr(totals.giftWrapPaise)}</strong></div>
              <div className="totals-row total"><span>Grand total</span><strong>{formatInr(totals.totalPaise)}</strong></div>
            </div>
            <div className="notice transaction-summary__notice"><ShoppingBag size={18} /><span>You can select up to {maxUnits} total gift units in this kiosk order.</span></div>
          </div>
          <div className="transaction-summary__actions">
            <button className="primary-button" onClick={onCheckout}>Continue to Pay Later</button>
          </div>
        </aside>
      </div>
      <div className="cart-actions-row"><button className="secondary-button" onClick={onContinueShopping}>Continue shopping</button></div>
    </main>
  );
}
