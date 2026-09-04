# Operating notes for Claude Code sessions in this repo

- After pushing a change to `main` that actually affects the iOS app, trigger a new
  TestFlight build automatically (`.github/workflows/ios-testflight.yml`,
  `workflow_dispatch` with `lane: beta`) -- do not ask for confirmation first. The
  web bundle is compiled into the native binary, so even client-only changes (not
  just `ios/` Swift edits) need a fresh build to reach a real device. Explicit user
  instruction (Scott): "Yes upload to testflight, don't ask anymore just do it" /
  "Make a note to always upload to Apple" / "Obviously if it applies, some builds
  don't apply to iOS" -- so skip the build when a change genuinely can't reach the
  app (e.g. this file, an admin-only server route the app never calls, a workflow
  file, docs). When in doubt whether a change reaches the app, build.
- If a change touches native code or adds/changes a native dependency (Swift
  files under `ios/`, or a new Capacitor plugin), run the `verify_build` lane
  first to confirm it compiles on real Xcode before spending a `beta` upload
  (Apple rate-limits TestFlight uploads) -- then follow with `beta` automatically,
  still without asking.
- This environment's local git checkout has repeatedly reverted `main` to a stale
  commit between tool calls, especially after an idle gap (waiting on a build,
  a long pause between user messages) -- looks like a container-resume quirk in
  the remote sandbox, not anything wrong with the repo or with how commits are
  made. `origin/main` is never affected, and recovery is always a clean
  `git fetch origin main && git merge --ff-only origin/main` (verify
  `git status --short` is empty first). Once bitten (a whole audit run against
  a checkout ~112 commits behind origin/main, producing a real false report):
  run that fetch+ff-only check at the START of any work in this repo -- before
  reading files for research, not just before committing -- so stale state gets
  caught before it feeds conclusions, not just before it feeds a push.

## Tests

- Two suites, deliberately separate. `npm test` needs no database and must stay
  that way -- nobody should need Postgres installed to check that a readiness
  score is computed correctly. `npm run test:integration` (`*.itest.ts`,
  `vitest.integration.config.ts`) runs against a real Postgres, because
  `server/storage.ts` is ~21k lines of queries and mocking the Drizzle builder
  well enough for an assertion to mean anything would amount to asserting
  against the mock.
- This sandbox has no database running by default but Postgres 16 IS installed.
  To get one (the integration suite provisions its own database on top of it,
  and CI already runs one as a service container):
  ```
  mkdir -p /var/lib/postgresql/forge-test && chown -R postgres:postgres /var/lib/postgresql
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/forge-test -U postgres --auth=trust"
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/forge-test -o '-p 5433 -k /tmp' -l /tmp/pg.log start"
  export TEST_DATABASE_URL="postgresql://postgres@localhost:5433/forge_integration_test"
  ```
  `initdb` refuses to run as root, hence the `su postgres`. With a database in
  hand, `npm run db:reconcile` against a throwaway one is also the fastest way
  to prove a migration edit actually executes -- worth doing for any change to
  `server/reconcile-schema.ts`, since a broken statement there fails the deploy.

## Working alongside other Claude sessions

- Split by FILE OWNERSHIP, never by task. Several findings living in the same
  file means constant conflicts; worse, work in this repo is often ordered
  (a backfill before the reads that depend on it), and out-of-order here means
  data loss rather than a merge conflict.
- `server/storage.ts` and `shared/schema.ts` take one owner and cannot be
  shared -- everything imports the schema. Natural disjoint slices are
  `server/auth.ts`, the `*-job.ts` files, the client camera trackers
  (`client/src/lib/*-tracking.ts`, the tracker dialogs, `ios/`), and new test
  files.
- Everyone branches from the same commit, rebases before pushing, and pushes
  small and often. A session that needs a schema column or a server route
  outside its files should ask the owner rather than reach across.

## Camera tracking

- Read `docs/camera-tracking-notes.md` before changing anything in the tracking
  pipeline or adding a capture mode. Two constraints in particular are not
  visible from the code and will produce plausible, wrong numbers if missed:
  **Olympic lifts need their own path model** (bar-path deviation and peak
  velocity both assume a straight vertical line, which a correct clean or
  snatch deliberately is not), and **camera angle decides which axis is
  measurable** (filming from behind puts forward-back drift on the estimated
  depth axis, the least reliable number the tracker produces).
- Trust scores exist for every mode now, but every threshold in them is
  uncalibrated. Treat a score as a relative signal until someone has run real
  footage through it.
- Only back squat, Pendlay row, bench press and box jump have been tested
  against real lifts. Everything else is unvalidated.
