<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Start of every session

1. Read `HANDOVER.md` (the session-start hook prints it): what is in flight,
   deploy steps still pending, and open follow-ups.
2. Run `npm ci` if `node_modules` is missing, then `npm run check` before
   changing anything, so you know the starting point is green.
3. Before writing Next.js code, read the matching guide in
   `node_modules/next/dist/docs/` (see above).
4. Commit as `inceptionretreats-7739 <inceptionretreats@gmail.com>` (set
   `git config --local user.name` and `user.email` in a new clone). Work on a
   branch and open a pull request: every push to `main` deploys production
   on Vercel.
5. Migrations are forward-only; never edit an applied one. Record each
   release's deploy order (migrations first or app first) under "Before you
   deploy" in `CHANGELOG.md`.
6. Before finishing, update `HANDOVER.md`. With uncommitted changes the Stop
   hook runs `npm run -s check`, which takes about a minute.
