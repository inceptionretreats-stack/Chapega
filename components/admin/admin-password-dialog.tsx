"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { PasswordToggle } from "../password-toggle";
import { adminRequest, AdminClientError } from "./admin-client";
import { AdminDialog } from "./admin-dialog";

type FieldName = "currentPassword" | "newPassword" | "confirmPassword";

type AdminPasswordDialogProps = {
  email: string;
  onClose: () => void;
  onChanged: () => void;
  onSessionEnded: () => void;
};

/** Changes the signed-in platform admin's own password. */
export function AdminPasswordDialog({
  email,
  onClose,
  onChanged,
  onSessionEnded,
}: AdminPasswordDialogProps) {
  const currentRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [values, setValues] = useState<Record<FieldName, string>>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});

  const update = (field: FieldName, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (values.newPassword !== values.confirmPassword) {
      setFieldErrors({ confirmPassword: "The new passwords don't match." });
      return;
    }
    setPending(true);
    setError(null);
    try {
      await adminRequest<{ ok: true }>("/api/admin/account/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      onChanged();
    } catch (caught) {
      if (caught instanceof AdminClientError && caught.status === 401) {
        onSessionEnded();
        return;
      }
      const fields = caught instanceof AdminClientError ? caught.fields : undefined;
      const currentPassword = fields?.currentPassword?.[0];
      const newPassword = fields?.newPassword?.[0];
      if (currentPassword || newPassword) {
        setFieldErrors({ currentPassword, newPassword });
      } else {
        setError(caught instanceof Error ? caught.message : "The password could not be changed.");
        window.requestAnimationFrame(() => errorRef.current?.focus());
      }
    } finally {
      setPending(false);
    }
  };

  const field = (
    name: FieldName,
    label: string,
    autoComplete: string,
    help?: string,
    ref?: React.RefObject<HTMLInputElement | null>,
  ) => (
    <div className="admin-field admin-field--full">
      <label htmlFor={`admin-${name}`}>{label}</label>
      <span className="admin-password-field">
        <input
          ref={ref}
          id={`admin-${name}`}
          type={visible ? "text" : "password"}
          value={values[name]}
          onChange={(event) => update(name, event.target.value)}
          autoComplete={autoComplete}
          spellCheck={false}
          required
          maxLength={name === "currentPassword" ? 200 : 128}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors[name]) || undefined}
          aria-describedby={
            fieldErrors[name] ? `admin-${name}-error` : help ? `admin-${name}-help` : undefined
          }
        />
        {name === "currentPassword" ? (
          <PasswordToggle
            className="admin-password-toggle"
            visible={visible}
            controls="admin-currentPassword admin-newPassword admin-confirmPassword"
            onToggle={() => setVisible((current) => !current)}
            disabled={pending}
          />
        ) : null}
      </span>
      {fieldErrors[name] ? (
        <small id={`admin-${name}-error`}>{fieldErrors[name]}</small>
      ) : help ? (
        <small id={`admin-${name}-help`}>{help}</small>
      ) : null}
    </div>
  );

  return (
    <AdminDialog
      title="Change your password"
      description="Your other devices will be signed out. This one stays signed in."
      onClose={onClose}
      busy={pending}
      initialFocusRef={currentRef}
      compact
    >
      <form onSubmit={submit} noValidate>
        <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
        <div className="admin-form-grid">
          {field("currentPassword", "Current password", "current-password", undefined, currentRef)}
          {field(
            "newPassword",
            "New password",
            "new-password",
            "At least 15 characters. A few unrelated words make a good passphrase.",
          )}
          {field("confirmPassword", "Confirm new password", "new-password")}
        </div>
        {error ? (
          <p ref={errorRef} tabIndex={-1} className="admin-form-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="admin-dialog__actions">
          <button className="admin-secondary" type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className="admin-primary" type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="admin-spin" size={18} /> : <KeyRound size={18} />}
            {pending ? "Saving…" : "Change password"}
          </button>
        </footer>
      </form>
    </AdminDialog>
  );
}
