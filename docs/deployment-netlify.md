# Netlify Free deployment preparation

Prepared on 2026-10-31 for the locked Next.js 16.4.3 application. This is a
local configuration and evaluation guide. No Netlify account, site, token,
secret import or deployment has been created by this work. Existing
production remains in place. No billing or plan change is authorized.

## What is prepared

`netlify.toml` uses `npm run build`, publishes `.next` and selects Node 22,
matching `.nvmrc`. It relies on Netlify's automatic current OpenNext adapter,
without a legacy adapter pin, static export or catch-all SPA rewrite. The
adapter documents support for Next.js from 13.5 onward, including App Router,
Route Handlers, streaming, rewrites and `next/after`. That support range
includes the locked 16.4.3 version; it is not a verification of this app on
Netlify. [Netlify Next.js integration](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

Build Node and function Node are separate settings. Netlify normally derives
the runtime from the build version, subject to its supported Lambda-runtime
rules and fallback. For the evaluation, verify the generated function uses
Node 22; if necessary, set the nonsecret `AWS_LAMBDA_JS_RUNTIME` setting to
`nodejs22.x` through the supported site configuration. That setting must not
be placed in `netlify.toml`. No region, memory upgrade or paid resource is
requested by the committed configuration.
[Build Node](https://docs.netlify.com/build/configure-builds/manage-dependencies/),
[function configuration](https://docs.netlify.com/build/functions/configuration/).

The bundled Next.js deployment documentation treats Netlify as a provider
integration, rather than a Next.js-team-verified adapter. The actual adapter
version and end-to-end behavior must be recorded when a build is attempted.
The server request-identity integration pins `@netlify/functions` 6.0.3,
with its exact package-lock entries. Its published engine requires Node
22.12 or newer. The application minimum is 22.19 to also satisfy the patched
Undici used by the test tools; the selected build major remains 22. The package
has no Next.js peer dependency.
[Official package](https://www.npmjs.com/package/@netlify/functions).

## Credential boundary

Creating a local config does not authorize transmitting existing production
credentials to another provider. Keep the following table reviewable before
any site configuration. It lists names and purposes only.

| Variable name | Purpose | Intended availability |
|---|---|---|
| `CHAPEGA_DATA_BACKEND` | Select the Supabase backend; the production choice is `supabase` | Build and server runtime |
| `NEXT_PUBLIC_SUPABASE_URL` | Public project origin for CSP/image rewrites and server Storage configuration | Build and server runtime; this URL is not a secret |
| `CHAPEGA_HOST_PLATFORM` | Required nonsecret `netlify` marker for authenticated platform client-IP context | Server Functions runtime; never `NEXT_PUBLIC_*` |
| `SUPABASE_DATABASE_URL` | TLS transaction-pooler connection using the restricted `chapega_app` role | Server runtime only |
| `SUPABASE_SECRET_KEY` | Server Storage operations | Server runtime only |
| `FCM_SERVICE_ACCOUNT_JSON` | Existing dedicated FCM sender service-account credential | Server runtime only |
| `FCM_PROJECT_ID` | Optional FCM project override | Server runtime only |
| `LOG_LEVEL` | Optional structured-log threshold | Server runtime only |
| `VENDOR_SESSION_HOURS`, `VENDOR_SESSION_IDLE_MINUTES` | Optional existing browser-session limits | Server runtime only |
| `ADMIN_SESSION_HOURS`, `ADMIN_SESSION_IDLE_MINUTES` | Optional existing admin-session limits | Server runtime only |
| `VENDOR_APP_SESSION_DAYS`, `VENDOR_APP_SESSION_IDLE_DAYS`, `VENDOR_APP_MAX_DEVICES` | Optional existing phone-session limits | Server runtime only |

The table describes what the code needs, not a promise of per-scope access
control on Free. Netlify documents configurable variable scopes on Pro and
above; do not depend on a paid feature or claim runtime-only isolation on
Free. Use private site settings and keep untrusted preview builds away from
any project holding production credentials.
Do not put values in git, this guide, build logs or client bundles. Do not
upload/import `.env.local` wholesale: the local example selects JSON storage
and includes development defaults. The build needs the public origin for
its image/CSP configuration; it does not need the database owner's password.

Never install `SUPABASE_ADMIN_DATABASE_URL` as a runtime credential. Do not
copy local `VENDOR_EMAIL`/`VENDOR_PASSWORD` seeds, enable
`ALLOW_LOCAL_VENDOR_BACKEND`/`ALLOW_VENDOR_PREVIEW_LOGIN`, or seed/rotate
production accounts as part of changing hosts. Existing database migrations
are already applied; hosting preparation requires no new migration.
[Environment configuration](https://docs.netlify.com/build/environment-variables/overview/).

## Security gate: request identity

**The config alone is not verified for public production traffic.**
`server/http/request-identity.ts` now uses the official `getContext().ip`
with the explicit server-only `CHAPEGA_HOST_PLATFORM=netlify` marker, validates
a literal IPv4/IPv6 address and honours
`TRUST_PROXY_HEADERS=false`. Missing context fails closed to the existing
unknown-address protections. Vercel and explicitly configured custom-proxy
behavior are preserved; an active Vercel flag retains precedence.

Do not solve this with blanket `TRUST_PROXY_HEADERS=true`. It would trust
the first `X-Forwarded-For`/`X-Real-IP` value and forwarded host/protocol under
assumptions that have not been verified for this adapter.

The Functions API exposes this context inside web frameworks and throws
outside an active request. Tests cover literal addresses, missing/invalid
context, unknown platform flags, explicit trust-off, forged headers and actual
sign-in rate-limit buckets. CSRF origin logic is unchanged, and Netlify
context support does not grant forwarded-host/protocol trust. A platform
check must still verify runtime context and the deployment marker through
the generated adapter. No raw `X-NF-Client-Connection-IP` header is trusted.
[Functions request context](https://docs.netlify.com/build/functions/api/#getcontext).

Set `CHAPEGA_HOST_PLATFORM=netlify` in the reviewed site's Functions runtime
environment before evaluation. This is a nonsecret server flag, not an inlined
Next.js public variable. `NETLIFY=true` remains a fallback for build/local
adapter environments; it is documented as a build marker, not one of the few
guaranteed read-only function-runtime variables. Do not depend on that fallback
in production. A nonempty unknown explicit marker blocks the fallback and is
rejected by startup validation. Missing markers/context fail closed without
trusting raw request headers. Verify the explicit marker and real context in
the eventual deployed evaluation.
[Function environment boundaries](https://docs.netlify.com/build/functions/environment-variables/).

## Payload, runtime and cost gates

- Default functions have 1 GB RAM and a 60-second synchronous limit. Verify
  concurrent sign-in behavior with the current 128 MiB scrypt parameters;
  do not weaken password hashing or request paid memory to make a build pass.
- Buffered requests/responses are limited to 6 MB; binary encoding lowers
  practical uploads to about 4.5 MB. Chapega advertises/validates images up
  to 8 MB. A platform-aware limit or another reviewed upload design is needed
  before promising that every accepted image can reach the handler.
- Streamed responses can reach 20 MB. The Studio currently returns complete
  order history; test actual large JSON bootstrap behavior instead of
  assuming an unlimited order count fits a function response.
- Measure the selected function region against the Seoul database. The
  config deliberately leaves region selection to a measured site decision.
  The current Postgres client can open three pooler connections per warm
  instance; validate aggregate connections, transaction locks and timeouts.
- Verify `next/after` runs the FCM task after the HTTP response completes.
  A generated function or a healthy endpoint does not establish push delivery.

Source: [function resource and payload limits](https://docs.netlify.com/build/functions/configuration/).

Netlify permits commercial projects on Free. Its current Free plan supplies
300 monthly credits with a hard limit and no automatic recharge; exhausted
allowances pause sites. Use the current credit-based terms, not the older
bandwidth/invocation allowances in the announcement. A successful production
deploy consumes 15 credits, while previews are free to deploy. Requests,
bandwidth and compute still consume credits. Confirm the account really is
on Free and accept the availability tradeoff without enabling upgrades,
auto-recharge or paid add-ons.
[Commercial use](https://www.netlify.com/blog/introducing-netlify-free-plan/),
[current Free plan](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/),
[metering and pause behavior](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/).

## Local verification and eventual evaluation

The ordinary web checks and coverage pass locally. The production dependency
audit has no findings. The compatible test-only Undici patch removes the high
severity findings; 16 moderate dev-only findings remain in the ESLint/minimatch
dependency chain. Its available fix requires a breaking minimatch major and
is not forced over incompatible consumers.
[Remaining upstream advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).

An actual `netlify build --offline --context production` completed in an
isolated temporary source copy using official CLI 27.16.1, `@netlify/build`
37.7.3, automatic `@netlify/plugin-nextjs` 5.16.5 and locked Next.js 16.4.3.
The CLI accepted this TOML, compiled the app and bundled the streaming server
handler. Its generated manifest selects `nodejs22.x`. The local host used
Node 24.19.0 on Windows, so this is packaging evidence rather than execution
evidence for the Linux Node 22 cloud runtime.

The temporary copy excluded `.env*`, existing `.netlify`/`.vercel` state,
local application data, signing files and cloud credentials. CLI profile and
environment were isolated; only synthetic public build settings were used.
There was no login, link, deploy, secret import or account-backed operation.
The current production build directory was not overwritten. Local offline
success does not verify Netlify's edge proxy, payload limits, real runtime
context or live external connectivity. The configuration has not been
accepted by a linked Netlify site.
[CLI offline build](https://cli.netlify.com/commands/build/).

After the owner approves the destination and credential boundary, an
isolated evaluation should verify:

1. Explicit Node/adapter versions, headers, real redirects/404s, health and
   readiness, and the Supabase image rewrite.
2. Same-origin cookie login, rejected cross-origin writes, rate limits,
   bearer-only phone authentication, password gates and tenant isolation.
3. Concurrent order confirmation/cancellation and exactly-once stock changes,
   product uploads around the chosen size limit, and large bootstrap bodies.
4. Controlled FCM registration/delivery, `after` completion and session
   revocation on a disposable demo account.
5. Free-credit consumption and expected quota-pause behavior.

Keep the current production endpoint and the app's release API origin
unchanged until evaluation passes and the cutover is explicitly selected.
Phone tokens are origin-bound. A later host change needs a mobile update,
review of privacy/deletion URLs, and an old-version transition plan. Public
contact details remain unchanged at the owner's request. No DNS or production
cutover is performed by this guide.
