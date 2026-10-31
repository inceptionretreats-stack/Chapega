# Operations runbook (draft)

How to deploy, check, roll back and recover Chapega in production. Items
marked **TO DECIDE** need an owner's decision before launch.

## Ownership

| Role | Who |
| --- | --- |
| Production owner (Vercel, Supabase, domain) | **TO DECIDE** |
| On-call / first responder | **TO DECIDE** |
| Shop data and privacy contact | Each shop, on its WhatsApp number (shown at `/privacy?shop=<slug>`); Chapega.com is named as responsible |

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

The Chapega Studio phone app is released separately, through Google Play and
the App Store: follow `mobile/docs/RELEASE.md`. Ship server changes the app
depends on first, and keep the API compatible with app versions people still
have installed.

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

- **Customer details** are removed every day at 03:45 UTC by the
  `chapega-redact-orders` job (migration `20261030120000`; retention decided
  2026-10-30: 30 days). It clears name, phone, notes, the WhatsApp text and
  the submission fingerprint 30 days after an order is completed or
  cancelled, and 30 days after preparation for orders the shop never
  confirmed. Orders in progress keep them until they finish. `/privacy`
  states this rule; change both together. The day after a run this should
  return 0 (it also proves the owner bypasses row-level security):

  ```sql
  select count(*) from private.orders
  where ((status in ('completed', 'cancelled') and updated_at < now() - interval '30 days')
      or (status = 'prepared' and created_at < now() - interval '30 days'))
    and (customer_name <> '' or customer_phone <> '' or gift_note <> ''
      or order_note <> '' or whatsapp_url like '%?%');
  ```

  On a Postgres without pg_cron, run
  `select * from private.redact_order_personal_data(interval '30 days');` daily.

- **Push announcement records** (which orders were already announced to
  phones) older than 30 days go with the same nightly purge.

## Push notifications (Chapega Studio app)

New kiosk orders are announced to the signed-in phones of the shop's team
through Firebase Cloud Messaging. Push is off until it is configured; the app
still alerts while it is open. A notification shows the order number, total
and item count only.

**Turn it on** (once, with the Firebase project the app is built with; the
app side is in `mobile/docs/PUSH.md`):

1. In the Google Cloud console of that Firebase project, create a service
   account with only the "Firebase Cloud Messaging API Admin" role, and add a
   JSON key.
2. For iOS, upload the APNs authentication key in the Firebase console
   (Project settings → Cloud Messaging).
3. In Vercel, set `FCM_SERVICE_ACCOUNT_JSON` to the key (raw JSON or
   base64), mark it Sensitive, and redeploy. Delete the downloaded key file.
4. Check the deployment log: `config.validated` shows
   `"pushNotifications":"on"`; a `config.warning` naming
   `FCM_SERVICE_ACCOUNT_JSON` means the key was not accepted and push is off.
5. Place a test kiosk order with a signed-in phone that allowed
   notifications. The log shows `push.order_alert` with `sent` at least 1.

**Turn it off:** remove `FCM_SERVICE_ACCOUNT_JSON` and redeploy. Phones keep
their registrations and get notifications again when it is turned back on.

**Check it** (as the database owner):

```sql
-- Phones registered for notifications, and announcements in the last day.
select count(*) from private.vendor_push_registrations;
select count(*) as orders, sum(sent_count) as sent, sum(failed_count) as failed
from private.order_push_dispatches
where claimed_at > now() - interval '1 day';
```

`push.send_failed` with status 401 or 403 in the logs means the key or its
role is wrong; `push.apns_not_configured` means the APNs key is missing in
Firebase. Tokens Firebase reports as no longer registered are removed
automatically.

**Rotate the key:** add a new JSON key to the service account, update
`FCM_SERVICE_ACCOUNT_JSON`, redeploy, then delete the old key in the Google
Cloud console.

## Backups and recovery

- Supabase backs up the database on a schedule that depends on the plan.
  Point-in-time recovery is an add-on. Confirm what the project has
  (**TO DECIDE**) and do one test restore into a scratch project.
- Product images live in the `vendor-products` Storage bucket, which
  database backups do not cover. **TO DECIDE**: how to back up the bucket.
- Local backend: `.data/vendor-db.json`, with its recovery copy next to it.
  Back up that directory.
- A restore brings back customer details removed since the backup. Run the
  redaction function again afterwards, and repeat any
  `order.customer_details_removed` actions recorded in `private.audit_log`
  after the backup was taken.

## Incidents

### A secret may have leaked

1. Rotate the Supabase secret key in the dashboard and update Vercel.
2. Generate a new runtime password, update `SUPABASE_DATABASE_URL`, and
   run `npm run supabase:provision`.
3. If the owner database password leaked, rotate it and update
   `SUPABASE_ADMIN_DATABASE_URL`.
4. Sign everyone out:
   `delete from private.vendor_sessions;` (run as owner). This includes
   phones; their push registrations go with their sessions.
5. If the Firebase service-account key leaked, delete it in the Google Cloud
   console and add a new one (see "Rotate the key" above).
6. Redeploy and run the post-deploy checks above.

### A phone is lost or stolen

Any of these signs the phone out at once; its notifications stop with it:

- The person changes their password (Studio or app → Change password): every
  other session of theirs ends, browsers and phones.
- The owner removes the person's access in Team (and restores it later).
- As the database owner, end only that person's phones:

  ```sql
  delete from private.vendor_sessions
  where session_scope = 'vendor_app'
    and user_id = (select id from private.vendor_users where email = 'person@example.com');
  ```

### A vendor is misbehaving or compromised

Suspend the vendor in `/admin`. This stops kiosk ordering and vendor
sign-in and keeps every record. Reactivate it when access should resume.

### Someone is locked out

Sign-in never locks an account; it only slows retries. The delay per
account is at most 5 minutes, and one address that keeps failing can be
held off for up to 15 minutes. For a forgotten password:

- **A shop owner:** in `/admin`, use the key icon on the shop's row (Reset
  owner password). Share the temporary password privately; the owner
  chooses a new one at the next sign-in.
- **A manager or staff member:** the shop owner uses Team → Set temporary
  password. Someone who also belongs to another shop changes their own
  password; if they cannot, use the next option.
- **A super admin, or nobody can sign in:** `npm run vendor:password` with
  `VENDOR_EMAIL`, the new `VENDOR_PASSWORD` and, on Supabase,
  `SUPABASE_ADMIN_DATABASE_URL` (see README).

There is no self-service reset by email yet.

### A customer asks to see, correct or delete their details

The privacy notice sends these requests to the shop's WhatsApp. In Studio,
find the order by its number or the customer's phone (any format), then
use **Remove details**; it is audited as `order.customer_details_removed`.
There is no tool to edit an order's details: for a correction, remove them
and continue on WhatsApp. Messages already in WhatsApp are outside the
app; the shop deletes that chat itself.

### A shop team member asks to delete their account

`/delete-account` (linked from the app's About screen and the privacy
notice) sends these requests to Chapega.com's WhatsApp and promises
deletion within 30 days. Confirm the request with the person first, for
example from the phone number or email the shop has for them.

1. Find the account and its shops (as the database owner):

   ```sql
   select users.id, users.name, users.platform_role,
          vendors.slug, memberships.role, memberships.active
   from private.vendor_users users
   left join private.vendor_memberships memberships on memberships.user_id = users.id
   left join private.vendors vendors on vendors.id = memberships.vendor_id
   where users.email = 'person@example.com';
   ```

   Stop if they are a shop's only owner: agree the new owner or the shop's
   closure first. Never delete the only `super_admin`.
2. Check that nobody else in those shops has the same name:

   ```sql
   select distinct users.name
   from private.vendor_memberships memberships
   join private.vendor_users users on users.id = memberships.user_id
   where memberships.vendor_id in (
     select vendor_id from private.vendor_memberships where user_id = 'USER-ID'
   );
   ```

3. Delete in one transaction:

   ```sql
   begin;
   -- Order timelines store the name, not the account.
   update private.order_events events
   set actor_name = 'Former team member'
   from private.orders orders
   where events.order_id = orders.id
     and orders.vendor_id in (
       select vendor_id from private.vendor_memberships where user_id = 'USER-ID'
     )
     and events.actor_name = 'THEIR NAME';
   -- Memberships, every session (browsers and phones) and push registrations
   -- go with the account; their uploads keep no uploader.
   delete from private.vendor_users where id = 'USER-ID';
   commit;
   ```

4. Tell the person it is done. `private.audit_log` keeps the account
   number (`actor_id`), which no longer leads to anyone.

### The site is slow or down

1. Check `/api/readyz`. A 503 means the database is not answering: check
   the Supabase status page and the project's connection limits.
2. Look up the failing requests by `requestId` in the logs.
3. If a deployment caused it, roll back (see above).
