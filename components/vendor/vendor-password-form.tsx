"use client";

import { LoaderCircle } from "lucide-react";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import { PasswordToggle } from "../password-toggle";
import { vendorRequest, VendorClientError } from "./vendor-client";
import { focusFirstInvalid } from "./vendor-shared";

type FieldName = "currentPassword" | "newPassword" | "confirmPassword";

type VendorPasswordFormProps = {
  apiBase: string;
  /** Lets password managers file the new password under the right account. */
  email: string;
  idPrefix: string;
  submitLabel: string;
  currentLabel?: string;
  firstFieldRef?: RefObject<HTMLInputElement | null>;
  onChanged: () => void;
  onCancel?: () => void;
  /** The session ended (401): send the person back to sign in. */
  onSessionEnded: () => void;
};

export function VendorPasswordForm({
  apiBase,
  email,
  idPrefix,
  submitLabel,
  currentLabel = "Current password",
  firstFieldRef,
  onChanged,
  onCancel,
  onSessionEnded,
}: VendorPasswordFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [values, setValues] = useState<Record<FieldName, string>>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});

  const update = (field: FieldName, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (error) setError(null);
  };

  const showFieldErrors = (next: Partial<Record<FieldName, string>>) => {
    setFieldErrors(next);
    window.requestAnimationFrame(() => focusFirstInvalid(formRef.current, errorRef.current));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (values.newPassword !== values.confirmPassword) {
      showFieldErrors({ confirmPassword: "The new passwords don't match." });
      return;
    }
    setPending(true);
    setError(null);
    try {
      await vendorRequest<{ ok: true }>(`${apiBase}/account/password`, {
        method: "POST",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      onChanged();
    } catch (caught) {
      if (caught instanceof VendorClientError && caught.status === 401) {
        onSessionEnded();
        return;
      }
      const fields = caught instanceof VendorClientError ? caught.fields : undefined;
      const currentPassword = fields?.currentPassword?.[0];
      const newPassword = fields?.newPassword?.[0];
      if (currentPassword || newPassword) {
        showFieldErrors({ currentPassword, newPassword });
      } else {
        setError(caught instanceof Error ? caught.message : "The password could not be changed.");
        window.requestAnimationFrame(() => errorRef.current?.focus());
      }
    } finally {
      setPending(false);
    }
  };

  const describedBy = (field: FieldName, help?: string) =>
    fieldErrors[field] ? `${idPrefix}-${field}-error` : help;

  return (
    <form ref={formRef} className="vendor-password-form" onSubmit={submit} noValidate>
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />

      <div className="vendor-field">
        <label htmlFor={`${idPrefix}-current`}>{currentLabel}</label>
        <span className="vendor-input-with-icon">
          <input
            ref={firstFieldRef}
            id={`${idPrefix}-current`}
            type={showCurrent ? "text" : "password"}
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={(event) => update("currentPassword", event.target.value)}
            required
            maxLength={200}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.currentPassword) || undefined}
            aria-describedby={describedBy("currentPassword")}
          />
          <PasswordToggle
            className="vendor-password-toggle"
            visible={showCurrent}
            controls={`${idPrefix}-current`}
            onToggle={() => setShowCurrent((visible) => !visible)}
            disabled={pending}
            iconSize={19}
          />
        </span>
        {fieldErrors.currentPassword ? (
          <small id={`${idPrefix}-currentPassword-error`} className="vendor-field-error">
            {fieldErrors.currentPassword}
          </small>
        ) : null}
      </div>

      <div className="vendor-field">
        <label htmlFor={`${idPrefix}-new`}>New password</label>
        <span className="vendor-input-with-icon">
          <input
            id={`${idPrefix}-new`}
            type={showNew ? "text" : "password"}
            autoComplete="new-password"
            spellCheck={false}
            value={values.newPassword}
            onChange={(event) => update("newPassword", event.target.value)}
            required
            // Mirrors server/security/password-policy.ts (NIST 800-63B).
            minLength={15}
            maxLength={128}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.newPassword) || undefined}
            aria-describedby={describedBy("newPassword", `${idPrefix}-new-help`)}
          />
          <PasswordToggle
            className="vendor-password-toggle"
            visible={showNew}
            controls={`${idPrefix}-new ${idPrefix}-confirm`}
            onToggle={() => setShowNew((visible) => !visible)}
            disabled={pending}
            iconSize={19}
          />
        </span>
        {fieldErrors.newPassword ? (
          <small id={`${idPrefix}-newPassword-error`} className="vendor-field-error">
            {fieldErrors.newPassword}
          </small>
        ) : (
          <small id={`${idPrefix}-new-help`}>
            At least 15 characters. A few unrelated words make a good passphrase.
          </small>
        )}
      </div>

      <div className="vendor-field">
        <label htmlFor={`${idPrefix}-confirm`}>Confirm new password</label>
        <input
          id={`${idPrefix}-confirm`}
          type={showNew ? "text" : "password"}
          autoComplete="new-password"
          spellCheck={false}
          value={values.confirmPassword}
          onChange={(event) => update("confirmPassword", event.target.value)}
          required
          maxLength={128}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.confirmPassword) || undefined}
          aria-describedby={describedBy("confirmPassword")}
        />
        {fieldErrors.confirmPassword ? (
          <small id={`${idPrefix}-confirmPassword-error`} className="vendor-field-error">
            {fieldErrors.confirmPassword}
          </small>
        ) : null}
      </div>

      {error ? (
        <p ref={errorRef} tabIndex={-1} className="vendor-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="vendor-dialog__actions">
        {onCancel ? (
          <button className="vendor-secondary" type="button" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
        ) : null}
        <button className="vendor-primary" type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="vendor-spin" size={18} /> : null}
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
