"use client";

import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Store,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type AdminLoginFormProps = {
  authenticationAvailable: boolean;
  previewCredentials: Readonly<{ email: string; password: string }> | null;
};

type LoginFieldErrors = Readonly<{
  email?: string;
  password?: string;
}>;

export function AdminLoginForm({
  authenticationAvailable,
  previewCredentials,
}: AdminLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(previewCredentials?.email ?? "");
  const [password, setPassword] = useState(previewCredentials?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !authenticationAvailable) return;
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: {
          message?: string;
          fields?: Record<string, string[] | undefined>;
        };
      } | null;
      if (!response.ok) {
        setFieldErrors({
          email: result?.error?.fields?.email?.[0],
          password: result?.error?.fields?.password?.[0],
        });
        setError(result?.error?.message ?? "Unable to sign in. Please try again.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("The platform service is unavailable. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="admin-login-shell">
      <section className="admin-login-art" aria-label="Chapega.com platform administration">
        <div className="admin-login-brand">
          <span className="admin-wordmark">Chapega.com</span>
          <span>Platform admin</span>
        </div>
        <div className="admin-login-art__mark" aria-hidden="true">
          <Store size={74} strokeWidth={1.05} />
        </div>
        <div className="admin-login-art__copy">
          <h2>Every storefront, beautifully in view.</h2>
          <p>A private operations space for Chapega platform administrators.</p>
        </div>
      </section>

      <section className="admin-login-panel">
        <div className="admin-login-card">
          <Link className="admin-login-back" href="/">
            <ArrowLeft size={17} aria-hidden="true" /> Back to kiosk
          </Link>
          <div className="admin-login-mobile-brand">
            <span className="admin-wordmark">Chapega.com</span>
            <span>Platform admin</span>
          </div>
          <header>
            <h1>Super admin</h1>
            <p>Sign in to monitor vendors, storefront activity, and platform access.</p>
          </header>

          {!authenticationAvailable ? (
            <p className="admin-form-error" role="status">
              Platform sign-in needs private server credentials before it can be used.
            </p>
          ) : null}

          <form onSubmit={submit} aria-busy={pending}>
            <label className="admin-field">
              <span>Email address</span>
              <span className="admin-login-input">
                <Mail size={19} aria-hidden="true" />
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError(null);
                    setFieldErrors((current) => ({ ...current, email: undefined }));
                  }}
                  placeholder="admin@chapega.com"
                  required
                  maxLength={160}
                  disabled={pending || !authenticationAvailable}
                  aria-invalid={Boolean(error || fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "admin-email-error" : error ? "admin-login-error" : undefined}
                />
              </span>
              {fieldErrors.email ? <small id="admin-email-error">{fieldErrors.email}</small> : null}
            </label>

            <label className="admin-field">
              <span>Password</span>
              <span className="admin-login-input">
                <LockKeyhole size={19} aria-hidden="true" />
                <input
                  id="admin-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError(null);
                    setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                  placeholder="Enter your password"
                  required
                  minLength={8}
                  maxLength={200}
                  disabled={pending || !authenticationAvailable}
                  aria-invalid={Boolean(error || fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "admin-password-error" : error ? "admin-login-error" : undefined}
                />
                <button
                  type="button"
                  className="admin-password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={pending || !authenticationAvailable}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
              {fieldErrors.password ? <small id="admin-password-error">{fieldErrors.password}</small> : null}
            </label>

            {error ? <p id="admin-login-error" className="admin-form-error" role="alert">{error}</p> : null}

            <button className="admin-primary admin-login-submit" type="submit" disabled={pending || !authenticationAvailable}>
              {pending ? <LoaderCircle className="admin-spin" size={19} /> : <ShieldCheck size={19} />}
              <span>{pending ? "Signing in…" : "Sign in securely"}</span>
              {!pending ? <ArrowRight size={18} /> : null}
            </button>
          </form>

          {previewCredentials ? (
            <aside className="admin-preview-access">
              <strong>Local preview access</strong>
              <p><span>Email</span><code>{previewCredentials.email}</code></p>
              <p><span>Password</span><code>{previewCredentials.password}</code></p>
            </aside>
          ) : null}

          <p className="admin-secure-note"><LockKeyhole size={15} /> Separate, private platform session.</p>
        </div>
      </section>
    </main>
  );
}
