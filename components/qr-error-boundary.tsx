"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, Clipboard, ExternalLink, RefreshCcw } from "lucide-react";
import type { Order } from "@/types/kiosk";

type QrErrorBoundaryProps = {
  order: Order;
  onCopy: () => void;
  onStartNewOrder: () => void;
  children: ReactNode;
};

type QrErrorBoundaryState = { hasError: boolean };

export class QrErrorBoundary extends Component<QrErrorBoundaryProps, QrErrorBoundaryState> {
  state: QrErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): QrErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="screen-page narrow">
        <section className="surface-panel panel-padding" aria-labelledby="qr-fallback-title">
          <AlertTriangle size={38} color="#A46218" />
          <h1 id="qr-fallback-title" className="screen-heading" style={{ marginTop: 16 }}>The QR could not be displayed</h1>
          <p className="screen-subtitle">Your prepared order is still safe. Use the same WhatsApp link below or copy the exact message and continue on your phone.</p>
          <div className="notice" style={{ marginTop: 18 }}><strong>{this.props.order.orderNumber}</strong></div>
          <div className="settings-actions" style={{ marginTop: 22 }}>
            <a className="whatsapp-button" href={this.props.order.whatsappUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp <ExternalLink size={16} /></a>
            <button className="secondary-button" onClick={this.props.onCopy}><Clipboard size={17} /> Copy message</button>
            <button className="secondary-button" onClick={this.props.onStartNewOrder}><RefreshCcw size={17} /> Start new order</button>
          </div>
        </section>
      </main>
    );
  }
}
