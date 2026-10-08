"use client";

import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Gift,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type LoginFormProps = {
  authenticationAvailable: boolean;
  previewCredentials: Readonly<{ email: string; password: string }> | null;
  requestedVendorSlug?: string;
};

type LoginFieldErrors = Readonly<{
  email?: string;
  password?: string;
}>;

export function VendorLoginForm({ authenticationAvailable, previewCredentials, requestedVendorSlug }: LoginFormProps) {
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
      const response = await fetch("/api/vendor/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(requestedVendorSlug ? { vendorSlug: requestedVendorSlug } : {}),
        }),
      });
      const result = (await response.json()) as {
        user?: {
          activeVendor?: { slug?: string } | null;
          platformRole?: "super_admin" | null;
        };
        error?: {
          message?: string;
          fields?: Record<string, string[] | undefined>;
        };
      };
      if (!response.ok) {
        setFieldErrors({
          email: result.error?.fields?.email?.[0],
          password: result.error?.fields?.password?.[0],
        });
        setError(result.error?.message ?? "Unable to sign in. Please try again.");
        return;
      }
      const activeVendorSlug = result.user?.activeVendor?.slug;
      router.replace(
        activeVendorSlug
          ? `/vendor/${encodeURIComponent(activeVendorSlug)}`
          : result.user?.platformRole === "super_admin"
            ? "/admin"
            : "/vendor",
      );
      router.refresh();
    } catch {
      setError("The vendor service is unavailable. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="vendor-login-shell">
      <section className="vendor-login-art" aria-label="Chapega.com Vendor Studio">
        <div className="vendor-login-brand">
          <span className="vendor-wordmark">Chapega.com</span>
          <span>Vendor studio</span>
        </div>
        <div className="vendor-login-gift" aria-hidden="true">
          <Gift strokeWidth={1.15} />
        </div>
        <div className="vendor-login-art-copy">
          <p>Thoughtful operations</p>
          <strong>Every gift, order, and customer moment—kept beautifully in view.</strong>
        </div>
      </section>

      <section className="vendor-login-panel">
        <div className="vendor-login-card">
          <Link className="vendor-login-back" href={requestedVendorSlug ? `/kiosk/${encodeURIComponent(requestedVendorSlug)}` : "/"}>
            <ArrowLeft size={17} aria-hidden="true" /> Back to kiosk
          </Link>
          <div className="vendor-login-mobile-brand">
            <span className="vendor-wordmark">Chapega.com</span>
            <span>Vendor studio</span>
          </div>
          <header>
            <h1>Welcome back</h1>
            <p>Sign in to manage your products, live orders, stock, and kiosk settings.</p>
          </header>

          {!authenticationAvailable ? (
            <p className="vendor-form-error vendor-form-error--panel" role="status">
              Vendor sign-in needs private server credentials before it can be used in production.
            </p>
          ) : null}

          <form onSubmit={submit} aria-busy={pending}>
            <div className="vendor-field">
              <label htmlFor="vendor-email">Email address</label>
              <span className="vendor-input-with-icon">
                <Mail size={19} aria-hidden="true" />
                <input
                  id="vendor-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setError(null);
                    if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
                  }}
                  placeholder="you@chapega.com"
                  required
                  maxLength={160}
                  disabled={pending || !authenticationAvailable}
                  aria-invalid={Boolean(error || fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "vendor-email-error" : error ? "vendor-login-error" : undefined}
                />
              </span>
              {fieldErrors.email ? <small id="vendor-email-error" className="vendor-field-error">{fieldErrors.email}</small> : null}
            </div>

            <div className="vendor-field">
              <label htmlFor="vendor-password">Password</label>
              <span className="vendor-input-with-icon">
                <LockKeyhole size={19} aria-hidden="true" />
                <input
                  id="vendor-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError(null);
                    if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                  placeholder="Enter your password"
                  required
                  minLength={8}
                  maxLength={200}
                  disabled={pending || !authenticationAvailable}
                  aria-invalid={Boolean(error || fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "vendor-password-error" : error ? "vendor-login-error" : undefined}
                />
                <button
                  type="button"
                  className="vendor-password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-controls="vendor-password"
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={pending || !authenticationAvailable}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </span>
              {fieldErrors.password ? <small id="vendor-password-error" className="vendor-field-error">{fieldErrors.password}</small> : null}
            </div>

            {error ? <p id="vendor-login-error" className="vendor-form-error" role="alert">{error}</p> : null}

            <button className="vendor-primary vendor-login-submit" type="submit" disabled={pending || !authenticationAvailable}>
              {pending ? <LoaderCircle className="vendor-spin" size={20} /> : null}
              <span>{pending ? "Signing in…" : authenticationAvailable ? "Sign in" : "Sign-in unavailable"}</span>
              {!pending ? <ArrowRight size={19} /> : null}
            </button>
          </form>

          {previewCredentials ? (
            <aside className="vendor-preview-access">
              <div><ShieldCheck size={18} /><strong>Local preview access</strong></div>
              <p><span>Email</span><code>{previewCredentials.email}</code></p>
              <p><span>Password</span><code>{previewCredentials.password}</code></p>
              <small>Replace these server-only credentials before deployment.</small>
            </aside>
          ) : null}

          <p className="vendor-secure-note"><LockKeyhole size={15} /> Secure, private vendor session.</p>
        </div>
      </section>
    </main>
  );
}
