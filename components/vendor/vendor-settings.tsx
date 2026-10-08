"use client";

import {
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  Save,
  ShieldCheck,
  Store,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import type { VendorSettings as VendorSettingsType } from "@/types/vendor";
import { buildWhatsAppUrl } from "@/domain/whatsapp";
import { vendorRequest } from "./vendor-client";

type SettingsProps = {
  apiBase?: string;
  settings: VendorSettingsType;
  onSettingsSaved: (settings: VendorSettingsType, message: string) => void;
};

type SettingsDraft = Omit<VendorSettingsType, "updatedAt"> & {
  giftWrapFeeRupees: string;
};

type WorkingDraft = Readonly<{
  baseline: VendorSettingsType;
  value: SettingsDraft;
}>;

function createDraft(settings: VendorSettingsType): SettingsDraft {
  return {
    ...settings,
    giftWrapFeeRupees: String(settings.giftWrapFeePaise / 100),
  };
}

export function VendorSettings({ apiBase = "/api/vendor", settings, onSettingsSaved }: SettingsProps) {
  const [workingDraft, setWorkingDraft] = useState<WorkingDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseline = workingDraft?.baseline ?? settings;
  const draft = workingDraft?.value ?? createDraft(settings);
  const dirty = workingDraft !== null;
  const newerSettingsAvailable = settings.version > baseline.version;

  const update = <Key extends keyof SettingsDraft>(
    key: Key,
    value: SettingsDraft[Key],
  ) => setWorkingDraft((current) => {
    const nextBaseline = current?.baseline ?? settings;
    const nextValue = {
      ...(current?.value ?? createDraft(settings)),
      [key]: value,
    };
    return JSON.stringify(nextValue) === JSON.stringify(createDraft(nextBaseline))
      ? null
      : { baseline: nextBaseline, value: nextValue };
  });

  const loadLatestSettings = () => {
    setWorkingDraft(null);
    setError(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (newerSettingsAvailable) {
      setError("Shop settings changed in another session. Load the latest settings before publishing your draft.");
      return;
    }
    const fee = Number(draft.giftWrapFeeRupees);
    if (!Number.isFinite(fee) || fee < 0) {
      setError("Enter a valid gift-wrap fee.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await vendorRequest<{ settings: VendorSettingsType }>(`${apiBase}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          shopName: draft.shopName,
          ownerWhatsAppNumber: draft.ownerWhatsAppNumber,
          defaultCountryCode: draft.defaultCountryCode,
          kioskName: draft.kioskName,
          maxCartQuantity: Number(draft.maxCartQuantity),
          giftWrapFeePaise: Math.round(fee * 100),
          qrResetSeconds: Number(draft.qrResetSeconds),
          showPreviewLabel: draft.showPreviewLabel,
          storeOpen: draft.storeOpen,
          lowStockThreshold: Number(draft.lowStockThreshold),
          version: baseline.version,
        }),
      });
      setWorkingDraft(null);
      onSettingsSaved(result.settings, "Shop settings published to the kiosk.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Settings could not be saved.");
    } finally {
      setPending(false);
    }
  };

  // Build the test link exactly like the real order handoff (country code
  // applied, number validated); no link while the number is not usable.
  let whatsappTestUrl: string | undefined;
  try {
    whatsappTestUrl = buildWhatsAppUrl({
      rawNumber: draft.ownerWhatsAppNumber,
      defaultCountryCode: draft.defaultCountryCode,
      message: "Hello Chapega.com, this is a Vendor Studio connection test.",
    });
  } catch {
    whatsappTestUrl = undefined;
  }

  return (
    <form className="vendor-workspace vendor-settings-view" onSubmit={save}>
      {error ? <div className="vendor-inline-error" role="alert">{error}</div> : null}
      {newerSettingsAvailable ? (
        <div className="vendor-settings-note" role="status">
          <ShieldCheck size={18} />
          <p>A newer settings revision is available. Your unsaved draft is still here.</p>
          <button className="vendor-text-action" type="button" onClick={loadLatestSettings}>Load latest settings</button>
        </div>
      ) : null}

      <div className="vendor-settings-grid">
        <div className="vendor-settings-main">
          <section className="vendor-panel vendor-settings-section" aria-labelledby="store-profile-title">
            <header className="vendor-panel-header"><div><h2 id="store-profile-title">Store profile</h2><p>The public identity shown throughout the kiosk and WhatsApp handoff.</p></div><span className="vendor-settings-icon"><Store size={20} /></span></header>
            <div className="vendor-form-grid vendor-settings-fields">
              <label className="vendor-field"><span>Shop name</span><input value={draft.shopName} onChange={(event) => update("shopName", event.target.value)} maxLength={80} required /></label>
              <label className="vendor-field"><span>Kiosk name</span><input value={draft.kioskName} onChange={(event) => update("kioskName", event.target.value)} maxLength={80} required /></label>
              <label className="vendor-toggle-row vendor-field--full"><span><strong>Accept kiosk orders</strong><small>Pause ordering without hiding your product catalogue.</small></span><input type="checkbox" checked={draft.storeOpen} onChange={(event) => update("storeOpen", event.target.checked)} /><i aria-hidden="true" /></label>
            </div>
          </section>

          <section className="vendor-panel vendor-settings-section" aria-labelledby="whatsapp-title">
            <header className="vendor-panel-header"><div><h2 id="whatsapp-title">WhatsApp handoff</h2><p>Every kiosk order prepares a message to this destination.</p></div><span className="vendor-settings-icon"><MessageCircle size={20} /></span></header>
            <div className="vendor-form-grid vendor-settings-fields">
              <label className="vendor-field"><span>Country code</span><span className="vendor-country-input"><b>+</b><input value={draft.defaultCountryCode} onChange={(event) => update("defaultCountryCode", event.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" required /></span></label>
              <label className="vendor-field"><span>Owner WhatsApp number</span><input value={draft.ownerWhatsAppNumber} onChange={(event) => update("ownerWhatsAppNumber", event.target.value)} inputMode="tel" maxLength={24} required /></label>
              <div className="vendor-settings-note vendor-field--full"><ShieldCheck size={18} /><p>The kiosk prepares the exact message, but the customer still reviews and taps Send in WhatsApp. A QR scan alone is never reported as delivered.</p></div>
              <div className="vendor-field--full"><a className="vendor-secondary vendor-inline-link" href={whatsappTestUrl} target="_blank" rel="noopener noreferrer" aria-disabled={!whatsappTestUrl}><MessageCircle size={17} /> Test WhatsApp destination <ExternalLink size={14} /></a></div>
            </div>
          </section>

          <section className="vendor-panel vendor-settings-section" aria-labelledby="ordering-rules-title">
            <header className="vendor-panel-header"><div><h2 id="ordering-rules-title">Ordering rules</h2><p>Server-enforced limits used when the kiosk prepares an order.</p></div></header>
            <div className="vendor-form-grid vendor-settings-fields">
              <label className="vendor-field"><span>Maximum gift units</span><input type="number" min="1" max="5" step="1" value={draft.maxCartQuantity} onChange={(event) => update("maxCartQuantity", Number(event.target.value))} required /><small>Hard limit: one to five.</small></label>
              <label className="vendor-field"><span>Gift-wrap fee (₹)</span><input type="number" min="0" step="0.01" value={draft.giftWrapFeeRupees} onChange={(event) => update("giftWrapFeeRupees", event.target.value)} required /></label>
              <label className="vendor-field"><span>QR privacy reset (seconds)</span><input type="number" min="15" max="3600" step="1" value={draft.qrResetSeconds} onChange={(event) => update("qrResetSeconds", Number(event.target.value))} required /></label>
              <label className="vendor-field"><span>Low-stock alert at</span><input type="number" min="0" max="999" step="1" value={draft.lowStockThreshold} onChange={(event) => update("lowStockThreshold", Number(event.target.value))} required /></label>
              <label className="vendor-toggle-row vendor-field--full"><span><strong>Show preview label</strong><small>Display the optional preview marker on the kiosk.</small></span><input type="checkbox" checked={draft.showPreviewLabel} onChange={(event) => update("showPreviewLabel", event.target.checked)} /><i aria-hidden="true" /></label>
            </div>
          </section>
        </div>

        <aside className="vendor-settings-rail">
          <section className="vendor-panel vendor-publish-card">
            <p>Publish changes</p>
            <h2>{dirty ? "Settings are ready to update" : "Everything is up to date"}</h2>
            <span>Revision {baseline.version} · Last saved {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(baseline.updatedAt))}</span>
            <button className="vendor-primary" type="submit" disabled={!dirty || pending || newerSettingsAvailable}>
              {pending ? <LoaderCircle className="vendor-spin" size={18} /> : <Save size={18} />}
              {pending ? "Publishing…" : "Publish settings"}
            </button>
            {dirty ? <button className="vendor-text-action vendor-discard" type="button" onClick={loadLatestSettings}>Discard changes</button> : null}
          </section>

          <section className="vendor-panel vendor-kiosk-preview">
            <p>Kiosk connection</p>
            <div><i className={draft.storeOpen ? "is-online" : "is-paused"} /><strong>{draft.kioskName || "Unnamed kiosk"}</strong></div>
            <span>{draft.storeOpen ? "Accepting new orders" : "Ordering paused"}</span>
            <small>Catalogue and settings are refreshed on load, focus, and every 30 seconds while online.</small>
          </section>
        </aside>
      </div>
    </form>
  );
}
