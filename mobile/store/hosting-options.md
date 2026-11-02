# Free hosting options for the Chapega backend

Research checked on 2026-10-31. No host has been selected, linked or deployed,
and no billing, account or production configuration was changed.

**Best candidate to evaluate: Netlify Free.** Netlify expressly allows
commercial projects on Free. Its current Free plan has 300 monthly credits,
a hard limit and no automatic recharge; exhaustion pauses sites. These
terms suit the no-spend constraint but do not guarantee business uptime.
[Commercial use](https://www.netlify.com/blog/introducing-netlify-free-plan/),
[current Free terms](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/),
[credit exhaustion](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/).

## Fit for the existing application

| Option | Source-backed platform facts | Assessment for Chapega |
|---|---|---|
| Netlify Free | OpenNext supports current Next.js versions from 13.5, including App Router, Route Handlers, RSC, streaming, rewrites and `next/after`. Default Node functions have 1 GB RAM and a 60-second synchronous limit. | Closest serverless candidate. Existing Node crypto, TLS Postgres pooler connections and FCM HTTPS calls should fit the runtime model, but this is an inference, not a deployed test of Next 16.4.3. |
| Render Free web service | Runs Node web services, but sleeps after 15 minutes idle and takes about a minute to resume. Render advises against production use of Free instances. High service-initiated external traffic, including databases and object storage, can trigger suspension. | Can run a conventional `next start` prototype, but unsuitable as the recommended business host under these availability and external-Supabase constraints. Do not use Render's expiring Free Postgres for the existing production data. |
| Cloudflare Workers Free | 128 MB memory and 10 ms CPU per HTTP request. | Not a safe drop-in recommendation: Chapega's scrypt verification alone requests roughly 128 MiB, before app memory, and is deliberately CPU intensive. An adapter/authentication design and measured resource validation would be needed. Do not weaken password parameters to fit the plan. |

Platform sources: [Netlify Next.js](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/),
[Node function limits](https://docs.netlify.com/build/functions/configuration/),
[Render Free limitations](https://render.com/docs/free),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

This comparison does not certify a host's contracts, privacy obligations or
long-term suitability. Render and Workers are technical comparisons, not
equally qualified launch recommendations. Keep the existing production
service intact until a controlled replacement is verified and selected.

## Netlify evaluation gates

1. **Runtime and build.** Keep Node 22 aligned with `.nvmrc`; verify the actual
   function runtime and adapter build for locked Next 16.4.3. Check startup
   validation, security headers, dynamic pages, `/api/healthz`, `/api/readyz`,
   streaming and image rewrites. Netlify documents build/runtime version
   selection separately.
   [Node selection](https://docs.netlify.com/build/configure-builds/manage-dependencies/).
2. **Database and FCM.** Use the existing Supabase backend and restricted
   runtime role. Verify TLS, tenant isolation, sessions, transaction timeouts
   and concurrent stock updates. Test the existing `next/after` FCM task
   through a real response completion; adapter support alone does not verify
   delivery. Keep secrets in server-only runtime configuration and never
   place them in this store pack.
3. **Upload and response sizes.** Netlify's buffered limit is 6 MB; binary
   encoding makes uploads effectively about 4.5 MB, below Chapega's declared
   8 MB image limit. Streamed responses can be up to 20 MB. Exercise uploads
   and the complete order bootstrap at realistic sizes. A migration needs an
   explicit upload/size solution, not an assumption that every accepted
   local upload reaches the handler.
   [Payload limits](https://docs.netlify.com/build/functions/configuration/).
4. **Latency and connection counts.** The database is in Seoul. Measure
   database latency from the chosen function region instead of retaining
   the Ohio default without review. Each warm instance can create up to
   three pooler connections in the current code; evaluate aggregate limits
   under concurrent function instances.
5. **Proxy identity.** Current code automatically trusts Vercel headers only.
   Verify which forwarding headers the new platform overwrites and adapt
   client-IP/CSRF handling deliberately. Do not blindly set
   `TRUST_PROXY_HEADERS=true` or leave address-based limits ineffective.
6. **Monthly limits.** Model all deployments, bandwidth, requests and compute
   against the shared Free allowance. A successful production deployment
   consumes 15 credits; preview deployments do not. A Free site can pause
   for the rest of a billing cycle when credits are exhausted. Do not enable
   paid auto-recharge, upgrades or add-ons.
   [Metering](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/).
7. **Mobile origin and public links.** Release builds currently target
   `https://chapega.vercel.app`; secure tokens are bound to their issuing
   origin. A replacement URL requires an explicit rollout and verification
   of sign-in, image URLs, privacy/deletion links and old app versions.
   Updating hosting must not silently change the owner's public contacts.

These are evaluation requirements, not instructions to create an account,
copy credentials, change DNS or migrate the live service now. A hard spending
cap trades unexpected charges for possible downtime; the owner must accept
that availability limit before choosing a free production host.
