# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). `AUD-n` refers to
the findings of the 2026-10-08 project audit.

## [Unreleased]

### Before you deploy

- **Apply the migrations first, then merge (deploy) the app.** Review the
  dry run, which lists what is pending (`20261009120000` too, if it was
  never applied):

  ```bash
  npx supabase db push --linked --dry-run
  npx supabase db push --linked
  npm run supabase:verify
  ```

  `supabase:provision` is not needed. All three new migrations are safe for
  the app that is live now:
  - `20261030120000` schedules order redaction (`chapega-redact-orders`).
  - `20261030121000` lets a shop rename itself; the current app never
    changes `display_name`.
  - `20261030122000` adds `vendor_users.must_change_password` (default false,
    so no existing account is affected) and the team and password
    functions.
- If the app goes out before the migrations, sign-in and existing screens
  keep working, but Team, change password, owner reset and Add vendor answer
  503 until `20261030122000` is applied, and renaming a shop fails until
  `20261030121000` is.
- **The first nightly redaction is permanent.** It blanks customer details on
  every order completed or cancelled more than 30 days ago and on every draft
  prepared more than 30 days ago that the shop never confirmed. Export
  anything the shop still needs before applying `20261030120000`.
- Before applying, `select slug from private.vendors where slug in ('team',
  'account');` must return nothing (both became reserved routes).
- `npm run vendor:password` on Supabase now needs `SUPABASE_ADMIN_DATABASE_URL`.
- People given a temporary password (new owners from Add vendor, new team
  members, any reset) choose their own at the next sign-in. Rolling the app
  back afterwards is safe; never roll back the migrations.

### Security

- Next.js 16.3.8 → 16.4.3 (and `eslint-config-next` with it) for
  GHSA-2464-fhr4-w9xw (image optimizer RCE with SVG), GHSA-p3m5-59mp-jv5r
  (Server Actions denial of service) and GHSA-673q-mjm6-r5xr (`use cache`
  RCE). The app uses neither Server Actions nor `use cache`, and `sharp`
  was already 0.35.5, so these were not reachable here.
- zod 4.4.3 → 4.6.7 for GHSA-mrhx-c7xc-m3w5: zod parsed every element of an
  array before checking `.max()`, so the public kiosk order endpoint could
  be made to parse an oversized `items` array (bounded by the 128 KB body
  cap).
- Both advisories made CI's `npm audit --omit=dev --audit-level=high` step
  fail, so every pull request was red. It passes again.
- A password someone else chose is now temporary: until the person replaces
  it, the Studio shows only a "Set a new password" page and every other
  endpoint answers `PASSWORD_CHANGE_REQUIRED` (OWASP ASVS 2.3.1).
- On Supabase, accounts and sessions change only through narrow
  `SECURITY DEFINER` functions that prove the caller from the session it
  presented, and a shop-scoped write that touches them now fails (403)
  instead of a silent no-op. `npm run supabase:verify` checks those
  functions' grants and `search_path`.

### Changed

- Server functions run in Vercel's Seoul region (`icn1`), next to the Supabase
  database, instead of the default US East. Each render makes several
  database round trips, which made the kiosk home page answer in about
  2.4 s (AUD-24).
- Dependencies: React 19.3, Vitest 5 (with its coverage plugin), Supabase
  CLI 2.119, Node types matched to the Node 22 runtime, and the GitHub
  checkout, setup-node and upload-artifact actions at v7. ESLint stays on 9
  because the React lint plugin does not support ESLint 10 yet, and
  TypeScript stays below 6.1 for typescript-eslint. Dependabot now groups
  packages that must move together, batches small dev-tool updates into one
  PR, and skips those majors. Also tsx 4.23.15, lint-staged 17.6, jsdom
  30.1.1 and Testing Library React 16.3.3.
- The Content Security Policy is now enforced instead of report-only. Every
  kiosk, Studio and admin screen loaded with no violation first, locally and
  on the live site.
- Expired Studio and admin sessions are deleted daily at 03:15 UTC by a
  pg_cron job (migration `20261009120000`). Apply it after deploying; it is
  independent of the app code.
- The privacy notice is final and indexable. It names Chapega.com as
  responsible, states the 30-day rule, and (opened from a kiosk) gives that
  shop's WhatsApp number for data requests. "Back to the kiosk" returns to
  that shop's kiosk.
- New owners created with Add vendor choose their own password at their
  first sign-in.
- Order search matches phone numbers in any format ("+91 98765 43210").
- Studio "Restock" opens that product's editor.
- The admin activity rail names team and password changes.

### Added

- `/.well-known/security.txt` and `SECURITY.md` with a private way to
  report vulnerabilities. GitHub private vulnerability reporting is on.
- **Team** in Vendor Studio (owners): add managers and staff with a temporary
  password, change their role, remove or restore their access, and set a
  new temporary password. Owners are never changed there. An email already
  on the platform is refused without saying where, and a temporary password
  is set only for someone who belongs to this shop alone.
- **Change password** in the Studio sidebar and the admin account menu.
- **Reset owner password** in the admin vendor list, for a locked-out owner.
- **Remove customer details** on a Studio order (owners and managers,
  audited), so the privacy notice's deletion promise can be kept.
- Automatic 30-day removal of customer details (migration `20261030120000`),
  covering drafts the shop never confirmed, which used to keep them forever.
  The local store applies the same rule when it saves.

### Fixed

- Product editor and admin "Add vendor" dialog: the divider line ran
  through each section heading, and a heading sat 24 px further from its
  fields than the first one did. The divider now sits between sections.
- Product editor: the drawer was an `<aside>` with `role="dialog"`, which
  is invalid ARIA. It is a `<div>` now; nothing changes visually.
- Dialogs no longer move focus to their first control a frame after opening
  if focus is already inside them. On a slow device that could send the
  first keystrokes to the Close button and lose an edit.
- `npm run vendor:password` did not work on Supabase (the documented
  lockout recovery): it ran under the restricted role and either found no
  account or was refused. It now uses the owner connection.
- Renaming a shop in Settings now renames it everywhere (page titles, Studio
  header, shop picker, admin); before, only the kiosk and WhatsApp name
  changed. Migration `20261030121000` also repairs shops renamed earlier.
- Admin "Accounts" did nothing when the vendor search had no results.
- On mobile, each admin vendor row showed a navigation arrow that opened the
  Suspend dialog; it now shows the pause or play icon.
- README: the Content Security Policy is enforced (it said report-only),
  and retention runs automatically. RUNBOOK: the pg_cron example was invalid
  SQL; it now describes the scheduled job and how to check it.

### Removed

- Four unused `NEXT_PUBLIC_*` lines from `.env.example`; nothing read them.

## [0.2.0] - 2026-10-08

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
