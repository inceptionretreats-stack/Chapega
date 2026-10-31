"use client";

import {
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  UserMinus,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ASSIGNABLE_TEAM_ROLES,
  generateTemporaryPassword,
  TEAM_ROLE_LABELS,
  TEAM_ROLE_SUMMARIES,
} from "@/domain/team";
import type { AssignableTeamRole, VendorTeamMember } from "@/types/vendor";
import { ConfirmDialog } from "../confirm-dialog";
import { PasswordToggle } from "../password-toggle";
import { vendorRequest, VendorClientError } from "./vendor-client";
import { VendorFormDialog } from "./vendor-form-dialog";
import { focusFirstInvalid } from "./vendor-shared";

type VendorTeamProps = {
  apiBase: string;
  shopName: string;
  onToast: (message: string, tone?: "success" | "error") => void;
  onSessionEnded: () => void;
};

type Issued = Readonly<{ name: string; email: string; password: string }>;

function memberState(member: VendorTeamMember): Readonly<{ label: string; tone: string }> {
  if (!member.active) return { label: "No access", tone: "is-inactive" };
  if (member.passwordChangePending)
    return { label: "Waiting for their own password", tone: "is-pending" };
  return { label: "Active", tone: "is-active" };
}

export function VendorTeam({ apiBase, shopName, onToast, onSessionEnded }: VendorTeamProps) {
  const [members, setMembers] = useState<readonly VendorTeamMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<VendorTeamMember | null>(null);
  const [deactivating, setDeactivating] = useState<VendorTeamMember | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const failed = useCallback(
    (caught: unknown, fallback: string) => {
      if (caught instanceof VendorClientError && caught.status === 401) {
        onSessionEnded();
        return null;
      }
      return caught instanceof Error ? caught.message : fallback;
    },
    [onSessionEnded],
  );

  // Bumped by "Try again" to load the team once more.
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    vendorRequest<{ members: VendorTeamMember[] }>(`${apiBase}/team`)
      .then((result) => {
        if (current) setMembers(result.members);
      })
      .catch((caught: unknown) => {
        const message = failed(caught, "The team could not be loaded.");
        if (current && message) setLoadError(message);
      });
    return () => {
      current = false;
    };
  }, [apiBase, failed, loadAttempt]);

  const load = () => {
    setLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  };

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const replace = (member: VendorTeamMember) =>
    setMembers((current) =>
      current
        ? current.some((candidate) => candidate.userId === member.userId)
          ? current.map((candidate) => (candidate.userId === member.userId ? member : candidate))
          : [...current, member]
        : [member],
    );

  const change = async (
    member: VendorTeamMember,
    body: Readonly<{ role: AssignableTeamRole } | { active: boolean }>,
    message: string,
  ) => {
    if (busyId) return;
    setBusyId(member.userId);
    setError(null);
    try {
      const result = await vendorRequest<{ member: VendorTeamMember }>(
        `${apiBase}/team/${encodeURIComponent(member.userId)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      replace(result.member);
      onToast(message);
      setDeactivating(null);
    } catch (caught) {
      setDeactivating(null);
      const failure = failed(caught, "The change could not be saved.");
      if (failure) setError(failure);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="vendor-workspace vendor-team-view">
      <section className="vendor-panel" aria-labelledby="team-title">
        <header className="vendor-panel-header">
          <div>
            <h2 id="team-title">People who can sign in to {shopName}</h2>
            <p>
              Managers look after orders and products. Staff handle orders. Only the owner changes
              settings and the team.
            </p>
          </div>
          <button className="vendor-primary" type="button" onClick={() => setAdding(true)}>
            <UserPlus size={18} /> Add team member
          </button>
        </header>

        {error ? (
          <div ref={errorRef} tabIndex={-1} className="vendor-inline-error" role="alert">
            {error}
          </div>
        ) : null}

        {loadError ? (
          <div className="vendor-panel-empty">
            <div>
              <strong>The team could not be loaded</strong>
              <p>{loadError}</p>
              <button className="vendor-secondary" type="button" onClick={load}>
                <RefreshCw size={17} /> Try again
              </button>
            </div>
          </div>
        ) : members === null ? (
          <p className="vendor-team-loading" role="status">
            <LoaderCircle className="vendor-spin" size={18} /> Loading the team…
          </p>
        ) : (
          <ul className="vendor-team-list">
            {members.map((member) => {
              const state = memberState(member);
              const busy = busyId === member.userId;
              return (
                <li
                  key={member.userId}
                  className={`vendor-team-member${member.active ? "" : " is-inactive"}`}
                >
                  <div className="vendor-team-member__identity">
                    <strong>
                      {member.name}
                      {member.isCurrentUser ? <span className="vendor-team-you">You</span> : null}
                    </strong>
                    <span>{member.email}</span>
                  </div>
                  <div className="vendor-team-member__role">
                    {member.canManage ? (
                      <label className="vendor-team-role-select">
                        <span className="sr-only">Role for {member.name}</span>
                        <select
                          value={member.role}
                          disabled={busy}
                          onChange={(event) => {
                            const role = event.target.value as AssignableTeamRole;
                            void change(
                              member,
                              { role },
                              `${member.name} is now ${TEAM_ROLE_LABELS[role].toLowerCase()}.`,
                            );
                          }}
                        >
                          {ASSIGNABLE_TEAM_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {TEAM_ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className="vendor-role-badge">{TEAM_ROLE_LABELS[member.role]}</span>
                    )}
                  </div>
                  <span className={`vendor-member-state ${state.tone}`}>
                    <i aria-hidden="true" />
                    {state.label}
                  </span>
                  <div className="vendor-team-member__actions">
                    {member.canManage ? (
                      member.active ? (
                        <button
                          className="vendor-quiet"
                          type="button"
                          onClick={() => setDeactivating(member)}
                          disabled={busy}
                          aria-haspopup="dialog"
                          aria-label={`Remove access for ${member.name}`}
                        >
                          <UserMinus size={17} /> Remove access
                        </button>
                      ) : (
                        <button
                          className="vendor-secondary"
                          type="button"
                          onClick={() =>
                            void change(
                              member,
                              { active: true },
                              `${member.name} can sign in to ${shopName} again.`,
                            )
                          }
                          disabled={busy}
                          aria-label={`Give ${member.name} access again`}
                        >
                          {busy ? (
                            <LoaderCircle className="vendor-spin" size={17} />
                          ) : (
                            <UserRoundCheck size={17} />
                          )}{" "}
                          Give access again
                        </button>
                      )
                    ) : null}
                    {member.canResetPassword ? (
                      <button
                        className="vendor-quiet"
                        type="button"
                        onClick={() => setResetting(member)}
                        disabled={busy}
                        aria-haspopup="dialog"
                        aria-label={`Set a temporary password for ${member.name}`}
                      >
                        <KeyRound size={17} /> Set temporary password
                      </button>
                    ) : member.canManage ? (
                      <small className="vendor-team-hint">
                        Also on another shop: they change their own password.
                      </small>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {adding ? (
        <AddMemberDialog
          apiBase={apiBase}
          shopName={shopName}
          onClose={() => setAdding(false)}
          onAdded={(member) => {
            replace(member);
            onToast(`${member.name} was added to the team.`);
          }}
          onSessionEnded={onSessionEnded}
        />
      ) : null}

      {resetting ? (
        <TemporaryPasswordDialog
          shopName={shopName}
          apiBase={apiBase}
          member={resetting}
          onClose={() => setResetting(null)}
          onReset={(member) => {
            replace(member);
            onToast(`${member.name} has a new temporary password.`);
          }}
          onSessionEnded={onSessionEnded}
        />
      ) : null}

      {deactivating ? (
        <ConfirmDialog
          title={`Remove ${deactivating.name}'s access?`}
          description={`${deactivating.name} is signed out of ${shopName} now and can't sign in to it until you give access again. Their past orders and history stay.`}
          confirmLabel="Remove access"
          pendingLabel="Removing…"
          cancelLabel="Keep access"
          pending={busyId === deactivating.userId}
          onConfirm={() =>
            void change(
              deactivating,
              { active: false },
              `${deactivating.name} no longer has access to ${shopName}.`,
            )
          }
          onCancel={() => setDeactivating(null)}
        />
      ) : null}
    </div>
  );
}

function TemporaryPasswordField({
  id,
  value,
  error,
  disabled,
  onChange,
}: Readonly<{
  id: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="vendor-field">
      <label htmlFor={id}>Temporary password</label>
      <span className="vendor-temporary-password">
        <span className="vendor-input-with-icon">
          <input
            id={id}
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            spellCheck={false}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required
            minLength={15}
            maxLength={128}
            disabled={disabled}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? `${id}-error` : `${id}-help`}
          />
          <PasswordToggle
            className="vendor-password-toggle"
            visible={visible}
            controls={id}
            onToggle={() => setVisible((current) => !current)}
            disabled={disabled}
            iconSize={19}
          />
        </span>
        <button
          className="vendor-secondary"
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(generateTemporaryPassword());
            setVisible(true);
          }}
        >
          Generate
        </button>
      </span>
      {error ? (
        <small id={`${id}-error`} className="vendor-field-error">
          {error}
        </small>
      ) : (
        <small id={`${id}-help`}>
          At least 15 characters. They choose their own password when they first sign in.
        </small>
      )}
    </div>
  );
}

function IssuedCredentials({
  issued,
  shopName,
  onDone,
}: Readonly<{ issued: Issued; shopName: string; onDone: () => void }>) {
  const doneRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => doneRef.current?.focus(), []);
  return (
    <div className="vendor-issued" role="status">
      <p>
        Give {issued.name} these details. They sign in at the Vendor Studio for {shopName} and
        choose their own password straight away.
      </p>
      <dl>
        <div>
          <dt>Email</dt>
          <dd>{issued.email}</dd>
        </div>
        <div>
          <dt>Temporary password</dt>
          <dd>
            <code>{issued.password}</code>
          </dd>
        </div>
      </dl>
      <div className="vendor-dialog__actions">
        <button
          className="vendor-secondary"
          type="button"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(issued.password)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? <Check size={17} /> : <Copy size={17} />} {copied ? "Copied" : "Copy password"}
        </button>
        <button ref={doneRef} className="vendor-primary" type="button" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

function AddMemberDialog({
  apiBase,
  shopName,
  onClose,
  onAdded,
  onSessionEnded,
}: Readonly<{
  apiBase: string;
  shopName: string;
  onClose: () => void;
  onAdded: (member: VendorTeamMember) => void;
  onSessionEnded: () => void;
}>) {
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    role: "staff" as AssignableTeamRole,
    temporaryPassword: "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [issued, setIssued] = useState<Issued | null>(null);

  const update = <K extends keyof typeof draft>(field: K, value: (typeof draft)[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await vendorRequest<{ member: VendorTeamMember }>(`${apiBase}/team`, {
        method: "POST",
        body: JSON.stringify(draft),
      });
      onAdded(result.member);
      setIssued({
        name: result.member.name,
        email: result.member.email,
        password: draft.temporaryPassword,
      });
    } catch (caught) {
      if (caught instanceof VendorClientError && caught.status === 401) {
        onSessionEnded();
        return;
      }
      const fields = caught instanceof VendorClientError ? caught.fields : undefined;
      const next = {
        name: fields?.name?.[0],
        email: fields?.email?.[0],
        role: fields?.role?.[0],
        temporaryPassword: fields?.temporaryPassword?.[0],
      };
      if (Object.values(next).some(Boolean)) {
        setFieldErrors(next);
        window.requestAnimationFrame(() => focusFirstInvalid(formRef.current, errorRef.current));
      } else {
        setError(caught instanceof Error ? caught.message : "The team member could not be added.");
        window.requestAnimationFrame(() => errorRef.current?.focus());
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <VendorFormDialog
      title={issued ? `${issued.name} was added` : "Add a team member"}
      description={
        issued
          ? undefined
          : `They can sign in to ${shopName} with the email and temporary password you set here.`
      }
      initialFocusRef={nameRef}
      busy={pending}
      onClose={onClose}
    >
      {issued ? (
        <IssuedCredentials issued={issued} shopName={shopName} onDone={onClose} />
      ) : (
        <form ref={formRef} className="vendor-team-form" onSubmit={submit} noValidate>
          <div className="vendor-field">
            <label htmlFor="team-add-name">Name</label>
            <input
              id="team-add-name"
              ref={nameRef}
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
              autoComplete="off"
              required
              maxLength={80}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.name) || undefined}
              aria-describedby={fieldErrors.name ? "team-add-name-error" : undefined}
            />
            {fieldErrors.name ? (
              <small id="team-add-name-error" className="vendor-field-error">
                {fieldErrors.name}
              </small>
            ) : null}
          </div>
          <div className="vendor-field">
            <label htmlFor="team-add-email">Email</label>
            <input
              id="team-add-email"
              type="email"
              value={draft.email}
              onChange={(event) => update("email", event.target.value)}
              autoComplete="off"
              required
              maxLength={160}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.email) || undefined}
              aria-describedby={fieldErrors.email ? "team-add-email-error" : undefined}
            />
            {fieldErrors.email ? (
              <small id="team-add-email-error" className="vendor-field-error">
                {fieldErrors.email}
              </small>
            ) : null}
          </div>
          <fieldset className="vendor-team-roles">
            <legend>Role</legend>
            {ASSIGNABLE_TEAM_ROLES.map((role) => (
              <label key={role} className="vendor-team-role-option">
                <input
                  type="radio"
                  name="team-role"
                  value={role}
                  checked={draft.role === role}
                  onChange={() => update("role", role)}
                  disabled={pending}
                />
                <span>
                  <strong>{TEAM_ROLE_LABELS[role]}</strong>
                  <small>{TEAM_ROLE_SUMMARIES[role]}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <TemporaryPasswordField
            id="team-add-password"
            value={draft.temporaryPassword}
            error={fieldErrors.temporaryPassword}
            disabled={pending}
            onChange={(value) => update("temporaryPassword", value)}
          />
          {error ? (
            <p ref={errorRef} tabIndex={-1} className="vendor-form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="vendor-dialog__actions">
            <button className="vendor-secondary" type="button" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button className="vendor-primary" type="submit" disabled={pending}>
              {pending ? (
                <LoaderCircle className="vendor-spin" size={18} />
              ) : (
                <UserPlus size={18} />
              )}
              {pending ? "Adding…" : "Add to team"}
            </button>
          </div>
        </form>
      )}
    </VendorFormDialog>
  );
}

function TemporaryPasswordDialog({
  shopName,
  apiBase,
  member,
  onClose,
  onReset,
  onSessionEnded,
}: Readonly<{
  apiBase: string;
  shopName: string;
  member: VendorTeamMember;
  onClose: () => void;
  onReset: (member: VendorTeamMember) => void;
  onSessionEnded: () => void;
}>) {
  const fieldRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [issued, setIssued] = useState<Issued | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await vendorRequest<{ member: VendorTeamMember }>(
        `${apiBase}/team/${encodeURIComponent(member.userId)}/password`,
        { method: "POST", body: JSON.stringify({ temporaryPassword: password }) },
      );
      onReset(result.member);
      setIssued({ name: member.name, email: member.email, password });
    } catch (caught) {
      if (caught instanceof VendorClientError && caught.status === 401) {
        onSessionEnded();
        return;
      }
      const problem =
        caught instanceof VendorClientError ? caught.fields?.temporaryPassword?.[0] : undefined;
      if (problem) {
        setFieldError(problem);
      } else {
        setError(caught instanceof Error ? caught.message : "The password could not be set.");
        window.requestAnimationFrame(() => errorRef.current?.focus());
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <VendorFormDialog
      title={issued ? "Temporary password set" : `Set a temporary password for ${member.name}`}
      description={
        issued
          ? undefined
          : `${member.name} is signed out everywhere and must choose a new password at the next sign-in.`
      }
      initialFocusRef={fieldRef}
      busy={pending}
      onClose={onClose}
    >
      {issued ? (
        <IssuedCredentials issued={issued} shopName={shopName} onDone={onClose} />
      ) : (
        <form className="vendor-team-form" onSubmit={submit} noValidate>
          <TemporaryPasswordField
            id="team-reset-password"
            value={password}
            error={fieldError}
            disabled={pending}
            onChange={(value) => {
              setPassword(value);
              setFieldError(undefined);
            }}
          />
          {error ? (
            <p ref={errorRef} tabIndex={-1} className="vendor-form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="vendor-dialog__actions">
            <button
              ref={fieldRef}
              className="vendor-secondary"
              type="button"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button className="vendor-primary" type="submit" disabled={pending}>
              {pending ? (
                <LoaderCircle className="vendor-spin" size={18} />
              ) : (
                <KeyRound size={18} />
              )}
              {pending ? "Saving…" : "Set password"}
            </button>
          </div>
        </form>
      )}
    </VendorFormDialog>
  );
}
