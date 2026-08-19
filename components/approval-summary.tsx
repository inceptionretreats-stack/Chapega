"use client";

import { Check, Circle, MessageCircle, RotateCcw } from "lucide-react";

type ApprovalSummaryProps = {
  confirmed: boolean;
  onConfirmReceipt: () => void;
  onStartAnother: () => void;
};

export function ApprovalSummary({ confirmed, onConfirmReceipt, onStartAnother }: ApprovalSummaryProps) {
  const checks = ["Five-gift cart limit checked", "Pay Later flow completed", "Working order QR generated", "WhatsApp link prepared with exact order"];
  return (
    <main className="screen-page narrow">
      <div className="surface-panel panel-padding" style={{ maxWidth: 860, margin: "30px auto" }}>
        <span className="selected-check" style={{ width: 46, height: 46 }}><Check size={24} /></span>
        <h1 className="screen-heading" style={{ marginTop: 18 }}>Order Handoff Ready</h1>
        <p className="screen-subtitle">The customer journey has reached the WhatsApp handoff. Receipt is confirmed manually only after the real message is seen on the owner’s phone.</p>
        <div style={{ margin: "28px 0" }}>{checks.map((check) => <div className="switch-row" key={check}><span>{check}</span><Check size={19} color="#25683D" /></div>)}</div>
        <button className={`wrap-toggle ${confirmed ? "active" : ""}`} onClick={onConfirmReceipt} aria-pressed={confirmed} disabled={confirmed}><MessageCircle size={17} /> {confirmed ? "Owner confirmed receipt" : "Mark owner receipt after seeing the message"}</button>
        <div className="notice" style={{ marginTop: 18 }}><Circle size={16} /><span>This manual check is not WhatsApp delivery confirmation from an API.</span></div>
        <div className="roadmap-summary">
          <strong>Production roadmap after approval</strong>
          <p>Connect a database and live stock first, then add staff order statuses, secure administration, optional payment, and the official WhatsApp Business Platform.</p>
        </div>
        <button className="primary-button" style={{ marginTop: 24 }} onClick={onStartAnother}><RotateCcw size={18} /> Start Another Order</button>
      </div>
    </main>
  );
}
