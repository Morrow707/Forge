# Operating notes for Claude Code sessions in this repo

- BATCH TestFlight uploads; do not upload per change. After pushing a change to
  `main` that actually affects the iOS app, run `verify_build`
  (`.github/workflows/ios-testflight.yml`, `workflow_dispatch`), NOT `beta`.
  Accumulate changes and spend one `beta` upload roughly every 20 of them.
  Explicit user instruction (Scott, 2026-09-06): "stop uploading we are wasting
  uploads on these small builds, queue them all, once we get to lets say 20,
  lets upload, obviously push them to verifybuild so we know they won't get
  bounced." This supersedes the earlier "always upload, don't ask" instruction
  ("Yes upload to testflight, don't ask anymore just do it" / "Make a note to
  always upload to Apple") -- the "don't ask first" half still stands, it is
  only the per-change upload that stops. Neither lane needs confirmation.
- `verify_build` is now a real pre-flight, not just a compile check: it archives,
  signs, AND runs `xcrun altool --validate-app` against the archive, so it
  answers "would App Store Connect accept this binary" without creating a build
  record or spending upload quota. That is what makes the batching safe -- it
  catches the whole rejection class (missing purpose strings, entitlement
  mismatches, bundle problems) that used to only surface at upload time. It was
  added after a Health purpose-string change archived cleanly, passed the old
  `verify_build`, and was then rejected at upload with error 90683.
- Both lanes follow the same "does this reach the app" rule as before: skip
  entirely when a change genuinely cannot reach it (this file, an admin-only
  server route the app never calls, a workflow file, docs, a server-only
  dependency). The web bundle is compiled into the native binary, so client-only
  changes DO reach it. When in doubt, run `verify_build`.
- When a batch is ready, run `beta` once on the current `main`. It ships
  everything accumulated since the last upload, so there is no need to upload
  per commit to keep anything from being missed.
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

## The AI knowledge library

- **Domain tags live on the PASSAGE, not the source.** A strength and
  conditioning textbook has a nutrition chapter in it; tagging the file
  forced a choice between hiding that chapter from the nutrition assistant
  and handing it every page of bar-path material. Retrieval matches
  `knowledge_passages.topics` where set and falls back to the source's
  domains where not, so pre-tagging passages keep working. Do not "simplify"
  this back to a source-level filter.
- **Transcription is checkpointed and must stay that way.** Pages are written
  and `transcribedThroughPage` moved after every batch. The first build held
  400 pages in memory and wrote at the end, so a redeploy at page 390 lost
  the run and charged twice. The checkpoint advances even for a batch that
  produced nothing, or unreadable pages are retried on every resume forever.
- **Transcription and conflict detection run on the cheap model.** Both are
  mechanical and both are once-per-page or once-per-passage across a whole
  book. Moving either to the expensive model multiplies a real bill.
- **Usage is recorded in `callAnthropic` and nowhere else.** That is the one
  point every model call passes through, so a new feature cannot spend money
  invisibly. The write is best-effort and never awaited -- the opposite of
  the aggregate-data access log, which is awaited because it doubles as a
  budget. Nothing depends on this counter.

## Population norms

- **`NORM_MIN_COHORT` is 30 and is not the anonymity floor.** Five stops a
  chart identifying somebody; thirty is the minimum for a percentile to mean
  anything. Different questions, do not merge them.
- **Norms are rebuilt wholesale every night, never updated in place.** That
  is what lets an athlete change age band on their birthday with no
  bookkeeping. An incremental update reintroduces exactly the maintenance
  the design removes.
- **A cohort too thin to widen returns nothing.** A percentile from eleven
  people is a different kind of claim, not a weaker one. Every rendering
  carries the sample size, which dimensions were dropped, and the fact that
  Forge's athletes are not a random sample of anything.
- **Nutrition uses norms for description only.** The cohort says what an
  athlete of this description looks like; the published guidance supplies the
  recommendation. Intake norms come from self-reported food logs, so deriving
  a target from them recommends under-fuelling back to a population that is
  already under-fuelling.

## Athlete data leaving the platform

Added 2026-09-07, after an audit found the admin analytics surfaces were
not actually de-identified. These are invariants, not preferences -- if a
change makes one of them false, the change is wrong.

- **Nothing that resolves to a person leaves an analytics surface.** The
  Query Engine used to return `users.id` on the reasoning that a bare id
  isn't identifying; `/api/admin/users/:id` turns exactly that id into a
  name, email and date of birth, so it was. Rows carry a `subjectCode`
  instead: an HMAC under a salt generated fresh per query, stable within
  one result and different across two, mapped nowhere. The tracking report
  shows "Athlete 1", "Athlete 2" for the same reason.
- **Extracts are built from the research mirror, never from live rows.**
  `server/research-mirror.ts` writes consenting athletes into
  `research_subjects` and its two child tables ahead of time, with the
  identifying columns absent rather than stripped on the way out, and
  `queryResearchCohort` in `storage.ts` reads only those. That function is
  a near-duplicate of `queryTrackedCohort` on purpose -- merging them
  behind a flag would put the export path one SELECT away from live
  athlete rows. `users.researchSubjectId` is the one pointer, and it has
  to exist: without it a withdrawal could not remove anyone from the
  mirror. So the honest claim is anonymous at the export boundary,
  pseudonymous inside Forge, and the PDF says exactly that.
- **The admin side is anonymous; the coach side is not.** A coach sees
  their own athletes by name because that is what coaching is. Everything
  on an admin analytics surface, and everything that leaves, is group
  numbers over the mirror. Do not "improve" an admin screen by resolving a
  code back to a person.
- **Two suppression floors, deliberately different.** 5 inside Forge
  (`PLATFORM_TRENDS_MIN_COHORT`, `QUERY_ENGINE_MIN_COHORT`), 10 in anything
  that leaves (`RESEARCH_EXPORT_MIN_CELL`). Five is reasonable for an
  operator looking at their own platform; it is thin for a document leaving
  the organisation, where a reader may hold outside knowledge that narrows
  a group further. Don't "tidy" these into one constant.
- **Research consent is opt-IN and separate from `trackingOptOut`.** Those
  answer different questions: one governs collection for the athlete's own
  coaching, the other governs inclusion in an extract prepared for an
  outside party. A minor's answer comes from a guardian, relayed by a coach
  who must name who they are relaying from. Withdrawal writes its own dated
  consent record.
- **The aggregate-data access log write is awaited on purpose.** It used to
  be fire-and-forget with a comment saying an audit write must never make a
  query fail. It is now also the query budget counter, and a budget a
  failed insert can bypass is not a budget. A query that cannot be logged
  does not run. The comment in `storage.ts` says so; don't revert it back
  on the strength of the older reasoning.
- **The query budget exists for differencing, not for load.** 50 per admin
  per rolling 24 hours. Suppression only ever sees one query at a time, so
  a sequence of overlapping queries can still isolate an individual by
  subtraction. The number is a judgement call, not a derivation.
- **Purging a video never touches its metrics.** Velocity, ROM, jump
  height, bar path, skeleton frames, trust scores and the PR flag all
  survive; only the file and two video-specific flags are cleared. That is
  what makes the retention policy defensible AND keeps the research data
  intact. Both properties depend on it.
