# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). `AUD-n` refers to
the findings of the 2026-10-08 project audit.

## [Unreleased]

### Before you deploy

- **Deploy the app first, then apply the migrations straight away.** The
  old app saves through `INSERT ... ON CONFLICT` on `private.vendors`, which
  only the blanket policies allowed. Migration `20261008120000` removes
  them, so applying it first would fail every order and edit until the new
  app is live. The new app works on the old schema.
- Then apply the migrations in order (`npx supabase db push --linked`):
  `20261008120000` (tenant policy repair), `20261008121000` (schema
  hygiene), `20261008122000` (order data retention) and `20261008130000`
  (auth hardening). Until the last one is applied, Supabase sessions end
  30 minutes after sign-in.
- Then re-run `npm run supabase:provision`. It no longer grants anything
  and refuses to run while a blanket policy exists.
- After this release, never roll the app back to an earlier build. Roll
  forward instead (see `docs/RUNBOOK.md`).
- On a new database, create the first owner with
  `npm run supabase:bootstrap-owner -- --vendor=<slug>`.
- Passwords issued from now on must be 15–128 characters and not common
  or self-referential. Existing passwords keep working.
- The server now refuses to start with invalid settings or with the
  `.env.example` placeholder password.

### Security

- Tenant writes no longer depend on a blanket `chapega_app` policy. The
  role is limited to its own tenant, and a tenant can bump only its own
  vendor revision, never its identity or status (AUD-1, AUD-2).
- Next.js upgraded to 16.3.8, with patched `sharp` and `source-map-js` (AUD-4).
- Same-origin checks compare `Origin` with the host the browser actually
  addressed (AUD-6).
- Sign-in throttling uses per-account backoff with per-address and
  instance caps instead of a shared limit that let one client lock out
  every account. Kiosk catalogue reads are rate-limited (AUD-7).
- The preview and placeholder credentials are refused on every sign-in
  path (AUD-8).
- Vendor sessions end after 30 idle minutes and admin sessions after 15.
  Background polling does not count as activity, and the runtime role
  can only move a session's expiry (AUD-17).
- scrypt raised to N=2^17 with transparent re-hashing on sign-in, and a
  NIST SP 800-63B password policy (AUD-18).
- Request bodies are limited while streaming (AUD-19).
- Password verification runs outside the database transaction. Every
  transaction has statement, lock and idle timeouts (AUD-26).
- Clickjacking, referrer, content-type, permissions and HSTS headers, plus
  a report-only Content Security Policy (AUD-28).
- Upload metadata is stripped completely and hashes are normalized.
  Customer text is cleared of control and bidi-override characters before
  it reaches WhatsApp (AUD-36).
- Vendor slugs that would shadow a fixed route are refused (AUD-40).

### Added

- Guarded first-owner bootstrap for Supabase (AUD-3).
- Structured JSON logs with request IDs, `/api/healthz`, `/api/readyz`
  and a global error page (AUD-13).
- Startup configuration validation (AUD-27).
- Draft privacy notice at `/privacy`, and owner-run functions to purge
  expired sessions and redact customer details from old orders (AUD-12,
  AUD-38).
- Per-route titles, app icons and a web manifest (AUD-31).
- Dark mode for Vendor Studio and admin: follows the device, with a
  System / Light / Dark switch remembered in a cookie. The public kiosk
  stays light (AUD-32).
- One accessible confirm dialog for archiving a product, cancelling an
  order, suspending a shop and starting a new kiosk order from the QR
  screen (AUD-22).
- Show / hide password on both sign-in forms and on Add vendor, and
  placeholders instead of a full-page loader, shown only after 300 ms
  (AUD-32).
- Prettier, a lint-staged pre-commit hook, and a pull request template
  (AUD-34).
- An all-rights-reserved `LICENSE` (AUD-33).
- Real-Postgres integration suite for row-level security, run in CI
  (AUD-1, AUD-2).
- Playwright runs on Chromium, Firefox, WebKit, mobile Chrome and mobile
  Safari. Unit coverage is reported with ratcheted thresholds. CI also
  runs a dependency audit and a gitleaks secret scan, and Dependabot is
  enabled (AUD-25, AUD-34).

### Changed

- Kiosk order numbers are assigned by the server, and submissions use a
  random idempotency key (AUD-37).
- The public kiosk bootstrap reads only visible catalogue rows (it used to
  load the shop's whole history, including credential hashes in Supabase
  mode), is rate-limited, and is revalidated with an ETag (AUD-7, AUD-14).
- Admin status changes are guarded by the status the admin saw, not the
  vendor revision (AUD-16).
- The kiosk applies the catalogue the server rendered instead of fetching
  it again on load, and its Vendor login links no longer prefetch. Mobile
  LCP is 2.2 s under applied slow-4G and 4× CPU throttling; Lighthouse's
  simulated estimate on localhost is 3.1 s (AUD-24).

### Fixed

- Product variants were lost when an update or a visibility toggle omitted
  them (AUD-9).
- Unknown or suspended shop links showed Chapega's catalogue and branding
  with HTTP 200 (AUD-11).
- Reloading the QR screen lost the order, and preparing it again created a
  duplicate (AUD-10).
- Uploaded product images returned 404 under `next start`, and in Supabase
  mode unless the backend was set at build time (AUD-15).
- The QR privacy pause could be extended indefinitely (AUD-17).
- The local backend stopped taking orders after 500 unconfirmed drafts,
  and its audit log evicted platform sign-ins (AUD-20).
- Focus handling, landmarks and error announcements in the kiosk, Vendor
  Studio and admin (AUD-22).
- Horizontal page scrolling at tablet widths (AUD-23).
- Text below 4.5:1 contrast (kiosk step labels, old prices, Studio's
  secondary text) and touch controls under 44 px (AUD-22).
- Hover styles stuck on touch screens, and anchor or focus scrolling hidden
  under sticky headers (AUD-32).
- Hydration replaced the server-rendered welcome screen, so the hero image
  only counted as painted after JavaScript ran (AUD-24).
- Typed login input was overwritten on hydration (AUD-39).
- Admin navigation destinations and the vendor slug field (AUD-40).
- The README quick start and its credentials were wrong (AUD-33).

### Removed

- Dead kiosk, vendor and admin code, unused art and the full-page
  `app/loading.tsx` preloader (AUD-35).

## [0.1.0]

- Initial multi-vendor kiosk, Vendor Studio and platform admin.
