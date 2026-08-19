"use client";

import { ExternalLink, MessageCircle, RotateCcw, Save, Settings, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatInr } from "@/domain/money";
import { buildWhatsAppUrl } from "@/domain/whatsapp";
import type { OrderHistoryItem, PresenterSettings } from "@/types/kiosk";

type PresenterScreenProps = {
  settings: PresenterSettings;
  history: readonly OrderHistoryItem[];
  storageWarning: string | null;
  onSave: (settings: PresenterSettings) => string | null;
  onResetSession: () => void;
  onResetAll: () => void;
  onClearHistory: () => void;
  onClose: () => void;
};

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function PresenterScreen({ settings, history, storageWarning, onSave, onResetSession, onResetAll, onClearHistory, onClose }: PresenterScreenProps) {
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testUrl = useMemo(() => {
    try {
      return buildWhatsAppUrl({
        rawNumber: draft.ownerWhatsAppNumber,
        defaultCountryCode: draft.defaultCountryCode,
        message: `Hello ${draft.shopName},\nThis is a WhatsApp connection test from the gift-shop kiosk.`,
      });
    } catch {
      return null;
    }
  }, [draft]);

  const update = <K extends keyof PresenterSettings>(key: K, value: PresenterSettings[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => {
    const result = onSave(draft);
    setError(result);
    setStatus(result ? null : "Presenter settings saved.");
  };

  return (
    <main className="screen-page presenter-page">
      <div className="section-heading-row">
        <div><h1 className="screen-heading">Presenter Settings</h1><p>Configure the kiosk without changing code.</p></div>
        <button className="secondary-button" onClick={onClose}>Close presenter mode</button>
      </div>
      {storageWarning ? <div className="notice">{storageWarning}</div> : null}
      <div className="presenter-grid">
        <section className="surface-panel panel-padding">
          <h2 className="panel-title"><Settings size={22} /> Shop and kiosk</h2>
          <div className="form-grid">
            <label className="field"><span>Shop name</span><input value={draft.shopName} onChange={(e) => update("shopName", e.target.value)} /></label>
            <label className="field"><span>Kiosk name</span><input value={draft.kioskName} onChange={(e) => update("kioskName", e.target.value)} /></label>
            <label className="field full"><span>Owner WhatsApp number</span><input value={draft.ownerWhatsAppNumber} onChange={(e) => update("ownerWhatsAppNumber", e.target.value)} placeholder="9876543210" inputMode="tel" /><small>The saved destination is normalized to country-code-prefixed digits only.</small></label>
            <label className="field"><span>Default country code</span><input value={draft.defaultCountryCode} onChange={(e) => update("defaultCountryCode", e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" /></label>
            <label className="field"><span>Maximum gift units</span><input type="number" min={1} max={5} value={draft.maxCartQuantity} onChange={(e) => update("maxCartQuantity", Number(e.target.value))} /></label>
            <label className="field"><span>Gift-wrap fee (₹)</span><input type="number" min={0} value={draft.giftWrapFeePaise / 100} onChange={(e) => update("giftWrapFeePaise", Math.round(Number(e.target.value) * 100))} /></label>
            <label className="field"><span>QR reset seconds</span><input type="number" min={30} max={1800} value={draft.qrResetSeconds} onChange={(e) => update("qrResetSeconds", Number(e.target.value))} /></label>
          </div>
          <div className="switch-row"><div><strong>Show preview label</strong><div className="product-card__descriptor">Keep the approval preview clearly identified.</div></div><button className={`switch-button ${draft.showPreviewLabel ? "on" : ""}`} onClick={() => update("showPreviewLabel", !draft.showPreviewLabel)} aria-pressed={draft.showPreviewLabel} aria-label="Toggle preview label" /></div>
          {error ? <div className="error-notice" style={{ marginTop: 16 }}>{error}</div> : null}
          {status ? <div className="success-notice" style={{ marginTop: 16 }}>{status}</div> : null}
          <div className="settings-actions">
            <button className="primary-button" onClick={save}><Save size={18} /> Save settings</button>
            {testUrl ? <a className="whatsapp-button" href={testUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> Test WhatsApp link <ExternalLink size={15} /></a> : <button className="whatsapp-button" disabled><MessageCircle size={18} /> Enter a valid number to test</button>}
          </div>
        </section>

        <div>
          <section className="surface-panel panel-padding">
            <h2 className="panel-title">Recent orders</h2>
            {history.length ? (
              <div className="history-table-wrap"><table className="history-table"><thead><tr><th>Order</th><th>Created</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>{history.map((item) => <tr key={item.orderNumber}><td>{item.orderNumber}</td><td>{formatCreatedAt(item.createdAt)}</td><td>{item.itemCount}</td><td>{formatInr(item.totalPaise)}</td><td>{item.status === "presenter_marked_sent" ? "Presenter marked sent" : "Prepared for WhatsApp"}</td></tr>)}</tbody></table></div>
            ) : <p className="screen-subtitle">No orders have been prepared in this browser.</p>}
          </section>
          <section className="surface-panel panel-padding" style={{ marginTop: 20 }}>
            <h2 className="panel-title">Reset tools</h2>
            <p className="screen-subtitle">Reset only the active customer journey, clear redacted order history, or return every local setting to its default.</p>
            <div className="settings-actions">
              <button className="secondary-button" onClick={onResetSession}><RotateCcw size={17} /> Reset active session</button>
              <button className="danger-button" onClick={onClearHistory}><Trash2 size={17} /> Clear order history</button>
              <button className="danger-button" onClick={onResetAll}><Trash2 size={17} /> Reset all local data</button>
            </div>
          </section>
          <section className="surface-panel panel-padding" style={{ marginTop: 20 }}>
            <h2 className="panel-title">After approval</h2>
            <p className="screen-subtitle">Add a database, stock management, staff order statuses, secure administration, optional UPI, and the WhatsApp Business Platform as separate production phases.</p>
            <details className="technical-details">
              <summary>How this QR flow works</summary>
              <p>The kiosk freezes the reviewed cart into a local order, builds one encoded <code>wa.me</code> link, and renders that same link in both the QR and Open WhatsApp button.</p>
              <p>No backend sends a message. The customer still reviews the prepared text and taps Send inside WhatsApp; receipt is marked manually by the presenter.</p>
            </details>
          </section>
        </div>
      </div>
    </main>
  );
}
