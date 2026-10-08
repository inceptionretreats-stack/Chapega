# Chapega.com Kiosk + Vendor Studio

Chapega.com is a responsive, multi-vendor gift-ordering kiosk with a tenant-scoped Vendor Studio and a separate platform-admin portal. Customers browse one vendor's live catalogue, prepare an order, and continue through WhatsApp; each vendor signs in to manage only its own products, stock, orders, availability, and kiosk settings.

The interface keeps the existing ivory, blush, burgundy, and gold brand palette. The kiosk is designed for touch screens and the vendor studio adapts from desktop tables to mobile cards and bottom navigation.

## What is implemented

### Customer kiosk

- Server-synced catalogue, stock, pricing, availability, and shop status
- Search, category filters, product details, variants, gift wrap, and a five-unit hard limit
- Server-authoritative order validation and integer-paise total calculation
- Idempotent order submission with opaque internal IDs and friendly display numbers
- Customer name, phone, gift note, order note, and Pay Later / Pay at Counter selection
- Exact WhatsApp Click-to-Chat message, scannable QR, copy fallback, and privacy countdown
- Responsive layouts for kiosk landscape, tablet, and phone sizes

### Vendor Studio

- Protected sign-in with an opaque, `HttpOnly`, `SameSite=Strict` session cookie
- Slug-scoped workspaces (`/vendor/:vendorSlug`) with isolated carts, products, orders, settings, uploads, sessions, and audit data
- Owner, manager, and staff memberships with capability-based navigation and server authorization
- Dashboard with order value, product count, low-stock count, live orders, and shop status
- Product create, edit, publish/hide, stock update, image upload, and archive flows
- PNG/JPEG signature and size validation, dimension limits, metadata stripping, and content-addressed filenames
- Order search/filtering, immutable item snapshots, timeline, WhatsApp handoff, cancellation, and controlled status progression
- Stock deduction exactly once at confirmation, with release when a confirmed order is cancelled
- Shop identity, WhatsApp destination, ordering limits, wrapping fee, QR timeout, low-stock threshold, and open/closed controls
- Automatic refresh on focus and every 30 seconds while the studio is open

### Super admin

- Separate `/admin/login` and protected `/admin` surface with its own platform-scoped session cookie
- Platform metrics, recent activity, vendor search/filtering, and responsive vendor tables/cards
- Create a vendor with its initial owner, shop settings, and isolated kiosk in one guarded operation
- Suspend or reactivate a vendor without deleting its catalogue, orders, settings, or audit history
- Every platform read and mutation revalidates a live `super_admin` session in the database

### Production backend

- Supabase Postgres persistence for vendors, memberships, platform/vendor sessions, products, variants, orders, events, settings, assets, audit records, and distributed rate limits
- One transaction and a database lock for every mutation, preserving atomic stock/order behavior across multiple app instances
- A private database schema with forced RLS and no `anon` or `authenticated` Data API grants
- Supabase Storage for validated, metadata-stripped runtime product images
- Checksum-verified, idempotent migration from the existing local JSON snapshot

## Vendor workflow

1. Open `/vendor/login?shop=<vendor-slug>` and sign in. Successful sign-in opens `/vendor/<vendor-slug>`; users with more than one membership can switch shops.
2. Use **Products → Add product** to upload an image, enter product information and stock, then publish it to the kiosk.
3. A kiosk order appears in **Orders** as **Prepared on kiosk**. This means the draft was created; it does not claim that WhatsApp delivered the message.
4. After the shop receives and accepts the request, move it through **Confirmed → Preparing → Ready → Completed**. Cancelling a confirmed order releases its committed stock once.
5. Use **Shop settings** to pause new orders or change the public kiosk rules and WhatsApp destination.

## Super-admin workflow

1. Open `/admin/login` and sign in with an account whose platform role is `super_admin`.
2. Use **Add vendor** to create the tenant, initial owner credentials, and default shop settings.
3. Open `/kiosk/<vendor-slug>` to verify the isolated public kiosk.
4. Suspend a tenant to block its kiosk ordering and vendor sign-in while retaining all records; reactivate it when access should resume.

## Local setup

Use Node.js 22 or newer.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open:

- Customer kiosk: [http://localhost:3000](http://localhost:3000)
- Vendor sign-in: [http://localhost:3000/vendor/login](http://localhost:3000/vendor/login)
- Super-admin sign-in: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)

The built-in local-preview credentials are:

```text
Email: owner@chapega.com
Password: Chapega@2026
```

The known preview account is accepted only in development. Production fails closed when private vendor credentials are missing (or still match the preview pair). `ALLOW_VENDOR_PREVIEW_LOGIN=true` exists only for an intentional, private local production preview and must not be enabled on a public deployment.

Set private production values in `.env.local` before using the portal beyond a local preview:

```env
VENDOR_EMAIL=owner@example.com
VENDOR_PASSWORD=replace-with-a-long-unique-password
VENDOR_NAME=Shop owner
VENDOR_SESSION_HOURS=12
CHAPEGA_OWNER_WHATSAPP_NUMBER=919876543210
# Only for a known non-Vercel reverse proxy; Vercel is detected automatically.
# TRUST_PROXY_HEADERS=true
```

Never prefix these values with `NEXT_PUBLIC_`. If `.data/vendor-db.json` has already been initialized, changing the seed environment variables does not rewrite that existing account; start with an empty data directory or provide an intentional account-migration step.

## Architecture

```text
app/                     Kiosk, Vendor Studio pages, styles, and Route Handlers
components/              Kiosk, vendor, and responsive super-admin screens
data/                    Initial catalogue used only to seed a new local store
domain/                  Cart, money, order, WhatsApp, and status-state rules
server/vendor/           Auth, validation, image handling, persistence, and services
server/admin/            Platform authentication, validation, and vendor lifecycle services
server/supabase/         Server-only Supabase configuration, Storage, and Postgres clients
supabase/migrations/     Versioned private database schema and Storage bucket
scripts/                 Verified one-time JSON-to-Supabase importer
store/                   Kiosk UI/session state synchronized from the server
types/                   Shared public and vendor DTOs
tests/unit/              Domain, validation, and status-machine tests
tests/e2e/               Kiosk, responsive, vendor, and multi-tenant admin workflow tests
.data/                   Ignored local JSON database and recovery backup
public/vendor-products/  Ignored, validated vendor uploads for local hosting
```

All mutations pass through strict Zod schemas and the server reconstructs order totals from its own product records. Local development can use the checksummed JSON repository. The Supabase adapter keeps the same service/API contracts and serializes each mutation with a Postgres row lock inside one transaction, so order, stock, event, and audit changes commit or roll back together.

### Main endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /api/vendor/login` | Validate credentials, rotate sessions, and set the secure cookie |
| `POST /api/vendor/logout` | Revoke the current session |
| `GET /api/vendor/:vendorSlug/bootstrap` | Load that authenticated tenant's dashboard, products, orders, and settings |
| `POST /api/vendor/:vendorSlug/products` | Create a product inside the authenticated tenant |
| `PATCH /api/vendor/:vendorSlug/orders/:id` | Apply a permitted transition to that tenant's order |
| `PATCH /api/vendor/:vendorSlug/settings` | Publish that tenant's kiosk and shop settings |
| `GET /api/vendor/bootstrap` | Load the authenticated dashboard, products, orders, and settings |
| `POST /api/vendor/products` | Create a product |
| `PATCH /api/vendor/products/:id` | Edit, publish/hide, or archive a product with version checks |
| `POST /api/vendor/uploads` | Validate and store a PNG/JPEG product image |
| `DELETE /api/vendor/uploads` | Delete an unused content-addressed vendor image |
| `PATCH /api/vendor/orders/:id` | Apply a permitted order-status transition |
| `PATCH /api/vendor/settings` | Publish kiosk and shop settings with version checks |
| `GET /api/kiosk/bootstrap` | Return only the public catalogue/settings DTO |
| `POST /api/kiosk/orders` | Reprice, validate, and idempotently create a kiosk order |
| `GET /api/kiosk/:vendorSlug/bootstrap` | Return one tenant's public catalogue/settings DTO |
| `POST /api/kiosk/:vendorSlug/orders` | Validate and create an order inside one tenant |
| `POST /api/admin/login` | Create a separate platform-admin session |
| `GET /api/admin/bootstrap` | Load platform metrics, vendors, and recent activity |
| `POST /api/admin/vendors` | Create a vendor and its initial owner |
| `PATCH /api/admin/vendors/:vendorId/status` | Suspend or reactivate a vendor without deleting data |

Authenticated and PII-bearing responses are private and `no-store`. Cookie-authenticated mutations reject cross-site requests, login/order creation is rate-limited, passwords use parameterized `scrypt`, and only hashed session tokens are stored.

New uploads use `/vendor-products/<vendor-id>/<sha256>.png` or `.jpg`; legacy flat paths remain readable during the cutover. Owner and manager roles may retry deletion safely when the object is already missing; staff cannot upload or delete images. Cross-vendor ownership checks run before deletion, and deletion is refused while the image is referenced by any active or archived product or immutable historical order-item snapshot. Supabase objects are removed through the Storage API rather than by modifying `storage.objects` directly.

## Persistence and deployment

The default development mode remains local so the kiosk can run without cloud credentials:

```env
CHAPEGA_DATA_DIR=D:\secure\chapega-data
```

The local backend is for one persistent Node.js process only. Do not use it on serverless or multi-instance production hosts. Production fails closed unless Supabase is configured; it never silently redirects failed cloud writes to JSON.

To provision a Supabase project:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

Copy the project URL, a server-only Supabase secret key, and the **transaction pooler** owner URI from the project dashboard into `.env.local`. Generate a separate strong password for the runtime role and URL-encode passwords in both URIs.

```env
CHAPEGA_DATA_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_DATABASE_URL=postgresql://chapega_app.YOUR_PROJECT_REF:APP_PASSWORD@POOLER_HOST:6543/postgres
SUPABASE_ADMIN_DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:OWNER_PASSWORD@POOLER_HOST:6543/postgres
```

After the schema migration, provision and verify the restricted runtime role:

```bash
npm run supabase:provision
npm run supabase:verify
```

The application refuses to start with the `postgres` owner as its runtime connection. `SUPABASE_ADMIN_DATABASE_URL` is reserved for migrations and provisioning; normal requests use `chapega_app` with table grants and explicit RLS policies. The secret key and both database URLs must never use a `NEXT_PUBLIC_` prefix. Prepared statements are disabled for transaction-pooler compatibility.

Rate limits use Vercel's platform-supplied client IP automatically. On another deployment behind a trusted reverse proxy, set `TRUST_PROXY_HEADERS=true` only when that proxy overwrites incoming `X-Forwarded-For`/`X-Real-IP` headers. Leave it unset for direct hosting, or set it to `false` to disable proxy-header trust explicitly.

Before the first cutover, verify and import the current snapshot:

```bash
npm run supabase:import:check
npm run supabase:import
```

The importer verifies the snapshot checksum, uploads content-addressed runtime images, and replaces normalized database rows in one transaction. Its checksum ledger makes a repeated run a no-op instead of overwriting newer production data. Static generated catalogue art remains bundled with the application; new vendor uploads live in the public `vendor-products` Storage bucket.

Vendor login/logout keeps the existing secure cookie contract. Password hashes and hashed session tokens are stored in the private Supabase schema; raw passwords and raw session tokens are never stored in the database.

To rotate the owner password, set `VENDOR_EMAIL` and a new 12–200 character `VENDOR_PASSWORD` in `.env.local`, then run `npm run vendor:password`. The command re-hashes the password, updates the selected backend, revokes that vendor’s existing sessions, and records an audit event.

## WhatsApp behavior

The system creates a different `wa.me` URL for every order because the message includes the current items, quantities, prices, notes, total, kiosk, and order number. Scanning the QR or opening the link only prepares a WhatsApp draft. The customer must review it and tap **Send**; the portal never labels a draft as delivered.

Before launch, verify the destination and exact message with a physical phone and the real owner account.

## Quality commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

The automated suite verifies domain rules, strict server schemas, the vendor status machine, customer critical flow, responsive kiosk layouts, authentication, product-to-kiosk synchronization, the vendor order lifecycle, super-admin vendor provisioning, cross-tenant denial, and suspension/reactivation. A physical WhatsApp receipt remains a manual acceptance check.

## Current production follow-ups

- Add owner-facing account management and password recovery instead of relying on the server-side rotation command.
- Define the shop's order/PII retention, export, monitoring, and recovery procedures before handling real customer data.
- Integrate the WhatsApp Business Platform only if verified delivery/webhook status is required.
- Run accessibility, multi-browser, physical touch-screen, and physical-phone acceptance tests on the final hardware and deployment.
