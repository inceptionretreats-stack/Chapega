# Handover

State on 2026-10-31. Update this file at the end of every session (AGENTS.md,
"Start of every session").

## Upload signing and store preparation (2026-10-31)

- Release branch: `release/play-store-preparation-20261031`, based on
  `d9b4b8a`. Do not merge to `main` until its automatic deployment is intended.
  Current production remains on `d9b4b8a`; the privacy edits are source-only.
- Latest authorization: create the Android upload key and fix the remaining
  Play preparation within free services. Leave public contact details
  unchanged. The user separately chose **leave the reviewer account
  pending**. Do not provision that account or invent contact details.
- User said **do not use complete screen control**. Desktop/native emulator
  control stopped. Any browser work is limited to Chrome extension tabs;
  subsequent app captures use project-scoped Flutter integration tests only.
- Created RSA 3072 upload key, alias `upload`, CN `Chapega Studio Upload`,
  valid 10,000 days, outside Git in
  `%USERPROFILE%\.chapega-signing\chapega-studio-upload-20261031\`.
  Private keystore and ignored `mobile/android/key.properties` have user-only
  ACLs; recovery uses Windows DPAPI CurrentUser. No password was printed.
  Read `RECOVERY.txt` there. An off-device backup of the key and password
  still needs the owner's secure password manager; DPAPI alone is not portable.
- Public-only certificate is in `mobile/store/signing/`. Its SHA-1 is
  `9D:02:E3:15:11:BB:AF:20:2D:48:18:84:FD:E7:DC:51:61:93:FB:6C` and SHA-256 is
  `13:51:FC:69:1D:B7:F8:65:2C:55:F7:7A:BC:EA:5F:80:AF:6D:72:2B:F9:3E:43:DF:35:63:03:33:A9:63:29:B1`.
  Both fingerprints are saved in Firebase. Android API restrictions retain
  the debug certificate and add this upload certificate; 25 API restrictions
  are unchanged. Google's eventual Play app-signing certificate is separate.
- Release bundles now reject absent/debug signing material, including direct
  package/sign/finalize task paths. APK-only CI checks retain their debug
  fallback. `.p12` is covered by Git ignores and the mobile CI key-file check.
- Upload-signed AAB/APK are preserved in `mobile/build/play-store/`.
  AAB SHA-256: `110C568582371FBCDBCAC86327D099590723C50F202BC7D89B39EE0420811884`;
  APK SHA-256: `F3AE33DAC62394424D1E15CB494D695D5BC95FEDAF024954C52463EAC7E6A8ED`.
  Signatures, Firebase resources, bundletool and static 16 KB checks pass.
- Stable delivery copies are outside temporary build output at
  `D:\chapega\releases\chapega-studio-1.0.0-1\`; their SHA-256 values match.
  The store-pack ZIP there contains 43 verified entries, including the signed
  builds, public certificate, four screenshots, listing drafts and release
  documentation. Every entry was checked against its SHA-256 manifest;
  private keys, passwords and Firebase configuration are excluded.
- D: ran out of space. Only this checkout's generated `mobile/build`
  (1,646,516,348 bytes) was moved using native PowerShell to
  `%TEMP%\chapega-mobile-build-20261031-upload`; the original path is a
  junction. Artifact hashes survived unchanged; no source/other worktree
  cleanup or global Gradle stop was done. Only the affected project daemon
  was restarted after its stale execution-history lock blocked a retry.
- Capture setup is private/local: 127.0.0.1:3340,
  `%TEMP%\chapega-play-capture-20261031\data`, six synthetic orders, 24 seeded
  products, public development preview credentials only, no FCM sender key.
  Existing port 3300 was occupied and left untouched. Dedicated AVD
  `ChapegaCapture20261031` on emulator-5556 is used; emulator-5554 is untouched.
  Capture harness refuses release/other origins and captures only Flutter's
  app view. Final headless retry passed with four genuine 1080×1920 images
  under `mobile/store/screenshots/`, visually checked and re-encoded as RGB
  with unchanged decoded pixels. Metadata records original/export hashes.
  The debug/local demo is not Play/physical-device acceptance. It signed out
  and verified token removal. Only the owned server PID 33224 and dedicated
  headless emulator were stopped afterwards; port 3340 is no longer listening.
- Store pack now has a 1024×500 RGB feature graphic, listing drafts, App
  access/App content drafts, four RGB app screenshots, metadata and public
  certificate. Privacy prose
  is corrected locally for providers/Firebase/photo uploads/retention and
  explicit transfers, preserving contacts. No Play listing/upload occurred.
- Netlify Free preparation includes `netlify.toml`, an official context-based
  client-IP integration and `docs/deployment-netlify.md`. A credential-free
  isolated CLI/OpenNext build succeeds. No account/site/secret transfer,
  deployment or billing occurred. Upload-size/runtime/region/quota and real
  service tests remain cutover gates. Current Vercel production is unchanged.
- Patched test-only Undici to 8.12.3; Node minimum is 22.19 (major 22).
  Production audit is clean. Existing moderate minimatch/ESLint dev findings
  need incompatible upstream major changes and remain documented.
- Final standalone web check passes: 665 tests across 86 files, typecheck,
  lint and all coverage thresholds. Two workers avoided competing-build
  contention; no assertions or timeouts were weakened. The independent
  signing, request-identity, capture and privacy review found no material issue.
- Formatting, production dependency audit (zero findings), staged/history
  secret scans and whitespace checks pass. Flutter's 89 unit/widget tests
  and analysis pass; the final capture harness passes and Dart formatting
  requires no changes. Runtime push/Play/physical-device checks remain open.

## Google Play readiness review (2026-10-31)

This section records the initial review. Upload signing and store materials
were subsequently prepared as described above; the original debug artifact
below is historical and must not be uploaded.

- User wants Android publication, with a full check first and free versions
  only. Result: **not ready for submission**. The concrete findings,
  verified checks, listing drafts and Data safety inventory are in
  `mobile/docs/PLAY_STORE_REVIEW.md`.
- Chrome extension confirms an existing organization developer account is
  accessible through the configured Google account.
  Searching its apps for Chapega returns no result. No app was created,
  bundle uploaded, agreement accepted or money spent. The new-personal-
  account 12-testers/14-days rule should not be assumed for this account.
- User explicitly declined adding support/privacy/deletion contact details
  now and confirmed **no existing Android upload key**. Preserve that
  decision. Live `/delete-account` currently uses the sample WhatsApp
  `919876543210`; a real monitored route and store support email are
  blockers. Public privacy/deletion pages were left unchanged.
- Remaining blockers: Play app-signing SHA-1 in Firebase
  and Android API restrictions, final App
  content forms, a dedicated demo owner account and real-device acceptance
  including actual background/cold-start push. Do not give reviewers real
  shop credentials or use development preview credentials on production.
- Current Vercel Hobby is verified free, but Vercel's current terms limit
  it to personal/noncommercial use. Treat compliant hosting for Chapega's
  business launch as unresolved; do not upgrade or spend under the
  free-only instruction. PUSH.md/README now point to this restriction.
- Fresh web checks pass: 637 tests/85 files with coverage thresholds,
  production build, format and production dependency audit (zero
  vulnerabilities). Fresh Flutter analyze and all 89 tests pass.
- Android release APK inspection: min API 24, target/compile API 36,
  ARM64/x86_64 present, all 12 native libraries have at least 16 KB ELF
  alignment and APK ZIP alignment passes. HTTPS-only transport, backup
  exclusions and narrow permissions verified. These are static checks,
  not a test on a 16 KB runtime or physical phone.
- Firebase-configured AAB built and bundletool 1.18.3 validation passes:
  `mobile/build/app/outputs/bundle/release/app-release.aab`, 59,471,493 bytes,
  SHA-256 `1B6C2F3E17E5FCE7C09601692DC4ED1124888FB10AB4C4ACD1F29139336A6EF4`.
  BundleConfig specifies `PAGE_ALIGNMENT_16K`; Firebase resources match,
  R8 map/native symbols are included. Signature verifies as Android Debug:
  **check artifact only, not upload-ready**. No new credentials were made.
- Corrected only the store icon's PNG encoding (RGB to RGBA, 512×512,
  14,916 bytes), verifying decoded pixels are unchanged. Corrected internal
  store privacy notes and the runbook's name-attribution/tenant-join
  deletion safeguards. No actual account deletion or production data
  mutation was performed. These were local and uncommitted at the initial
  review; the final release branch is recorded in the latest section above.

## Firebase connection (2026-10-31)

- Created Firebase project `chapega-studio` (Chapega Studio), project number
  `909514098484`, under the user's chosen Google account, with approval.
  It is on Spark ($0/month); Analytics and the optional developer-program
  signup were left off. Android and iOS apps both use `com.chapega.studio`.
  The user requires free versions only: no billing activation, paid plan,
  add-on or store enrollment is authorized. Vercel remains on Hobby;
  Supabase's authenticated dashboard shows the `chapega` organization on Free.
- FCM HTTP v1 is enabled. Dedicated service account
  `chapega-fcm-sender@chapega-studio.iam.gserviceaccount.com` has only the
  Firebase Cloud Messaging API Admin role. Google OAuth and an FCM
  `validate_only` request both passed (HTTP 200; no notification sent).
- Stored `FCM_SERVICE_ACCOUNT_JSON` as a Sensitive Production variable in
  Inception's existing Vercel `chapega` project. Redeployed the existing
  production source (`d9b4b8a`), without publishing local uncommitted work:
  deployment `dpl_GtKpij7MMPxQ1DNkrvKRCzYwGb1x`, live at
  `https://chapega.vercel.app`. Health/readiness pass and production logs
  report `pushNotifications: "on"`. The downloaded private key was removed
  after installation and validation; no private key is in the repository.
- Local Android/iOS build settings are in ignored
  `mobile/config/firebase.json`. Client keys are application-restricted:
  Android package plus the current debug signing SHA-1, iOS bundle ID.
  Add the real Play app-signing certificate before publishing to Play.
- Fixed AGP 9's disabled `resValues` feature in
  `mobile/android/app/build.gradle.kts`; Firebase's generated native string
  resources now compile. Configured release APK built and AAPT verified its
  four Firebase resources against the local configuration:
  `mobile/build/app/outputs/flutter-apk/app-release.apk` (61,613,156 bytes).
  Analyze is clean; all 89 Flutter tests pass.
- This Windows/JDK installation needed a process-only
  `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=D:\chapega\.java-sockets`
  for Gradle's loopback/socket startup. No machine-wide setting changed.
- Applied exactly the four approved migrations to Chapega Kiosk
  (`vjfnuwpsomwnomqllfau`, Seoul): `20261030120000`, `20261030121000`,
  `20261030122000` and `20261101120000`. The final dry-run reports zero
  pending migrations. Catalog checks verify the temporary-password flag,
  device columns, phone session scope, forced RLS on both push tables,
  narrow function grants and no direct runtime access to push tables.
  Both cron jobs are active. The user explicitly approved permanent
  30-day customer redaction; it runs nightly at 03:45 UTC (09:15 IST),
  preserving order items and totals. No redaction was invoked manually.
  No Supabase plan or billing settings changed.
- Post-migration production checks pass: health/readiness return HTTP 200;
  an unauthenticated phone session and a nonexistent `.invalid` login both
  return the expected HTTP 401. Supabase dashboard and CLI report Healthy.
  This does not verify a signed-in phone.
- Still to verify: push registration and real delivery on
  a signed-in phone, and iOS APNs configuration/signing/build. No app was
  installed on an existing device and no real kiosk order or notification
  was sent in this session.

## Windows test fix (2026-10-31)

- `tests/unit/team-and-password-routes.test.ts` normalizes CRLF to LF after
  reading the migration, preserving its exact security assertions on both
  Windows and Unix checkouts. No migration or application code changed.
- The CI history secret scan surfaced five duplicate historical fingerprints
  of byte-identical, already-reviewed fixtures, dummy values and blocklist
  entries. Added only those exact fingerprints to `.gitleaksignore`;
  scanner rules are unchanged. History and worktree scans now pass.
- Verified: `npm run check -- --coverage` (637 tests across 85 files, all
  coverage thresholds met), `npm run format:check`, `npm run build`, and
  `npm audit --omit=dev --audit-level=high` (zero vulnerabilities).
- Real-database integration passed: 35 tests across 4 files, with
  `CHAPEGA_IT_REQUIRED=true` on an isolated local Postgres 17.10 with TLS.
  The temporary database server was shut down afterwards.
- Full Playwright suite passed across Chromium, Firefox, WebKit, mobile
  Chrome and mobile Safari: 84 passed, 16 intentionally skipped duplicate
  API cases (those run once under Chromium). Used `next start` on port 3200
  with a temporary config and isolated data outside the repository because
  the existing `next dev` process prevents another dev server in this
  checkout. The existing process was left running.

## Project review (2026-10-31)

- Read the web kiosk, Vendor Studio, admin portal, domain rules, backend,
  migrations, Flutter app, tests, CI and operations documentation. No
  application code changed.
- Local `main` at `d9b4b8a` contains the complete-app stack merge (#29-#33).
  Its tracked tree matches the `feat/store-pages` checkout at `6b5533f`.
  The merge instructions below predate that local merge; live deployment,
  applied migrations and remote PR state were not checked.
- Baseline `npm run check`: type checking and lint passed; 636 of 637 unit
  tests passed. The remaining migration-text assertion in
  `tests/unit/team-and-password-routes.test.ts:244` expects LF while the
  checked-out SQL uses CRLF. Its expected text matches after normalizing
  line endings. Integration, browser and Flutter checks were not rerun.
- Architecture follow-ups: Studio loads complete order history, ordinary
  Supabase mutations reconstruct the tenant snapshot, and push claims an
  announcement before delivery without a durable retry queue. Readiness
  probes database reachability, not migration or Storage health.
- Documentation drift: the design-system documents describe older styling;
  current CSS is the implementation reference. The final privacy bullet in
  `mobile/docs/RELEASE.md` still describes kiosk customers only, although
  `/privacy` now also covers shop teams.

## Where things are

- `main` is production (`chapega.vercel.app`, Supabase in `ap-northeast-2`,
  functions in Vercel `icn1`). Every push to `main` deploys.
- Five stacked pull requests, merged in this order. Each one is retargeted
  when the one below it merges:
  1. **#29 `fix/security-upgrade`**: Next.js 16.4.3 and zod 4.6.7 for the
     advisories. No migration.
  2. **#30 `feat/complete-app`**: privacy notice, 30-day retention,
     per-order erasure, Team, password changes and resets, fixes.
     **Migration-first.**
  3. **#31 `feat/studio-app-api`**: phone sessions and push for the
     Chapega Studio app (migration `20261101120000`). **Migration-first.**
  4. **#32 `feat/studio-app`**: the Chapega Studio Flutter app in `mobile/`,
     plus its CI workflow and repository housekeeping. No server change.
  5. **`feat/store-pages`**: the account-deletion page and the privacy
     notice's shop-team part that the app stores require. No migration.

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
  - 89 Flutter tests, including accessibility in light and dark at 2x text;
  - `flutter analyze` is clean;
  - the integration test passes on the API 36 emulator against the real server;
  - a release APK builds (debug-signed).
- **Not verified:**
  - **iOS is not compiled.** Run the "Mobile app" workflow by hand with
    `ios: true` before the first iOS release.
  - **Push has not run end to end on a signed-in phone.** Firebase is now
    configured, Google validation passes and the production server has push on.
- **Decided on 2026-10-31:**
  - Release builds use `https://chapega.vercel.app`.
  - Account deletion requests go to Chapega.com's WhatsApp, through
    `/delete-account`; the procedure is in `docs/RUNBOOK.md`.
  - The privacy notice gained a "Shop teams" part (`/privacy#shop-teams`).
  - Both pages are in **`feat/store-pages`**, stacked on `feat/studio-app`.
- **Waiting on the owner:** who owns the Google Play and App Store accounts
  and the upload key? A new personal Play account must
  run a closed test with 12 testers for 14 days before going public.

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
- **Git worktrees on Windows** check files out with CRLF. The team migration
  test normalizes line endings so its assertions pass locally and in CI.

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
