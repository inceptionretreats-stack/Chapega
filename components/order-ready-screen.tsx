"use client";

import Image from "next/image";
import QRCode from "react-qr-code";
import {
  Check,
  Clipboard,
  ExternalLink,
  Info,
  MessageCircle,
  Pause,
  Play,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { formatInr } from "@/domain/money";
import { maskWhatsAppNumber } from "@/domain/whatsapp";
import type { Order, Product } from "@/types/kiosk";
import { CheckoutStepper } from "./checkout-stepper";

type OrderReadyScreenProps = {
  order: Order;
  products: readonly Product[];
  secondsRemaining: number;
  paused: boolean;
  copied: boolean;
  onCopy: () => void;
  onTogglePause: () => void;
  onStartNewOrder: () => void;
  onApprovalSummary: () => void;
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
  order,
  products,
  secondsRemaining,
  paused,
  copied,
  onCopy,
  onTogglePause,
  onStartNewOrder,
  onApprovalSummary,
}: OrderReadyScreenProps) {
  const finalWarning = !paused && secondsRemaining <= 15;
  return (
    <main className="order-ready-page">
      <CheckoutStepper active={4} />
      <div className="order-ready-grid">
        <section className="order-ready-copy">
          <h1 className="order-ready-title">Your order is ready to send</h1>
          <p className="order-ready-lede">Scan the QR with your phone. WhatsApp will open with your selected gifts—review the message and tap Send.</p>
          <div className="order-status"><Info size={18} /> Message prepared. Complete the final step in WhatsApp.</div>
          <div className="order-detail-columns">
            <div>
              <p className="order-kicker">Order details</p>
              <span className="order-number">{order.orderNumber}</span>
              <ul className="review-items">
                {order.items.map((item) => {
                  const product = products.find((candidate) => candidate.id === item.productId);
                  return (
                    <li className="review-item" key={`${item.productId}-${item.variant ?? "default"}`}>
                      {product ? <Image src={product.image} alt="" width={132} height={132} /> : <div />}
                      <div><h3>{item.name}</h3><p>{item.variant ? `${item.variant} · ` : ""}× {item.quantity}{item.giftWrapped ? " · Gift wrapped" : ""}</p></div>
                      <strong>{formatInr(item.lineTotalPaise)}</strong>
                    </li>
                  );
                })}
              </ul>
              <dl className="summary-list" style={{ marginTop: 10 }}>
                <div><dt>Gift wrap</dt><dd>{formatInr(order.giftWrapPaise)}</dd></div>
                <div><dt>Total</dt><dd>{formatInr(order.totalPaise)}</dd></div>
                <div><dt>Payment</dt><dd>Pay at Counter</dd></div>
                <div><dt>Kiosk</dt><dd>{order.kioskName}</dd></div>
              </dl>
            </div>
            <div>
              <p className="order-kicker">WhatsApp message preview</p>
              <div className="message-preview">
                <div className="message-bubble">{order.whatsappMessage}</div>
                <div className="message-preview__footer"><MessageCircle size={17} /> {getOrderDestinationLabel(order)}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="qr-column" aria-label="WhatsApp QR handoff">
          <div className="qr-card" aria-label="WhatsApp order QR code" data-testid="whatsapp-qr">
            <QRCode value={order.whatsappUrl} size={420} bgColor="#FFFFFF" fgColor="#111111" level="M" />
          </div>
          <div className="scan-instructions">
            <ol className="instruction-list">
              <li><span className="instruction-number">1</span>Open your phone camera</li>
              <li><span className="instruction-number">2</span>Scan this QR code</li>
              <li><span className="instruction-number">3</span>WhatsApp opens—tap Send</li>
            </ol>
            <div>
              <div className="countdown-ring" aria-label={`${secondsRemaining} seconds until reset`}>{paused ? "Paused" : formatCountdown(secondsRemaining)}</div>
              {finalWarning ? <div className="error-notice" style={{ marginTop: 8 }}>Resetting soon</div> : null}
            </div>
          </div>
          <div className="qr-actions">
            <a className="whatsapp-button" href={order.whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} /> Open WhatsApp <ExternalLink size={16} /></a>
            <button className="quiet-button" onClick={onCopy}>{copied ? <Check size={17} /> : <Clipboard size={17} />}{copied ? "Message copied" : "Copy message"}</button>
            <button className="quiet-button" onClick={onTogglePause}>{paused ? <Play size={17} /> : <Pause size={17} />}{paused ? "Resume reset" : "Keep this screen open"}</button>
            <button className="quiet-button" onClick={onStartNewOrder}><RefreshCcw size={17} /> Start new order</button>
          </div>
          <div className="success-notice" style={{ width: "100%", maxWidth: 600, marginTop: 14 }}><ShieldCheck size={18} /><span>The QR contains this exact order link. WhatsApp still requires you to tap Send.</span></div>
          <button className="text-button" style={{ marginTop: 8 }} onClick={onApprovalSummary}>Presenter: show approval summary</button>
        </section>
      </div>
    </main>
  );
}
