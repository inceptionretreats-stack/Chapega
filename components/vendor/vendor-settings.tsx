"use client";

import { ExternalLink, LoaderCircle, MessageCircle, Save } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { VendorSettings as VendorSettingsType } from "@/types/vendor";
import { buildWhatsAppUrl } from "@/domain/whatsapp";
import { vendorRequest, VendorClientError } from "./vendor-client";
import { focusFirstInvalid } from "./vendor-shared";

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

/** Fields the server can reject; each shows its own message. */
type SettingsField =
  | "shopName"
  | "kioskName"
  | "defaultCountryCode"
  | "ownerWhatsAppNumber"
  | "maxCartQuantity"
  | "giftWrapFeePaise"
  | "qrResetSeconds"
  | "lowStockThreshold";

type FieldErrors = Partial<Record<SettingsField, string>>;

const FIELD_FOR_DRAFT_KEY: Partial<Record<keyof SettingsDraft, SettingsField>> = {
  shopName: "shopName",
  kioskName: "kioskName",
  defaultCountryCode: "defaultCountryCode",
  ownerWhatsAppNumber: "ownerWhatsAppNumber",
  maxCartQuantity: "maxCartQuantity",
  giftWrapFeeRupees: "giftWrapFeePaise",
  qrResetSeconds: "qrResetSeconds",
  lowStockThreshold: "lowStockThreshold",
};

function createDraft(settings: VendorSettingsType): SettingsDraft {
  return {
    ...settings,
    giftWrapFeeRupees: String(settings.giftWrapFeePaise / 100),
  };
}

export function VendorSettings({
  apiBase = "/api/vendor",
  settings,
  onSettingsSaved,
}: SettingsProps) {
  const [workingDraft, setWorkingDraft] = useState<WorkingDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const baseline = workingDraft?.baseline ?? settings;
  const draft = workingDraft?.value ?? createDraft(settings);
  const dirty = workingDraft !== null;
  const newerSettingsAvailable = settings.version > baseline.version;

  const update = <Key extends keyof SettingsDraft>(key: Key, value: SettingsDraft[Key]) => {
    const field = FIELD_FOR_DRAFT_KEY[key];
    if (field && fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
    setWorkingDraft((current) => {
      const nextBaseline = current?.baseline ?? settings;
      const nextValue = {
        ...(current?.value ?? createDraft(settings)),
        [key]: value,
      };
      return JSON.stringify(nextValue) === JSON.stringify(createDraft(nextBaseline))
        ? null
        : { baseline: nextBaseline, value: nextValue };
    });
  };

  const loadLatestSettings = () => {
    setWorkingDraft(null);
    setError(null);
    setFieldErrors({});
  };

  const showFieldErrors = (next: FieldErrors, message: string) => {
    setFieldErrors(next);
    setError(message);
    window.requestAnimationFrame(() => focusFirstInvalid(formRef.current, errorRef.current));
  };

  /** Props tying an input to its label and its error message. */
  const fieldProps = (field: SettingsField, help?: string) => ({
    id: `settings-${field}`,
    "aria-invalid": fieldErrors[field] ? true : undefined,
    "aria-describedby": fieldErrors[field] ? `settings-${field}-error` : help,
  });

  const fieldError = (field: SettingsField) =>
    fieldErrors[field] ? (
      <small id={`settings-${field}-error`} className="vendor-field-error">
        {fieldErrors[field]}
      </small>
    ) : null;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (newerSettingsAvailable) {
      setError(
        "Shop settings changed in another session. Load the latest settings before publishing your draft.",
      );
      return;
    }
    const fee = Number(draft.giftWrapFeeRupees);
    if (!Number.isFinite(fee) || fee < 0) {
      showFieldErrors(
        { giftWrapFeePaise: "Enter a valid gift-wrap fee." },
        "Check the highlighted information and try again.",
      );
      return;
    }
    setPending(true);
    setError(null);
    setFieldErrors({});
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
      const fields = caught instanceof VendorClientError ? caught.fields : undefined;
      const next: FieldErrors = {};
      for (const field of Object.values(FIELD_FOR_DRAFT_KEY)) {
        const message = fields?.[field]?.[0];
        if (message) next[field] = message;
      }
      const message = caught instanceof Error ? caught.message : "Settings could not be saved.";
      if (Object.keys(next).length) {
        showFieldErrors(next, message);
      } else {
        setError(message);
        window.requestAnimationFrame(() => errorRef.current?.focus());
      }
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
    <form ref={formRef} className="vendor-workspace vendor-settings-view" onSubmit={save}>
      {error ? (
        <div ref={errorRef} tabIndex={-1} className="vendor-inline-error" role="alert">
          {error}
        </div>
      ) : null}
      {newerSettingsAvailable ? (
        <div className="vendor-settings-note" role="status">
          <p>A newer settings revision is available. Your unsaved draft is still here.</p>
          <button className="vendor-text-action" type="button" onClick={loadLatestSettings}>
            Load latest settings
          </button>
        </div>
      ) : null}

      <div className="vendor-settings-grid">
        <div className="vendor-settings-main">
          <section
            className="vendor-panel vendor-settings-section"
            aria-labelledby="store-profile-title"
          >
            <header className="vendor-panel-header">
              <div>
                <h2 id="store-profile-title">Store profile</h2>
                <p>Shown on the kiosk and in every WhatsApp order.</p>
              </div>
            </header>
            <div className="vendor-form-grid vendor-settings-fields">
              <div className="vendor-field">
                <label htmlFor="settings-shopName">Shop name</label>
                <input
                  {...fieldProps("shopName")}
                  value={draft.shopName}
                  onChange={(event) => update("shopName", event.target.value)}
                  maxLength={80}
                  required
                />
                {fieldError("shopName")}
              </div>
              <div className="vendor-field">
                <label htmlFor="settings-kioskName">Kiosk name</label>
                <input
                  {...fieldProps("kioskName")}
                  value={draft.kioskName}
                  onChange={(event) => update("kioskName", event.target.value)}
                  maxLength={80}
                  required
                />
                {fieldError("kioskName")}
              </div>
              <label className="vendor-toggle-row vendor-field--full">
                <span>
                  <strong>Accept kiosk orders</strong>
                  <small>Pause ordering without hiding your product catalogue.</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.storeOpen}
                  onChange={(event) => update("storeOpen", event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
            </div>
          </section>

          <section
            className="vendor-panel vendor-settings-section"
            aria-labelledby="whatsapp-title"
          >
            <header className="vendor-panel-header">
              <div>
                <h2 id="whatsapp-title">WhatsApp handoff</h2>
                <p>Kiosk orders open a WhatsApp chat with this number.</p>
              </div>
            </header>
            <div className="vendor-form-grid vendor-settings-fields">
              <div className="vendor-field">
                <label htmlFor="settings-defaultCountryCode">Country code</label>
                <span className="vendor-country-input">
                  <b>+</b>
                  <input
                    {...fieldProps("defaultCountryCode")}
                    value={draft.defaultCountryCode}
                    onChange={(event) =>
                      update(
                        "defaultCountryCode",
                        event.target.value.replace(/\D/g, "").slice(0, 3),
                      )
                    }
                    inputMode="numeric"
                    required
                  />
                </span>
                {fieldError("defaultCountryCode")}
              </div>
              <div className="vendor-field">
                <label htmlFor="settings-ownerWhatsAppNumber">Owner WhatsApp number</label>
                <input
                  {...fieldProps("ownerWhatsAppNumber")}
                  value={draft.ownerWhatsAppNumber}
                  onChange={(event) => update("ownerWhatsAppNumber", event.target.value)}
                  inputMode="tel"
                  maxLength={24}
                  required
                />
                {fieldError("ownerWhatsAppNumber")}
              </div>
              <div className="vendor-settings-note vendor-field--full">
                <p>
                  Customers still check the message and tap Send themselves. Scanning the QR code
                  doesn&apos;t send anything.
                </p>
              </div>
              <div className="vendor-field--full">
                <a
                  className="vendor-secondary vendor-inline-link"
                  href={whatsappTestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!whatsappTestUrl}
                >
                  <MessageCircle size={17} /> Test WhatsApp destination <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </section>

          <section
            className="vendor-panel vendor-settings-section"
            aria-labelledby="ordering-rules-title"
          >
            <header className="vendor-panel-header">
              <div>
                <h2 id="ordering-rules-title">Ordering rules</h2>
                <p>Limits that apply to every kiosk order.</p>
              </div>
            </header>
            <div className="vendor-form-grid vendor-settings-fields">
              <div className="vendor-field">
                <label htmlFor="settings-maxCartQuantity">Maximum gift units</label>
                <input
                  {...fieldProps("maxCartQuantity", "settings-maxCartQuantity-help")}
                  type="number"
                  min="1"
                  max="5"
                  step="1"
                  value={draft.maxCartQuantity}
                  onChange={(event) => update("maxCartQuantity", Number(event.target.value))}
                  required
                />
                {fieldError("maxCartQuantity") ?? (
                  <small id="settings-maxCartQuantity-help">Between 1 and 5.</small>
                )}
              </div>
              <div className="vendor-field">
                <label htmlFor="settings-giftWrapFeePaise">Gift-wrap fee (₹)</label>
                <input
                  {...fieldProps("giftWrapFeePaise")}
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.giftWrapFeeRupees}
                  onChange={(event) => update("giftWrapFeeRupees", event.target.value)}
                  required
                />
                {fieldError("giftWrapFeePaise")}
              </div>
              <div className="vendor-field">
                <label htmlFor="settings-qrResetSeconds">QR privacy reset (seconds)</label>
                <input
                  {...fieldProps("qrResetSeconds")}
                  type="number"
                  min="15"
                  max="3600"
                  step="1"
                  value={draft.qrResetSeconds}
                  onChange={(event) => update("qrResetSeconds", Number(event.target.value))}
                  required
                />
                {fieldError("qrResetSeconds")}
              </div>
              <div className="vendor-field">
                <label htmlFor="settings-lowStockThreshold">Low-stock alert at</label>
                <input
                  {...fieldProps("lowStockThreshold")}
                  type="number"
                  min="0"
                  max="999"
                  step="1"
                  value={draft.lowStockThreshold}
                  onChange={(event) => update("lowStockThreshold", Number(event.target.value))}
                  required
                />
                {fieldError("lowStockThreshold")}
              </div>
              <label className="vendor-toggle-row vendor-field--full">
                <span>
                  <strong>Show preview label</strong>
                  <small>Display the optional preview marker on the kiosk.</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.showPreviewLabel}
                  onChange={(event) => update("showPreviewLabel", event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
            </div>
          </section>
        </div>

        <aside className="vendor-settings-rail">
          <section className="vendor-panel vendor-publish-card">
            <p>Publish changes</p>
            <h2>{dirty ? "Settings are ready to update" : "Everything is up to date"}</h2>
            <span>
              Revision {baseline.version} · Last saved{" "}
              {new Intl.DateTimeFormat("en-IN", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(baseline.updatedAt))}
            </span>
            <button
              className="vendor-primary"
              type="submit"
              disabled={!dirty || pending || newerSettingsAvailable}
            >
              {pending ? <LoaderCircle className="vendor-spin" size={18} /> : <Save size={18} />}
              {pending ? "Publishing…" : "Publish settings"}
            </button>
            {dirty ? (
              <button
                className="vendor-text-action vendor-discard"
                type="button"
                onClick={loadLatestSettings}
              >
                Discard changes
              </button>
            ) : null}
          </section>

          <section className="vendor-panel vendor-kiosk-preview">
            <p>Kiosk connection</p>
            <div>
              <i className={draft.storeOpen ? "is-online" : "is-paused"} />
              <strong>{draft.kioskName || "Unnamed kiosk"}</strong>
            </div>
            <span>{draft.storeOpen ? "Accepting new orders" : "Ordering paused"}</span>
            <small>The kiosk picks up changes within 30 seconds.</small>
          </section>
        </aside>
      </div>
    </form>
  );
}
