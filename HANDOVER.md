# Handover

State on 2026-10-31. Update this file at the end of every session (AGENTS.md,
"Start of every session").

## Where things are

- `main` is production (`chapega.vercel.app`, Supabase in `ap-northeast-2`,
  functions in Vercel `icn1`). Every push to `main` deploys.
- Four stacked pull requests, merged in this order. Each one is retargeted
  when the one below it merges:
  1. **#29 `fix/security-upgrade`**: Next.js 16.4.3 and zod 4.6.7 for the
     advisories. No migration.
  2. **#30 `feat/complete-app`**: privacy notice, 30-day retention,
     per-order erasure, Team, password changes and resets, fixes.
     **Migration-first.**
  3. **#31 `feat/studio-app-api`**: phone sessions and push for the
     Chapega Studio app (migration `20261101120000`). **Migration-first.**
  4. **`feat/studio-app`**: the Chapega Studio Flutter app in `mobile/`, plus
     its CI workflow and repository housekeeping. No server change.

## Before merging #30 and #31

1. `npx supabase db push --linked --dry-run`, then `npx supabase db push --linked`.
   This applies `20261030120000`, `20261030121000` and `20261030122000` (for
   #30), `20261101120000` (for #31), and `20261009120000` if it is pending.
2. `npm run supabase:verify`.
3. Warn the shop first: the first nightly run permanently blanks customer
   details on orders finished more than 30 days ago, and on old drafts nobody
   confirmed.
4. Check that `select slug from private.vendors where slug in ('team',
   'account', 'studio-app');` returns nothing.
5. Merge. Then check:
   - `cron.job` lists `chapega-purge-sessions` and `chapega-redact-orders`;
   - `/privacy?shop=chapega` shows the shop's WhatsApp number;
   - Team and Change password work in the Studio;
   - the app signs in against production (Android emulator or phone).

## The Chapega Studio app (`mobile/`)

- Flutter 3.44.8. `mobile/README.md` covers running it on the emulator against
  `next start` on port 3300, the tests, and builds. `mobile/docs/PUSH.md`
  covers Firebase; `mobile/docs/RELEASE.md` covers the stores.
- **Verified:**
  - 86 Flutter tests, including accessibility in light and dark at 2x text;
  - `flutter analyze` is clean;
  - the integration test passes on the API 36 emulator against the real server;
  - a release APK builds (debug-signed).
- **Not verified:**
  - **iOS is not compiled.** Run the "Mobile app" workflow by hand with
    `ios: true` before the first iOS release.
  - **Push has not run end to end**, because no Firebase project exists yet.
- **Waiting on the owner:**
  - is `https://chapega.vercel.app` the API address for release builds, or will
    there be a custom domain (`AppConfig.productionOrigin`)?
  - who owns the Google Play and App Store accounts, the upload key, and the
    Firebase project? A new personal Play account must run a closed test with
    12 testers for 14 days before going public.
  - an account-deletion page, and a privacy policy that covers shop teams;
    today's `/privacy` covers kiosk customers. See `RELEASE.md`, "To decide".

## Working locally

- `.env.local` copied from `.env.example` gives the local JSON backend and the
  preview account `owner@chapega.com` / `Chapega@2026` (development only).
- **Ports and dev servers:**
  - Other projects on this machine may hold ports 3000 and 3100. For e2e,
    `PORT=3200 npx playwright test --project=chromium`.
  - Only one `next dev` can run per folder, so stop the dev server first. Use
    `next start` for a second server.
  - On Windows, `TaskStop` leaves the Node child running; stop it by its PID.
- `npm run test:integration` needs a Postgres 17 with TLS
  (`CHAPEGA_IT_ADMIN_URL=…`). It creates and drops its own databases.
- **Flutter:**
  - Run one Flutter command at a time in `mobile/`. A concurrent
    `flutter analyze` broke a release build by regenerating the plugin
    registrant.
  - The emulator reaches the computer at `10.0.2.2`.
- **Git worktrees on Windows** check files out with CRLF. One migration-text
  test then fails locally only; CI uses LF.

## Follow-ups (not done)

- **Dependabot:** after #29 merges, close #28 (it bumps eslint-config-next
  without next), rebase and merge #25, #26, #21, #22 and #24, then #23
  (TypeScript 6). Turn on Dependabot security updates.
- **App:**
  - a "Signed-in phones" list with remote sign-out;
  - a lighter, paginated orders endpoint (today the bootstrap returns every
    order);
  - an app-level `PrivacyInfo.xcprivacy`;
  - a TalkBack and VoiceOver pass.
- **RUNBOOK TO DECIDE items:** production owner, on-call, staging, uptime
  monitoring, error tracking, Supabase backup plan, Storage bucket backup.
- **Accounts:**
  - Self-service password recovery (needs email or SMS) and MFA for admins.
  - Admin: edit vendor details, transfer ownership, second super admin, delete.
  - A deactivated team member keeps their platform account, so their email
    stays taken.
- **Physical acceptance:** a real WhatsApp send from the kiosk QR, the
  touch-screen hardware, and the app on a real phone.
