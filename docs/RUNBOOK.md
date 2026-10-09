# Operations runbook (draft)

How to deploy, check, roll back and recover Chapega in production. Items
marked **TO DECIDE** need an owner's decision before launch.

## Ownership

| Role | Who |
| --- | --- |
| Production owner (Vercel, Supabase, domain) | **TO DECIDE** |
| On-call / first responder | **TO DECIDE** |
| Shop data and privacy contact | **TO DECIDE** (also named in `/privacy`) |

## Environments

- **Production:** Vercel deploys `main`. Every push to `main` goes live, so
  merge only after CI is green.
- **Staging:** none yet (**TO DECIDE**). Until one exists, rehearse migrations
  on a Supabase branch or a scratch project, never on production.
- **Local:** `npm run dev` with the local JSON backend (see README).

## Deploying a release

1. Read `CHANGELOG.md` → "Before you deploy". It says whether this release
   needs the app or the migrations first.
2. By default, apply migrations first, so the new code finds the schema it
   expects:
   ```bash
   npx supabase db push --linked --dry-run
   npx supabase db push --linked
   ```
3. If the release says so, re-run `npm run supabase:provision` and
   `npm run supabase:verify`.
4. Merge to `main` and let Vercel deploy.
5. Check:
   - `GET /api/healthz` returns `{"status":"ok"}`;
   - `GET /api/readyz` returns 200 with `"ready"`;
   - a kiosk loads, and a test sign-in works for Vendor Studio and admin.

## Rolling back

- **App only:** use Vercel's "Instant Rollback" to the previous deployment.
- **Do not roll back** to a build from before 2026-10-08 once migration
  `20261008120000` is applied. That migration removes the blanket database
  policies the old build depended on, so the old build can no longer save
  tenant data. Roll forward with a fix instead.
- **Migrations** are forward-only. To undo one, write and review a new
  migration; never edit an applied one.

## Mobile load speed

Target: the kiosk home page reaches Largest Contentful Paint within 3 s on
mobile. After each release, run PageSpeed Insights (mobile) against the
live URL and check LCP.

On 8 October 2026, measured against a local production build:
- **Applied throttling** (slow 4G, 4× slower CPU): **2.2 s**.
- **Lighthouse simulation on localhost:** 3.1 s. On localhost all the
  JavaScript arrives before the first paint, so the simulation counts it
  against the hero image.

If the live figure goes over 3 s, check for new requests made while the
page first loads, and for JavaScript added to the welcome screen.

**Function region.** Every page render runs several database round trips,
so the server functions must run next to the database. `vercel.json` pins
them to `icn1` (Seoul), the same region as the Supabase project
(`ap-northeast-2`). If the database ever moves, move the functions with
it. The `X-Vercel-Id` response header shows the region a request ran in;
for example, `bom1::icn1::…` is the Mumbai edge and a Seoul function.

## Health and logs

- Liveness: `/api/healthz`. Readiness (the database answers): `/api/readyz`.
  Point uptime monitoring at both (**TO DECIDE**: which service).
- Server logs are JSON lines in the Vercel function logs. Every API
  response has an `X-Request-Id` header, and the same `requestId` appears
  in the log line, so a user-reported failure can be found by that ID.
- Error tracking (Sentry or similar) is not set up (**TO DECIDE**).
- The Content Security Policy is enforced (`next.config.ts`). A blocked
  script, image or request shows as a CSP error in the browser console. If
  a new feature needs another origin, add it to the matching directive
  there; to debug, rename the header to
  `Content-Security-Policy-Report-Only` for one release.

## Scheduled maintenance

- **Expired sessions** are deleted every day at 03:15 UTC by the
  `chapega-purge-sessions` pg_cron job, which migration `20261009120000`
  creates. Check it (as the database owner):

  ```sql
  select jobname, schedule, active from cron.job;
  select status, return_message, start_time
  from cron.job_run_details order by start_time desc limit 5;
  ```

  On a Postgres without pg_cron the migration skips the job; run
  `select private.purge_expired_records();` on another schedule.

- **Customer details on finished orders** are not removed yet. The
  retention period is the owner's decision (**TO DECIDE**; at least 30 days,
  and state it in `/privacy`). Then schedule it as the database owner:

  ```sql
  select cron.schedule('chapega-redact-orders', '30 3 * * *',
    $select private.redact_order_personal_data(interval '90 days')$);
  ```

## Backups and recovery

- Supabase backs up the database on a schedule that depends on the plan.
  Point-in-time recovery is an add-on. Confirm what the project has
  (**TO DECIDE**) and do one test restore into a scratch project.
- Product images live in the `vendor-products` Storage bucket, which
  database backups do not cover. **TO DECIDE**: how to back up the bucket.
- Local backend: `.data/vendor-db.json`, with its recovery copy next to it.
  Back up that directory.

## Incidents

### A secret may have leaked

1. Rotate the Supabase secret key in the dashboard and update Vercel.
2. Generate a new runtime password, update `SUPABASE_DATABASE_URL`, and
   run `npm run supabase:provision`.
3. If the owner database password leaked, rotate it and update
   `SUPABASE_ADMIN_DATABASE_URL`.
4. Sign everyone out:
   `delete from private.vendor_sessions;` (run as owner).
5. Redeploy and run the post-deploy checks above.

### A vendor is misbehaving or compromised

Suspend the vendor in `/admin`. This stops kiosk ordering and vendor
sign-in and keeps every record. Reactivate it when access should resume.

### An owner is locked out

Sign-in never locks an account; it only slows retries. The delay per
account is at most 5 minutes, and one address that keeps failing can be
held off for up to 15 minutes. If the owner has forgotten the password, set a new one with
`npm run vendor:password` (see README). There is no self-service reset
yet.

### The site is slow or down

1. Check `/api/readyz`. A 503 means the database is not answering: check
   the Supabase status page and the project's connection limits.
2. Look up the failing requests by `requestId` in the logs.
3. If a deployment caused it, roll back (see above).
