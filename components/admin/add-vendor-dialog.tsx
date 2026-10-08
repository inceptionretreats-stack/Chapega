"use client";

import { LoaderCircle, Plus, Store } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type {
  AdminVendorMutationResult,
  CreateAdminVendorInput,
} from "@/types/admin";
import { adminRequest, AdminClientError } from "./admin-client";
import { AdminDialog } from "./admin-dialog";

type AddVendorDialogProps = {
  onClose: () => void;
  onCreated: (result: AdminVendorMutationResult) => void;
};

type FieldErrors = Partial<
  Record<keyof CreateAdminVendorInput, string>
>;

function vendorSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-IN")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

export function AddVendorDialog({
  onClose,
  onCreated,
}: AddVendorDialogProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<CreateAdminVendorInput>({
    displayName: "",
    slug: "",
    ownerName: "",
    ownerEmail: "",
    ownerWhatsAppNumber: "",
    temporaryPassword: "",
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const update = <Key extends keyof CreateAdminVendorInput>(
    key: Key,
    value: CreateAdminVendorInput[Key],
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === "displayName" && !slugEdited
        ? { slug: vendorSlug(value) }
        : {}),
    }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await adminRequest<AdminVendorMutationResult>(
        "/api/admin/vendors",
        {
          method: "POST",
          body: JSON.stringify(draft),
        },
      );
      onCreated(result);
    } catch (caught) {
      if (caught instanceof AdminClientError) {
        setFieldErrors({
          displayName: caught.fields?.displayName?.[0],
          slug: caught.fields?.slug?.[0],
          ownerName: caught.fields?.ownerName?.[0],
          ownerEmail: caught.fields?.ownerEmail?.[0],
          ownerWhatsAppNumber: caught.fields?.ownerWhatsAppNumber?.[0],
          temporaryPassword: caught.fields?.temporaryPassword?.[0],
        });
        setError(caught.message);
      } else {
        setError("The vendor could not be created. Check the connection and try again.");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <AdminDialog
      title="Add vendor"
      description="Create an independent storefront and its first owner account."
      onClose={onClose}
      busy={pending}
      initialFocusRef={nameRef}
    >
      <form className="admin-vendor-form" onSubmit={submit}>
        {error ? (
          <p className="admin-form-error" role="alert">
            {error}
          </p>
        ) : null}

        <fieldset>
          <legend>
            <Store size={18} aria-hidden="true" /> Storefront
          </legend>
          <div className="admin-form-grid">
            <label className="admin-field admin-field--full">
              <span>Vendor name</span>
              <input
                ref={nameRef}
                value={draft.displayName}
                onChange={(event) => update("displayName", event.target.value)}
                required
                minLength={2}
                maxLength={80}
                aria-invalid={Boolean(fieldErrors.displayName) || undefined}
                aria-describedby={fieldErrors.displayName ? "admin-vendor-name-error" : undefined}
              />
              {fieldErrors.displayName ? (
                <small id="admin-vendor-name-error">{fieldErrors.displayName}</small>
              ) : null}
            </label>
            <label className="admin-field admin-field--full">
              <span>Vendor URL</span>
              <span className="admin-slug-field">
                <b>/kiosk/</b>
                <input
                  value={draft.slug}
                  onChange={(event) => {
                    setSlugEdited(true);
                    update("slug", vendorSlug(event.target.value));
                  }}
                  required
                  minLength={2}
                  maxLength={63}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  spellCheck={false}
                  aria-invalid={Boolean(fieldErrors.slug) || undefined}
                  aria-describedby={fieldErrors.slug ? "admin-vendor-slug-error" : "admin-vendor-slug-help"}
                />
              </span>
              {fieldErrors.slug ? (
                <small id="admin-vendor-slug-error">{fieldErrors.slug}</small>
              ) : (
                <small id="admin-vendor-slug-help">Lowercase letters, numbers and hyphens.</small>
              )}
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Initial owner</legend>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Owner name</span>
              <input
                value={draft.ownerName}
                onChange={(event) => update("ownerName", event.target.value)}
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
                aria-invalid={Boolean(fieldErrors.ownerName) || undefined}
                aria-describedby={fieldErrors.ownerName ? "admin-owner-name-error" : undefined}
              />
              {fieldErrors.ownerName ? <small id="admin-owner-name-error">{fieldErrors.ownerName}</small> : null}
            </label>
            <label className="admin-field">
              <span>Owner email</span>
              <input
                type="email"
                value={draft.ownerEmail}
                onChange={(event) => update("ownerEmail", event.target.value)}
                autoComplete="email"
                required
                maxLength={160}
                aria-invalid={Boolean(fieldErrors.ownerEmail) || undefined}
                aria-describedby={fieldErrors.ownerEmail ? "admin-owner-email-error" : undefined}
              />
              {fieldErrors.ownerEmail ? <small id="admin-owner-email-error">{fieldErrors.ownerEmail}</small> : null}
            </label>
            <label className="admin-field admin-field--full">
              <span>Owner WhatsApp number</span>
              <input
                type="tel"
                inputMode="tel"
                value={draft.ownerWhatsAppNumber}
                onChange={(event) => update("ownerWhatsAppNumber", event.target.value)}
                autoComplete="tel"
                placeholder="+91 98765 43210"
                required
                minLength={8}
                maxLength={24}
                aria-invalid={Boolean(fieldErrors.ownerWhatsAppNumber) || undefined}
                aria-describedby={fieldErrors.ownerWhatsAppNumber ? "admin-owner-whatsapp-error" : "admin-owner-whatsapp-help"}
              />
              {fieldErrors.ownerWhatsAppNumber ? (
                <small id="admin-owner-whatsapp-error">{fieldErrors.ownerWhatsAppNumber}</small>
              ) : (
                <small id="admin-owner-whatsapp-help">Used for the new vendor’s kiosk order handoff.</small>
              )}
            </label>
            <label className="admin-field admin-field--full">
              <span>Temporary password</span>
              <input
                type="password"
                value={draft.temporaryPassword}
                onChange={(event) => update("temporaryPassword", event.target.value)}
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={200}
                aria-invalid={Boolean(fieldErrors.temporaryPassword) || undefined}
                aria-describedby={fieldErrors.temporaryPassword ? "admin-owner-password-error" : "admin-owner-password-help"}
              />
              {fieldErrors.temporaryPassword ? (
                <small id="admin-owner-password-error">{fieldErrors.temporaryPassword}</small>
              ) : (
                <small id="admin-owner-password-help">At least 12 characters with upper and lowercase letters and a number.</small>
              )}
            </label>
          </div>
        </fieldset>

        <footer className="admin-dialog__actions">
          <button className="admin-secondary" type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className="admin-primary" type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="admin-spin" size={18} /> : <Plus size={18} />}
            {pending ? "Creating vendor…" : "Create vendor"}
          </button>
        </footer>
      </form>
    </AdminDialog>
  );
}
