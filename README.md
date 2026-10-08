# Chapega.com Kiosk + Vendor Studio

Chapega.com is a responsive, multi-vendor gift-ordering kiosk with a tenant-scoped Vendor Studio and a separate platform-admin portal. Customers browse one vendor's live catalogue, prepare an order, and continue through WhatsApp; each vendor signs in to manage only its own products, stock, orders, availability, and kiosk settings.

The interface keeps the existing ivory, blush, burgundy, and gold brand palette. The kiosk is designed for touch screens and the vendor studio adapts from desktop tables to mobile cards and bottom navigation.

## What is implemented

### Customer kiosk

- Server-synced catalogue, stock, pricing, availability, and shop status; the catalogue is revalidated against an ETag, so an unchanged catalogue costs a body-less 304
- `/` serves the default shop and `/kiosk/<vendor-slug>` any other shop; unknown shops get a real 404 and suspended shops an "unavailable" page
- Search, category filters, product details, variants, gift wrap, and a five-unit hard limit
- Server-authoritative order validation and integer-paise total calculation
- Server-assigned order numbers (`GFT-YYYYMMDD-NNNN`) and idempotent submission with a random key, so a retry or reload never creates a second order
- Customer name, phone, gift note, order note, and Pay Later / Pay at Counter selection; control and bidirectional-override characters are stripped before the text reaches WhatsApp
- Exact WhatsApp Click-to-Chat message, scannable QR, copy fallback, and a privacy countdown whose pause is capped
- A privacy notice at `/privacy` (a **draft with placeholders**: complete it before launch)
- Responsive layouts for kiosk landscape, tablet, and phone sizes

### Vendor Studio

- Protected sign-in with an opaque, `HttpOnly`, `SameSite=Strict` browser-session cookie
- Sessions end after 30 idle minutes and in any case after 12 hours (configurable). The studio's background refresh does not count as activity, so a tab left open still signs out
- Slug-scoped workspaces (`/vendor/:vendorSlug`) with isolated carts, products, orders, settings, uploads, sessions, and audit data
- Owner, manager, and staff memberships with capability-based navigation and server authorization
- Dashboard with order value, product count, low-stock count, live orders, and shop status
- Product create, edit, publish/hide, stock update, image upload, and archive flows
- PNG/JPEG signature and size validation, dimension limits, metadata stripping, and content-addressed filenames
- Order search/filtering, immutable item snapshots, timeline, WhatsApp handoff, cancellation, and controlled status progression
- Stock deduction exactly once at confirmation, with release when a confirmed order is cancelled
- Shop identity, WhatsApp destination, ordering limits, wrapping fee, QR timeout, low-stock threshold, and open/closed controls
- Automatic refresh when the tab regains focus and every 30 seconds while it is visible

### Super admin

- Separate `/admin/login` and protected `/admin` surface with its own platform-scoped session cookie (15 idle minutes, 8 hours at most)
- Platform metrics, recent activity, vendor search/filtering, and responsive vendor tables/cards
- Create a vendor with its initial owner, shop settings, and isolated kiosk in one guarded operation; slugs that would shadow a fixed route (`login`, `privacy`, `api`, …) are refused
- Suspend or reactivate a vendor without deleting its catalogue, orders, settings, or audit history
- Every platform read and mutation revalidates a live `super_admin` session in the database

### Production backend

- Supabase Postgres persistence for vendors, memberships, platform/vendor sessions, products, variants, orders, events, settings, assets, audit records, and distributed rate limits
- One transaction and a database lock for every mutation, with statement and lock timeouts, preserving atomic stock/order behavior across multiple app instances
- A private database schema with forced row-level security keyed to the request's tenant and session, and no `anon` or `authenticated` Data API grants
- Supabase Storage for validated, metadata-stripped runtime product images
- Checksum-verified, idempotent import of the existing local JSON catalogue (accounts are never imported)

## Vendor workflow

1. Open `/vendor/login?vendor=<vendor-slug>` and sign in. Successful sign-in opens `/vendor/<vendor-slug>`; users with more than one membership can switch shops.
2. Use **Products → Add product** to upload an image, enter product information and stock, then publish it to the kiosk.
3. A kiosk order appears in **Orders** as **Prepared on kiosk**. This means the draft was created; it does not claim that WhatsApp delivered the message.
4. After the shop receives and accepts the request, move it through **Confirmed → Preparing → Ready → Completed**. Cancelling a confirmed order releases its committed stock once.
5. Use **Settings** to pause new orders or change the public kiosk rules and WhatsApp destination.

## Super-admin workflow

1. Open `/admin/login` and sign in with an account whose platform role is `super_admin`.
2. Use **Add vendor** to create the tenant, its initial owner and a temporary password, and default shop settings.
3. Open `/kiosk/<vendor-slug>` to verify the isolated public kiosk.
4. Suspend a tenant to block its kiosk ordering and vendor sign-in while retaining all records; reactivate it when access should resume.

## Local setup

Use Node.js 22 (see `.nvmrc`).

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open:

- Customer kiosk: [http://localhost:3000](http://localhost:3000)
- Vendor sign-in: [http://localhost:3000/vendor/login](http://localhost:3000/vendor/login)
- Super-admin sign-in: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)

`.env.example` leaves `VENDOR_EMAIL` and `VENDOR_PASSWORD` unset, so development uses the built-in preview account:

```text
Email: owner@chapega.com
Password: Chapega@2026
```

The preview account is accepted only in development. Production fails closed when private vendor credentials are missing or still match the preview pair, and the server refuses to start while `VENDOR_PASSWORD` is the `.env.example` placeholder. `ALLOW_VENDOR_PREVIEW_LOGIN=true` exists only for an intentional, private local production preview and must not be enabled on a public deployment.

For a private local-backend deployment, set real values in `.env.local`:

```env
VENDOR_EMAIL=owner@example.com
VENDOR_PASSWORD=a-long-passphrase-of-unrelated-words
VENDOR_NAME=Shop owner
CHAPEGA_OWNER_WHATSAPP_NUMBER=919876543210
# Session limits (defaults shown)
VENDOR_SESSION_HOURS=12
VENDOR_SESSION_IDLE_MINUTES=30
ADMIN_SESSION_HOURS=8
ADMIN_SESSION_IDLE_MINUTES=15
# debug | info | warn | error | silent
LOG_LEVEL=info
# Only for a known non-Vercel reverse proxy; Vercel is detected automatically.
# TRUST_PROXY_HEADERS=true
```

New passwords follow NIST SP 800-63B: 15–128 characters, no composition rules, and common, published or self-referential values (your email or name plus a few characters) are refused. Existing passwords keep working; a hash made with older scrypt parameters is upgraded on its next successful sign-in.

Never prefix server values with `NEXT_PUBLIC_`. If `.data/vendor-db.json` has already been initialized, changing the seed environment variables does not rewrite that existing account; use `npm run vendor:password` (below) or start with an empty data directory. Invalid settings (for example a non-numeric session limit) stop the server at startup with a list of the problems.

## Architecture

```text
app/                     Kiosk, Vendor Studio and admin pages, styles, and Route Handlers
components/              Kiosk, vendor, and responsive super-admin screens
data/                    Initial catalogue used only to seed a new local store
domain/                  Cart, money, order, WhatsApp, session-activity and status rules
server/vendor/           Auth, validation, image handling, persistence, throttling, and services
server/admin/            Platform authentication, validation, and vendor lifecycle services
server/security/         Password policy and session lifetime rules
server/http/             Request identity, same-origin checks, and streamed body limits
server/observability/    Structured logging with request IDs and health checks
server/config/           Data-backend selection and startup configuration checks
server/supabase/         Server-only Supabase configuration, Storage, and Postgres clients
supabase/migrations/     Versioned private database schema, policies, and Storage bucket
scripts/                 Supabase provisioning, first-owner bootstrap, import, and password rotation
store/                   Kiosk UI/session state synchronized from the server
types/                   Shared public and vendor DTOs
tests/unit/              Domain, validation, security, and component tests (Vitest)
tests/integration/       Row-level security and tenant isolation on a real Postgres
tests/e2e/               Kiosk, responsive, vendor, and multi-tenant admin workflows (Playwright)
.data/                   Ignored local JSON database and recovery backup
public/vendor-products/  Ignored, validated vendor uploads for local hosting
```

All mutations pass through strict Zod schemas and the server reconstructs order totals from its own product records. Local development can use the checksummed JSON repository. The Supabase adapter keeps the same service/API contracts and serializes each mutation with a Postgres row lock inside one transaction, so order, stock, event, and audit changes commit or roll back together.

### Main endpoints

Vendor endpoints exist in two forms: `/api/vendor/<vendor-slug>/…` acts on that shop, and the unscoped `/api/vendor/…` acts on the session's active shop. Kiosk endpoints likewise exist as `/api/kiosk/<vendor-slug>/…` and as unscoped `/api/kiosk/…` for the default shop. The table lists the slug-scoped form.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/vendor/login` | Validate credentials, rotate sessions, and set the session cookie |
| `POST /api/vendor/logout` | Revoke the current session |
| `GET /api/vendor/:vendorSlug/bootstrap` | Load the tenant's dashboard, products, orders, and settings |
| `POST /api/vendor/:vendorSlug/products` | Create a product |
| `PATCH /api/vendor/:vendorSlug/products/:productId` | Edit, publish/hide, or restock a product (version-checked) |
| `DELETE /api/vendor/:vendorSlug/products/:productId` | Archive a product (version-checked) |
| `POST /api/vendor/:vendorSlug/uploads` | Validate and store a PNG/JPEG product image |
| `DELETE /api/vendor/:vendorSlug/uploads` | Delete an unused content-addressed image |
| `PATCH /api/vendor/:vendorSlug/orders/:orderId` | Apply a permitted order-status transition |
| `PATCH /api/vendor/:vendorSlug/settings` | Publish kiosk and shop settings (version-checked) |
| `GET /api/kiosk/:vendorSlug/bootstrap` | Public catalogue and settings, with ETag revalidation |
| `POST /api/kiosk/:vendorSlug/orders` | Reprice, validate, and idempotently create a kiosk order |
| `POST /api/admin/login` / `POST /api/admin/logout` | Create or revoke a platform-admin session |
| `GET /api/admin/bootstrap` | Platform metrics, vendors, and recent activity |
| `POST /api/admin/vendors` | Create a vendor and its initial owner |
| `PATCH /api/admin/vendors/:vendorId/status` | Suspend or reactivate a vendor (guarded by the status the admin saw) |
| `GET /api/healthz` | Liveness: the process is up |
| `GET /api/readyz` | Readiness: the data backend answers (503 otherwise) |
| `GET /vendor-products/…` | Runtime product images (Supabase Storage, or streamed locally) |

### Security notes

- Authenticated and PII-bearing responses are private and `no-store`. Cookie-authenticated mutations reject cross-site requests by comparing `Origin` with the host the browser addressed.
- Request bodies are size-limited while they stream; an oversized upload is cut off with 413 instead of being buffered.
- Sign-in is throttled without hard lockouts: a few free attempts per account, then a doubling delay (vendor up to 5 minutes, admin slower), plus per-address and instance-wide caps. Every 429 carries `Retry-After`. Kiosk ordering and catalogue reads are capped per shop.
- Passwords are hashed with scrypt at the OWASP parameters (N=2^17, r=8, p=1); only hashed session tokens are stored.
- Responses carry `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`, HSTS outside development, and a **report-only** Content Security Policy. Move the CSP to enforcing once a release shows no violations.
- Every API response carries an `X-Request-Id`, and server logs are structured JSON lines with the same ID.

New uploads use `/vendor-products/<vendor-id>/<sha256>.png` or `.jpg`; legacy flat paths remain readable during the cutover. Owner and manager roles may retry deletion safely when the object is already missing; staff cannot upload or delete images. Cross-vendor ownership checks run before deletion, and deletion is refused while the image is referenced by any active or archived product or immutable historical order-item snapshot. Supabase objects are removed through the Storage API rather than by modifying `storage.objects` directly.

## Persistence and deployment

The default development mode remains local so the kiosk can run without cloud credentials:

```env
CHAPEGA_DATA_DIR=D:\secure\chapega-data
```

The local backend is for one persistent Node.js process only. Do not use it on serverless or multi-instance production hosts. Production fails closed unless Supabase is configured; it never silently redirects failed cloud writes to JSON.

### Provisioning Supabase

1. Apply the migrations (review the dry run first):

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --linked --dry-run
   npx supabase db push --linked
   ```

2. Copy the project URL, a server-only Supabase secret key, and the **transaction pooler** owner URI from the project dashboard into `.env.local`. Generate a separate strong password for the runtime role and URL-encode passwords in both URIs.

   ```env
   CHAPEGA_DATA_BACKEND=supabase
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   SUPABASE_DATABASE_URL=postgresql://chapega_app.YOUR_PROJECT_REF:APP_PASSWORD@POOLER_HOST:6543/postgres
   SUPABASE_ADMIN_DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:OWNER_PASSWORD@POOLER_HOST:6543/postgres
   ```

3. Provision and verify the restricted runtime role. Provisioning only sets the role's login, connection limit and timeouts; every access rule lives in the migrations, and it refuses to run if a blanket policy is found.

   ```bash
   npm run supabase:provision
   npm run supabase:verify
   ```

4. If you are moving an existing local store, import its catalogue, orders and images. The importer verifies the snapshot checksum, uploads content-addressed runtime images, and replaces normalized rows in one transaction; its checksum ledger makes a repeated run a no-op. Accounts and sessions are never imported.

   ```bash
   npm run supabase:import:check
   npm run supabase:import
   ```

5. Create the first platform owner. Set `VENDOR_EMAIL`, `VENDOR_PASSWORD` and `VENDOR_NAME` in `.env.local` (the password must meet the policy above), then run it once for the shop that person owns. It refuses if a super admin already exists.

   ```bash
   npm run supabase:bootstrap-owner -- --vendor=chapega
   ```

   Sign in at `/admin/login`; further vendors and owners are created from the admin portal.

The application refuses to start with the `postgres` owner as its runtime connection. `SUPABASE_ADMIN_DATABASE_URL` is reserved for migrations and the scripts above; normal requests use `chapega_app` with table grants and explicit row-level security policies. The secret key and both database URLs must never use a `NEXT_PUBLIC_` prefix. Prepared statements are disabled for transaction-pooler compatibility.

Rate limits use Vercel's platform-supplied client IP automatically. On another deployment behind a trusted reverse proxy, set `TRUST_PROXY_HEADERS=true` only when that proxy overwrites incoming `X-Forwarded-For`/`X-Real-IP` headers. Leave it unset for direct hosting, or set it to `false` to disable proxy-header trust explicitly.

Point the host's health checks at `/api/healthz` (liveness) and `/api/readyz` (readiness).

### Data retention

Two owner-only database functions exist for retention; nothing runs them automatically yet:

- `select private.purge_expired_records();` deletes sessions that expired more than a day ago.
- `select private.redact_order_personal_data(interval '90 days');` blanks customer name, phone and notes on finished orders older than the period (it refuses periods under 30 days). Choose the period with the shop owner and state it in the privacy notice.

### Password rotation

To rotate the owner password, set `VENDOR_EMAIL` and a new `VENDOR_PASSWORD` that meets the policy above in `.env.local`, then run `npm run vendor:password`. The command re-hashes the password, updates the selected backend, revokes that account's existing sessions, and records an audit event.

## WhatsApp behavior

The system creates a different `wa.me` URL for every order because the message includes the current items, quantities, prices, notes, total, kiosk, and order number. Scanning the QR or opening the link only prepares a WhatsApp draft. The customer must review it and tap **Send**; the portal never labels a draft as delivered.

Before launch, verify the destination and exact message with a physical phone and the real owner account.

## Quality commands

```bash
npm run check            # typecheck + lint + unit tests (the fast gate)
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install   # once, for the e2e browsers
npm run test:e2e         # Chromium, Firefox, WebKit, mobile Chrome and mobile Safari
```

The real-database suite needs a Postgres 17 owner URL with TLS enabled; it creates and drops its own database, so never point it at real data:

```bash
CHAPEGA_IT_ADMIN_URL=postgresql://postgres:PASSWORD@localhost:5432/postgres npm run test:integration
```

CI runs all of these on every pull request, plus a dependency audit, coverage thresholds, and a secret scan. A physical WhatsApp receipt remains a manual acceptance check.

## Current production follow-ups

- Complete the draft privacy notice at `/privacy`, choose the retention period, and schedule the two retention functions.
- Add owner-facing account management, password recovery, and multi-factor sign-in for platform admins.
- Move the Content Security Policy from report-only to enforcing after a clean release.
- Set up error monitoring and a staging environment; document backups and rollback.
- Integrate the WhatsApp Business Platform only if verified delivery/webhook status is required.
- Run physical touch-screen and physical-phone acceptance tests on the final hardware and deployment.
