"use client";

import { Check, Copy, KeyRound, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { generateTemporaryPassword } from "@/domain/team";
import type { AdminVendorMutationResult, AdminVendorSummary } from "@/types/admin";
import { PasswordToggle } from "../password-toggle";
import { adminRequest, AdminClientError } from "./admin-client";
import { AdminDialog } from "./admin-dialog";

type ResetOwnerPasswordDialogProps = {
  vendor: AdminVendorSummary;
  onClose: () => void;
  onReset: (result: AdminVendorMutationResult) => void;
  onSessionEnded: () => void;
};

/**
 * For a locked-out shop owner: sets a temporary password, signs the owner out
 * everywhere, and makes them choose their own at the next sign-in.
 */
export function ResetOwnerPasswordDialog({
  vendor,
  onClose,
  onReset,
  onSessionEnded,
}: ResetOwnerPasswordDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (issued) doneRef.current?.focus();
  }, [issued]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await adminRequest<AdminVendorMutationResult>(
        `/api/admin/vendors/${encodeURIComponent(vendor.id)}/owner-password`,
        {
          method: "POST",
          body: JSON.stringify({ ownerId: vendor.owner.id, temporaryPassword: password }),
        },
      );
      onReset(result);
      setIssued(password);
    } catch (caught) {
      if (caught instanceof AdminClientError && caught.status === 401) {
        onSessionEnded();
        return;
      }
      const problem =
        caught instanceof AdminClientError ? caught.fields?.temporaryPassword?.[0] : undefined;
      if (problem) {
        setFieldError(problem);
      } else {
        setError(caught instanceof Error ? caught.message : "The password could not be reset.");
        window.requestAnimationFrame(() => errorRef.current?.focus());
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <AdminDialog
      title={issued ? "Temporary password set" : "Reset owner password"}
      description={
        issued
          ? `Give ${vendor.owner.name} these details. They choose their own password when they sign in.`
          : `${vendor.owner.name} (${vendor.displayName}) is signed out everywhere and must choose a new password at the next sign-in.`
      }
      onClose={onClose}
      busy={pending}
      initialFocusRef={issued ? doneRef : cancelRef}
      compact
    >
      {issued ? (
        <>
          <dl className="admin-issued">
            <div>
              <dt>Email</dt>
              <dd>{vendor.owner.email}</dd>
            </div>
            <div>
              <dt>Temporary password</dt>
              <dd>
                <code>{issued}</code>
              </dd>
            </div>
          </dl>
          <footer className="admin-dialog__actions">
            <button
              className="admin-secondary"
              type="button"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(issued)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? "Copied" : "Copy password"}
            </button>
            <button ref={doneRef} className="admin-primary" type="button" onClick={onClose}>
              Done
            </button>
          </footer>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="admin-field admin-field--full">
            <label htmlFor="admin-reset-password">Temporary password</label>
            <span className="admin-temporary-password">
              <span className="admin-password-field">
                <input
                  id="admin-reset-password"
                  type={visible ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldError(null);
                  }}
                  autoComplete="new-password"
                  spellCheck={false}
                  required
                  minLength={15}
                  maxLength={128}
                  disabled={pending}
                  aria-invalid={Boolean(fieldError) || undefined}
                  aria-describedby={
                    fieldError ? "admin-reset-password-error" : "admin-reset-password-help"
                  }
                />
                <PasswordToggle
                  className="admin-password-toggle"
                  visible={visible}
                  controls="admin-reset-password"
                  onToggle={() => setVisible((current) => !current)}
                  disabled={pending}
                />
              </span>
              <button
                className="admin-secondary"
                type="button"
                disabled={pending}
                onClick={() => {
                  setPassword(generateTemporaryPassword());
                  setVisible(true);
                  setFieldError(null);
                }}
              >
                Generate
              </button>
            </span>
            {fieldError ? (
              <small id="admin-reset-password-error">{fieldError}</small>
            ) : (
              <small id="admin-reset-password-help">
                At least 15 characters. Share it with the owner privately.
              </small>
            )}
          </div>
          {error ? (
            <p ref={errorRef} tabIndex={-1} className="admin-form-error" role="alert">
              {error}
            </p>
          ) : null}
          <footer className="admin-dialog__actions">
            <button
              ref={cancelRef}
              className="admin-secondary"
              type="button"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button className="admin-primary" type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="admin-spin" size={18} /> : <KeyRound size={18} />}
              {pending ? "Saving…" : "Set temporary password"}
            </button>
          </footer>
        </form>
      )}
    </AdminDialog>
  );
}
