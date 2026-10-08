"use client";

import Image from "next/image";
import QRCode from "react-qr-code";
import {
  Check,
  Clipboard,
  Clock3,
  ExternalLink,
  MessageCircle,
  Pause,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { formatInr } from "@/domain/money";
import { maskWhatsAppNumber } from "@/domain/whatsapp";
import type { Order, Product } from "@/types/kiosk";
import { CheckoutStepper, HandoffStatusRail } from "./checkout-stepper";
import { ConfirmDialog } from "./confirm-dialog";

type OrderReadyScreenProps = {
  shopName: string;
  order: Order;
  products: readonly Product[];
  secondsRemaining: number;
  extended: boolean;
  copied: boolean;
  copyError: string | null;
  onCopy: () => void;
  onKeepOpen: () => void;
  onStartNewOrder: () => void;
};

function formatCountdown(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function getOrderDestinationLabel(order: Order) {
  const greeting = order.whatsappMessage.split("\n", 1)[0] ?? "";
  const shopName = greeting.match(/^Hello (.+),$/)?.[1] ?? "Shop";
  let destination = "";
  try {
    destination = new URL(order.whatsappUrl).pathname.replace(/^\/+/, "");
  } catch {
    // Restored orders are validated before this screen renders; retain a safe label if parsing fails.
  }
  return `${shopName} WhatsApp ${maskWhatsAppNumber(destination)}`;
}

export function OrderReadyScreen({
  shopName,
  order,
  products,
  secondsRemaining,
  extended,
  copied,
  copyError,
  onCopy,
  onKeepOpen,
  onStartNewOrder,
}: OrderReadyScreenProps) {
  const finalWarning = secondsRemaining <= 15;
  // A stray tap would wipe the customer's QR, so starting over asks first.
  const [confirmingNewOrder, setConfirmingNewOrder] = useState(false);
  return (
    <main className="order-ready-page">
      <CheckoutStepper active={4} />
      <header className="order-ready-header">
        <h1 className="order-ready-title" data-screen-heading tabIndex={-1}>
          Your order is ready to send
        </h1>
        <div className="order-ready-meta" aria-label="Prepared order status">
          <span className="order-number">Order {order.orderNumber}</span>
          <span className="order-ready-meta__status">
            <ShieldCheck size={16} aria-hidden="true" /> Prepared · not sent
          </span>
        </div>
        <p className="order-ready-lede">
          Your message is prepared. Scan the QR code to open WhatsApp and send your order to{" "}
          {shopName}.
        </p>
      </header>
      <HandoffStatusRail active={2} />
      <section className="order-ready-frame" aria-label="WhatsApp QR handoff">
        <div className="qr-handoff-row">
          <div
            className="qr-card"
            role="img"
            aria-label="WhatsApp order QR code"
            data-testid="whatsapp-qr"
          >
            <QRCode
              value={order.whatsappUrl}
              size={420}
              bgColor="#FFFFFF"
              fgColor="#111111"
              level="M"
            />
          </div>
          <div className="order-ready-guidance">
            <ol className="instruction-list">
              <li>
                <span className="instruction-number">1</span>
                <span>
                  <strong>Scan the QR code</strong>
                  <small>Open WhatsApp on your phone</small>
                </span>
              </li>
              <li>
                <span className="instruction-number">2</span>
                <span>
                  <strong>Check your message</strong>
                  <small>Your order details are pre-filled</small>
                </span>
              </li>
              <li>
                <span className="instruction-number">3</span>
                <span>
                  <strong>Tap send</strong>
                  <small>Review and send to {shopName}</small>
                </span>
              </li>
            </ol>
            <p className="qr-scan-tip">
              <strong>Scanning tip:</strong> Keep the full code in view and hold your phone steady.
            </p>
            <div className="order-status">
              <ShieldCheck size={22} aria-hidden="true" />
              <span>
                <strong>Message prepared</strong>
                <small>Nothing is sent until you tap Send in WhatsApp</small>
              </span>
            </div>
            <a
              className="whatsapp-button order-ready-guidance__primary"
              href={order.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={20} /> Open WhatsApp <ExternalLink size={16} />
            </a>
          </div>
        </div>
      </section>

      <div className="order-ready-controls">
        <div className="expiry-row">
          <Clock3 size={22} aria-hidden="true" />
          <span>This kiosk screen will reset in</span>
          <strong
            className="countdown-ring"
            role="timer"
            aria-label={`${secondsRemaining} seconds until reset`}
          >
            {formatCountdown(secondsRemaining)}
          </strong>
        </div>
        <button className="text-button qr-pause" disabled={extended} onClick={onKeepOpen}>
          <Pause size={17} />
          {extended ? "Extra time added" : "Keep this screen open"}
        </button>
      </div>
      {finalWarning ? (
        <div className="error-notice order-ready-warning" role="alert">
          Resetting soon
        </div>
      ) : null}

      <div className="qr-actions">
        <a
          className="whatsapp-button"
          href={order.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={20} /> Open WhatsApp <ExternalLink size={16} />
        </a>
        <button className="quiet-button" onClick={onCopy} aria-live="polite">
          {copied ? <Check size={17} /> : <Clipboard size={17} />}
          {copied ? "Message copied" : "Copy message"}
        </button>
        <span className="qr-actions__or" aria-hidden="true">
          OR
        </span>
        <button className="quiet-button" onClick={() => setConfirmingNewOrder(true)}>
          <RefreshCcw size={17} /> Start new order
        </button>
      </div>
      {copyError ? (
        <div className="error-notice qr-copy-error" role="alert">
          {copyError}
        </div>
      ) : null}

      <details className="order-ready-copy">
        <summary>
          View order details · <span className="order-number">{order.orderNumber}</span>
        </summary>
        <div className="order-detail-columns">
          <div>
            <p className="order-kicker">Order details</p>
            <ul className="review-items">
              {order.items.map((item, index) => {
                const product = products.find((candidate) => candidate.id === item.productId);
                return (
                  <li
                    className="review-item"
                    key={`${item.productId}-${item.variant ?? "default"}-${item.giftWrapped ? "wrapped" : "plain"}-${index}`}
                  >
                    {product ? (
                      <div className="review-item__image">
                        <Image src={product.image} alt="" width={132} height={132} sizes="66px" />
                      </div>
                    ) : (
                      <div />
                    )}
                    <div>
                      <h3>{item.name}</h3>
                      <p>
                        {item.variant ? `${item.variant} · ` : ""}× {item.quantity}
                        {item.giftWrapped ? " · Gift wrapped" : ""}
                      </p>
                    </div>
                    <strong>{formatInr(item.lineTotalPaise)}</strong>
                  </li>
                );
              })}
            </ul>
            <dl className="summary-list order-ready-summary-list">
              <div>
                <dt>Gift wrap</dt>
                <dd>{formatInr(order.giftWrapPaise)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{formatInr(order.totalPaise)}</dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>Pay at Counter</dd>
              </div>
              <div>
                <dt>Kiosk</dt>
                <dd>{order.kioskName}</dd>
              </div>
            </dl>
          </div>
          <div>
            <p className="order-kicker">WhatsApp message preview</p>
            <div className="message-preview">
              <div className="message-bubble">{order.whatsappMessage}</div>
              <div className="message-preview__footer">
                <MessageCircle size={17} /> {getOrderDestinationLabel(order)}
              </div>
            </div>
          </div>
        </div>
      </details>
      {confirmingNewOrder ? (
        <ConfirmDialog
          title="Start a new order?"
          description="This clears this QR code and the order details from the screen. Make sure the message has been sent on WhatsApp first."
          confirmLabel="Start new order"
          cancelLabel="Keep this QR"
          onConfirm={() => {
            setConfirmingNewOrder(false);
            onStartNewOrder();
          }}
          onCancel={() => setConfirmingNewOrder(false)}
        />
      ) : null}
    </main>
  );
}
