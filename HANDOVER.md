# Handover

State on 2026-10-31. Update this file at the end of every session (AGENTS.md,
"Start of every session").

## Where things are

- `main` is production (`chapega.vercel.app`, Supabase in `ap-northeast-2`,
  functions in Vercel `icn1`). Every push to `main` deploys.
- Open pull requests:
  - **#29 `fix/security-upgrade`**: Next.js 16.4.3 and zod 4.6.7 for
    the advisories that made CI's audit step fail. No migration. Merge first.
  - **#30 `feat/complete-app`** (stacked on #29): privacy notice, 30-day
    retention, per-order erasure, Team, password changes and resets, the
    recovery-script fix, shop rename, small admin/Studio fixes, docs.
    **Migration-first**, see below.

## Before merging #30

1. `npx supabase db push --linked --dry-run`, then `npx supabase db push --linked`.
   New: `20261030120000` (retention job), `20261030121000` (shop rename),
   `20261030122000` (team and credentials). `20261009120000` too if pending.
2. `npm run supabase:verify` (now also checks the definer functions).
3. Warn the shop first: the first nightly run permanently blanks customer
   details on orders finished more than 30 days ago and on old unconfirmed
   drafts.
4. Merge. Then check:
   - `select jobname, schedule, active from cron.job;` lists
     `chapega-purge-sessions` and `chapega-redact-orders`.
   - The redaction check query in `docs/RUNBOOK.md` returns 0 the day after.
   - `/privacy?shop=chapega` shows the shop's WhatsApp number.
   - Studio → Team loads for the owner; Change password works.

## Working locally

- `.env.local` copied from `.env.example` gives the local JSON backend and the
  preview account `owner@chapega.com` / `Chapega@2026` (development only).
- Other projects on this machine may hold ports 3000 and 3100. `next dev`
  moves to the next free port by itself; for e2e set one explicitly:
  `PORT=3200 npx playwright test --project=chromium`.
- `npm run test:integration` needs any Postgres 17 with TLS
  (`CHAPEGA_IT_ADMIN_URL=postgresql://postgres:…@localhost:PORT/postgres`).
  It creates and drops its own databases.

## Follow-ups (not done)

- After #29 merges: close Dependabot #28 (it bumps eslint-config-next without
  next), rebase and merge #25, #26, #21, #22, #24, then #23 (TypeScript 6).
  Turn on Dependabot security updates in the repository settings.
- RUNBOOK TO DECIDE items: production owner, on-call, staging, uptime
  monitoring, error tracking, Supabase backup plan, Storage bucket backup.
- Self-service password recovery (needs email/SMS) and MFA for admins.
- Admin: edit vendor details, transfer ownership, second super admin, delete.
- A deactivated team member keeps their platform account, so their email
  stays taken; moving someone to another shop needs support.
- Staff-written order event notes are not redacted (none are written today).
- Browser Back from `/privacy` can restore the kiosk's in-memory session
  (existing behaviour; the "Back to the kiosk" link reloads correctly).
- Physical acceptance: a real WhatsApp send from the kiosk QR, and the
  touch-screen hardware.
