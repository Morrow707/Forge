# Operating notes for Claude Code sessions in this repo

## RULE #1: THE CAMERA NEVER REJECTS. EVER.

**This is the first rule in this file on purpose, and it applies to every camera build Forge
ever ships.** Scott, 2026-09-22, after the fourth refusal in three weeks of calibration:

> "Camera should never ever reject, I'd rather have bad data then it reject the whole thing, we
> can calibrate bad data, we can't calibrate a rejection. Never ever, ever, ever, should the
> camera ever, reject my filming angle or data. Make that rule number 1."

> "The athlete is going to film from any angle, so we have to make it work, there's no 'perfect
> angle'. The camera should never reject. Ever."

Earlier the same day, the same rule in its first form: "our camera system should never, ever
reject data, accept it wrong, that gives us something to work with, rejected data does nothing
for us."

**THE FILMING ANGLE IS NEVER A REASON TO REFUSE ANYTHING.** There is no angle the pipeline is
entitled to turn down, and no posture. Every refusal this repo has shipped was geometrically
correct and still wrong, because the thing it refused was the only evidence anybody had.

A wrong number carries information: it can be compared against a bar sensor, replayed through
the harness, and used to find the fault. A refusal carries none -- the athlete filmed a set, the
app kept the video, and nobody can tell a 40% scale error from a broken tracker from a bad angle,
because no number was written down.

Before adding ANY check to this pipeline, ask what it does when it fires. If the answer is
"withholds a number the pipeline already computed", the check is wrong as written: make it a
flag and a caveat instead, and let the number through.

- **A capture always writes its numbers**, however little the pipeline trusts them, alongside the
  accuracy caveat (`shared/camera-accuracy-copy.ts`) and the `trackingDiagnostics` blob saying
  what went wrong. The caveat is how an athlete is told not to trust it; silence is not.
- **Withholding a number is a LAST resort and needs a reason that is not "it might be wrong."**
  Every number this pipeline produces might be wrong; that is what calibration is for. The bar is
  "a reader would be actively harmed by seeing this", not "we are not confident".
- **Never ship a refusal before its replacement.** The shoulder-width refusal (2026-09-22) was
  correct on the geometry and still wrong to ship: it removed the only ruler a bench press had,
  with nothing behind it, so two builds produced less than the morning had. If a source is going
  to be refused, the source that replaces it lands first, in the same build or an earlier one.
- **This does not weaken the plausibility gates.** A single frame that implies an impossible
  velocity is still dropped -- that is filtering a sample, not refusing a take. The rule is about
  the SET: a set that was filmed gets a row, a number and an explanation, always.
- **NO SURFACE EVER TELLS THE ATHLETE WHERE TO STAND, AND NO TAKE RAISES A BANNER ABOUT ITS
  ANGLE.** Scott, 2026-09-29, on "Range of motion came out as 116cm ... Filming square to the
  side, camera level with the bar, gives the most reliable read": "fix that error message, and
  make a note in Claude.md to never have it pop up again. The athlete is able to film from any
  angle." The take that raised it was a rep-splitting bug (the segmenter took the un-rack as a
  rep, see docs/camera-tracking-notes.md "Bench at an angle, 2026-09-29"), and the banner blamed
  the camera angle for it. A plausibility finding goes into `trackingDiagnostics` for the report
  and nowhere else; the athlete sees the accuracy caveat every camera number already carries,
  and never a sentence about where the phone was. Trust-score notes state the angle as a fact
  ("Filmed from an angle"), never as a fault. `exercise-camera-profile.ts` may still DESCRIBE a
  view before recording; nothing after a take may prescribe one.

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
- **NEVER ASK WHETHER TO PUSH OR UPLOAD. SCOTT SAYS WHEN NOT TO.** Scott, 2026-09-22: "I will
  tell you when I don't want you to push things", after "stop asking me to upload I've been
  waiting on you this whole time." The default is ship; a hold is something he states, and it
  lasts until he lifts it (he held one earlier the same day -- "don't ship it I want to test
  the camera first" -- which is exactly how a hold is meant to arrive). Asking costs him a
  round trip he has already paid for twice.
- **CALIBRATION WORK IS ALSO EXEMPT FROM THE BATCH.** A change whose whole purpose is to make
  the next filmed set measurable -- a new diagnostic, a segmentation rule, a scale source -- is
  worthless on `main`: it only produces evidence once it is on the phone that does the filming.
  Push `beta` the moment such a change is committed. Scott: "when youre calibrating push then
  right away." This does not reopen per-change uploads for ordinary work; the batch above still
  governs everything that is not blocking a capture.
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

## CI red that IS real: the production npm audit blocks the deploy

Added 2026-10-06. `build-and-migrate` has an **Audit production dependencies** step, and
`deploy` hangs off that job -- so a new advisory in the PRODUCTION tree stops the commit
reaching Render, silently, with the deploy showing as `skipped` rather than failed. This is the
one CI red that is neither a flake nor a duplicate run, and it is the first thing to check when
both the main run AND the branch run fail on the same SHA (the duplicate-run pattern below has
one of them succeed).

It fired for the first time on `b97b69bb`, 2026-10-06, on four advisories published after Pass A
cleared the tree the day before: `@capacitor/ios` and `@capacitor/android` 8.5.0 (CRITICAL,
remote content loadable at the app origin through the internal HTTP proxy path),
`proxy-addr` 2.0.7 (CRITICAL, IP spoofing via an IPv4-mapped IPv6 trust subnet -- which on Forge
decides what every rate limiter and every consent record's `ipAddress` sees) and `compression`
1.8.1 (high, DoS). `npm audit fix` cleared all four inside the existing semver ranges, so only
`package-lock.json` moved: 8.5.0 -> 8.5.2, 2.0.7 -> 2.0.8, 1.8.1 -> 1.8.2.

**A Capacitor bump is a NATIVE change even though only the lockfile moved.** The iOS project
takes its plugins through SPM (`ios/App/CapApp-SPM`, no CocoaPods), regenerated by
`npx cap sync ios` in the workflow, so the native side picks the new version up on the next
build with nothing to edit by hand -- and that is exactly why it needs `verify_build` rather
than riding along unproven.

This step is the reason `tailwindcss-animate` was moved to devDependencies in Pass A: with
build-time packages in `dependencies`, the production tree carried six advisories permanently
and a REAL one in the server's own tree would have been invisible among them. Keep it that way.

**IT FIRED AGAIN 2026-10-22, ON THE SIBLING STEP, AND THE CURE CRASHES ON THE SANDBOX'S OWN NPM.**
`Audit build tooling` (the whole tree at `--audit-level=moderate`, step 10) went red on
`6157bae9` and `685fe491` -- **four CI runs, both refs, two commits**, which is NOT the
duplicate-run pattern below (there one of the two succeeds). Read the step NUMBER: step 10 of 16
means typecheck, the unit suite and the production audit all PASSED and nothing about the code
was the problem; it also means steps 11-16 -- the build, the reconciler, the seed, the FK-drift
check and **the whole integration suite** -- never ran, so a commit that dies here is unproven
by everything after it, not just unaudited. Four advisories published between 10-20 and 10-22:
`vite` <=6.4.3 (high, five CVEs incl. cross-origin script execution through custom middleware),
`@vitest/mocker` and `vitest` <=4.1.11 (moderate, code injection via unauthenticated manual mock
registration) and `ip-address` <=10.7.3 (moderate, quadratic zone-identifier match). **The last
one is in the PRODUCTION tree** -- `express-rate-limit` -> `ip-address`, so it reaches every rate
limiter -- and it passed step 9 at 18:23 and failed it locally two hours later, i.e. the deploy
blocker above was minutes from firing on its own. Fix inside the declared ranges, so only
`package-lock.json` moved: vite 6.4.3 -> 6.4.5, the seven vitest packages 4.1.11 -> 4.1.12,
chai 6.2.2 -> 6.3.0, tinyrainbow 3.1.1 -> 3.2.0, ip-address 10.7.2 -> 10.7.4.

**`npm audit fix` AND `npm update` BOTH CRASH HERE, AND `--legacy-peer-deps` IS NOT THE
WORKAROUND -- IT SILENTLY DELETES PACKAGES.** On npm 10.9.7 (what Node 22 ships, so what the CI
runner and this sandbox both have) every form of the fix dies with
`Cannot read properties of null (reading 'edgesOut')` in arborist's `#loadPeerSet`, while
resolving vitest's five OPTIONAL peers (`@vitest/browser`, `@vitest/ui`, `happy-dom`, `jsdom`,
`canvas`). A plain `npm install` is fine; it is only the ideal-tree rebuild that a version change
forces. `--legacy-peer-deps` makes the command SUCCEED and is the trap: it skips peer resolution
altogether, so it dropped **`react-is`, `ts-custom-error` and `@zxing/library`** from the tree
(the net -33 lines in the lockfile diff were the tell, and the diff is the only place it is
visible -- npm reports nothing). The next `npm run build` then failed with
`Rollup failed to resolve import "react-is" from recharts/es6/util/ReactUtils.js`, which would
have been a RED STEP 11 on top of the red step 10 and reads as a code problem. **A flag that
makes a resolver stop resolving is not a bypass for a resolver bug.**
**What works: run the update with a NEWER NPM, from a scratchpad, without installing it.**
`npm install --no-save npm@11.21.1` into a temp directory, then
`<that>/node_modules/.bin/npm update vite vitest ip-address` -- 56 insertions / 56 deletions,
**zero packages added or removed**, `lockfileVersion` still 3, `package.json` untouched. Then
prove CI can use it with CI's own npm: `npm ci` on 10.9.7 installed all 905 packages from the
npm-11-written lock with no error, and typecheck, the 405-file unit suite (4744 passed,
unchanged), `npm run build` and BOTH audits are green on that tree. Do not install a newer npm
globally in the sandbox to do this -- the lock is the only artifact, and it has to be readable by
the npm the runner actually has.
**A vite bump reaches the phone.** The web bundle is compiled into the native binary, so the
build tool that produces it moving two patches is a client change: `verify_build`, same argument
as the Capacitor paragraph above.

### AND ONE MORE THAT IS REAL: A DEADLOCKED TRUNCATE IN THE TEST HARNESS (2026-10-09)

Run 1757 on `b88d8850`. **`deploy` hangs off the integration job, so one aborted TRUNCATE stopped
the commit reaching Render** -- same consequence as the audit above, different cause, and it
presents as a plain red test rather than as anything about the deploy.

Read the ANNOTATION, not the step name. Postgres named the cycle itself: "Process 693 waits for
AccessExclusiveLock on relation 20622; blocked by process 694. Process 694 waits for
AccessShareLock on relation 20606; blocked by process 693." One side is `resetDatabase`'s TRUNCATE
(AccessExclusive on every table at once) and the other a plain reader. **The reader is deliberate
product behaviour**: several writes in this app are documented as best-effort and never awaited
(the AI usage counter, the session store's `touch()`, the fire-and-forget sends), so a request
that already returned 200 can still have a statement in flight when the next test's `beforeEach`
fires. `fileParallelism: false` does not help -- the race is inside one file, not between two.

**This is the one place a retry is the cause-level fix and not a shrug**, and the distinction is
worth keeping because "flake is not a root cause" is otherwise the rule. The cause is known and
intended; the harness is what has to tolerate it; the competing statement finishes in
milliseconds, so the re-sent TRUNCATE finds the locks free. `server/test-support/retry-on-deadlock.ts`
retries on **SQLSTATE 40P01 alone**, is bounded at five, and rethrows the ORIGINAL error
untouched, so nothing real can hide behind it. `resetDatabase` also takes its table list
`ORDER BY tablename` -- which does not prevent the deadlock (a reader locks in its own order
regardless) but stops an unordered `pg_tables` scan making the same race appear and vanish for no
visible reason. `the-reset-survives-an-unawaited-write.test.ts` is a `.test.ts`, NOT an itest, so
it runs on every `npm test` with no Postgres; mutation-tested seven ways. **Its two "gives up"
cases throw a sentinel after twenty times the bound** on purpose: an unbounded retry whose sleep
resolves immediately is a tight async loop that starves the timer queue, so the suite HANGS
instead of failing, and a hang in CI is a 25-minute job timeout that reads as something else.

### AND THE THIRD: "Docker pull failed with exit code 1" -- FIXED BY REMOVING THE REGISTRY

Same day, runs 1759, 1760 (and its re-run) and 1761. `Initialize containers` failed in 12-19
seconds with that message, retried three times with backoff by the runner itself, on **three
consecutive commits across four attempts over ~35 minutes**. No step after it ran, so nothing
about the code was tested either way and `deploy` was skipped each time. **A job that fails at
step 2 in under 20 seconds has not run a test; check the step NUMBER before reading a red
integration job as a broken one.**

**AND THE FIRST VERSION OF THIS ENTRY SAID "NOT something a workflow change fixes", WHICH WAS
WRONG.** It is true that nothing fixes Docker Hub from here -- and that is the argument for not
depending on it. `services: postgres: image: postgres:16` put an unauthenticated Docker Hub pull
on the critical path to the Render deploy, and Actions runners share outbound IPs while Docker
Hub rate-limits anonymous pulls per IP, so this is neither rare nor ours to fix at the registry.
The runner image already ships PostgreSQL 16, installed and stopped, so a step that starts it
costs a few seconds and removes the registry from the path entirely -- the same shape as the
local recipe in the Tests section, which has always used the sandbox's own Postgres. The DSN is
unchanged (host service, default port), so nothing downstream of the job knows the difference,
and the step FAILS LOUDLY with a named remedy if a future runner image stops shipping Postgres
rather than falling through to a cryptic connection error forty lines later.

**AND THAT GUARD CRIED WOLF ON HALF OF 2026-10-10's RUNS, FOR A REASON WORTH KNOWING BY HEART.**
Runs 1768, 1774, 1776 and 1778 on main (and 1765, 1771, 1775 on the branch) died at step 2 in
one second with "No postgresql service on this runner image" -- on the SAME image version
(ubuntu-24.04 20261004.327.1) that passed the step on 1770, 1772 and 1777. Scott: "I've gotten
alot of ci errors." The log's line above the error says it: `Failed to print table: Broken
pipe`. The guard was `systemctl list-unit-files | grep -q '^postgresql'` under `set -o
pipefail`: `grep -q` exits on its FIRST match and closes the pipe, systemctl then dies writing
the rest of its table, the pipeline is non-zero, and `if !` reads that as "not found". Whether
it fires depends on whether systemctl finished writing before grep quit -- a race, hence half.
**`pipefail` and `grep -q` do not belong in the same pipeline**; read to EOF (`grep` without
`-q`, output to /dev/null, or test the captured string). Reproduce in any shell:
`set -o pipefail; yes | grep -q y; echo $?` prints 141. Nothing about the code was tested on
those runs and `deploy` was skipped, but Render auto-deploys on push, so every commit still
reached production -- the red was noise, loud noise, and the only cost was Scott's inbox.

## CI red that is not a test failure

Added 2026-10-05, after six of them in one evening. **Check the REF and the SHA before reading a
red CI run as a broken build.** Three separate causes, none of them a failing test, all of them
caused by how this repo is pushed to:

- **One commit, two refs, two runs.** Every commit goes to `main` AND to the development branch,
  so GitHub starts two identical runs of the same SHA. On `b9f0f6d3`, run 1666 on main SUCCEEDED
  and deployed while run 1667 -- the same commit on the branch -- was cancelled at 15:02. The
  concurrency group in `ci.yml` is keyed on `github.sha` now, so the two share a group and the
  second waits instead of competing. `cancel-in-progress` stays FALSE on purpose: true would let
  a branch push cancel main's in-flight run, and `deploy` hangs off that job, so the commit would
  silently never reach Render.
  **The cheaper cure is not to mirror the branch on every commit.** Push it when it has actually
  diverged, not after every merge to main.
- **A run cancelled at exactly 15:0x is not a timeout.** `build-and-migrate`'s limit is 25
  minutes (raised from 15 the same day, for a real timeout). A cancellation at 15:01 is runner
  contention or a superseding run; a cancellation with NO steps recorded is a job that never got
  a runner at all. Read `started_at` / `completed_at` on the JOB, not the run's wall clock, which
  includes queue time.
- **CodeQL goes red on GitHub's own infrastructure, twice over, and neither is a code problem.**
  Added 2026-10-07, run 1108 on `9c66b332`: three of five legs failed while CI on the same SHA
  succeeded and deployed. **Read the ANNOTATIONS, not the step list** -- every leg failed at
  "Perform CodeQL Analysis", which looks like a real finding and was not:
  `gh api repos/{owner}/{repo}/check-runs/<id>/annotations` said so in one line each.
  - `Analyze (swift)`: "The job was not started because it repeatedly failed to be acquired (5
    attempts)", beside a notice about macOS arm64 capacity. It never got a runner -- the same
    thing as the no-steps-recorded cancellation above, reported differently.
  - `Analyze (javascript-typescript)`: "attempted to run with improved incremental analysis but it
    did not complete successfully ... possible reason is disk space constraints ... **This failure
    has been recorded in the Actions cache, so the next CodeQL analysis will run without improved
    incremental analysis.**" It is GitHub's own optimisation running out of disk, and it SELF-HEALS
    -- the re-run does not use it. A re-run of the failed jobs is the whole fix and is the one
    legitimate re-run (the job died before analysing anything).
  **Nothing hangs off CodeQL.** `deploy` hangs off CI's `build-and-migrate`, so a red CodeQL beside
  a green CI means the commit reached Render. Check that before reading a red check as a blocked
  deploy -- it is one `gh api .../jobs` call on the CI run.
- **CodeQL goes red when a newer push supersedes it.** It runs only on `main` pushes with
  `cancel-in-progress: true`, so several pushes in a few minutes leave half its matrix legs
  cancelled and the check reads failure. That is the setting working; the fix is fewer rapid
  pushes to main, not a workflow change.

How to tell in one command: list the recent runs with their `head_branch` and conclusion. If the
same SHA shows a success on `main` and a failure elsewhere, nothing is broken.

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
- **A NEGATIVE SOURCE ASSERTION MUST STRIP COMMENTS FIRST. THIS COST FOUR FALSE RESULTS IN ONE
  DAY (2026-10-22) AND IS THE MOST REPEATED SELF-INFLICTED FAILURE IN THIS REPO.**
  A POSITIVE assertion is safe against raw source: a comment mentioning the right thing while the
  code does the wrong thing fails for other reasons. A NEGATIVE one is not -- **prose about what
  the code no longer does is indistinguishable from the code still doing it**, and the comment
  explaining a fix is exactly where the old form gets quoted.
  The four, all on the same day, three of them in tests written that day:
  - the camera ratchet's first draft asserted a FILE contained `TRACKER_FOR_TRACKING_LEVEL`, and
    the comment above the call contains those words -- so replacing the call's mapping with a bare
    `"jump"` literal left the test GREEN (2026-10-20);
  - `height-ruler-uncertainty.test.ts` went red because a comment quoted the removed
    `uncertaintyFraction: 0.05`;
  - `the-filming-roles-are-one-set.test.ts` went red because its own comment quoted the
    `["athlete","coach","admin"]` array it was documenting the removal of;
  - and the inverse, which is worse because nothing announces it: `/export \{ X \}/` unanchored
    matched `// export { X };`, so commenting the export out passed under mutation. Anchor to line
    start (`/^export \{ X \};/m`).
  **The cure is two lines and belongs in any test with a `.not.toMatch` or `.not.toContain` on
  source:** strip `/* */` blocks, then strip `//` to end of line, then match. Mutation-test every
  negative assertion -- a negative that has not been broken on purpose is not known to work.
- **AND A SCAN THAT ENUMERATES ACCEPTED FORMS FAILS ON EVERY CORRECT CHANGE, THEN GETS "FIXED" BY
  LENGTHENING THE LIST.** State what is FORBIDDEN instead; it accepts every correct change and
  refuses every wrong one. `height-ruler-uncertainty.test.ts` went red TWICE on correct changes
  because it listed two accepted spellings of the height row and the fix each time was to add a
  third; `coach-profile-response.test.ts` -- itself a monument to this lesson, with a long comment
  about a regex that "encoded the shape of the single instance that prompted it" and so "certified
  five live leaks as absent" -- had the identical flaw in two more cases, asserting the literal
  `toPublicUser(updated)` and going red on a change that served its purpose strictly better. Both
  now assert the rule.
- **AND NEVER BOUND A SOURCE SCAN BY A CHARACTER COUNT.** `routes.slice(start, start + 2000)` is
  how `coach-profile-response.test.ts` found a route's handler, and a nine-line comment pushed the
  `res.json` past the window. CLAUDE.md already records this as `stripe-checkout.test.ts`'s bug
  including the half that is worse than a false red -- a fixed window also PASSES for a match that
  sits inside it but belongs to an unrelated handler further down the file. Bound by the next
  `app.<verb>(` (see `handlerFor` in that file), which is what "this route's handler" actually
  means. Proven by mutation: deleting the route's own call reds it instead of finding the next
  one's.
- **NEVER RUN TWO INTEGRATION SUITES AGAINST ONE DATABASE.** `TEST_DATABASE_URL` names the
  database, every test file's `beforeEach` TRUNCATEs every table in it, and nothing coordinates
  two `vitest` processes -- so a quick four-file run started while a full run is in flight
  truncates tables under it and both sides report failures that are not there. Cost an hour on
  2026-10-14: twelve tests in `add-on-entitlements.itest.ts` failed with 401 on every request
  (the session rows had been truncated mid-file), read as a real regression, and passed 20/20 the
  moment they were re-run on a database of their own. A 401 or an empty read on EVERY case in a
  file is the signature; the fix is a second URL
  (`...localhost:5433/forge_itest_adhoc`), which the harness creates and reconciles on first
  use. Keep the full run on `forge_integration_test` and send every ad-hoc run elsewhere.

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

- **Read the camera architecture section below first.** Three parts -- body
  tracker, object tracker, overwatch -- and everything here sits inside that
  shape. This section is the older, mode-specific notes; it is not the design.
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
- **Every calibration finding names the piece of code it belongs to.** Scott, 2026-09-28: "make
  sure you're taking notes too, what code is supposed to do what, so if something screws up we
  know exactly which piece it was." `docs/camera-tracking-notes.md` carries one dated section per
  sensor comparison, and each symptom in it points at a function. The diagnostics export
  (`/api/admin/tracking-report/captures/recent`, the last twenty captures) is the evidence those
  sections are written from; when a fix needs a number the export does not carry, add the field
  to the export in the same change, or the next comparison cannot be made.

## RULE #4: ALL THREE CAMERA SYSTEMS RUN ON EVERY SINGLE LIFT. NO EXCEPTIONS.

Scott, 2026-10-05, after the fourth calibration session in a row where the object witness was
thrown away and the scale fell back to body rulers alone:

> "it should also be detecting the barbell in the barbell and exercises. And in the medball
> throw it needs to be detecting the medball along with the body, we need to be detecting both
> object and body in every single lift, make that rule in Claude.md. Camera system has two
> systems, object and body detector, they need to work in unison always to produce a truly
> trusted number. And never reject. We have talked about this at least 100 times now."

And immediately after, correcting the count:

> "That's what the ai overwatch is for too, so rule should be 3 camera systems, all working
> hand in hand for the most trusted numbers, or something like that, but for every single lift."

**BODY TRACKER, OBJECT TRACKER, OVERWATCH. ALL THREE, EVERY LIFT, EVERY TAKE.** He has said this
at least a hundred times and it keeps being lost, so it gets its own number. Rule #2 says no
sensor is ever switched OFF and the architecture section says what the three parts are; this
says the quieter thing that keeps happening instead -- a system that is nominally part of the
design is simply not asked for on a given tracker, or runs and has its reading discarded on
every take, which is indistinguishable from being off and is worse, because the diagnostics
read as though it was there.

**A number corroborated by one system is not a trusted number, it is an assertion.** Body
rulers agree with each other by construction -- they are built from the same landmarks -- so a
blend of body rulers alone can return `scaleCorroborated: true` and be 8% wrong, which is
exactly what the 2026-10-04 pairing did. The object is the only ruler in the scene whose real
size is KNOWN, and overwatch is the only thing that can hold the two against each other. Take
either away and the remaining system has nothing to be checked by.

### What the 2026-10-04 pairing actually showed

Read off `trackingDiagnostics.objectDetection` and `.objectLock`:

| Take | Object detected | Lock held | Secondary lock | Overwatch |
|---|---|---|---|---|
| Back Squat | **18 of 840 frames (2%)** | 32/840 (4%) | **0 frames** | ran |
| RDL | 391 of 585 (67%) | 390/585 (67%) | **0 frames** | ran |
| Box Jump | **0 frames** | `objectLock: null` | n/a | **never ran** |
| Med ball throw | never reached the server | | | |

- **The box jump had NO object system and NO overwatch.** `av-jump-tracker-dialog.tsx` passes no
  `trackingMode`, so `AvCoreMlImplementDetector.targetLabel` returns nil, the detector is inert,
  `objectLock` comes back null and overwatch has one witness and nothing to arbitrate. Scott
  jumped onto a box and the system that is supposed to find the box was not running. This is the
  clearest violation of this rule in the repo.
- **The squat found its barbell on 2% of frames**, with 90 candidates rejected on confidence and
  39 on size. The plate scale that did emerge was then rejected outright
  (`plateRejectedReasons: ["size_vs_grip", "aspect_ratio", "too_large_for_a_plate"]`).
- **The secondary barbell witness has never once held a lock** on either barbell take --
  `framesLockHeld: 0` on both. The second class exists precisely so a take with unrecognised
  plates still has an object, and it is contributing nothing.
- So on both barbell lifts the scale was decided by body rulers ONLY. **The 0.05 -> 0.1 refit of
  `HEIGHT_RULER_UNCERTAINTY` is a stopgap over this, not a fix for it**, and is to be read that
  way: it makes today's numbers land while the object system is failing to produce a usable
  reading. The real work is the detector.

### What this means for any change

- **A tracker that does not ask for an object class is broken, not simple.** Every capture mode
  names the object it expects, and if the scene genuinely has no implement (jump, sprint,
  mechanics, horizontal_load) it names what it DOES have -- a box, a ground plane -- or records
  explicitly that it has none, so overwatch's silence is a recorded fact and not an absence.
- **A rejected object read is a BUG REPORT, not a successful guard.** Three rejection reasons
  firing on one squat plate, 90 candidates refused on confidence, a secondary that never locks:
  those are detector problems. A guard that fires on every take has replaced the sensor it was
  meant to check.
- **"The object was rejected" is never a finished answer to a wrong number.** The next question
  is what the detector was looking at. `referenceObject`, `plateMeasuredPx` and the
  `candidatesRejectedBy*` counters exist for that and are to be read, not skipped.
- **Never fit a body-ruler constant without first saying what the object system produced.** If
  the answer is "nothing", the work is the detector, not the constant.
- **AND IT STILL NEVER REJECTS THE TAKE** (Rule #1). All three failing is a take with a number,
  a caveat and a `trackingDiagnostics` blob -- never a withheld number. Mandatory means
  mandatory to RUN and to RECORD, never mandatory to succeed.
- **Neither detector leads** (Rule #2). This rule adds no hierarchy. It says all three must be
  PRESENT so overwatch has something to arbitrate. One witness is not unison.

## THE FOUR ROLE "PROFILES" ARE NOT FOUR, AND THE SPLIT HE WANTED IS ALREADY THERE 446 TIMES

Added 2026-10-22. Scott, after the camera registry: "There's 4 unique 'profiles' each with
profile setting, calendar settings, so on and so forth ... I want there to be 4 different
heights, one for free agent, one for athlete, one for coach, one for admin ... if I want to
adjust the admin profile, I don't want it to change the free agents profile settings. Does that
work? **We aren't 'calibrating' anything, but would it be better to keep it the same?**"

**HIS OWN PARENTHESIS IS THE ANSWER.** A read-only survey of all 260 role conditionals (22
agents, 0 errors; `docs/role-conditional-survey-2026-10-22.md`) says do not split, for five
reasons, and found one live defect that **has no role conditional in it at all**.

- **TWO OF THE FOUR ARE NOT WHAT THEY LOOK LIKE.** `shared/schema.ts:88` is
  `pgEnum("role", ["coach","athlete","admin","guardian"])`. **"Free agent" is not a role** -- it
  is `role === "athlete" && coaches.length === 0`, recomputed per request -- so a record keyed on
  it is keyed on a LIVE DERIVED STATE: an athlete who joins a program would switch which record
  they read mid-account, and their height would appear to change. No migration, no event, nothing
  logged. **"Guardian" IS a role**, with its own dashboard and its own profile surface, and it was
  missing from the four. Three slices found this independently.
- **THE SEPARATION ALREADY EXISTS, 446 TIMES, IN THE GATES.** `requireRole` is 284 `"coach"`,
  162 `"admin"`, 154 `"athlete"`, 2 `"guardian"`, plus 95 `ProtectedRoute` declarations each
  naming one role. **Coach and admin are not two settings of one surface; they are 446 disjoint
  gates.** Giving an admin a coach capability is 284 edits, not a set-membership change.
- **NOTHING HERE IS FITTED**, which is this file's own test for a split. Height is typed by a
  person; no measurement, no drift, nothing to leak.
- **FOUR COPIES WOULD MULTIPLY THE LEGAL SURFACE BY FOUR.** Profile surfaces carry the biometric
  release, research consent, the terms snapshot, `trackingOptOut`, the guardian link and the date
  of birth that gates under-13. A legal surface has failed silently FIVE times on record here. A
  wrong camera number is a caveated number; a wrong consent flag is unlawful collection from a
  child.
- **AND THE CAMERA REGISTRY'S OWN COST IS NOW MEASURABLE**: 270 records shipped 10-06, and the
  10-20 audit found `cameraTunablesFor` was read by 1 of 15 trackers with `FITTED_OVERRIDES`
  still empty. Two weeks to learn it was mostly unwired, for a problem that needed the shape.
- **74% OF THE BRANCHING IS CORRECT.** Of 194 classified: 143 correctly inert, 24 visibly
  degraded, 17 silently wrong, 10 unreachable. The concentration is permission gates (73) and
  data shape (46), not profile settings (27).
- **THE SEPARATION THAT DOES EXIST IN PROFILE CODE IS PER-ACTION, AND THAT IS THE BETTER AXIS.**
  Three `heightIn` validators -- `signupSchema` and `claimProvisionalAthleteSchema` at `min(1)`,
  `updateProfileSchema` at `min(0).nullable()` -- because signup must REQUIRE what a later edit
  may CLEAR. `min(0)` is benign (`!heightIn || heightIn <= 0` is guarded in six places in the
  camera code, so 0 is fail-closed). `updateProfileSchema` is ONE role-agnostic write path.
  Four roles x three actions would be twelve validators for a field nobody measures.

**WHAT TO DO INSTEAD, AND IT IS ALREADY THE REPO'S OWN PATTERN:** separate the DECLARATIONS,
share the MECHANISM. `ROLES_THAT_FILM_THEIR_OWN_TRAINING` is the model -- one named set in
`shared/`, read by the flag and the writer, held in step by a test. That was the fix for the
2026-10-19 bug and it is the fix for this class. 12 further sites want that same set; the
survey lists the rest.

### THE LIVE DEFECT: A RESPONSE THAT CARRIED THE CALLER'S IDENTITY AND NOT THEIR FLAGS

`toPublicUser` (exported) strips secrets and returns the row. `toPublicUserWithSections` (which
was NOT exported) calls it and attaches twelve flags needing storage. So **every user object
`routes.ts` handed back was flag-free by construction**, and three client dialogs seed the
`/api/auth/me` cache from exactly those responses with a wholesale `setQueryData` replace.

**A coach or admin opens Edit My Profile, types their height, saves -- and the response unsets
`biometricReleaseRequired`.** The workout screen stops asking for the release, the capture gate
goes on dropping their traces, nothing logs it. **The recovery path built for bug #2 of 10-19
re-armed bug #1 of the same day.** `isPrimaryCoach` rode the same write, so a primary coach who
saved a notification preference read "ask your primary coach" on billing and Coaches Corner until
a refetch, and `hiddenSections` stopped hiding -- the exact failure `auth.ts:281-293` warns about
in words.

**IT HAS NO ROLE COMPARISON IN IT**, which is why seven slices of `role ===` greps were blind and
the completeness critic is what found it. Two things kept it invisible: the twelve flags are
declared OPTIONAL on `PublicUser`, legitimately, so "not applicable to you" and "not computed on
this response" are the same value; and the one test over these serializers asserted what must be
STRIPPED and was blind to what must be ATTACHED.

**SIX ROUTES CARRY THE FLAGS NOW, NOT THREE AND NOT SEVEN.** The survey named three; three more
had the same defect. `PATCH /api/coach/roster/:athleteId/profile` is deliberately left flag-free:
it returns the ATHLETE's row to a coach, where the flags are meaningless to the reader and a leak
of that athlete's consent state (its body is discarded anyway).
`every-self-response-carries-the-flags.test.ts` discovers every `toPublicUser(` and holds each to
one of two readings -- **a rule about whose row it is, never an exception list**, because a list
rots and this one would rot toward the bug.

**Also shipped:** both client hooks read the filming set instead of re-typing it (a divergence
there is SILENT -- the hook decides whether to ASK the server); the 14 `requireRole([...])` gates
are deliberately NOT rewritten, because `requireRole` is typed against the `Role` union so a
`ReadonlySet<string>` would trade a compiler check on a permission gate for cosmetics, and a
divergence there is LOUD -- a ratchet holds them equal instead; `admin/users.tsx` and the
`z.enum` role-change schema name the same three strings and answer a different question (which
roles an admin may ASSIGN) and the test asserts they stay separate;
`shared/home-route-by-role.ts` replaces two hand-written four-way chains, each with a trailing
`return "/athlete"` that silently absorbed any role it had not been told about; the signup height
DISCARD is fixed while the athlete-only REQUIREMENT stands (whether the coach form should ask is
acquisition friction and is Scott's); and an empty profile patch is a read rather than a drizzle
throw that hangs the request -- `updateCoachBranding`'s bug of 10-11, one table over.

**STILL OPEN, NAMED SO IT IS NOT MISTAKEN FOR DONE:** nine silently-wrong findings survived both
adversarial lenses and seven are unfixed. Three are one job in `storage.ts` -- account deletion,
the video retention cap and the stale-account purge are all scoped `role = 'athlete'`, so a coach
or admin who films their own training is exempt from the cap the $9.99 add-on raises and leaves
files behind on deletion; they want the filming set at all three sites and were left because each
changes what gets DELETED, which wants its own commit and its own itest. And
`documentAudienceFor` serves a **guardian** the athlete document checklist, because `/documents`
is open to every signed-in role and that helper has three audiences and tests two. 17 files no
slice reached, `debug-console.tsx:80` among them: the camera is granted to {athlete, coach, admin}
and the only on-phone diagnostic readout is admin-only, so a coach filming their own training
cannot see a save outcome. Server-side except four client files: `verify_build`.

### THE THREE RETENTION PATHS ARE DONE (2026-10-22), AND THEY TURNED OUT TO BE FOUR PLUS A LINK

Scott: "Fix the paths too." The three named above now read
`ROLES_THAT_FILM_THEIR_OWN_TRAINING` -- `deleteUserRecord`, `sweepVideoRetentionCap`,
`sweepStaleAccountVideos` -- plus a **fourth of the same shape the survey did not name**,
`getVideosEligibleForRetentionPurge` (the MINOR tier purge, 30 days under 13 / 90 days 13-17).
That fourth was the only one where the role word was defensible, and the reason it still moved is
worth keeping: `shared/roles-that-film-their-own-training.ts` says a coach or admin is "an adult
account by construction", which is a CONVENTION and not an enforcement -- `signupSchema` requires
a date of birth from a coach exactly as it does from an athlete and nothing refuses a minor coach.
That sweep is DOB-gated anyway, so for every real coach it is a no-op; a minor's
data-minimisation promise is the wrong place to rest on a convention.

**`deleteUserRecord`'s TWO BRANCHES WERE EXCLUSIVE AND A COACH WHO FILMS IS BOTH.** The athlete
branch cleans the account's OWN training files (set clips in `form-videos`, skeleton traces in
`set-traces/<id>/`, skill clips, the comment media on their assignments); the `else` cleans what
the account UPLOADED ABOUT SOMEBODY ELSE (authored comment video and stills, the brand logo).
Those answer different questions and a coach needs both, so they are two sequential `if`s now,
not an if/else. **The second branch is still `!== "athlete"` rather than coach-or-admin**, on
purpose: narrowing it would silently stop cleaning up for a GUARDIAN, and a branch that used to
run for a role must not stop running for it as a side effect of widening the branch above.
`retainSubjectAfterDeletion` is widened too and is INERT today -- it refuses without a
`researchSubjectId` and the mirror is athlete-scoped -- so it is there against the day mirror
membership changes, which is a CONSENT decision and not that function's to make.

**AND THE WIDENING COULD NOT SHIP WITHOUT A NEW MODULE, BECAUSE THE WARNING'S LINK IS
ATHLETE-ONLY.** The cap warning says "tap the heart within 7 days to keep it" and the grace clock
starts the moment the notice is DELIVERED -- and `/athlete/day/...` and `/athlete/calendar` are
`<ProtectedRoute role="athlete">`, so a coach handed that link is REFUSED while the countdown
runs. That is a silent deletion with a notice attached, which is the shape Rule #1 exists to
refuse. `shared/own-training-routes.ts` is the fix: athlete `/athlete/...`, coach `/coach/my/...`,
admin `/admin/my/...` (all three already routed; the coach and admin pages are `my-calendar.tsx`
and `AdminMyWorkout`), built from the account's own role, which both sweeps now select alongside
the id. **NOT merged into `shared/home-route-by-role.ts`**, which names the same three roles and
answers where signing in LANDS somebody -- the same QUESTION test the camera registry uses.
A skill warning still links to the calendar, because no role has a standalone skill-day URL.

**WHAT THIS CHANGES IN PRODUCTION, SAID PLAINLY BECAUSE IT IS SCOTT'S OWN ACCOUNT.** Enforcement
is on and `isBetaAccount` has defaulted false since 10-11, so from the next deploy the nightly
sweep really does cap a coach's and an admin's own training videos at **10 unfavorited per
exercise** (5 favorited exempt, 20/10 with the $9.99 add-on), with a 7-day warned grace. The
calibration account is an admin that films the same four lifts over and over, so it is the one
account on the platform likely to cross that. Two things take the edge off and one lever closes
it: **purging a video never touches its metrics** (the numbers, `trackingDiagnostics`, the scale
blend and the skeleton trace all survive -- the export that calibration is actually read from is
unaffected), the warning now links somewhere an admin can open, and ticking **Beta account** or
**Extra video storage** for that account on `/admin/billing` makes it unlimited again. The
stale-account sweep cannot touch it at all (12 months inactive). Nothing is deleted on the deploy
itself: the first run only warns.

`server/a-coach-who-films-is-swept-too.itest.ts` (11 cases on real Postgres: a coach and an admin
over the cap, a coach under it, a GUARDIAN never swept, all three link shapes, the files really
gone on deletion for each role, and the rows proven present first),
`shared/own-training-routes.test.ts` (reads `App.tsx` and asserts every path is routed FOR THAT
ROLE -- a path typed in the map and not in the router is a link that refuses, and nothing else
would notice) and `server/the-retention-paths-cover-every-filming-role.test.ts`, which states
what is FORBIDDEN rather than listing the sites that were fixed, so a fifth retention path
written next year fails the day it is added. Nine mutations, each caught by the right case, and
under the three that revert a fix the ATHLETE cases stay green -- which is exactly what made this
invisible for as long as it was.

### AND THE FOURTH ROLE WAS ASKED FOR A PHYSICIAN'S CLEARANCE TO TRAIN (2026-10-22)

The role survey named "guardian" as the role missing from Scott's four. Two defects on the one
surface that asks a person for paperwork, both found by a read-only panel and verified against
the code before anything moved.

**`documentAudienceFor` TESTED TWO ROLE STRINGS WHERE THE pgEnum HAS FOUR**, so a guardian fell
through to the ATHLETE branch -- and the two halves then disagreed about WHICH athlete. The page
resolved `athlete_rostered` (it passes `hasCoach: isFreeAgent !== true`, and `useIsFreeAgent`
returns false for any non-athlete, so that is the steady state and not a flicker); both server
call sites resolved `athlete_free_agent` (they pass `hasCoach: false`). A parent saw "Your forms"
over two red REQUIRED rows about their own training and a footer counting two things for them to
do. **Both halves of acting on it were broken in OPPOSITE directions**: the participation waiver
-- the row the page PRE-SELECTED -- 400'd, because the server had resolved a different audience;
the medical clearance did NOT, so an adult's own physician's letter entered the admin review queue
of children's medical records, where the query joins `users` for an `athleteName` with no role
filter.

**A GUARDIAN'S CORRECT CHECKLIST IS EMPTY, and that is a positive answer from this file's own
rules rather than an omission.** They do not train (`ROLES_THAT_FILM_THEIR_OWN_TRAINING` is
athlete, coach, admin), so no clearance and no school waiver describes them; they do not supervise
through Forge, so the credential list is not theirs either -- `background_check`'s own `why` reads
"You coach minors through Forge", which is false of a parent. What a guardian signs is accepted IN
the app and lives in the consent ledger, which the page already rendered for them correctly, and
their child's paperwork is filed against the CHILD at `/documents/:athleteId`.

**AND THE SAME FIX CAUGHT A COACH BUG ONE LINE AWAY.** `documents.tsx` defaulted the upload kind
to the literal `"participation_waiver"`, which is not among a coach's four credentials either --
so the selector drew an empty box for every coach and a file picked without touching it POSTed a
kind the route refuses. The kind is derived from the audience now. **`"other"` survives on every
profile including a guardian's**, because it is the escape hatch for a form no list anticipated
and taking it away would be a refusal nobody asked for.

**AND A GUARDIAN COULD NOT SEE ANY NOTIFICATION FORGE HAS EVER WRITTEN THEM.** The bell is
rendered in `AppShell` for coach | athlete | admin, and a guardian never renders `AppShell` --
every other `ProtectedRoute` redirects them to `/guardian`, which draws its own header.
`GET /api/notifications` and its unread count are plain `requireAuth`, so the rows were being
written and shown to nobody. **What that cost is not hypothetical**: `storage.requestDocuments`
writes a `documents_requested` row to each linked guardian and then tries the email, and when the
email cannot go -- no address, Resend unconfigured, a send that failed on a mistyped address -- it
returns `delivery: "in_app_only"` and the coach's toast reads "the email couldn't be sent". That
asserts a delivery that reached nobody, so the coach stops chasing and the parent is never told
their child's medical clearance and participation waiver are missing.
**THE SAME PASS HAD ALREADY MADE THIS ARGUMENT IN THIS FILE AND MISSED THE BELL.**
`guardian-dashboard.tsx`'s own comment reads "a guardian had no way to change their password, see
or revoke their active sessions, report a problem, or delete their account: the routes all accept
them (`requireAuth`), only the doors were missing" -- one control over. And `storage.ts` records a
THIRD pass that fixed that notification's LINK to point at the child's page rather than the
guardian's own empty checklist. Three layers of one fix, each done partially.

**TWO DROPPED BY THE ADVERSARIAL LENSES AND NOT ACTED ON**, which is the panel working: the
admin-only debug console is a DECIDED state with no code change to make, and the two `storage.ts`
role-check findings are real but their proposed patch was refused as unsafe -- the third of its
three parts regresses something. Those stay open and named rather than half-fixed, along with the
17 files no slice reached.

The ratchet discovers roles from `roleEnum` and states what is FORBIDDEN (no role lands on an
athlete audience unless it trains), the audience type and the checklist map are held EQUAL rather
than one iterating the other, and two itest cases drive the real upload route and the real
compliance route. Client halves: `verify_build`.

### A ZERO ORPHAN COUNT IS NOT A GREEN LIGHT: THE FK REPORT PRINTS THE CASCADE IT WOULD EXPOSE

Added 2026-10-23, from the orphan cleanup's own follow-up. `reconcile-schema.ts` is additive-only
and `CREATE TABLE IF NOT EXISTS` is a no-op on a table that exists, so a `REFERENCES` clause
written inside such a block **never reaches the one database that is never fresh**. CI's drift
check passes trivially against an empty database, which is why `4 of 225 declared foreign keys are
MISSING` on production went unnoticed.

**THE 0-ORPHAN KEY IS THE DANGEROUS ONE, WHICH IS THE OPPOSITE OF HOW A CENSUS READS.** The
census found `assignment_correctives.assignment_id` with 9 orphans, `program_day_id` with 9, and
`exercise_id` with **0**. Nine orphans means the constraint cannot be added until they are
cleaned; zero means it can be added **right now** -- and adding it completes
`exercises -> assignment_correctives -> workout_log_entries -> workout_set_entries ->
video_review_requests`, every hop declared CASCADE, with `deleteExercise` an unguarded bare
DELETE. One line away, `workoutLogEntries.exerciseId` is deliberately `set null`. **The missing
constraint has been protecting production from its own declaration**, and the FK added for
`workout_set_entries` extended that latent chain by one hop.

So `server/fk-drift-job.ts` prints the orphan census AND the deepest CASCADE path each missing key
would open, and `cascadePathsFrom` is pure and declaration-only (cycle-safe by recording the
repeat and not following it). **The three `assignment_correctives` decisions are Scott's and were
reported, not acted on.** And nothing the server imports may `process.exit` -- the drift CLI did,
so importing it from `index.ts` would have crash-looped the service on the very drift it reports;
the logic is in `server/foreign-key-drift.ts` now and a test forbids the path.

## ONE SCHOOL'S EXECUTED CONTRACT WAS A BUTTON-TAP AWAY FROM ANOTHER SCHOOL

Added 2026-10-24, from the same sweep. **The most serious thing it found, and I refuted it wrongly
on the first read** -- which is the part worth keeping, because the refutation was of a claim the
report was not making.

**THE DEFECT.** `getAcceptedInstitutionalAgreementWaiver` resolved
`inArray(externalWaivers.athleteId, getEffectiveCoachIds(coachId))` and took
`orderBy(desc(createdAt)).limit(1)` -- **the most recently accepted agreement held by ANYONE on the
staff.** And a coach carries their own agreement onto a staff they join: `/api/coach/staff/join`
refuses only a coach who already has a staff of their own, so a head coach who signed School 1's
agreement and then joined School 2's staff put School 1's row inside School 2's effective ids,
NEWER than School 2's own. School 2's primary coach taps **Download signed copy** and receives
School 1's executed contract. The reverse is wrong too: the joining coach reads their own old
contract while their card shows their new school's.

**WHAT THE WRONG PDF CARRIES, which is why this is not a cosmetic scoping slip.**
`buildAgreementPdf`'s `executed` branch prints, by design, "so the PDF stands on its own if it is
ever produced away from the database": the institution's legal name, its signer's name and title,
the typed signature, and **the signer's IP address**. So the wrong answer is another organisation's
executed legal instrument plus its signer's personal data, handed over by tapping a button, with
nothing logged. The only hint was the `Content-Disposition` filename, built from the other school's
`issuingOrganization`.

**EVERY OTHER READ ON THAT SURFACE IS CORRECTLY SCOPED, WHICH IS WHY IT WAS INVISIBLE.**
`getLatestInstitutionalAgreementSignature` is `eq(coachUserId, coachId)`, and the staff branch of
`getInstitutionalAgreementStatus` RECURSES into the primary's -- so the card on /documents names
the right signature in every case. The card was right and the button was wrong, and nothing on
screen could show the difference. Both that function's comment and the route's own promise the
correct behaviour in words: "Resolved through getEffectiveCoachIds so the primary's row is what
everyone reads" and "A STAFF COACH READS THE PRIMARY'S AGREEMENT". `inArray` over the whole set
with newest-wins is simply not that -- **intent and code differed and the comment is what made it
look settled.**

**THE FIX IS `eq(athleteId, coachIds[0])`** -- the primary, since `getEffectiveCoachIds` returns
`[primaryId, ...staff]`, the same idiom `getEntitlementsForCoach` and `/api/coach/team-roster`
already use. **It is a NARROWING, which is the hazard this file names** (`deleteUserRecord`'s
second branch is still `!== "athlete"` so a guardian keeps its cleanup), so what it stops serving
was checked and is in the itest as its own two cases: an ordinary staff coach whose primary has an
accepted agreement is unaffected and now really reads the row the comment always promised; a staff
coach whose primary has NONE but who personally holds one now gets a 404, **which AGREES with the
card they were already shown** -- the staff branch reports the primary's `onFile`, so that card
said "nothing on file" while the button handed over a PDF. Signing and uploading are the primary's
acts, so a staff coach cannot file one for the program at all; the only way they hold a row is
having been primary somewhere else, which is exactly the leak. Their row is not deleted, just not
served here, and comes back the moment they are a primary again.

**I REFUTED IT FIRST, AND THE REASON GENERALISES.** My first pass read the claim as a cross-program
leak, checked `getEffectiveCoachIds`, found it returns only the caller's own staff, and filed the
finding as "an intentional, documented design". That was correct about the question I asked and
irrelevant to the one the report asked -- **the staff set is not one school forever, because a
coach moves schools.** Then the full claim text (recovered from the workflow run's own JSON on
disk, after compaction had dropped it) showed the mechanism was `limit(1)`, not the staff scope.
**Verifying a report means verifying the claim it makes, not the claim it resembles** -- and a
summary of a finding is not the finding.

**AND THE EXISTING SUITE COULD NOT HAVE CAUGHT IT, for a reason about FIXTURES rather than
assertions.** `institutional-agreement-sign.itest.ts` creates its staff coach with
`makeLoginableUser` and signs only as the primary, so no staff coach in it has ever carried a prior
agreement of their own -- the single fact the leak needs. Nor had anything ever exercised the join
DOOR: every test inserts `coachStaff` rows by hand, so `staffInviteCode` is never minted and
`joinCoachStaffByCode` was never driven.
`server/one-schools-contract-never-reaches-another.itest.ts` drives the real sign route, the real
join and the real PDF: **four of its six cases red against the pre-fix code, and the two that stay
green are the patch-safety pair** -- which is the right signature for a narrowing, since those two
must pass before AND after.

**Also from the sweep, and NOT a defect** (recorded so it is not re-raised): the classifier in the
workflow script read `survived: live.length > 0 && refuted === 0`, so a finding whose three
verification lenses all died on the session limit was filed as **refuted** rather than unverified,
and a finding with ONE surviving lens was reported as having survived all three. Five of the 2026-10-23
sweep's sixteen candidates have empty claim text and zero lenses -- their READ agents died too, so
they are not findings at all and their targets (`admin/waivers.tsx`, `coach-section-gate.tsx`,
`admin-billing-assignment.tsx`, `notification-bell.tsx`, `team-chat-quick-summary.tsx`) are simply
**unread**, along with the completeness critic that never ran. Server-side: ships on Render, no build.

## THE STRENGTH PERCENTILE SCORED NOBODY ON EVERY DATABASE BUT PRODUCTION

Added 2026-10-24, from the role-conditional sweep's own report, verified against the code and
then MEASURED before anything moved -- and the agent's stated consequence ("for everybody,
forever") was right about the environments it tested and did not distinguish production, which
is the whole severity question.

**`exercises.is_forge_official` GATES ALL THREE STRENGTH-PROFILE QUERIES AND HAD EXACTLY ONE
WRITER: A ONE-SHOT THAT RUNS BEFORE THE ROWS EXIST.** `reconcile-schema.ts:3674` adds the column
and backfills it from admin ownership under the `applied_backfills` key
`forge_official_exercises_2026_09_21`. `render.yaml`'s build command is
**`db:reconcile && db:seed && db:reconcile`**. So on a database created FRESH: reconcile #1 fires
the backfill against an EMPTY table, writes its marker anyway, the seed then creates 410
exercises, and reconcile #2 skips. **Measured on a throwaway database brought up exactly that
way: 410 exercises, all owned by the role-admin library owner, 0 flagged -- while 9 of 9 seeded
classes ARE flagged by the same run**, because `createClassWithStructure(owner, structure, true)`
takes the flag as an argument. Deleting the marker and re-reconciling flagged all 410, which is
the proof that **ORDERING was the entire fault and the backfill itself is sound.**

**PRODUCTION WAS NEVER AFFECTED, AND THAT NEARLY WENT UNSAID.** The ownership handover to the
admin has run inside the seed since `bef1f04f` (2026-08-01), so when the backfill landed on
2026-09-21 it saw an admin-owned library and flagged it; and no new exercise NAME has entered
`seed.ts` since (diffed across the backfill commit: 0 added). What was broken is **every other
environment** -- a dev box, a new Render service, a rebuild after a database loss, and **CI's
integration harness, which creates its database fresh on every run.**

**THE SYMPTOM IS THE REASON IT SURVIVED A MONTH.** A zero-row gate does not error: every athlete
gets no percentile and the card reads "Not enough athletes on Forge yet" -- which is the REAL
thin-cohort state the platform launched in (`NORM_MIN_COHORT` is 30 per group, and the 10-10
audit already fixed a different sentence for exactly this reason). A correct empty state and a
broken gate are the same pixels.

**AND NO TEST COULD SEE IT, FOR THE REASON THIS FILE KEEPS NAMING.**
`strength-profile.itest.ts:65` does `db.update(exercises).set({ isForgeOfficial: true })` on its
OWN fixture row, so the suite proves the QUERY works and is structurally blind to whether
anything in the real library is ever flagged. A test that supplies the input it is meant to be
checking for cannot fail for the input being absent.

**THE FIX IS ONE MECHANISM, DISCOVERED FROM THE LISTS, NOT THREE CALL-SITE EDITS.** `seed.ts`
flags the library it creates, keyed on the union of its own three name lists
(`seedExercises`, `combinationExercises`, `expansionExercises`) and scoped to the library owner.
A fourth list added next year is covered the day it is written; editing the three
`createExercise(libraryOwner.id, ...)` calls instead would have missed it in silence, which is
the shape this file has now recorded six times (the Coaches Corner lesson re-sync, the Barbell
Shoulder Press instructions, `videoEligible: false`, the terms-change guardian notice, the Stripe
upsert, the height ruler's refit). **The flag is NOT written at the call sites as well**: a fact
with two writers is the billing sweep's whole lesson.

**SCOPED BY OWNER *AND* BY NAME, which is the one thing that had to be measured rather than
asserted.** `shared/schema.ts` argues the explicit column exists precisely so ownership cannot
enrol "an admin's own personal exercise into the standards every athlete on the platform is
measured against" -- and production holds exactly such a row (`Mcconnell Raises`, Scott's own,
under the account that owns the library). A write scoped to the owner alone is that hazard. On a
throwaway database with the library unflagged and that exercise present: **411 total, 410 flagged,
`Mcconnell Raises` still false.** It also only ever SETS the flag, so an admin turning a Forge
exercise off is not undone by the next deploy, and it reports what it CHANGED -- a count of what
MATCHED would put a "repaired 410" line in every deploy log forever, which is how a one-off fix
comes to read as a recurring fault.

**THE RATCHET'S DIRECTION IS THE POINT.** A scan that iterated the names handed to the flagging
step could not see a list nobody passed -- the omission it would look like it covered, which is
`parental_notice` and the upload-directory list again. So it discovers every
`for (const x of LIST)` loop that really calls `createExercise(libraryOwner.id, ...)` and requires
the flagging step to name each one. **Two bugs in its own first drafts, both recorded because both
are this file's standing lessons wearing new clothes:** the brace matcher followed a BRACE-LESS
loop body (`for (const ex of allExercises) exerciseMap[ex.name] = ex.id;`) to the next `{`
hundreds of lines away and reported `allExercises` as a library list -- a character window with a
brace matcher's face; and the cross-check in `forge-official-is-inferred-for-classes.test.ts`
matched the bare method NAME, so renaming the call to `...ForgeOfficialX(` left it GREEN, the
unanchored-match trap that `/export \{ X \}/` is recorded for. Eight mutations on the scan and
four on the itest, each caught by the right case; **the one that is NOT caught says so in its own
comment** -- deleting the empty-list guard changes nothing observable, because `inArray(col, [])`
already compiles to a false predicate, so that case proves the outcome and not the guard.

**AND IT CORRECTS `a0ef9305`, PUSHED THE DAY BEFORE.** That commit's test and schema comment both
state the exercises column "is the one that is real: reconcile-schema.ts adds it, backfills it for
admin-owned rows and indexes it" -- true of production, false of a fresh database, and **a source
scan cannot tell those two apart**, which is why that file certified a working column for a month.
Both now say which writer covers which database. The classes/programs divergence it recorded is
unchanged and still open.

## RULE #3: A VIDEO SHOWS THE REAL APP. NOTHING IN IT IS INVENTED.

Added 2026-10-02, after a build-a-program reel shipped with a program builder nobody has ever
seen. Scott, looking at it beside the real screen: "That's not what it looks like" / "Those are
what our builds look like, with the slider button, everything else" / "I don't want to post
something that isn't in our actual code, anytime you make a video, only use our code, no
inventing things."

**EVERY SCREEN IN A VIDEO IS A COPY OF A SCREEN THAT EXISTS.** Not an impression of one, not a
tidier version, not what the screen probably looks like from reading its labels. The layout,
the controls, the order of the fields, the empty states and the words are the ones in the
repo.

What went wrong is worth naming, because it felt like diligence at the time: the reel's copy
was assembled by grepping for strings -- "Program name", "Add Day", "Add Exercise", "Sets",
"Reps" -- and every one of those words was real. The STRUCTURE around them was invented. The
real builder has an AI Program Builder card, Training Blocks with a periodization note, a
Rest day checkbox, a drag handle and a delete on every exercise, a REST toggle reading
"Between Each / After The Group", a Back and an Add to My Calendar button beside Save Program,
and a "No days yet" empty state. The reel had none of them, and invented a "Week 1" header and
a bare row of four boxes instead. Real words in a made-up frame is still a made-up screen, and
it is worse than an obviously rough mock because it looks authoritative.

- **Read the COMPONENT, never just grep its strings.** A grep tells you a label exists. It does
  not tell you what sits beside it, what wraps it, what state it starts in, or what the screen
  does when it is empty. Open the page and the components it renders.
- **Ask for a screenshot when one would settle it.** Scott can take one in thirty seconds. That
  is cheaper than a reel that has to be rebuilt, and far cheaper than one that gets posted.
- **A feature the video claims must be the feature the code has**, at the tier the code gates
  it to. The AI Program Builder edits the program from inside the builder; the AI Training
  Chat is a separate screen behind `requirePaidAiAccess`. They are different things and a
  video may not blur them.
- **No camera accuracy claim, ever** -- the numbers are uncalibrated and carry
  `CAMERA_ACCURACY_PURCHASE_WARNING`. A marketing video is exactly where that warning cannot
  be attached, so the claim does not go in one.
- **This applies to anything that leaves the building**: reels, screenshots, teasers, App Store
  captures, a deck. If it shows Forge, it shows Forge as built.

## RULE #2: EVERY CAMERA SENSOR IS A PEER. NONE LEADS. OVERWATCH IS THE ONLY ARBITER. NONE IS EVER SWITCHED OFF.

Scott, 2026-09-28, after the 3D body pose was turned off to save five seconds of analysis:

> "We have 3 camera systems and they need to work in unison, when one fails the other is
> there to pick it up. If we build the 3d model, then we will have 4 camera systems which is
> fine, but all are working toward the same unison goal. Neither one takes over, neither one
> is the leader, neither one is in control except for the ai overwatch, we built that because
> the cameras will get fixated and lock on one frame and won't let go, the overwatch makes it
> let go."

What this means in code, each one a thing that has already gone wrong:

- **A sensor is never turned off to save time.** The 3D body pose was disabled for the bar and
  jump trackers on 2026-09-28 because "nothing on those paths reads it", against a comment on
  that very request saying thin it, never delete it. Hours later it was proposed as a scale
  ruler. The cost of a sensor is paid by THINNING (a sparse stride, a smaller frame), never by
  removal. If a sensor is expensive, run it on every thirtieth frame; do not make it absent.
- **Adding a sensor adds a PEER under overwatch, never a leader and never a fourth referee.** A
  3D pose, a plate detector, a grip ruler, a box ruler: each is one more witness whose reading
  is held against the others. It does not get to decide anything on its own, and it does not
  get its own private checks (that is how the object tracker went wrong the first time).
- **No sensor takes over by rule.** A name-based switch that hands the bar's position to one
  witness ("on a back squat the shoulders ARE the bar", 2026-09-28) is a leader wearing a
  rule's clothes. It fixed the head-on squat, and it is still the wrong shape: the choice of
  which witness to believe on a frame belongs to overwatch, made from agreement, not to a
  regex on the exercise name. That switch stays until overwatch can make the choice, and
  making it so is open work, not a settled design.
- **Overwatch exists to make a sensor let go.** A tracker that locks on a frame and will not
  release is the failure every sensor here has shown. Overwatch's job is to notice, from the
  OTHER sensors, and break the lock. It owns no sensor. It never becomes one.
- **When one fails, another picks up.** That is the whole reason there are several. A frame
  where the hands are hidden is a frame for the shoulders or the plate; a take where the plate
  is a rack is a take for the body rulers; a take with no flat jump is a take for the box.
  Nothing is allowed to be the single point of failure, which is the same thing as saying
  nothing is allowed to be the leader.

- **Analysis time is cut by SPEEDING UP, never by CUTTING.** Scott, same day: "We need to cut
  analysis time not by cutting things, we need to cut analysis time by speeding it up, having
  it start when I hit record, things like that." The levers are: start the work at Record (the
  live path), hand Vision smaller frames (the file path already decodes at 1280; the live path
  still hands it 1920x1080), run the expensive sensors on a stride, and keep the encode and
  the upload running while the analysis does. Hand pose off for the bar tracker (2026-09-28,
  build 557/558) was a cut, not a speed-up, and is to be reversed into a stride the same way
  as the 3D pose.

Before changing anything under `ios/`, `client/src/lib/*-tracking.ts` or a tracker dialog, say
which sensor it touches and confirm the change removes nothing and appoints nothing. If it does
either, it is wrong as written.

## THE CAMERA MEASURES THE ATHLETE. THE ATHLETE NEVER TYPES A BODY MEASUREMENT FOR IT.

Added 2026-09-30, when the typed grip width was removed from the profile. Scott: "Get rid of
the wrist width ... Every bench will be different. Different arms different lengths different
widths, we need to measure regardless." And: "we want to stay anonymous, sort of, that makes
it harder."

- **No profile field exists for the camera's benefit.** Height and body weight were on the
  profile before the camera and are training facts; a grip width, a limb length, a shoulder
  breadth, anything the camera would use as a ruler, is measured by the camera or not at all.
  `users.gripWidthIn` is retired (column kept until a migration drops it; nothing reads it),
  the form field, the two dialogs' mapping, the signup and profile validators and the tracker
  prop are gone. `gripWidthScaleFromFrames` stays for a grip the CAMERA measures.
- **Why not just ask:** a bench grip differs from a row grip differs from next week's bench,
  so one typed number is wrong for most of the sets it would scale (the row filmed 2026-09-30
  had a 0.64m span against the bench's 0.72m). And every measurement stored against an account
  is one more thing Forge holds about a person; the anonymity stance argues for fewer, not
  more. A ruler the camera takes on the take describes the take and is stored with it, as
  diagnostics, not against the athlete.
- **What replaces it** is the scale work already under way: the plate detector (a known
  object, the right ruler), the body rulers weighted by evidence (`reconcileScaleEstimates`),
  and a per-take grip span learned from a take that had a real ruler (`measure-limbs.ts`,
  `users.bodyModel`, which is learned by the camera and is the shape this rule allows).
- **Do not re-add a "just type it" field for any body dimension**, however much a calibration
  session would benefit from one. The sensor comparisons are done with the OVR beside the
  bar, not with a tape on the athlete.

## THE CAMERA ARCHITECTURE: three parts, answering to each other

**This is how the camera system works. Not one fix among several -- the shape
the whole pipeline is built to, and the shape anything added to it has to
fit.** Ratified by Scott 2026-09-19: "camera should work cohesively, all three
parts, body tracker tracking body things, object tracker tracking object,
overwatch making sure both are working properly, everything is cohesive" /
"that should be how our camera system works."

Added 2026-09-19, revised the same day when the first version turned out to be
one-way. These are invariants, not preferences. Read
`docs/camera-tracking-notes.md` ("The two trackers now share one referee")
before touching any of it.

**Before adding a capture mode, a tracker, or a check, say which of the three
parts it is.** A change that does not fit one of them is either in the wrong
place or is a fourth part nobody agreed to, and a fourth part is how this got
into trouble the first time: the object tracker grew three checks of its own,
each perfectly reasonable, none of which could see the athlete. If a new signal
genuinely belongs to none of the three, that is a design conversation, not a
commit. The four modes with no implement in the scene (jump, sprint, mechanics,
horizontal_load) are the standing exception and are documented as such -- they
have a body tracker and nothing for overwatch to hold it against, which is a
known ceiling rather than a gap to fill.

The three parts and their jobs, which do not overlap:

1. **Body tracker** (`VNDetectHumanBodyPoseRequest`) — where the athlete is.
   Joints, grip span, posture. It does not know what equipment is.
2. **Object tracker** (`AvCoreMlImplementDetector`) — where the equipment is.
   One classification, then a tracked pixel region. It does not know where the
   athlete is.
3. **Overwatch** (`shared/tracker-arbiter.ts`, ported to `AvTrackerArbiter`) —
   whether to believe either of them. It owns no sensor of its own, on purpose:
   everything it knows comes from holding the other two against each other.

- **Overwatch judges BOTH, in both directions.** The first version only judged
  the object against the body, which is a hierarchy, not cohesion — and it
  introduced its own bug, because making the body the ruler let a jumped wrist
  landmark break a perfectly good object lock. `arbitrate()` checks the body
  first and returns one of four outcomes: `agree`, `object_suspect`,
  `body_suspect`, `cannot_judge`. Anything that only ever blames one tracker is
  the old bug wearing a new name.
- **The response is ASYMMETRIC and must stay that way.** A suspect object loses
  its lock, because a better answer exists — re-detect. A suspect body gets an
  abstention: the frame is skipped, the lock is left alone, nothing is reported.
  There is no better body available, and convicting the object on a measurement
  just declared untrustworthy is the worst of both.
- **The body is checked FIRST, before the object gate AND before any fresh
  detection.** Every statement overwatch can make about the object is measured
  with the body's ruler, so a ruler that just changed length cannot convict
  anybody. Skipping the detection matters as much: a jumped wrist drags
  `regionOfInterest` with it, so a detection seeded on that frame searches the
  wrong part of the image.
- **Each part is checked by a signal the other cannot influence.** The object is
  judged by grip width, which the object tracker has no hand in producing. The
  body is judged by the constancy of its own span — the distance between an
  athlete's wrists is fixed for a set, so it can only foreshorten as they
  rotate, which is slow. Neither check borrows the other's sensor. That is what
  makes them independent rather than two opinions from the same source.
- **A rejected body reading never joins the history it was judged against.**
  Otherwise a run of bad landmark frames teaches the stability check to accept
  them, and the guard dissolves exactly when it is needed most.
- **The threshold is in the athlete's grip widths, never pixels or frame
  fractions.** Grip width is measured every frame, needs no calibration, and
  scales with camera distance and zoom exactly as the scene does. That is what
  makes one number correct at every framing. Every earlier attempt used a frame
  fraction and needed per-setup tuning it never got.
- **A frame overwatch cannot judge PASSES.** No body reading is not evidence the
  object is wrong. It fires only on a positive finding. Inverting this
  reproduces the over-eagerness it exists to cure, somewhere new.
- **Candidate filtering happens BEFORE the most-confident pick.** Choosing first
  and validating after discards a good second-place detection of the real
  implement whenever a better-lit duplicate exists in the room — which, for the
  `plate` class in a gym, is most takes. The order is the fix.
- **Every unlock and every abstention is recorded.** `AvObjectLockTelemetry` ->
  `TrackingDiagnostics.objectLock` -> the admin tracking report, including
  `framesBodySuspect` so a body-tracking problem cannot be mistaken for an
  object-tracking one. Every threshold here is an admitted guess, and this was
  audited three times with no evidence to revise them against because the
  unlocks were silent. A guard that cannot be shown to have fired is a guard
  nobody can tune.
- **The Swift port is a port.** Overwatch must act mid-clip and there is no
  Swift test target, so the constants live twice. `shared/tracker-arbiter.test.ts`
  reads the Swift source and fails when they diverge, when the body check stops
  preceding the object gate, or when a rejected span could reach the history.
  Change one, change both.

## Pending TestFlight batch

Flagged 2026-09-19. What is on `main`, verified, and NOT yet in a build anyone
can install. Delete entries as a `beta` ships them.

**THE CURRENT BUILD NUMBER IS NOT IN THIS SECTION. IT IS IN "THE BUILD NUMBER IS THE iOS
WORKFLOW'S `GITHUB_RUN_NUMBER`" BELOW, AND THE RUN LIST BEATS BOTH.** Four entries here read
"is the newest TestFlight build" until 2026-10-09 -- 493, 576, 578 and 609 -- which cannot all
be true and none of which was; each is now past tense with its date. The cause is the drift this
file warns about three times: an entry is written when a build goes out and never revised when
the next one does. Everything below is a HISTORY of what shipped in which build, which is its
real value; read it that way and take the current number from the run list.

- Build **493** was the newest build on 2026-09-21, cut from `8d1a4920`.
  It carries #158: the tap-a-muscle lift history (Forge-official only), the
  reader's-unit display with the date window, the demo-account device exemption,
  and bodyweight-at-the-time scoring.
- Build **492** was cut from `4f245a8` on 2026-09-21. It carries #157: the
  athlete's own cohort filter (gender and sport, on top of the age band).
- Build **491** shipped from `1d5ecc8` the same day with #156: the strength
  profile -- the shared body map, the tap-a-muscle exercise filter, and the
  age-band percentile.
- Build **490** shipped from `d924540` the same day and cleared the queue that had
  been waiting since 488: #154 (SEO fixes, the 35% smaller eager bundle with lazy
  tracker dialogs and vision runtimes, server request memo and cache headers) and
  #155 (video review Phases 4b.1-4b.5, Phase 5 export, and the Phase 4 polish).
- Build **609** was the newest build on 2026-10-04, cut from `9503d966` (608 was the
  verify_build run) on Scott's "lets launch what we have so far": twenty-nine commits since
  600. Coaches Corner (Ask the library, scored quizzes, paths, the board, the digest, analytics,
  the eleven new tracks), the whole athlete classes batch (flashcards, four quiz shapes, notes,
  the coach's view, reading level, streak, certificate, eight repo classes), Scott's fifteen-item
  list (Coaches Corner cards and shapes, coach notes, flag-with-reason, Continue rows, release
  dates, apply-to-roster, certificate wall; the catalog by sport, Continue into the reader, the
  review deck, Fundamentals), Barlow Condensed loaded, read-aloud built and switched off. NOT in
  609: the All Classes add-on (`4eafc80a`), the builder's pricing notice, the assistants reading
  the whole library again (server-side anyway). Server halves ship on Render.
- Build **600** was the previous build, cut 2026-10-03 from `24c984a3` (599 was the
  verify_build run): Full Personalization end to end -- the Branding page at `/coach/branding`,
  the background hue/strength and heading font, the remembered brand on the login screens, the
  branded invite and public page, `--chart-2`. Server halves (branded emails, the slug, the
  test-email route) shipped on Render with the same push.
- Build **598** was the previous build, cut 2026-10-03 from `5338c7aa`: every program
  day picks its own date with its workout on screen (the weekday picker is gone from both
  Assign Program and the builder's self-assign, and each day's date is sent explicitly rather
  than inferred), every Free Agent gets the Exercise Bank in their Library (the Skill Bank
  stays behind the skills entitlement), and the superset Link chip no longer touches the card
  above it -- that was structural, one wrapper per exercise holding card, chip and Rest chips
  with only the wrappers spaced. Also RULE #3 in this file. Build **597** was the previous
  build, cut the same day from `eb11c72b` (Coaches Corner sold in the app), and it carried the
  queue that had been waiting: the under-13 card verification's client half (the guardian
  dashboard card, the athlete holding screen's second message, `guardianVerificationRequired`)
  and the Apple Health switch reading counsel's disclosure.
- Build **595** was cut 2026-10-02 from set 2 beside OVR
  (docs/camera-tracking-notes.md "Set 2 beside OVR, 2026-10-02"): the row's pickup is not a rep
  (`EDGE_OVERSIZED_AMPLITUDE_RATIO`), the live path thins the 3D pose and hand pose at the same
  rate as the file path (`strideIndex`), a wrist under the visibility floor is used at its own
  confidence (`lowVisibilityWristConfidence`), a tracked set always keeps its clip whatever the
  form-check switch says, the debug console logs every video outcome, and the export carries
  `hasVideo` / `videoCheckEnabled` (server-side, Render). Calibration work: uploaded on commit.
- Build **594** was the previous build (593 was a verify_build run), cut 2026-10-02 from the three sensor-paired lifts
  (bench, Pendlay row, push press; docs/camera-tracking-notes.md "Three lifts beside OVR,
  2026-10-02"): `bent_over` posture (no height ruler, no stature check on a hinged row; the row's
  scale goes from 0.64 to 1.11 of the sensor), a lone uncorroborated plate steps out of the scale
  vote (Rule #2; the "plate" was the torso in all three paired sets it appeared in),
  `MAX_PLATE_ASPECT_RATIO` 1.7, `inferMovementType` for a program row with no type, and the
  live path sampling by time with a largest-gap gate so a 120fps take stops re-reading its own
  clip (untested on a phone; `analysisPath` in the next capture's diagnostics is the answer).
  Also Reduce Transparency honoured. Calibration work: uploaded on commit.
- Build **592** was the previous build, cut 2026-10-02 from `4913f052`: Reduced Motion
  honoured app-wide (one global `prefers-reduced-motion` rule in `index.css`) and Larger Text
  on iOS (`client/src/lib/dynamic-type.ts` scales the root font from the system body size, 1.0
  at the default setting). `accessibility-claims.test.ts` pins the three features ticked on
  the App Store Connect accessibility page: Dark Interface, Reduced Motion, Larger Text. Nothing
  else is ticked there and nothing else should be until it is true and pinned.
- Build **591** was the previous build, cut 2026-10-02 from `4eb622e7` (590 was a
  verify_build run). It carries #209 (the launch email list: "Notify me" on the coming-soon card
  and the footer, the admin mailing screen), #210 (`DEMO_ACCOUNT_PASSWORD` on Render sets the
  three demo accounts' password for App Review; the seed is server-side, the build only rides
  along) and Opus's dialog fix (`grid-cols-[minmax(0,1fr)]` on `DialogContent`, the Assign
  Program date input bounded, `dialog-cannot-outgrow-the-screen.test.ts`).
- Build **589** was the previous build, cut 2026-10-02 from `335cf566` the moment
  `forgeperformancesystems.com` answered on Render with a certificate (GoDaddy: A `@` ->
  216.24.57.1, CNAME `www` -> forge-ebhd.onrender.com; the root's first certificate attempt
  stuck on "Certificate Error" and was cleared by removing and re-adding the domain in Render).
  It carries #208 (the native API base on the production domain, the iOS web-credentials
  entitlement with both hosts, the Android Health Connect privacy URL), #207 (the coming-soon
  gate, inert until `PUBLIC_SIGNUPS_OPEN` and `SIGNUP_INVITE_CODE` are set on Render), #206 and
  #205 (the dash sweep). Still to set on Render by Scott: `PUBLIC_ORIGIN`,
  `PUBLIC_SIGNUPS_OPEN=false`, `SIGNUP_INVITE_CODE`; and the domain verified in Resend.
- Build **585** was the previous build, cut 2026-10-01 from `e9705daa` when Scott
  lifted the hold ("Hold is lifted, upload everything"). It clears the queue: height typed as
  feet and inches (`shared/height-units.ts`), the store-launch items from #201 (the AI Training
  Chat's not-medical-advice line, the paywall never-steer scan, Android RECORD_AUDIO and
  POST_NOTIFICATIONS, the Apple Health switch's AI sentence, the Smart App Banner injected from
  `VITE_APP_STORE_ID`), #202 (Health Connect on Android, the Android app sells nothing until
  `GOOGLE_PLAY_BILLING_LIVE`, `ACCEPT_UNDER_13_SIGNUPS`), and #203 (Google Play Billing end to
  end). Launch checklist: https://claude.ai/artifact/QAkD4pcu9E4zo9jKfsNTZB
- Build **584** was the previous build, cut 2026-10-01 from `d2e8b361`: the password rule
  (`shared/password-rules.ts`: six characters, a number and a special character, held by ONE
  `passwordField` across all six schemas that set a password) and the live red-to-green checklist
  on every screen where one is chosen. Login keeps `min(1)` on purpose -- every existing account
  fails the new rule, so enforcing it at sign-in would lock out the platform in one deploy.
- Build **583** was cut 2026-10-01 from `c43da72b`: the dashes gone from the signup screens, the
  Free Agent welcome dialog, the Invite Athletes card and all three emails, and the welcome email
  no longer promising a Free Agent the AI program builder (two tiers up at $9.99). Both are also
  server-side and already live on Render.
- Build **582** was the previous build, cut 2026-10-01 (581 was a verify_build run): the jump's countermovement read
  off the hip (`measureCountermovement`, `JumpRep.countermovement`: dip depth, eccentric and
  concentric durations and velocities, the window a hip-mounted OVR reads), and the tracker that
  films a set following the exercise (`resolve-tracking-mode.ts`: a generic "full" on a
  med-ball-named exercise runs the med-ball tracker, which the 2026-10-01 sensor-paired throw did
  not). See docs/camera-tracking-notes.md, "Queued: the loading dip and the drive" and "Queued:
  the tracker that films a set".
- Build **580** was the previous build, cut 2026-10-01 for the next two sensor pairings:
  each med-ball rep carries `peakHorizontalSpeedMps` (the axis a horizontal tether reads) and
  the ball and wrist witnesses before the blend. The export now carries `jumpBreakdown` and the
  med-ball columns (server-side, Render). See docs/camera-tracking-notes.md, "Build 580".
- Build **579** was the previous build, cut 2026-10-01 from the first sensor-paired
  squat: the reported concentric window is the drive (`trimPhaseToDrive`,
  `DRIVE_ONSET_FRACTION` 0.07) while the filters keep the travel margin, the set's mean and mean
  power are distance over time, and the typed grip width is gone from the profile and the
  tracker. See docs/camera-tracking-notes.md, "Build 578 beside OVR, the first squat".
- Build **578** was the newest build on 2026-09-30 (evening), cut from set 11: the two 3D-pose
  rulers are one vote in `reconcileScaleEstimates`, the blend is inverse-variance weighted, and
  the 3D-pose uncertainties are set from seven sensor-paired benches (0.2). See
  docs/camera-tracking-notes.md, "Build 577 beside OVR, set 11".
- Build **577** was the previous build, cut 2026-09-30 from set 10: a rep's peak bounded
  by its own mean (`MAX_PEAK_TO_MEAN_RATIO`), the set's peak as the reps' average (the sensor's
  definition), both counted in `trace.repPeaksFlooredToMean` / `repPeaksCappedToMeanRatio`.
  See docs/camera-tracking-notes.md, "Build 577".
- **Set 10 on build 576 landed on the OVR sensor** (10 reps, 0.80 against 0.78 m/s, range of
  motion within 3%): docs/camera-tracking-notes.md, "Build 576 beside OVR, set 10". Ground
  truth and fixture only; nothing waiting on an upload from it.
- Build **576** was the newest build earlier on 2026-09-30, cut from set 9: the movement axis is
  gravity (`reconcileMovementAxis` reads CoreMotion's `cameraRollDeg`; `axisSource: "gravity"`),
  the grip's axis recorded beside it, and set 9 as ground truth. See
  docs/camera-tracking-notes.md, "Build 575 beside OVR, set 9".
- Build **575** was the previous build, cut 2026-09-29 night from set 8: the grip axis
  held against the image vertical (`reconcileMovementAxis`, `axisSource: "vertical_over_grip"`,
  `gripAxisFromVerticalDeg`), the replay harness no longer rotating a stored trace twice
  (`STORED_TRACE_ALONG_AXIS`), and set 8 as ground truth. See docs/camera-tracking-notes.md,
  "Build 574 beside OVR, set 8".
- Build **574** was the previous build, cut 2026-09-29 night from #188: the depth ruler as a zeroed candidate
  (`source: "depth"`, `DEPTH_RULER_BIAS` 0.9 from sets 5, 6 and 7), body rulers blended when
  nothing anchored is present, the travel margin keyed by lift (a press at 0.75cm), set 7 as
  ground truth, and the head-on toast moved into `trackingDiagnostics.cameraView`. See
  docs/camera-tracking-notes.md, "Build 573 beside OVR, set 7" and "Build 574".
- Build **573** was the previous build, cut 2026-09-29 night from #187: the depth
  ruler recorded (`body3DRuler.depthRulerScale`, `frameWidth`, `frameHeight`) and sets 5 and
  6 as ground truth. See docs/camera-tracking-notes.md, "Build 572 beside OVR, set 6".
- Build **572** was the previous build, cut 2026-09-29 night from #186: the set 5
  segmentation rules (`isImplausiblyFast`, `splitMergedPhases`, count-informed isolation) and
  a 400-held set never given up on. See docs/camera-tracking-notes.md, "Build 571 beside OVR,
  set 5".
- Build **571** was the previous build, cut 2026-09-29 night from #185: a 400 from the
  server holds a queued set for a week instead of deleting it, the lone-hand carry by the recent
  half-span (`carryHalfSpan`), and the per-point witness tag (`PathTracePoint.s`). The schema
  cap fix in the same PR is server-side and shipped on Render. See docs/camera-tracking-notes.md,
  "Build 569: the set that was counted right and never saved".
- Build **569** was the previous build, cut 2026-09-29 night from #184: the 3D ruler's
  in-plane method (camera-space joints from the plugin, `body3DRuler.method`), the
  longest-projection fallback demoted below the shoulder ruler, the grip as a plausibility
  yardstick, and the count-trim rule for the settle after the un-rack. See
  docs/camera-tracking-notes.md, "Build 566 beside OVR".
- Build **566** was the previous build, cut 2026-09-29 evening from #183: the camera
  audit (neutral copy on every tracker, fallback rulers for jump, kettlebell and med ball, no
  take thrown away), the 3D ruler taking the median across bones with every bone recorded
  (`calibration.body3DRuler`), the edge-under-movement-floor rack rule, the plate size cap at
  2.0 grips, and 120fps ranked first again with a binned 4:3 middle step. See
  docs/camera-tracking-notes.md, "Build 564 beside OVR".
- Build **564** was the previous build, cut 2026-09-29 from #182: the 3D skeleton as a
  scale ruler (`body-3d-ruler.ts`, `body_3d`, corrected by the athlete's height when Vision
  scaled to a reference stature), and the plate detector shown the whole frame on every other
  unlocked search (`fullFrameSearches`). See docs/camera-tracking-notes.md, "Rulers the camera
  finds by itself".
- Build **562** was the previous build, cut 2026-09-29 from the oblique bench against OVR:
  the 4:3 frame ranked above 120fps (shape before rate, `applyHighestFrameRate`), the athlete's
  rep count choosing among the segmenter's candidate gates (`expectedReps`), the isolated-run
  rack-move rule, and the scale-suspect banner gone from the athlete's screen (Rule #1).
- Build **560** was the previous build, cut 2026-09-29 from the Rule #2 reversal and the
  file-backed save queue: the 3D pose and hand pose back on for every tracker as STRIDES
  (`AvFrameContext(body3DStride:handPoseStride:)`, never off), live frames scaled to 1280 before
  Vision (`AvLiveFrameScaler`), the detector re-searching every third frame while unlocked, and
  a queued save's body written to a file on the phone so the 5MB localStorage quota can never
  trim it again (`pending-log-files.ts`).
- Build **558** was the previous build, cut 2026-09-28 evening (#177): the height and
  shoulder rulers are averaged when they are the only rulers (fitted on three OVR sets), hand
  pose off for the bar tracker, replayable traces (`PathTracePoint.c`, movement axis, scale
  correction), one-rep jump chips. 557 was cancelled before upload on Scott's instruction.
- Build **556** was the previous build, cut from `7870358c` on 2026-09-28 (#174): the
  shoulders carry the bar on bar-on-back lifts, the box is a scale ruler, takeoff velocity on
  every jump rep, the unmount re-queue only when dirty.
- Build **555** was the previous build, cut from `711d65d1` on 2026-09-28 (#172): the
  box-landing gate needs a corroborated box top, hand pose off for jumps, the debug console
  survives a force close.
- Build **554** was the previous build, cut from `32087376` on 2026-09-28 (#169). It
  carries the equipment's vote on bar position, the CoreMotion camera tilt, the torso-stillness
  fix, the plate size gate, the jump gravity correction, the best-effort jump (Rule #1), the
  box-contact rule, the 409 catch-up after a lost response, the 403 queue rule, and the 3D pose
  opt-out for bar and jump. See docs/camera-tracking-notes.md, "Build 553 on the phone".
- Build **553** (`48505970`, #167 + #168): the 720p upload copy encoded during the recording, the
  sensor-fitted concentric window, the jump-decision and live-fallback diagnostics.
- Build **611** was cut 2026-10-05 from `ed3f57c9`, the first sandbox purchase run (610 was a
  verify_build run). Basic on TestFlight showed "Couldn't complete that purchase, try again" with
  nothing in the debug console. Two fixes: every StoreKit step logs to the debug console
  (`logDebug("IAP", ...)` in `client/src/lib/apple-iap.ts`: request, transaction, the server's
  verify status and message, finish, restore count) and the upgrade page's toast carries the
  server's sentence; and `verifyAppleTransaction` recognises every product sold at Apple
  (`KNOWN_APPLE_PRODUCT_IDS`), where it had asked `tierForAppleProductId` alone and so refused
  All Classes and Coaches Corner with a 502 after Apple took the money. Also carries the queue:
  the All Classes add-on, the builder's pricing notice, the card fix, and the coach plan band
  following the plan onto the Stripe subscription (`syncCoachSubscriptionBand` in
  `server/billing.ts`, up prorates, down waits for the next invoice).
- **The first sandbox purchase on 611 read, off the debug console:** `server verify refused
  ...basic_v2: 422 No subscription found for this account.` Apple had confirmed the purchase and
  `applyAppleIapVerification` updated a `subscriptions` row the athlete never had (the row is
  only created by `createTrialSubscription`, which a Free Agent who never trialled never meets).
  Behind it a second gap: the Apple and Google Play paths wrote the subscriptions row only, and
  the entitlements read `users.freeAgentTier` (`hasAthletePaidForAiAccess`), which the Stripe
  webhook has written since that bug was found there and the store paths never did. Both fixed
  server-side (`upsertSubscriptionByUserId`; `updateFreeAgentBilling({ freeAgentTier })` on
  verify and on an Apple renewal), proven by `server/apple-iap-grant.itest.ts`, shipped on
  Render, no build needed. Note for the audit: with `BILLING_LIVE` off, `cameraAccessFor`
  answers false for EVERY Free Agent except the comped demo address, whatever they hold.
- Build **612** was cut 2026-10-05 from `18c033c9`: the two AI tiers on their `_v3` product ids,
  all three tiers in one Apple subscription group. On it every tier bought, swapped and recorded
  in sandbox.
- Build **613** was cut 2026-10-05 from the end of that run, three things the console showed:
  a StoreKit transaction replayed at cold start before the session was known met a 401 and is
  now HELD and re-sent after sign-in (`flushAppleIapTransactionsHeldForSignIn`, called from
  App.tsx); a downgrade comes back from Apple as the CURRENT product (a downgrade waits for the
  renewal) and the toast now says so instead of "You're upgraded" (`TierPurchaseResult.deferred`);
  and the upgrade screen marks the current plan (`freeAgentTier` on `/api/athlete/entitlements`).
  Also, server-side: **THE TWO DEMO ACCOUNTS ARE ALWAYS SOLD TO** for All Classes and Coaches
  Corner (`DEMO_ACCOUNTS_ALWAYS_SOLD_TO` in routes.ts; Scott: "lock the classes and the coaches
  corner for both free agent and the coach"). Beta and enforcement-off comp every add-on for
  every account, so these two could never show the wall or be bought in sandbox; now they answer
  from the purchase record alone and nothing else. `coach@forge.app` left
  `COMPED_COACHES_CORNER_COACHES` (now empty). The Free Agent's camera comp stays for App Review.
  `server/demo-accounts-are-sold-to.itest.ts` proves both.
- **BUILD 643'S CONSOLE PROVED ALL CLASSES AND EXPOSED FOUR ZOMBIE TRANSACTIONS** (2026-10-08).
  Scott: "i only did sandbox for the free agent profile, how do we know it worked". Off his
  console: `purchase requested: ...addon.all_classes_v1` -> `StoreKit transaction ... verifying`
  -> `server recorded ...all_classes_v1, finishing with StoreKit`, and the Classes page opened
  with every chapter. The 613 hold-until-sign-in also worked on its first real cold start:
  `signed in, re-sending 6 held transaction(s)`. **But four of the six were refused 502 "Apple
  In-App Purchase isn't set up yet"** -- sandbox transactions for `ai_coach_v2` and
  `ai_coach_video_v2`, the gravestone ids recreated as `_v3` on 10-05. The server did not know
  them, so it refused; the app never finishes a refused transaction (the right rule for a real
  purchase the server does not know yet, build 611's bug); so StoreKit replayed them at every
  launch, forever, and the message blamed configuration. Three fixes, each its own thing:
  `RETIRED_APPLE_PRODUCT_IDS` in `shared/free-agent-tiers.ts` names the gravestones as data;
  `verifyAppleTransaction` returns a REASON instead of null and `appleVerifyRefusal` maps it --
  502 is now reserved for the verifier being unconfigured, an unknown product is 422 and stays
  unfinished, a retired product is **410 with `retired: true`**; and the phone finishes a
  transaction ONLY on that 410 (`verifyAndFinishOnce`), with nothing granted, so it never comes
  back. `apple-product-ids.test.ts` pins the list, the statuses and that 410 is the one branch
  that finishes. Client half needs a build; server half ships on Render.
- **A PRODUCTION SERVER STILL VERIFIES A SANDBOX PURCHASE, OR APP REVIEW FAILS** (2026-10-08).
  Found writing the launch-day instructions. Apple's `SignedDataVerifier` is bound to ONE
  environment and throws `INVALID_ENVIRONMENT` for a payload signed in the other, and
  `getVerifier` built exactly one from `APPLE_IAP_ENVIRONMENT`. So the moment Render was
  switched to `production`, every sandbox-signed purchase would have been refused -- and App
  Review tests in-app purchases in the SANDBOX, as does every TestFlight tester and every
  sandbox Apple ID. The reviewer would have paid at the sheet and been told the purchase could
  not be verified. Apple's own guidance is production first, sandbox on a mismatch, and that is
  `verifyWithFallback` now: one verifier per environment, built lazily, the configured one
  tried first, sandbox only on `INVALID_ENVIRONMENT` (a bad signature is never retried), and a
  notification's nested transaction decoded by the verifier that accepted the outer payload.
  The grant records the environment Apple stamped, so a sandbox purchase on a production server
  is distinguishable forever, and a `console.warn` names each one. While configured for
  sandbox nothing changes (the production verifier needs `APPLE_APP_APPLE_ID` and is not
  tried). `apple-verifier-falls-back-to-sandbox.test.ts` fakes the library's verifier with the
  same constructor contract and exception and drives both paths through every configuration.
  **THE FOUR RENDER VARIABLES FOR LAUNCH DAY ARE FOUR, NOT THREE:** `APPLE_APP_APPLE_ID` (the
  numeric Apple ID on the app's App Information page; the production verifier refuses to
  construct without it, legibly, in the log), `APPLE_IAP_ENVIRONMENT=production`,
  `APPLE_IAP_LIVE=true`, `BILLING_LIVE=true`. Set the first one any time; it is inert in sandbox.
  Server-side: ships on Render, no build.
- Build **614** was cut 2026-10-05 right after 613, from the locked demo Free Agent's screen:
  the All Classes card read "Free while Forge is in beta" with nothing to tap, because it gated
  the PHONE on `BILLING_LIVE` too. Both rails now follow their own switch, the split the tier
  cards already had: the store sheet opens on `APPLE_IAP_LIVE` / `GOOGLE_PLAY_BILLING_LIVE`,
  the web checkout on `BILLING_LIVE`. The Coaches Corner upsell card on `/coach/coaches-corner`
  had only the web checkout (refused from a native platform) and now buys through StoreKit on
  iOS like the coach billing page does.
- Build **617** was cut 2026-10-05 from `ed540193`, from the four lifts filmed beside the OVR on
  2026-10-04 (docs/camera-tracking-notes.md, "Four lifts beside OVR, 2026-10-04"): scale
  candidates carry `uncertainty` and `weightPct` so the 8% low range of motion on both barbell
  lifts can be attributed to a ruler (`reconcileScaleEstimates` returns the per-voter weights;
  the report prints them -- server-side half ships on Render), the box jump no longer tells the
  athlete "Did not clear the box" (Rule #1: a performance claim from a number 28% low), and a
  unilateral prescription reads "3 × 5 each side" (`shared/prescription-laterality.ts`).
  **NO correction constant was applied**, and the evidence says not to: range of motion, the
  whole RDL and the box jump all read LOW, so "calibrate these numbers down" would make three
  of the four comparisons worse. Calibration work: uploaded on commit.
  Also build **616** was the All Classes / Coaches Corner sandbox build.
- Build **619** was cut 2026-10-05 from `d3a6e205`. It clears the whole queue AND fixes a
  regression 618 shipped.
  **THE 3D POSE WAS SWITCHED OFF IN 618, BY ACCIDENT, BY THE CHANGE MEANT TO MAKE IT CHEAP.**
  The phase offset that stops the 3D pose and the hand pose sharing a frame was `1`, and on the
  live path `strideIndex = thisFrameIndex * sampleEveryNthFrame`, so with the sample stride of 4
  it only ever takes multiples of 4 and `4k % 120 == 1` has no solution. Measured off the
  2026-10-05 export: every capture before 618 carried 20-36 3D frames, both 618 takes carried
  **0**, and with them went the body_3d ruler, the depth ruler and the 3D ankle ruler that same
  build existed to test. The offset is now derived from the sample stride (the first multiple
  that is not also a hand-pose frame), and
  `expensive-sensors-never-collide.test.ts` proves REACHABILITY -- the old test passed
  throughout, because a gate that never fires collides with nothing.
  Also in 619: **the gravity ruler stands down on a box set** (it models a jump that lands where
  it took off; the 618 box jump's box ruler had five clean reps and put the scale at 0.636 of
  truth -- net rises of 38.1/37.2/39.6/39.3/38.8cm onto a 61cm box -- and was overruled), the
  **Rule #4 audit** of all eight trackers (the kettlebell and swing live paths ran no object
  detection at all; six trackers ran hand pose on EVERY frame by omission; the swing tracker had
  one scale ruler), **`rotation3D`** (the native 2D landmarks carry `z: 0`, so hip-shoulder
  separation has been exactly 0 or 180 degrees on every iPhone frame -- recorded as a peer, not
  substituted), and the **accuracy batch** from the 10-04 telemetry: `minDetectionConfidence`
  0.4 -> 0.25 (the squat had 90 of 130 candidates refused by that floor), the static-decoy rule
  (a rack does not move and a barbell does), the source-agreement gap read at last, and
  scale-drift-per-rep. Calibration work: uploaded on commit.
- **THE CoreML MODEL WAS UNDERTRAINED AND IS RETRAINED AS OF 2026-10-09. HISTORY KEPT BECAUSE
  THE SYMPTOM IS QUOTED ALL OVER THIS FILE.** All eight classes existed and the mapping was
  right, but it was trained on 43 labelled boxes across 41 images -- med_ball 10, plate 12,
  kettlebell 12, **barbell 3**, dumbbell 1. That is why the barbell class never produced a single
  detection on any take (`candidatesSeenOfClass: 0` on both barbell lifts, across 60 full-frame
  searches), why the secondary witness never held a lock, and why `plateScaleIfAdmitted` was
  1.9-4.7x too small on every sensor-paired take. **Do not reason from those numbers as the
  current state** -- see the 2026-10-09 retrain entry below for what shipped and what is still
  unproven.
- Build **620** was cut 2026-10-05 from `660b025d`, off Scott's debug console, and it is the one
  to film on. **EVERY FINISHED CAMERA SET WAS RE-UPLOADING EVERY EARLIER SET'S SKELETON
  FRAMES.** From one session's console: `sending 10472KB (traces 10362KB)` ok in 7712ms, then
  `11961KB` ok in 10228ms, then `13340KB` ok in 10512ms, then `13383KB` FAILED 409, plus two
  `NetworkError: Can't reach Forge`. Beside them, from the keystroke path that had omitted since
  it was written: `sending 118KB (traces 0KB)` ok in 2460ms. The payload grew all session because
  `autosaveNow` -- the path a finished camera set takes -- sent the whole day in full. A 13MB
  upload from a phone is a payload problem, not a network one, and it is where that night's Back
  Squat and med ball throw went. `autosaveNow` now omits the captures the server has CONFIRMED
  and sends the new one in full; the safety is `capturePersistedRef`, which a set joins only
  inside `if (synced)`, so the set just filmed is never omitted. Keys are omitted, never nulled
  (the server reads an absent key as "keep what you have" and a null as "clear it").
  **AND EVERY QUEUE SKIP NOW SAYS WHY.** The same console showed `flush: 1 queued day(s)` six
  times and not one `flush ok`, `flush retry`, `flush HELD` or `flush DROPPED` after any of them.
  Three bare `continue`s did it -- another account's entry, a day the open workout screen has
  claimed, and a held entry on its slow clock -- each legitimate, each indistinguishable from the
  others and from a crash. All three name themselves now and the held one says how long until its
  next retry. Calibration work: uploaded on commit.
- Build **621** was cut 2026-10-05 from the four lifts filmed on 620 beside the OVR
  (docs/camera-tracking-notes.md, "Four lifts beside OVR, build 620, 2026-10-05"). Two fixes, each
  measured against the sensor:
  **THE ROMANIAN DEADLIFT WAS CLASSIFIED AS A STANDING LIFT.** It is the textbook hip hinge, and
  `bent_over` (2026-10-02) got the eleven rows and Good Morning and not the hinge. Its height
  ruler read 16% below the scale the sensor requires while carrying 44.4% of the blend weight;
  dropping it takes the RDL from **-7.0% to 0.0%** of the OVR, and the Back Squat -- a standing
  lift, which keeps its ruler -- is untouched (dropping the squat's reads 25% HIGH, which is the
  control). The 10-02 note's "it starts and finishes upright so the median carries it" argument
  was wrong for a hinge for a reason it missed: `calibrateFromFrames` corrects one-sided
  COMPRESSION, and a hinge rotates the torso OUT OF PLANE, lengthening the apparent nose-to-ankle
  span. A conventional deadlift stays standing on purpose.
  **A 61CM BOX JUMP REPORTED 238.4CM.** Its seven reps were
  `[70.6, 71.5, 2.4, 71.7, 70.3, 67.5, 265.5]` -- five inside 1.6cm of each other (the box ruler
  working), plus two measured from a baseline that had walked off, each following a
  `baseline_reanchored` event. **Both were already flagged** by `outlierAgainstSet`;
  `bestJumpHeightCm` was a bare `Math.max` over every rep and did not read the flag, so the set's
  headline number was the worst rep it had. `repsForSetBest` now prefers the unflagged reps and
  the set reads **61.1cm against the 61cm box**; it falls back to every rep when every rep is
  flagged, so nothing is withheld (Rule #1) and every rep keeps its row and its flag. Same shape
  as build 577's `MAX_PEAK_TO_MEAN_RATIO` for the bar; the next place to look for it is any other
  set-level `Math.max` over reps.
  **NOT changed, and the notes say why at length:** the `shoulder_width` ruler is the highest
  candidate on 19 of 19 captures (median 1.29x) and the cause is measurable --
  `BIACROMIAL_HEIGHT_FRACTION` is 0.23, the anatomical breadth, but the span it divides is
  between Vision's shoulder LANDMARKS, which the 3D skeleton puts at 0.1934 of stature. Refitting
  it takes the RDL from -7.0% to -13.8%, because that bias was COMPENSATING for the hinge bug
  above. It is refittable only once a standing lift is read against the sensor with the hinge fix
  in -- the thing to look for in the next export.
  Also confirmed working on the phone from this export: the 3D pose is back (24/17/25 frames
  against 618's 0), the 13MB autosave is fixed (134KB per save after the first), and the barbell
  detector now finds its object on 124/51/16 frames where 10-04 had 18 of 840. Calibration work:
  uploaded on commit.
- Build **622** was cut 2026-10-06 from the three lifts filmed on 621 beside the OVR
  (docs/camera-tracking-notes.md, "Three lifts beside OVR, build 621, 2026-10-06").
  **THE UN-RACK WAS COUNTING AS REP 1 ON A BENCH, AND IT COST 15.7% OF THE SET MEAN.** The
  bench's range of motion was the best this pipeline has produced -- 37.4cm against the sensor's
  37.1, +0.9% -- and its mean read 0.81 against 0.70. None of that was scale: the segmenter
  returned TWELVE reps for a ten-rep set, and reps 1-3 were the bar coming off the hooks, the
  settle and the hold. `repConsistency` flagged the settle (20.1cm against a 39.2 median) and
  could NOT flag the un-rack, whose 44.4cm is perfectly ordinary -- it is impossible only in
  SPEED, 2.48 m/s against a set median of 0.70. The count-trim's oddness score weighed amplitude,
  the whole window and the ECCENTRIC's speed, never the concentric's own, so the un-rack looked
  like a rep to every term that was scored. `concSpeed` is now a fourth log-ratio term, and
  `MAX_COUNT_TRIM_PER_EDGE` goes 2 -> 4 behind it. Bench reads ten reps and 0.73 (+4.3%).
  **The cap alone is wrong and a sensor-paired take proved it:** at 4 without the speed term it
  takes set 10 from ten reps to nine, because the scorer cannot separate that set's real last
  press from this set's un-rack (oddness 1.34/1.61 against 1.39/1.61). It also closes
  `bench-rerack-is-not-a-rep.test.ts`, `it.fails` since build 575, whose own note said the day it
  drops the re-rack it gets rewritten as a plain assertion -- that re-rack is a speed outlier too.
  **Rule #1 proved, not asserted:** the trim loop stops AT the athlete's own count and cannot go
  under it, and `count-trim-never-empties-a-set.test.ts` replays all 20 corpus captures and
  asserts each still produces numbers. Five return fewer reps than logged; all five fail
  identically with this change reverted, so they are the segmenter, not the trim, and are pinned
  as a list that shrinks.
  **NO correction constant, third pairing running, and this time the sweep proves it:** every
  bias variant is worse on rms and the larger ones blow the squat to +28% by flipping which
  agreement cluster wins. **And the blend beats every ruler it is built from** -- median absolute
  error 7.0% against 13-17% for each voter, the first direct evidence that inverse-variance
  weighting is earning its keep. **This also CORRECTS the 10-05 note:** `shoulder_width` looked
  1.29x high against the other candidates, but against the SENSOR it is the least biased of the
  four (+5.5% median). The other rulers were low, not the shoulder high. Not refitting it on
  10-05 was the right call for the wrong reason. Calibration work: uploaded on commit.
- Build **623** was cut 2026-10-06 right after 622, from Scott reading the comparison:
  **THE BARBELL SHOULDER PRESS WAS MAPPED `seated` AND IS STANDING.** Scott: "Make barbell
  shoulder press standing, I am doing it standing, a barbell seated shoulder press is something
  different." Not cosmetic: `postureAllowsHeightCalibration` is false for seated, so every
  Barbell Shoulder Press ever filmed was denied its height ruler and scaled on the shoulder and
  3D rulers alone -- the exact candidate list the 10-06 take carried when it read range of
  motion +15.6%. The library's own instructions said "Seated, bar at collarbone", so the app was
  telling him to sit down for a lift he does standing; that text and the camera profile's framing
  note are fixed with it. **Same class as the RDL hinge, opposite direction** -- there a ruler
  was wrongly PRESENT (-7.0%), here wrongly ABSENT.
  **AND THE FRAMES NOW SAY WHAT POSTURE THEY SAW.** Two posture mislabels in two days, each
  costing a ruler, neither visible in any export, because posture has only ever been read off
  the exercise NAME. `measurePostureFromFrames` records `calibration.measuredPosture` beside
  `calibration.posture`: `torsoFromVerticalDeg` (near 0 upright, approaching 90 on a hinge --
  would have caught the RDL) and `heightToShoulderRatio` (separates SEATED from STANDING, which
  the angle cannot since both are upright -- would have caught the shoulder press). **It
  measures and overrides nothing**: one mislabelled take is not evidence enough to let the
  frames outvote the library, and a posture that flipped mid-pipeline would move every ruler
  under it at once. Both are angles or ratios, so neither needs a scale -- the point, since they
  must be readable on a take whose ruler is in question. Declared in
  `trackingDiagnosticsSchema` (zod strips undeclared fields silently; this has bitten twice) and
  the export selects the whole column, so they arrive with the build and need no Render deploy.
  Also ruled out, which saved chasing it: **the row's -18.6% is not a projection error.** Per
  rep, across-axis travel is 0.6-4.7cm against 41-60cm along it, so the full 2D path magnitude
  would raise the set's range of motion by 1.3%, not 19%. It is a genuine scale error with every
  ruler low (-13.0%, -36.3%, -45.2%) and NO mechanism is proposed, because one paired take
  against 31.9/56.0/51.3 from an earlier session is not enough to fit to. Next to film.
  Calibration work: uploaded on commit.
- Build **625** was cut 2026-10-06 from Scott's 623 console (run 624, `d619c07d`, was a
  verify_build; the beta went out as run/build **625** from `0daa3e6e`), and it is a SAVE-PATH
  build, not a calibration one. **This is the build that landed on the phone**; the posture sweep
  is in 626 behind it. Scott: "it rejected my video, which is a direct fucking violation of rule 1."
  The videos were in fact fine -- every set that reached the server carries `hasVideo: true`, so
  the video retry queue did its job -- but a SET did not reach the server, and he found that out
  by reading a debug console, which is the part that is indefensible. Two real bugs behind it,
  and the 620 logging did not cause either: it made both visible, which is the only reason they
  were found.
  **A CAPTURE COULD BE MARKED SERVER-HELD BY A SAVE THAT NEVER CARRIED IT.** `capturePersistedRef`
  decides what later saves may OMIT (620), and it was filled inside `if (synced)` from
  `itemsRef.current` -- the state when the RESPONSE lands, not what the REQUEST held. So: a
  payload is built while set 3 has no capture; set 3's analysis finishes and lands in state; the
  save succeeds and the loop marks set 3 persisted; every later save omits it and its frames are
  never sent. Silent and permanent. This file recorded `if (synced)` as the safety and it is
  necessary, not sufficient. Fixed by recording the keys WHERE OMISSION IS DECIDED, inside
  `buildLogPayload`, into a `WeakMap` keyed by the payload object -- which `onSuccess` already
  receives as the mutation's variables, so it needed no new plumbing. A payload with no record
  (a replay off the queue) marks nothing, which costs a re-send and cannot lose anything.
  **AND THE SCREEN THAT LOCKS OUT THE GLOBAL FLUSH COULD NOT RESCUE ITS OWN DAY.** The workout
  screen claims its `dayKey`, so `flushPendingLogs` skips it ("the open workout screen has
  claimed this day"). While that screen is open its own listeners are therefore the ONLY thing
  that can replay a queued save -- and they were `online` alone, the one trigger
  `startOfflineLogSync` documents at length as insufficient. A request that dies with
  `TypeError: Load failed` never went offline, so no `online` event follows. On 2026-10-06 a
  1510KB save failed exactly that way, queued, and every flush after it logged SKIPPED. The
  resolver now listens on the same three signals the global flush does (`online`,
  `networkStatusChange`, `resume`) and removes all three on unmount.
  `a-capture-is-never-marked-sent-unless-it-was.test.ts` pins both; mutation-testing each back to
  the old shape turns four of its seven cases red.
  **The lesson worth keeping: a guard stated as "X happens only inside `if (synced)`" is about
  TIMING, not CONTENT.** Both bugs were a correct-looking guard that answered the wrong
  question -- was the save successful, rather than did this save contain this thing.
- Build **626** carries the posture sweep (2026-10-06): all 413 library exercises run through
  `postureForExercise`, and **twenty-two were resolving to the default, "standing", while being
  done face-down on a bench, folded into a plank, hinged at the hip or hanging** (Seal Row, Spider
  Curl, Frog Pump, Renegade Row, Stir the Pot, McGill Curl-Up, Machine Row, Pec Deck, Bent-Over
  Rear Delt Raise, Cable Pull-Through, Jefferson Curl, both Kickbacks, the two deadlift-to-row
  combinations, Toes-to-Bar, Nordic Curl, Adductor Rock Back, Dead Hang). Each offered the height
  ruler a stature span measured across a torso that is not upright -- the Romanian deadlift bug
  of 2026-10-05, which cost 7%. **NO constant moved**: these are labels, and the ten sensor-paired
  lifts resolve exactly as before (`the-posture-sweep-2026-10-06.test.ts` pins both halves).
- **ONE CODE PATH, PER-LIFT VALUES: a constant fitted on the squat MOVES the bench.** Asked
  directly by Scott 2026-10-06 and worth keeping at hand. Bench, squat, row and press are all the
  SAME tracker (the bar tracker). Only six things are looked up per exercise -- `postureForExercise`
  (whether the height ruler may vote), `romBucketForExercise`, `TRAVEL_ONSET_MARGIN_BY_ROM_KIND_M`,
  `firstMoveForExercise`, the film guidance, and the `movementProfiles` DB row. **Everything else
  is shared**: `reconcileScaleEstimates` and all eight ruler uncertainties, `HEIGHT_RULER_UNCERTAINTY`,
  `BIACROMIAL_HEIGHT_FRACTION`, the count-trim scorer, `MAX_COUNT_TRIM_PER_EDGE`,
  `MAX_PEAK_TO_MEAN_RATIO`, `DRIVE_ONSET_FRACTION`, the plausibility gates and the segmenter. So
  the only safe way to make a lift its own is to make the thing that differs a LOOKUP, not a
  constant -- posture is the model: the hinge fix took the RDL from -7.0% to 0.0% and left the Back
  Squat bit-identical. Any constant fitted on one lift is checked against the others before it
  ships, as the 10-06 `concSpeed` term was. See docs/camera-tracking-notes.md, "The posture sweep".
- **ONLY 54 OF THE 413 LIBRARY EXERCISES CAN BE FILMED, AND THE LIST ALREADY EXISTS.** Corrected
  2026-10-06 the same day, after this file briefly said every exercise was filmable -- it is not,
  and the reason is video storage. Scott: "we don't need to film clamshells or bicep curls, tricep
  extensions for example, we don't need that video storage."
  `CANONICAL_VIDEO_ELIGIBLE_NAMES` in `server/seed.ts` is the set: 22 strength lifts (the canonical
  version of each main-lift pattern only -- Bench Press but not Board/Spoto/Larsen Press), all 24
  Olympic lifts (each a distinct skill, not a variant) and 8 plyometrics. Everything else is
  backfilled `exercises.videoEligible = false`, the coach's toggle is not drawn for it, and
  `resolveVideoCheckEnabled` in `storage.ts` refuses to turn video on for it whatever the client
  sent -- so the gate is real on both sides. **`VideoTrackingToggle` itself excludes nothing**,
  which is what made the wrong claim look true; the gate is the column, not the control.
  Nullable on purpose: null and true both read as eligible and only an explicit false restricts,
  so the backfill can never silently re-restrict one an admin flipped back on. Storage cost scales
  with how many DISTINCT exercises are eligible, not with library size.
  Skill drills have their own eligibility, by skillType rather than by name
  (`MECHANICS_ELIGIBLE_SKILL_TYPES`, `SPRINT_TIMING_ELIGIBLE_SKILL_TYPES` plus twelve named
  footwork drills); sprint and mechanics are in the SKILL library and are not among the 413.
  `every-filmable-lift-is-profiled.test.ts` pins the 54 and asserts each has a posture, a ROM
  bucket, a first move and film guidance, so a lift added to the list cannot land on the DEFAULTS
  unnoticed. **One known gap, recorded not filled: Hip Thrust has no ROM bucket** and so uses
  `DEFAULT_MIN_ROM_FRACTION`; nobody has filmed one beside the sensor.
  **AND THE POSTURE SWEEP ABOVE TOUCHED NOTHING FILMABLE** -- none of its twenty-two exercises is
  on this list, so it is a correctness fix against the day one of them becomes eligible, not a
  change to any number anyone can produce today.
- **ONE SET OF NUMBERS PER FILMABLE THING: 270 records** (54 exercises + 216 skill drills),
  `shared/camera-tunables-by-lift.ts`, 2026-10-06. Scott: "every single thing that can be filmed
  needs its own system, because again, if we're testing let's say a 40 yard dash, it shouldn't
  change any bench press numbers" / "Don't change the numbers that are already there, just make
  sure they are their own separate individual numbers" / "So copy and paste."
  Twelve constants are now per-lift -- the rep gate (min/max ROM fraction, travel onset), the
  headline numbers (`maxPeakToMeanRatio`, `driveOnsetFraction`, deviation ceiling), segmentation
  (`maxCountTrimPerEdge`, `minCountTrimOddness`) and four ruler uncertainties.
  `cameraTunablesFor(name, romBucket)` returns a FRESH record every call plus a `sources` map
  saying whether each number is shared, from the ROM bucket, or FITTED on this lift;
  `summarizeTrackedSet` reads all twelve off it and the bar dialog resolves it once per take.
  **NOTHING MOVED**, proved three ways: `camera-tunables-are-a-copy.test.ts` pins every value
  against the constant it was copied from (those are now EXPORTED from `bar-tracking.ts` for that
  purpose -- change one, change both, like the Swift arbiter); the OVR fixtures and the 20-capture
  replay corpus are green and unchanged; and `every-filmable-thing-has-its-own-numbers.test.ts`
  resolves all 270, asserts no two share a record, and scribbles on one to prove the other 269 are
  untouched -- with Scott's example as a named assertion.
  **THE GATES ARE SPLIT TOO** (Scott, same day, overruling the first version: "Split those too,
  every single thing should be the same but separate, if we change the gate on med ball throws it
  might change the gate on a golf swing and yes they are similar but very different"). He is right
  and the argument for leaving them shared was wrong: a gate is only "physics" once you have fixed
  WHICH movement it is about -- 3 m/s is impossible for a bar and ordinary for a thrown med ball.
  Eleven more fields, copied from each tracker's own constant via `GATES_BY_TRACKER`
  (`maxPlausibleSpeedMps` bar 3 / kb 8 / golf and bat 15 / mechanics 20 / med ball 25, the accel
  and velocity-change gates, `minTrackingConfidence`, both occlusion windows, and overwatch's four
  yardstick gates). `robustPeakSpeed`, `plausibleMean` and `rejectImplausibleAccelerationSpikes`
  take their gate as a defaulted parameter.
  **THE ARBITER IS PLUMBED (2026-10-06).** `AvTrackerArbiter.Tunables` + `static var active`,
  reset from `arbiterTunables` on EVERY capture at both native entry points (live and from a
  file), sent by the bar dialog at Record and at Stop. The `static let`s stay as the defaults and
  as what `tracker-arbiter.test.ts` pins against the TypeScript constants, so the two cannot drift
  on the value they share; an absent or non-positive value falls back to the DEFAULT, never to the
  last take (a stale static would be exactly the leak this exists to stop, and invisible).
  `the-arbiter-reads-this-lifts-numbers.test.ts` is the ratchet and was mutation-tested in both
  directions. Native change: needs `verify_build`.
  **VERIFIED SEPARATE ON 2026-10-16, AND THE WORD "SEPARATE" NEEDS ITS LIMITS SAID OUT LOUD.**
  Scott: "make sure each camera is actually separate." The 270 fresh records, the twelve lift
  numbers and the eleven per-tracker gates are real and the tests hold (38 cases). But
  `FITTED_OVERRIDES` is EMPTY, so every record holds the same values today -- the registry lets a
  bench-only fit stay bench-only; it is not evidence the bench was calibrated apart from the
  squat. And seven constants are STILL SHARED by design and read straight off their modules
  (`BIACROMIAL_HEIGHT_FRACTION`, `BIACROMIAL_TOLERANCE_FRACTION`, `MAX_SCALE_AGREEMENT_TOLERANCE`,
  the three `BODY_3D_*_UNCERTAINTY` values, `COREML_BOX_LONG_EDGE_UNCERTAINTY`,
  `EDGE_OVERSIZED_AMPLITUDE_RATIO`); each has its reason in docs/camera-tracking-notes.md, "State
  of the per-lift registry, verified 2026-10-16". **The one to watch is
  `BODY_3D_CORRECTED_UNCERTAINTY` (0.2)**: fitted on seven paired benches on 2026-09-30, before
  the registry existed, and shared -- by this file's own test it belongs in the registry the way
  `maxShoulderSpanSpread` was moved there (`12eb33ac`, 2026-10-08). Next candidate to move; not
  moved on a filming morning. The three 2026-10-08 commits that had no note (`12eb33ac`,
  `894849c8`, `45bd0815`) are written up in the same section.

  **AND THE 2026-10-20 PROVENANCE AUDIT ANSWERED "HOW MANY LEAK" WITH A NUMBER: SEVEN, SIX OF THEM
  A BENCH.** Scott, on the 10-19 RDL comparison: "Why did you ship pendlay rows? We are only
  testing squat, box jumps, and rdls, you don't have data to ship to pendlay." Then: "I want
  everything separate, everything needs its own place."
  **Nothing has ever shipped a Pendlay-specific number** -- `FITTED_OVERRIDES` is empty. The leak
  runs the OTHER way: values fitted on lifts he is not filming decide the three he is. Sixteen
  agents, one per file per lens, each claim challenged on PROVENANCE and on REACHABILITY; 60
  constants, 105 claims. **Two earlier counts were both wrong and the reasons generalise**: "two"
  searched for the word *Pendlay* and the leak is mostly *bench*; "thirty-six" counted shared RULES
  and first-principles anthropometry as leaks, which this file's own rule says they are not.
  **The seven, worst first, with sensitivities replayed on his own 10-19 candidates:**
  `DEPTH_RULER_BIAS` 0.9 (4 benches; **RDL ±2.6% per 0.1**, and it divides the depth value that is
  half the collapsed pair the RDL's whole +12% comes from), `VELOCITY_SMOOTHING_MS` 165 (**ONE**
  bench take, never swept), `BIACROMIAL_TOLERANCE_FRACTION` 0.2 (9 takes, bench+row+press; the only
  one reaching **all three**, box jump +4.3% at 0.1), `BODY_3D_CORRECTED_UNCERTAINTY` 0.2 (7
  benches; box jump the live one at +3.3%), `MAX_PEAK_TO_MEAN_RATIO` 2.0 (60 bench reps, and its own
  comment concedes a squat's is higher), `maxPlateSizeInYardsticks` 2.0, and
  `EDGE_OVERSIZED_AMPLITUDE_RATIO` 1.6 -- the one Pendlay number, and only its upper bound.
  **FIVE WENT INTO THE REGISTRY AND NO NUMBER MOVED.** Three of the seven already had their own
  place; the four that did not are fields now, plus `maxScaleAgreementTolerance`, which HAD to
  follow `biacromialToleranceFraction` because it is derived from it -- written as a hardcoded
  `0.2 * SCALE_AGREEMENT_MULTIPLE` whose comment claims it tracks the floor. A sentence is not a
  link, so the copy test now asserts the product. All five are DEFAULTED PARAMETERS (the
  `robustPeakSpeed` pattern), so every un-plumbed caller keeps today's value; 401 files / 4717
  tests identical to the baseline, OVR fixtures and the 20-capture corpus included.
  **DO NOT "FIX" THESE -- each looked like a leak and is not:** `HEIGHT_RULER_UNCERTAINTY` 0.1 was
  fitted jointly on HIS squat and HIS RDL and is the heaviest lever on two of the three;
  `PHANTOM_OVERSHOOT_RATIO`'s value was measured on **back squat and box jump** (the bench only
  showed the fault existed); `RELATIVE_REP_AMPLITUDE_FRACTION` predates every sensor pairing;
  `MAX_COUNT_TRIM_PER_EDGE` and `MIN_COUNT_TRIM_ODDNESS` as module constants **do not exist** (they
  are function-local aliases, double-counted by the readers); `travelOnsetMarginM` is already
  genuinely split (squat/RDL/jump 0.01, bench/row 0.0075 -- the one field of the twelve that is not
  identical everywhere); `MAX_SCALE_AGREEMENT_TOLERANCE` is a ceiling that can only tighten and was
  **inert on all four 10-19 takes** (an earlier reply called it Pendlay-fitted; that was wrong).
  **AND THE STRUCTURAL FINDING, WHICH IS THE BIGGER ONE: `cameraTunablesFor` IS CALLED BY ONE
  TRACKER OF FIFTEEN.** `av-bar-tracker-dialog.tsx` and nowhere else; `jump-tracking.ts` has no
  reference to `tune` at all. The separation ratified 10-06 was built as a data structure and wired
  to one tracker, so **the Box Jump under test and all 216 skill drills run entirely off shared
  module constants.** That is why `MAX_SHOULDER_SPAN_SPREAD` reaches his lifts by two routes -- the
  squat and RDL from their own record, the box jump from the raw constant, same 0.4, and no export
  says which. The 10-16 check verified the records were real and never asked who READ them.
  **NEXT, named so it is not mistaken for done:** wire the other fourteen dialogs, Box Jump first
  (it moves no number -- every record is identical today), with a ratchet in the
  `NOT_PUBLIC_ON_PURPOSE` shape so the unplumbed list must shrink.
  **Also corrected in the notes:** the 10-19 session note attributed that day's movement to the
  scale rulers alone, and `heightIn` arriving also moved every rep gate (squat 20.00 -> 19.05, RDL
  20.00 -> 22.86, box jump floor 15.00 -> 16.30). No count changed, but eight things moved on one
  input and the note caught five -- the 5%-then-40% mechanism exactly.
  See docs/camera-tracking-notes.md, "The provenance audit, 2026-10-20". Calibration work: uploaded
  on commit.

  **AND THE STRUCTURAL FINDING IS HALF FIXED, 2026-10-20: FIVE OF FIFTEEN TRACKERS READ THE
  REGISTRY NOW, UP FROM ONE, AND WIRING THEM FOUND A SIX-WEEK-OLD DEFECT.** Scott: "I want
  everything separate, everything needs its own place."
  **THE HEIGHT RULER'S REFIT NEVER REACHED THE MED BALL OR THE KETTLEBELL TRACKER.** Both dialogs
  state its uncertainty as a bare literal `0.05`, written `2436110b` (2026-09-29) when
  `HEIGHT_RULER_UNCERTAINTY` was also 0.05; `812becb7` (2026-10-05) refit the constant to 0.1 and
  **a refit cannot reach a literal**. So for six weeks those two trackers have stated the heaviest
  voter in the blend as twice as confident as the pipeline believes -- **four times the weight**.
  **Sixth instance of the class this file keeps naming** (the Coaches Corner lesson re-sync, the
  Barbell Shoulder Press instructions, `videoEligible: false`, the terms-change guardian notice,
  the Stripe upsert): a correction wired to one path, invisible because the path that IS taken
  looks like it worked. **NOT corrected** -- that moves a number on two trackers inside a commit
  claiming to move none, and 0.1 was fitted on a bench and a squat, so applying it to a thrown
  ball is the same leak pointing the other way. Copied into `GATES_BY_TRACKER` at TODAY'S value
  (0.05 those two, 0.1 elsewhere) where a grep finds it, and the copy test pins it **as it is, not
  as it should be** -- the assertion somebody changes the day a med ball is filmed beside the
  sensor.
  **WIRED: av-jump, av-kb-swing, av-medball, av-swing**, so **all five scale-blending dialogs**
  resolve their own record. Those are the five that matter, because each decides a take's SCALE --
  the error every pairing since 10-04 has chased. The **Box Jump under test** was reading
  `MAX_SHOULDER_SPAN_SPREAD`, `BIACROMIAL_TOLERANCE_FRACTION`, `BODY_3D_CORRECTED_UNCERTAINTY` and
  `HEIGHT_RULER_UNCERTAINTY` off the raw constants, three of the four fitted on a bench, and no
  export said which route a number came by. Golf and baseball resolve as separate identities off
  the `sport` prop (always separate in `FilmingTracker`, never at the call site).
  **ONE NEW FIELD, `boxRulerUncertainty`**, which was a bare `0.05` in the jump dialog's box-scale
  candidate with no name and no comment -- the TIGHTEST uncertainty any ruler here states, tighter
  than the CoreML detector's own measured 0.056, so it decides a box jump's scale almost by
  itself. NOT `COREML_BOX_LONG_EDGE_UNCERTAINTY` (a detector property, correctly shared): this
  ruler divides a typed box height by a Vision box-top read against a tenth-percentile ankle
  floor. Unmeasured either way, and findable now.
  **NO NUMBER MOVED**: every separation is a defaulted parameter (the `robustPeakSpeed` pattern),
  `bodyScaleFallbacks` gained an optional `tunables` argument as the one place the three ruler
  numbers reach the four newly-named trackers, and `FITTED_OVERRIDES` stays empty. Whole unit
  suite identical to the baseline, OVR fixtures and 20-capture corpus included.
  **THE RATCHET AND THE FLAW IN ITS FIRST DRAFT.**
  `every-tracker-reads-its-own-numbers.test.ts` reads the dialog DIRECTORY; every file resolves a
  record or sits in `NOT_PLUMBED_YET` with a reason over eighty characters naming a file, field,
  gate, module or blocker (ten entries), and **a wired dialog must LEAVE the list** -- the
  direction whose absence let the registry look finished on 10-16.
  `TRACKER_FOR_TRACKING_LEVEL` is exhaustive over the pgEnum (held equal in the test; the union is
  hand-written because that module is in the client bundle) because **`cameraTunablesFor` DEFAULTS
  to `"bar"`** and a dialog that omits its tracker gets a 3 m/s ceiling on a thrown ball.
  **The default case's first version asserted the FILE contained `TRACKER_FOR_TRACKING_LEVEL` --
  and the COMMENT above the call contains those words, so a bare `"jump"` literal left it GREEN.**
  The `stripe-checkout.test.ts` lesson inverted: there prose turned a test red, here prose turned
  one green, which is worse because nothing announces it. It paren-matches the call's own
  arguments now. Five mutations, each caught by the right case.
  **STILL NOT DONE, ten dialogs, grouped by what blocks them. THE FIRST GROUP'S REASON WAS WRONG
  IN THREE WAYS AND IS CORRECTED BELOW (2026-10-23); the sentence it replaces read "four
  web/Android halves (bar, kb-swing, medball, swing) are the same shape as their wired twins and
  wait only on a device to test on -- `medball-tracker-dialog.tsx` carries the same stale 0.05",
  and every clause of that is false:**
  - **They are not an Android path.** `isAvPreviewPlatform()` is
    `Capacitor.isNativePlatform() && getPlatform() === "ios"`, so all four run in EVERY BROWSER,
    on the live website, today. "Android is parked" excused them and made them sound unreachable,
    which is why nobody read them for three days.
  - **They are not the same shape as their twins.** `kb-swing-tracker-dialog.tsx` and
    `swing-tracker-dialog.tsx` declare no registry-eligible constant at all (no scale blend, no
    ruler uncertainty), and `medball-tracker-dialog.tsx` declares exactly one -- its 25 m/s ball
    gate, which already equals the registry's `med_ball.maxPlausibleSpeedMps`. Wiring the two
    empty ones would be cosmetic AND would take them off the list under false pretences.
  - **`medball-tracker-dialog.tsx` does not carry the stale 0.05.** It runs no scale blend, has
    no height ruler, and contains no 0.05. The claim was carried from its iOS twin by assumption.
  - **AND THE REAL FINDING UNDERNEATH, which the wrong reason hid: the bar's per-frame
    plausibility gate exists THREE times at TWO values.** `bar-tracking.ts` reads
    `tune.maxPlausibleSpeedMps` (the registry, bar = 3); `av-bar-tracker-dialog.tsx:567` has a
    function-local `MAX_PLAUSIBLE_VELOCITY_MPS = 3`; `bar-tracker-dialog.tsx:298` has a
    module-level `MAX_PLAUSIBLE_VELOCITY_MPS = 4`. Neither dialog reads the record and they
    disagree, so the same gate is **3 on a phone and 4 in a browser**, and neither value has a
    comment justifying it. **RECORDED, NOT CHANGED:** wiring the web one moves a number on a path
    no capture has ever been filmed on beside the sensor, which is Rule #5 exactly. A new case in
    the ratchet forbids any exemption from blaming Android and reads that premise off
    `native-av-preview.ts` rather than asserting it.

  The rest of the list stands as written: mechanics (both halves)
  needs the wrist gate threaded through `mechanics-tracking.ts` first, where it is applied;
  sprint and horizontal load (both halves each) have nothing in the record to read -- a timed
  sprint runs no scale blend and its gate is in yards per second, a sled push scales off a known
  distance, so each needs its own number put in the registry in its own units, which for
  horizontal load is the same one job as the open half of Rule #4 for that mode.
  **And `FITTED_OVERRIDES` is still empty: five trackers CAN be calibrated apart, none HAS been.**
  Two claims, and this advances only the first. See docs/camera-tracking-notes.md, "Fourteen
  trackers were handed their own numbers and never asked for them". Calibration work: uploaded on
  commit.
  **AND THE JUMP SAYS WHOSE NUMBERS IT READ NOW.** `calibration.scaleBlend` has been on the bar
  since build 635 and never on the jump, which is exactly why the 10-19 Box Jump was
  unattributable: every field was equally consistent with its own record and with the shared
  constants it was really reading. It carries `identity` plus the seven ruler uncertainties the
  take was handed, `boxRuler` among them -- **no schema change**, because `rulerUncertainties` is
  `z.record(z.string(), z.number())`, so a ruler only one tracker has is reportable without
  touching `trackingDiagnosticsSchema` (zod strips what it does not declare, silently; that has
  cost two diagnostics).
  **AND `height-ruler-uncertainty.test.ts` WENT RED FOR THE SECOND TIME ON A CORRECT CHANGE.** It
  listed two accepted SPELLINGS of the height row's uncertainty; mine was a third. Its own comment
  records instance one (10-08, the bar dialog moving to the registry) and the fix then was to **add
  a spelling** -- the patch that guarantees a third failure. It states the RULE now: on every
  height row in every dialog the uncertainty must be a NAME, never a number typed on the row, read
  off the DIRECTORY rather than two named files. **The general lesson, paid for three times in one
  commit** (that test twice, and this commit's own ratchet, whose first draft was satisfied by a
  COMMENT): a scan enumerating accepted FORMS fails on every correct change that uses a new one and
  gets "fixed" by lengthening the list; a scan stating what is FORBIDDEN accepts every correct
  change and refuses every wrong one.
  Also inverted rather than deleted: `the-blend-reads-this-lifts-uncertainties.test.ts`'s
  "RECORDED, NOT FIXED" case, exactly as its own comment instructed. One of its three gaps stays
  open and the reason is not neglect -- `ankle3DRulerUncertainty` is inert because the ankle ruler
  is computed AFTER the scale vote closes, so **the gap to close first is the order, not the
  constant.**
  402 files / 4728 tests, the delta exactly the 11 new cases; no pre-existing test changed result.

## WHAT "ITS OWN NUMBERS" MEANS, AND WHAT IT DOES NOT MEAN

Scott, 2026-10-06, settling it in one sentence: **"the overwatch is fine, it can learn to
understand the difference, what mattered was calibrating numbers not leaking to other numbers."**

That is the whole principle behind the 270-record registry, and it cuts both ways, so read both
halves before splitting anything else:

- **WHAT MUST NEVER LEAK IS A FITTED NUMBER.** A threshold measured on a med ball throw, a bench
  press or a 40-yard dash belongs to that movement and may not move what any other movement is
  judged by. That is the entire reason `shared/camera-tunables-by-lift.ts` hands out a fresh
  record per identity and the tests scribble on one to prove the other 269 are untouched.
- **JUDGEMENT IS ALLOWED TO BE SHARED, AND SHOULD BE.** Overwatch stays ONE referee across every
  movement -- it can and should learn to tell a thrown ball from a swung club. Splitting the
  arbiter itself into 270 arbiters is NOT what this asked for and would break Rule #2 (one
  arbiter, owning no sensor, judging both trackers). The same goes for the body tracker, the
  object tracker, the segmenter and the scale blend: one implementation, many movements.
- **So the test of any future split is: "is this a NUMBER somebody could fit from one take?"** If
  yes, it is per-lift. If it is a RULE, a mechanism or a piece of reasoning, it stays shared and
  gets better for every lift at once. The RDL hinge, the box jump's flagged rep and the bench
  un-rack were all fixed by changing a rule or a label, and every lift got the benefit -- that is
  the shape to keep, not something to split away.
  **`FITTED_OVERRIDES` is EMPTY and the test fails if an entry appears** -- no constant here has ever been fitted on one lift in isolation, and the registry is
  machinery for doing that safely, not permission to guess. See docs/camera-tracking-notes.md,
  "One set of numbers per filmable thing".
- Build **633** was cut 2026-10-06 from the three lifts filmed on 632 beside the OVR
  (docs/camera-tracking-notes.md, "Three lifts beside OVR, build 632, 2026-10-06"). The build-632
  diagnostics answered their own open question on the first take, which is what they were for.
  **THE BARBELL SHOULDER PRESS READ -1.8% ON THE MEAN AND -1.9% ON RANGE OF MOTION** -- the best
  standing-lift result this pipeline has produced, three witnesses, the height ruler voting at
  66.7% because build 623 stopped calling it seated. It is the control, and nothing in 633 touches
  it.
  **THE BENCH'S -39.3% IS NOT A SCALE ERROR, AND THE EXPORT PROVES IT.** Reaching the sensor needs
  5.942e-3 m/unit; the highest candidate the take produced was 3.881e-3 and the best 3D bone
  3.497e-3, so no blend of what it measured can get there -- same shape as the box jump's 28%.
  Camera pitch is ruled out (7.5 degrees, cos 7.5 = 0.991).
  **AND `subjectFacing` LIED ABOUT THE ANGLE -- CORRECTED THE SAME DAY.** This entry first said the
  bench was filmed from the head end, on the strength of `cameraView.subjectFacing: "facing_camera"`.
  Scott: "No I did not film the bench from head end, I have filmed every single bench press from
  this angle, every single one." He is right; the pipeline misread its own geometry.
  `assessSubjectFacing` divided shoulder spread measured along the IMAGE's horizontal by a torso
  length measured in any direction -- the same on an upright athlete, meaningless on a SUPINE one,
  whose body's long axis is horizontal so every landmark error ALONG the body is counted as
  shoulder breadth. That is why the bench's span read 112.9 against the same athlete's 81.2
  standing, and why 2026-09-22 saw 88.0 and 115.3 on two bench sets minutes apart. The spread is
  now the component PERPENDICULAR to the torso's own axis; **no threshold moved** and an upright
  athlete is bit-identical, so every standing lift is unchanged.
  `a-supine-athlete-is-not-head-on.test.ts`, mutation-tested. **Third instance in three days of one
  error class** (the RDL's height ruler, the shoulder press's posture label) and the first fixed by
  making the measurement rotation-invariant rather than by labelling the posture -- the better
  shape where it is available, since it needs no label to be right.
  **Do not reason from that field's old verdicts: a supine athlete read as head-on on every bench
  before this fix.**
  **The -39.3% is still OPEN, and two fixes were tried and rejected for measured reasons.**
  Measuring the shoulder RULER across the body is the identical bug and is correct, but the
  across-body span of a side-on supine athlete is near zero, so the ruler vanishes, the bench falls
  to body_3d alone and reads **-43.9%** -- a refusal before its replacement, which Rule #1 forbids
  and this repo has shipped once already. And the bench's object system DID find its plate (18
  frames, 0.88-1.00 confidence, aspect 0.80, a disc) and both gates that threw it away measure it
  against the GRIP, the one yardstick a supine side-on athlete cannot provide -- Rule #4's "a
  rejected object read is a bug report" exactly -- but that box was 457px, and a 45cm plate at
  457px reads the set at 5.9cm, so the gate was right on this take with a suspect yardstick.
  So three measurements ship instead of a guess, all `appliedCorrection: false`:
  `calibration.axisForeshortening` (off the 3D pose already running; on a SIDE-ON bench the travel
  should be fully in the image plane, so ~1.0 says the 39% is a scale error after all and ~1.65
  says the camera could not see the movement), and `calibration.objectGate` --
  `gripAcrossBodyFraction` (is the yardstick every object gate is judged by intact, or collapsed
  down the lens?) and `plateScaleIfAdmitted` (what the refused plate would have produced, without
  which three sessions of `plateRejectedReasons` have been unscoreable against the sensor).
  **Read all three on the next bench before anything acts on them.**
  **AND THE ROW'S SHOULDER RULER WAS REFUSED FOR THE WRONG REASON AND WAS RIGHT BY ACCIDENT.** Span
  68.5 units against an `impliedBodyLengthUnits` under 149 on an athlete folded at the hip, so the
  stature ratio cleared 2 -- the Romanian deadlift bug of 2026-10-05 in its second home. The
  refusal was still correct (that span disagreed with ITSELF by 46.4%; reinstating the ruler takes
  the row from -15.3% to +17.5%), and a guard that is right by accident cannot be tuned. So the
  body-length yardstick is consulted only where a body length IS a stature, `MAX_SHOULDER_SPAN_SPREAD`
  (0.4) refuses on the span's own self-disagreement, and the ruler states its own measured noise,
  `max(BIACROMIAL_TOLERANCE_FRACTION, spanSpreadFraction)` -- floored, so the spread can only ever
  LOOSEN it. **It moves nothing measurable today** (press under the floor, bench 0.1cm, row
  refused) and that is the point: every future take's weight is attributable to a number the export
  carries. Whole unit suite, OVR fixtures and 20-capture replay corpus unchanged.
  Open and NOT fitted: the row's +11.9% mean beside a -15.3% ROM, which cannot both be scale.
  Calibration work: uploaded on commit.
- Build **635+** was cut 2026-10-07 from the three lifts filmed on 634 beside the OVR
  (docs/camera-tracking-notes.md, "Three lifts beside OVR, build 634, 2026-10-07").
  **THE BENCH IS A SCALE ERROR AND `axisForeshortening` SETTLED IT FIRST TAKE: 1.009**, where 1.65
  would have meant the camera could not see the movement. The geometry chase is closed. Two more
  confirmed the same way: `subjectFacing` reads `side_on` on the bench (the rotation-invariant
  facing fix works on real footage), and `gripAcrossBodyFraction` is 0.956-0.999 on all three, so
  the object gate's yardstick is intact and the collapsed-yardstick hypothesis is dead.
  **SCALE AND TIMING ARE TWO DIFFERENT ERRORS AND EVERY EARLIER SESSION READ THEM AS ONE.** The
  bench's ROM is 26% LOW while its mean is 20% HIGH, which cannot both be scale. The concentric
  window is short on all three (-13.5%, -22.9%, -22.7%) and the drive window the mean is computed
  over is 38% short on the bench. Proof in one line: the bench's true ROM over the sensor's time
  is 0.690, the OVR's mean exactly -- the velocity computation is sound, both its inputs are wrong.
  `windows` (already exported) says the TRAVEL trim does the cutting, not `DRIVE_ONSET_FRACTION`.
  That is the next fit and it is now well-posed. **NOTHING was refitted this round**: a constant
  fitted at the end of a long session is how a bad one gets in.
  **AND WHAT COULD NOT BE SEEN WENT INTO THE EXPORT RATHER THAN BEING GUESSED AT.** The bench
  recorded `body_3d` 100% / `shoulder_width` 0%; replaying the blend on that take's own candidates,
  on 634's commit, returns 50/50, and nothing in between was visible. Scott: "So if you can't see,
  and can't guess, then put it in the export file I download, that way we can exactly see what's
  happening." `calibration.scaleBlend` carries the inputs exactly as passed (a take replays offline
  with no phone), the tolerance, the collapsed 3D witness, the voters, the winning cluster AND ITS
  ANCHOR, every pair in both directions, and the blended/plateSteppedOut flags -- plus `identity`,
  `romBucket` and the ruler uncertainties THIS lift was handed, since the record is per capture and
  each capture is one of the 54. The mechanism stays shared; the numbers it was given are what get
  written down. **It records and gates nothing** (Rule #1), pinned by
  `the-blend-shows-its-work.test.ts`.
  **Recorded, not fixed: the agreement test is ASYMMETRIC.** `|other/anchor - 1| <= tol` reads
  differently each way; the bench's pair clears 0.4 anchored on the larger and fails anchored on
  the smaller, and on a two-candidate take that decides everything. `pairwise` now shows both
  directions. Calibration work: uploaded on commit.
- Build **638+** was cut 2026-10-07 from a screen recording and the traces already in the repo --
  no new filming on either half. Scott: "calibrate the numbers so we can get more accurate without
  lifts, build what you need, then upload."
  **THE COACH'S SAVED VIDEO HAS BEEN RUNNING AT 6.0 FRAMES A SECOND.** Scott: "the video is very
  choppy, almost glitchy or laggy on playback." Measured off his screen recording of the real
  player: 75% of consecutive frames in the video region are pixel-identical, and the distinct-frame
  rate lands on exactly 1/6s at every threshold from 0.5 to 3.0 grey levels. **The camera is fine
  and the 120fps `.mov` is fine** -- Scott pushed back on the first explanation and was right, the
  export says `captureFrameRate: 120` on every take. What is thin is the DATA-OUTPUT feed:
  `AVCaptureVideoDataOutput` discards a frame arriving while `liveAnalysisQueue` is busy with
  Vision, which is what `liveDropRate` near 3.0 has always meant (90 of 120 dropped as late, so
  the delegate fires ~30 times a second), and `AvUploadCopyWriter` then kept one DELIVERED frame
  in `round(120/30) = 4`. **The stride landed twice.** It samples on the presentation timestamp
  now, the same fix the live analysis cadence took in build 594, which is right at any delivery
  rate where a fixed divisor is right at one. It does NOT touch any number: the copy and the
  analysis are independent consumers of the same callback.
  **AND NO EXPORT HAS EVER DESCRIBED THE SAVED FILE.** `skippedNotReady` was counted into the debug
  console alone, so the question had to be answered from a screen recording. `videoAsset` carries
  the delivered/appended/skipped counts, the target and MEASURED frame rate, the largest gap and
  the span, on BOTH analysis paths, declared in `trackingDiagnosticsSchema` and printed as a
  "Saved video" row. Records and gates nothing (Rule #1).
  **`DRIVE_ONSET_FRACTION` 0.07 -> 0.04, FITTED ON THIRTEEN SENSOR-PAIRED SETS, REPLAYED.** The
  quantity fitted is the SENSOR's own concentric time (its range over its mean), which carries none
  of Forge's scale -- the separation build 634 made is what let this be fitted at all. On the
  athlete-facing mean, excluding the four sets whose rep count is wrong (a miscounted set has a
  different fault and may not choose a timing constant): median error 17.2% -> 10.4%, rms 21.4% ->
  19.0% (the minimum), bias +0.9% -> -4.4%. 0.03 and below buy median by paying in BIAS, which is
  the worse error. Leave-one-out picks 0.03 or 0.04 with every set withheld in turn and never 0.07.
  **It cannot change which reps exist and that is checked**: every fraction from 0.10 to 0.01
  returns the same rep count on all thirteen. SHARED, not per-lift -- fitted across five movements,
  so all 269 move together and `FITTED_OVERRIDES` stays empty.
  **Two sets move the wrong way and are recorded, not smoothed over** (squat set 2, 0.83 -> 0.80 of
  the sensor; this session's row). **Still open**: the bench's -23.9% window does not respond,
  because its segmented PHASE (0.464s) is already shorter than the sensor's concentric (0.504s) --
  a ceiling no trim can lift, and the next thing to look at. Calibration work: uploaded on commit.
- **EVERY CAPTURE MODE NOW SAYS HOW WELL IT WAS SAMPLED, AND TWO WORSE GAPS TURNED UP DOING IT**
  (2026-10-07). Scott: "if you're leaving things open and not guessing, add the diagnostic to the
  export so we can hammer it down, make sure every skill and exercise video capture export gives
  the same diagnostic as well."
  **A REP MEASURED ON FIVE SAMPLES READS LIKE A REP MEASURED ON TWENTY**, in every field any
  export has ever carried. Replaying the 10-07 Pendlay row, rep 8 spans 0.550s on FIVE points and
  rep 7 0.759s on nine, on a take whose median cadence is 29.4Hz -- effective rates of 9-15Hz
  inside single reps, and every number for them computed over those points.
  `client/src/lib/trace-sampling.ts` is the one measure (samples, span, median interval, effective
  Hz, largest gap, dropouts past 3x the median, seconds lost in them, `cadenceHeld`), derived from
  timestamps the trace already carries so EVERY mode can report it -- native, web and Android
  alike -- and a replay offline computes the identical thing. It is NOT `liveCoverage`, which
  counts frames the CAPTURE discarded against a nominal rate and is native-only.
  **AND THE PHASE EDGES ARE ON EVERY REP** (`windows.openSpeedFraction`, `closeSpeedFraction`,
  `gapBeforeSeconds`, `gapAfterSeconds`, `phaseSamples`, `sampleIntervalSeconds`), because the
  phase is a CEILING on every window inside it and nothing could see where its edges landed. The
  fractions divide by the denominator `trimPhaseToDrive` itself thresholds on (`speedsMps` at the
  peak index), never `wholePhasePeak.peak`, which is read off a different array -- mixing them
  made the first run unreadable.
  **`skill_session_logs` HAD NO `trackingDiagnostics` COLUMN AT ALL.** Nine of the fifteen tracker
  dialogs -- every sprint, mechanics and horizontal-load tracker, so all 215 skill drills -- had
  nowhere to write one. `workout_set_entries` has carried one since 2026-09-16 and the skill half
  was never built, so a skill capture that went wrong left no account of itself. Column added and
  the migration run against a throwaway database, insert path and input schema wired.
  **AND THE EXPORT WAS WORKOUT SETS ONLY**, so even with a column a skill capture would have
  appeared nowhere: `getRecentSkillCapturesForAdmin` plus a `skillCaptures` key on the download,
  its own list rather than merged (a skill capture has no load, reps, bar path or range of
  motion). Additive, so every existing reader of the file keeps working.
  **The scan found one more than the plan did**, which is why it is a scan:
  `every-capture-says-how-it-was-sampled.test.ts` reads the dialog directory rather than holding a
  list and caught `swing-tracker-dialog.tsx` setting `trackingDiagnostics: null` under a comment
  saying the blob is native-only. Half true -- the sampling is not.
  `samplingOnlyDiagnostics` is the blob for a mode with a trace and none of the native machinery,
  nulling what it cannot honestly fill rather than zeroing it.
  **Still open and still not guessed at**: the bench's phase is shorter than the sensor's
  concentric. The edges say gaps are 0.000 and the short reps are sample-starved, which is the
  first mechanism tying `liveCoverage` to the numbers rather than to the video -- a hypothesis,
  recorded, NOT fitted. Calibration work: uploaded on commit.
- **BUILD 639 BESIDE THE OVR, 2026-10-07: THE TIMING REFIT LANDED AND SCALE IS ALL THAT IS LEFT.**
  Set 3 of each lift is the first take with `DRIVE_ONSET_FRACTION` at 0.04; sets 1 and 2 of the
  same session are the pre-refit control on 637.
  **The concentric window against the sensor went from -13.5% / -22.9% / -22.7% to +1.0% / -1.1% /
  +10.6%** (press, row, bench). Two of three inside 1.1%, on takes the fit was not made on.
  **And the mean's error is now arithmetic on the scale error.** Bench ROM is 21.3% low and its
  window 10.6% long, so the mean must read `(1-0.213)/(1+0.106)-1 = -28.9%` and it reads -28.6%.
  Nothing is hiding in the velocity computation.
  **THE SAMPLE-STARVATION HYPOTHESIS IS DEAD, KILLED BY ITS OWN DIAGNOSTIC ON ITS FIRST RUN.** The
  bench reports `sampling: {samples: 787, effectiveHz: 30, dropouts: 0, cadenceHeld: 1}` -- a
  flawless take -- and its ROM is still 21.3% low. Recorded as a hypothesis last session,
  disproved this one. It earned its keep elsewhere: the press lost 18 dropouts and 3.861s
  (`cadenceHeld` 0.854, largest gap 1.868s) and returned NINE reps for a ten-rep set -- the first
  miscount to arrive with a measured cause attached.
  **THE OBJECT WITNESS IS WRONG BY A FACTOR AND THE GATES WERE RIGHT ON ALL THREE.**
  `plateScaleIfAdmitted` (added build 633 for exactly this) against the scale each take needs:
  bench 0.001149 vs 0.004477 (**3.9x too small**), row 0.000986 vs ~0.004629 (**4.7x**), press
  0.001598 vs ~0.003112 (1.9x). Admitting the plate would have made every one far worse. The gate
  is not too tight -- the detector's box is wrong, and the cause is already recorded: the CoreML
  model is undertrained (barbell 3 labelled boxes, 225 of 266 images unlabelled). **Labelling that
  data is now the highest-value camera work in the repo.**
  **NOTHING WAS REFITTED AND THE EVIDENCE FORBIDS IT.** On the bench the two body rulers AGREE
  (`shoulder_width` 0.003502, `body_3d` 0.003525, 0.7% apart) and are BOTH 27% low -- Rule #4's
  failure exactly, body rulers corroborating nothing. The row is the opposite: shoulder 0.005892
  against body_3d 0.003367, truth between them at ~0.004629. Two takes, two contradictory
  corrections; fitting either moves the other the wrong way.
  **Caveat on the press, stated not fitted:** logged as a Barbell Shoulder Press, performed as a
  push press, and `axisForeshortening.ratio` is **1.452** against 1.029/1.036 on the other two. Its
  +13.1% ROM is not cleanly scale and must not be pooled until a press is filmed without the dip.
  **The 6fps video fix is confirmed on the phone**: `videoAsset.measuredFrameRate` 25.9 / 25.2 /
  39.9 against a 30 target, `skippedNotReady: 0` on all three. The bench's 39.9 is the 0.75 cadence
  slack's ceiling (its delegate got the full 120fps); harmless, recorded, not changed.
  **AND A FIX FROM BUILD 623 HAD NEVER REACHED THE PHONE.** Scott's screenshot showed the Barbell
  Shoulder Press still reading "Seated, bar at collarbone ... more than a standing Overhead Press".
  `seed.ts` has carried the standing text for two weeks; the insert loop creates an exercise by
  NAME and **nothing re-syncs `instructions`**, so the correction only ever landed on a fresh
  database. The posture LABEL was fixed at the time and is the half that moves numbers, so no
  measurement was affected. `CORRECTED_EXERCISE_INSTRUCTIONS` fixes it keyed on the exact wrong
  text, like `LIVE_DOCUMENT_PATCHES` -- a blanket re-sync would silently revert an admin's own edit
  on every deploy, and these rows are admin-editable. **Second instance of this class in two days**
  (the other was `videoEligible: false` surviving the canonical-list swap): a seed correction is
  invisible on a fresh database, which is the only kind the tests run against.
  Calibration work: uploaded on commit.
- **THE LEARNING LOOP EXISTED AND HAD NEVER BEEN SHOWN A CAPTURE** (2026-10-07). Scott, three
  times: "How do we make it so the ai overwatch learns? It should, we tried to build it before."
  **Overwatch itself learns nothing and must not.** `arbitrate()` is a PURE FUNCTION -- this
  frame's object centre, the body yardstick, recent spans from THIS take, returning one of four
  verdicts and keeping nothing. Rule #2 makes it the one arbiter owning no sensor; a model inside
  it would make it a leader. The only thing in the pipeline that learns across takes is
  `users.bodyModel`.
  **The loop he remembered IS real and complete**: `/admin/movement-knowledge` proposes a
  versioned `movementProfile`, an admin reviews, `applyMovementProfileProposal` archives and
  publishes with revert, and `summarizeTrackedSet` reads `positionScaleCorrection` off it. What
  was missing was the INPUT -- its whole prompt was "Passages retrieved from the library", so it
  proposed CAMERA thresholds from TEXTBOOKS and had never seen a trace, a ruler or a blend.
  **`summarizeScaleEvidenceForMovement` is the fix**: per scale ruler, its distance from the
  consensus that take used -- `median` (bias on this movement) and `spread` (measured variance) --
  plus `cadenceHeld`, the drive window's share of the phase, and rep-count mismatches. Both
  proposal paths carry it; a movement nobody filmed says so rather than implying evidence.
  **RESIDUALS, NEVER A CORRECTION, and the prompt says so in words.** A blanket
  `positionScaleCorrection` has been declined six sessions because the errors contradict each
  other (bench -21% beside press +13%, same day same athlete), and handing a contradiction to a
  model to average does not make it true. `reconcileScaleEstimates` is ALREADY inverse-variance
  weighted -- it is just being handed guessed variances, so a measured one is the honest version
  of a number that is currently invented, with no new mechanism.
  **It writes nothing, touches no arbiter, never sees footage, and carries no athlete.** The admin
  apply step is still the only thing that moves a live number.
  `the-camera-loop-learns-from-captures.test.ts` pins the shape, not the model's output.
  **Next, and not yet wired:** nothing reads the residuals straight into the blend's
  uncertainties -- the version with no model in the loop, which wants evidence to accumulate
  first. Server-side: ships on a Render deploy, no build.
- **OVERWATCH NOW REPORTS ON ALL 269, AND `framesFrozen` HAD NEVER REACHED AN EXPORT** (2026-10-07).
  Scott: "they will find frames and stick for no rhyme or reason because they don't know any
  better ... the ai overwatch, when it can learn, can figure out what's happening and can guide
  the cameras ... make sure every single camera system [has] this overwatch." That framing is
  right and this file already licenses it -- recognising a stuck tracker is a RULE, not a fitted
  number, so it is shared and every movement gets it at once.
  **CORRECTION to the first reading of the audit:** `AvOverwatch.judge()` DOES run on every frame
  of every mode, before either object tracker. What was wrong is that its findings went to one
  debug log line, and the only overwatch numbers in an export rode inside `objectLock`, gated on
  `coreMlDetectionEnabled` (= `coreMlTargetLabel != nil` = `trackingMode`, which jump, sprint,
  mechanics and horizontal-load still do not pass). So on those four it ran and was DISCARDED
  every take -- Rule #4's "indistinguishable from being off and worse". And on EVERY mode,
  including the ones with an object, **`framesFrozen` -- a tracker stuck on a frame, the single
  failure overwatch exists to break -- has never reached an export in this repo's history.**
  **`AvOverwatch.telemetry` ships on BOTH paths, gated on nothing**: `framesJudged` (the
  denominator), `framesFrozen` split into `framesFrozenByImage` (camera/decoder repeating) and
  `framesFrozenByLandmarks` (Vision returning a stale answer on a moving image -- the one that
  makes a tracker stick), `longestFrozenRun` (a blink against a lock), `framesBodySuspect`,
  `framesWithYardstick`, and the threshold it was judged by. Records and gates nothing (Rule #1);
  `judge()` is untouched and still makes every decision.
  `overwatch-reports-on-every-mode.test.ts` pins both emissions, that NEITHER is wrapped in the
  detector's flag (exactly how the four went silent), the split causes, the per-capture reset, the
  zod declaration, and that the telemetry getter contains no branch -- a getter that started
  deciding would be overwatch growing a sensor.
  **Why this is the prerequisite, not the thing:** nothing can be learned from a number nobody
  writes down. With these on every take across all 269, "this tracker sticks on this movement"
  becomes measurable for the first time, and a measurable claim is the only kind the learning loop
  can be handed.
  **STILL NOT DONE, named so it is not mistaken for finished:** the four implement-less trackers
  pass no `trackingMode`, so their object detector is inert and Rule #4's "name what it DOES have
  -- a box, a ground plane -- or record explicitly that it has none" is unmet.
  Native change: calibration work, uploaded on commit.
- **EVERY CAPTURE MODE NOW NAMES ITS OBJECT SYSTEM, AND TWO MORE SILENT MODES TURNED UP**
  (2026-10-07). This closes the item the overwatch-telemetry commit named as NOT done: Rule #4's
  "name what it DOES have -- a box, a ground plane -- or record explicitly that it has none, so
  overwatch's silence is a recorded fact and not an absence."
  **FOUR TRACKERS HAD ANSWERED BY SILENCE SINCE THEY WERE WRITTEN.** av-jump, av-sprint,
  av-mechanics and av-horizontal-load pass no `trackingMode`, so `targetLabel` returns nil, the
  detector is inert and `coreMlDetectionEnabled` is false -- and nothing in any export says
  whether that is a decision or a bug, because both look like an absent key. The 2026-10-04 box
  jump is the cost: the rectangle box detector DID run (`detectBox`) and the diagnostics read as
  though no object system existed.
  `shared/capture-object-system.ts` is the declaration, one record per tracker:
  `declared` ("coreml" / "box" / "none"), the CoreML class actually asked for on THIS take
  (per-exercise on the bar, fixed elsewhere), the secondary class, whether the box detector ran,
  and a sentence of reason for whoever reads the export. `declareObjectSystem` returns a FRESH
  record per take, like `cameraTunablesFor`. It is declared in `trackingDiagnosticsSchema` (zod
  strips what it does not declare; this has bitten twice) and printed as an "Object system" row.
  **It records and gates nothing** (Rule #1) and the test asserts no dialog branches on it.
  **The scan found two the plan did not**, which is why it is a scan and never a list:
  `kb-swing-tracker-dialog.tsx` and `medball-tracker-dialog.tsx` (the web halves) wrote NO
  diagnostics at all under a comment saying the blob is native-only. Half true -- the detector is
  native-only, the sampling measure and the declaration are not. Both now send
  `samplingOnlyDiagnostics`, so those two modes have a sampling read for the first time as well.
  The two horizontal-load dialogs wrote nothing either and now do.
  `every-capture-names-its-object-system.test.ts` scans the dialog directory, checks EVERY
  `buildTrackingDiagnostics` call site rather than just the file (a dialog with six and a
  declaration on five is the real bug), names the four implement-less modes explicitly, and pins
  the zod declaration. Whole unit suite green. Client change: calibration work, uploaded on commit.
- **ALL 266 TRAINING IMAGES ARE LABELLED: 43 BOXES -> 1611, BARBELL 3 -> 146** (2026-10-07).
  The undertrained CoreML model is recorded above as the cause of the object witness being wrong
  by a factor on every sensor-paired take (`plateScaleIfAdmitted` 3.9x / 4.7x / 1.9x too small on
  2026-10-07), and 225 of the 266 images in `training-data/med-ball/raw` were unlabelled. They
  are now all labelled: plate 465, dumbbell 430, med_ball 201, kettlebell 150, **barbell 146**,
  baseball 108, golf_ball 72, tennis_ball 39.
  **The 225 are also the half that matters.** They are 1440x1920 portrait with objects at 2-15%
  of the frame -- the geometry the phone hands the detector -- against 26-56% in the 41 close-ups
  labelled before. A detector trained on close-ups predicts boxes TOO LARGE, which a scale
  pipeline reads as a scale too small: the measured symptom exactly.
  Method and its limits are in `training-data/med-ball/README.md`: every box placed by eye at
  950px on a 20-cell grid and verified by eye on a contact sheet, the ORB carry between a clip's
  frames only ever a starting point (dropped or replaced wherever it drifted), 22 honest
  negatives, and the dense dumbbell racks recorded as COARSE rather than quietly presented as
  tight. `prepare_dataset.py` runs clean on all 266.
- **THE FAST MODEL IS `claude-haiku-5-5`** (2026-10-08, Scott: "switch the fast model to haiku
  5.5 ... everywhere"). `fastModel` in `server/ai.ts` was `claude-haiku-4-5-20251001`. Haiku 5.5
  REPLACES 4.5 and is newer AND cheaper, so this is not a downgrade and no quality call was made
  on anyone's behalf: **$1/$5 per MTok becomes $0.10/$0.50** for prompts of 100K tokens or fewer,
  which every call on this lane is by a wide margin. The headline 10x overstates it -- 5.5's
  tokenizer counts the same text ~30% heavier, so the real figure is nearer 7-8x. Context goes
  200K -> 1M, output 64K -> 128K.
  **THE ONE THING THAT COULD HAVE BITTEN, AND WHY IT DID NOT.** Haiku 4.5 thought only when asked;
  5.5 runs adaptive thinking BY DEFAULT, so a response can begin with thinking blocks and those
  count against `max_tokens`. That matters more here than anywhere because `callAnthropic`
  DISCARDS any response with `stop_reason: "max_tokens"` -- a 200-token cap eaten by thinking
  would not error, it would return null and the feature would quietly do nothing, which is the
  exact silent-degradation shape this file exists to prevent. Two properties make the lane safe
  and both are load-bearing: **every helper in `ai.ts` finds its block by `type`, never by
  position** (`content.find(b => b.type === "text" | "tool_use")`), and **eight of the nine fast
  call sites go through a FORCED `tool_choice`**, which returns the tool call with no thinking
  block at all. The ninth (pdf-vision page transcription) is free text at 4096. **A free-text fast
  call with a small cap is the shape that breaks, and it breaks silently** -- keep both properties
  if you add one.
  Also now a 400 rather than a quiet failure on 5.5: `temperature`/`top_p`/`top_k` at any
  non-default value, thinking `budget_tokens`, and an assistant prefill. `callAnthropic` sends
  none of them (checked); do not add them.
  **THE RATE TABLE IS PART OF THE CHANGE, NOT A FOLLOW-UP.** `routes.ts` asks `estimateUsd` for
  the dollar figure an admin sees BEFORE authorising a 400-page transcription pass, and a model
  with no rate on file returns null by design -- so shipping the id without the rate would blank
  that quote at the moment somebody is deciding whether to spend. The 4.5 rows are KEPT, not
  replaced: rollup rows are stored against the model id that spent the money, and deleting them
  would erase the before half of the comparison. `ai-usage.test.ts` holds the ratchet, derived
  from `fastModel` rather than hand-typed (a hand-typed list is what let the id and the table
  drift), and it was mutation-tested. The pre-flight's output estimate went 1,000 -> 1,300 tokens
  a page for the heavier tokenizer; input is left alone, being dominated by a page IMAGE, which
  is tokenised by pixel area and not by the text tokenizer.
  **One known limit, recorded not papered over:** Haiku 5.5 has TWO rate cards by prompt length
  ($0.10/$0.50 at <=100K, $0.50/$2.50 above) and `RATES` is one rate per model. The cheap card is
  on file because it is the one every call lands on today; a feature that starts sending this
  model six-figure prompts would be under-reported fivefold and needs the rate keyed on prompt
  length.
  **STILL TO DO ON RENDER, AND THE CODE CANNOT DO IT:** `ANTHROPIC_FAST_MODEL` is `sync: false` in
  `render.yaml`, so if it is pinned to the old id in the Render dashboard this change does nothing
  in production. Clear it (the in-code default is now correct) or set it to `claude-haiku-5-5`.
  **NOT changed and deliberately separate:** `defaultModel` is still `claude-sonnet-5`. Its
  successor `claude-sonnet-5-5` costs the SAME ($2/$10), but **forced `tool_choice` returns a 400
  on Sonnet 5.5**, and `askClaudeStructured` / `askClaudeVisionStructured` /
  `askClaudeFileStructured` all force a tool -- so that upgrade is free in money and not free in
  work, and it is its own decision. Server-side: ships on a Render deploy, no build.
- **THE BUILD NUMBER IS THE iOS WORKFLOW'S `GITHUB_RUN_NUMBER`** (`ios/fastlane/Fastfile`), so
  **a `verify_build` run consumes a number without producing a TestFlight build** -- which is why
  the numbering in this file has drifted twice. Read the run list, not the last number written
  down: run 623 `d33f942d`, 624 `d619c07d`, **625 `0daa3e6e` (landed)**, **626 `5cdd12aa` (the
  posture sweep + the filmable-54 audit, uploaded 18:55 and processing at Apple)**, 627 the
  branch `verify_build` for the arbiter plumbing. **The newest build is 686** (2026-10-23,
  `a0ef9305`, the eighteen-commit batch including four held calibration commits; 685 was its
  `verify_build`). Before it, **673** (2026-10-15, `34574c60`, the billing sweep's client halves
  and the twenty-commit backlog; 672 was its `verify_build`), and before that **657** (2026-10-09,
  `8364564e`, the retrained detector) was the newest for six days while 658-672 were all
  `verify_build` -- which is how the app came to be twenty commits behind. 674-684 were all
  `verify_build` runs too, which is why 686 follows 673 with twelve numbers between them. Runs 652-655 were that day's four
  calibration betas and **656 was the `verify_build` on the `.mlpackage` swap** -- the archive, the
  signing and Apple's own `--validate-app` all passed on the new model before the upload was
  spent, which is what makes a native change safe to ship rather than hopeful.
- **THE QUEUE IS EMPTY AS OF BUILD 657** (2026-10-09). Five betas went out this day, each one
  calibration work and so exempt from the batch, each uploaded on commit:
  - **652** `e044c56d` -- `plateBoxToExpectedRatio` and `capture-repeatability.ts`: the diagnostic
    that says whether a detected box is the right SIZE, with no sensor needed, which is what made
    everything after it scoreable on an ordinary day.
  - **653** `cb67688a` -- a lone plate no longer takes the whole scale (the build-594 guard was
    counting voters after the 3D-pose collapse). Row set 2: **-60.5% -> -1.1%**.
  - **654** `d283ec85` -- the grip says when the shoulder span cannot be right, carried as
    uncertainty and floored. Row set 1: **+23.1% -> -7.4%**.
  - **655** `b88d8850` -- 654's own regression, found within the hour: loosening a ruler was
    buying it the power to drag others into a cluster. `MAX_SCALE_AGREEMENT_TOLERANCE`.
  - **657** `8364564e` -- the retrained CoreML detector (box 2-7x too big -> 1.01-1.03x on
    held-out data) and the plate stating the detector's own measured noise. **656 was its
    `verify_build`.** This is the build to film on.
  Across the nine sensor-paired takes of the day, median absolute error **10.6% -> 5.4%** and
  worst case **60.5% -> 20.7%**. The row is the one lift still outside 15% and the retrained
  detector is the only remaining candidate for it; what proves or disproves that is one filmed
  set, read off `plateBoxToExpectedRatio`.
- **THE QUEUE IS EMPTY AS OF BUILD 686** (2026-10-23, `a0ef9305`, run 685 was its `verify_build`,
  which passed Apple's own `--validate-app`). Eighteen client-affecting commits over eight days
  since **673**, which is the batch working to its count -- and **four of them should never have
  been in the batch at all**, which is the lesson and the second time this rule has swallowed
  something its own exemption covers.
  **THE CALIBRATION WORK WAS HELD, AND HOLDING IT IS WHAT STOPS THE EVIDENCE.** This file says a
  change "whose whole purpose is to make the next filmed set measurable ... is worthless on
  `main`: it only produces evidence once it is on the phone that does the filming", and to push
  `beta` the moment such a change is committed. Four such commits waited three to eight days:
  **`839f8756`** (the biometric release asked of every role that films), **`d361e679`** (the RDL's
  3D-pose collapse diagnostic), **`e91220e1`** (five fitted numbers into the registry) and
  **`46b6df51`** (four more trackers reading their own record, plus the height ruler's refit that
  had never reached two of them).
  **`839f8756` IS THE ONE THAT WAS BLOCKING EVERYTHING BEHIND IT.** The 10-19 session filmed three
  lifts beside the OVR, every save returned 200, every clip 201, and the capture export came back
  EMPTY -- four athlete-only gates in a row, so an admin was offered Record and never asked for the
  release the capture gate requires. Until that client half is on a phone Scott cannot accept the
  release on the admin account, and until he does every filmed set keeps losing its trace. So this
  upload is the prerequisite for the next calibration session, and it sat on `main` four days
  behind a counter.
  **THE SECOND TRIGGER THE 673 ENTRY ADDED WAS THE RIGHT IDEA AND THE WRONG ONE.** It said a change
  that alters what the app CLAIMS about money, or that App Review would read, ships on its own
  upload. True, and it names a category the exemption list already had: calibration. The rule to
  read off both failures is that **the batch counter governs only work whose value is not
  time-sensitive**, and anything with a named consequence for being late -- a compliance fix, a
  we-are-charging-you correction, a change that unblocks a filming session -- is not that.
  **Two lockfile bumps reach the phone and are why 685 ran.** `vite` 6.4.3 -> 6.4.5 is the build
  tool that produces the bundle compiled into the binary, and `@capacitor/ios` 8.5.0 -> 8.5.2 is
  native through SPM (`ios/App/CapApp-SPM`, regenerated by `npx cap sync ios`), so a lockfile-only
  diff was a native change -- the same argument the 10-06 Capacitor entry makes.
  Also in it: the role survey's two client halves (**`6157bae9`**, every self response carrying the
  twelve flags, and **`6e2a63c1`**, the guardian asked for nothing and finally able to read their
  notifications); the profile-dialog chain of 10-19 (**`64a237f9`** never mounted for an admin,
  **`4cc6f798`** the shell's second account menu, **`89934668`** the Edit profile item for every
  filming role); **`a07e0412`**, the prerendered public page bodies (+9.4 kB gzipped on the eager
  entry, which the native app pays for pages it never shows -- known, and the reason nothing larger
  goes eager on that argument); the launch and promo codes (**`d07ea61f`**, **`3aedf553`**,
  **`c5868870`**); **`d1a25474`**, a claimed guardian invite leaving the page instead of drawing
  "Link not valid" over a claim that worked; **`b6a0ba32`**, the debug console; and **`fe0ea07c`**,
  clearing a plan warning that the provider is still charging.
  **Clear this entry on the next upload rather than adding to it.**
- **THE RDL'S +12% IS THE 3D-POSE COLLAPSE, AND NO CONSTANT MOVED FOR IT** (2026-10-19, the
  first calibration session on the admin account; three lifts beside the OVR -- Back Squat,
  Romanian Deadlift, Box Jump, and only those three).
  **THE PIPELINE DID NOT CHANGE SINCE `e40ea299` (2026-10-09); THE INPUT DID.** `heightIn` 75
  reached the athlete row for the first time today (the four-gate profile-dialog fix earlier the
  same day), which switched ON the `height` ruler and the `shoulder_width` ruler and changed
  `body_3d` and `depth` through `correction = 1.905 / 1.80 = 1.0583`. **So an RDL that read -3.7%
  on 10-08 reads +12.0% today with no code change between them** -- the 5%-then-40% shape Scott
  named, caused by a new input rather than drift, and invisible to every test because no test has
  a height on file. **The accuracy ledger is the answer to that and is BUILT as of
  2026-10-23** (`shared/accuracy-ledger.ts`; see "THE LEDGER, AND THE TWO GUARDS THAT CERTIFIED A
  BLEND NO BUILD EVER PRODUCED" below): a committed row per sensor-paired take carrying its INPUTS
  (every ruler's stated uncertainty, whether the height ruler voted, the shipped scale, both
  ranges of motion) beside its error, so the next jump is attributable in one read. Four rows
  today and none of them this session's -- these takes' own inputs are still unrecorded, and a row
  for them wants the export rather than a back-guess.
  **The collapse IS the whole error, measured.** `body_3d` is **-1.1%** of the scale the sensor
  requires and `depth` **+27.1%**; they are one sensor and vote once at their geometric mean
  (Rule #2, build 578), which is **+12.1%** against a blend of +12.0%. Set 1 repeats it exactly
  (-0.8%, +35.3% -> +15.8%, blend +16.4%). **The Back Squat is the control and reads -1.5%** only
  because a standing lift keeps its height ruler and its `shoulder_width` reads 6.6% LOW, dragging
  the blend off the same +13.5% collapse; the hinge has no witness on the other side, so it is left
  averaging a good reading with a bad one. Replays reproduce every shipped `scaleFactor` to eight
  decimals.
  **TWO FIXES WERE MEASURED AND BOTH REJECTED, and the numbers are in the notes so nobody retries
  them blind.** Carrying the in-plane value and stating the pair's split as uncertainty takes the
  RDL to 7.6% / 12.9% and **reds three pinned OVR guards** (`a-lone-plate-never-takes-the-whole-scale`
  twice, `height-ruler-uncertainty`) -- it moves takes already measured against the sensor, so its
  cost is known and negative. Widening the collapsed witness's uncertainty alone changes nothing
  (the RDL has two voters and `MAX_SCALE_AGREEMENT_TOLERANCE` already caps the window at 0.4) and
  makes set 1 worse. **`FITTED_OVERRIDES` stays empty.**
  **What ships is one diagnostic**: `collapsedPose3d.disagreement` (high over low, order-independent)
  and `.higher` (which of the pair read high -- `depth` on all four takes, which is the pattern to
  watch). Records and gates nothing (Rule #1); the collapse is byte-identical and the test asserts
  the RDL's scale with the field ignored. Two weeks of exports carried both input scales and nobody
  divided them.
  **AND `depth` READS HIGH ON ALL FOUR TAKES** (+27.1 / +35.3 / +22.1 / +13.9%), with a mechanism:
  `DEPTH_RULER_BIAS` (0.9) was fitted 2026-09-29 when no height was on file and the correction was
  1, and `inPlaneSamples` multiplies the wrist depth by the correction exactly as it does a bone.
  **A hypothesis with four same-day points, NOT a fit** (Rule #5) -- 1.0583 does not account for
  +27% alone.
  **ALSO FOUND, label not code: the box jump's gravity ruler stood down on a jump squat.** `usesBox`
  reads `boxHeightIn` on the exercise row, so a jump squat logged against Box Jump is modelled as a
  jump onto a box and the gravity ruler correctly abstains (build 619). Clear `boxHeightIn` or film
  it against an exercise with none. And **`measuredPosture.torsoFromVerticalDeg` reads 1.53 on a
  hinge** where an RDL approaches 90 -- worse than the 7.13 flagged on 10-08, and the one
  independent check that a posture LABEL matches the posture FILMED. Open, named, not fitted.
  **NOTHING IN THIS SESSION TOUCHED THE PENDLAY ROW**, asked directly by Scott ("we are only
  testing squat, box jumps, and rdls, you don't have data to ship to pendlay") and he is right.
  The leak that exists runs the other way: the grip floor (`d283ec85`) and
  `MAX_SCALE_AGREEMENT_TOLERANCE` (`b88d8850`) are NUMBERS fitted on Pendlay takes on 10-09 and are
  SHARED, so they reach all three lifts he is filming. By this file's own rule that is the defect
  shape; the lone-plate corroboration count (`cb67688a`) is a RULE and may be shared. Recorded, not
  moved on a filming morning.
  See docs/camera-tracking-notes.md, "The RDL's +12.0% is the 3D-pose collapse". Calibration work:
  uploaded on commit.

Two things worth saying out loud when someone tests this:
- **The gate is native, the evidence is not.** The arbiter runs in the build,
  but its telemetry is only readable on the admin tracking report, which is
  served from `storage.ts` and ships on a Render deploy. Testing report changes
  by installing a build will show nothing.
- The Institutional Service Agreement is with the attorney alongside the four public
  documents and has not been sent to any school. Since 2026-09-19 a school's primary
  coach can fill in their own details on /documents and download it as a PDF
  (`shared/institutional-service-agreement.ts` is the text, `server/institutional-agreement-routes.ts`
  fills it). Since later that day it can be SIGNED in the app: the primary coach reads the
  text on /documents, ticks that they are authorised and have read it, types their name, and
  `POST /api/coach/institutional-agreement/sign` writes the signed PDF as an ACCEPTED
  `institutional_agreement` waiver (reviewSource `in_app_signature`), an
  `institutional_agreement_signatures` row (the evidentiary record: text hash, IP, user agent,
  typed name; insert-only) and a consent record. Paper stays as the fallback. Downloading a
  copy never writes a record -- only signing or uploading does. The agreement text is still
  under attorney review; a change to it changes the hash on every later signature, which is
  the point of storing it.

## Coaches Corner: worth the $19.99, and what counsel said about the textbook

Added 2026-10-03. Scott: "we have the cscs book uploaded now ... can we add verbiage to those
classes? quizzes? build more classes? make it worth its value" and then "we bought the cscs
book, but can we profit from it?" Counsel answered the same day (docs/legal-open-questions.md,
questions 12 and 13), and the answers shape everything below.

- **An outside textbook never feeds paid content.** Copyright turns on market substitution and
  the publisher's EULA forbids ingestion; without an express licence, no retrieval over the book
  reaches a subscriber. `knowledge_sources.derivedContentLicensed` is the gate: false by default,
  set by an admin only with the licence written into `licenceNote`, and
  `searchKnowledgePassages({ licensedOnly: true })` is what the Coaches Corner draft and the
  citation pass read. **The AI assistants READ THE WHOLE LIBRARY, book included, by Scott's
  decision** (2026-10-04, reverting a same-day change that had narrowed them to licensed
  sources: "i want everything to read the book, we will be uploading others materials, and as
  long as we are summarizing we are fine"). The chat coach, both program-builder paths,
  nutrition, readiness and the class drafter retrieve across every source. Counsel's position
  (question 12) is recorded and was put to him; this is his call and it stands until he changes
  it. Do not re-narrow the assistants on counsel's note alone.
- **Paraphrasing the book is NOT the loophole** (counsel, 2026-10-04, question 14, on Scott's
  "there is no plagiarism for paraphrase"): a chapter-by-chapter paraphrase sold as a course
  copies the book's selection and arrangement and is market substitution. What IS allowed is
  what every track and class already does: Forge's own outline first, written from general
  knowledge across sources, the book used only as a fact reference. Never start a track from
  the book's table of contents, its examples, analogies or charts. The EULA point is about
  machine ingestion of the file, which is why the AI draft gate stays.
- **"Ask the library"** (`askCoachesCornerLibrary`, `POST /api/coach/academy/ask`) answers from
  Forge's own tracks and principles only, cites the lessons it used as chips that open them, and
  says when the library does not cover a question. Stateless.
- **The admin builder drafts from licensed sources** (`generateAcademyTrackDraftFromLibrary`):
  lessons, a ten-question quiz and the AI principles in Forge's own words, page citations under
  each lesson, and `server/academy-draft-guard.ts` refusing any lesson that repeats more than
  twelve consecutive words of a passage. "Find citations" attaches further reading by retrieval
  alone. `academy_lessons.sources` carries citations as page pointers, never text.
- **Quizzes are scored on the server** (`academy_quiz_attempts`, 80% in `shared/academy-quiz.ts`,
  best attempt counts); a track is complete when every lesson is read and the quiz passed, and
  only then does `GET /api/coach/academy/tracks/:id/certificate` issue a printable certificate
  that names Forge and no certifying body.
- **Twenty-four tracks.** The original seven, six written 2026-10-03 (energy systems, speed and
  agility, plyometrics, warm-up and recovery, testing, technique and safety) and eleven written
  2026-10-04 on Scott's "All of them. Every chapter" (muscle and force, biomechanics, adaptation,
  hormones and sleep, fueling, supplements and substances, writing a resistance program, aerobic
  programming, the mind in performance, women/older/returning athletes, the facility and duty of
  care), all in `server/seed-data/coaches-corner/`, each four lessons and eight questions, added
  by title on deploy. The eleven are Forge's own syllabus of the field, written from general
  knowledge with no book open (question 14); the topic list is the FIELD's, not any book's.
  Five learning paths. `tracks.test.ts` checks shape, the marks, and that no two lessons across
  all seventeen repo-written tracks share a long run.
- **No certification mark on any surface.** "CSCS-aligned" is gone from the upsell card and
  `client/src/lib/no-certification-marks.test.ts` refuses CSCS and NSCA in client pages and
  components. A coach's own credential in their bio is theirs to state.
- **Added 2026-10-04, Scott's list ("Yes 1 ... yes 15"):** every track lesson can carry
  flashcards (`academyLessons.flashcards`, no on/off switch, an empty list is off) and the
  track quiz takes the same four shapes as the class quizzes (`academyQuizQuestions.questionType`
  / `payload`, graded by `shared/class-quiz-grading.ts`; the key never leaves the server before
  grading, and the old `picks` body still grades). The quiz and flashcard editors live in
  `client/src/components/lesson-quiz-editor.tsx` and BOTH builders draw them. A coach's private
  note per lesson (`academy_lesson_notes`, nobody else's route reads it). "Flag this lesson"
  needs a reason of at least ten characters (`academy_lesson_flags`; Scott: "flagging is
  useless if they can't say why"), worked on the admin analytics page. Every track shows its
  release date and wears New for thirty days (which since 2026-10-11 is the only thing that
  tells a coach new content arrived -- the monthly digest that also named them is deleted).
  "Apply this to my roster" at the end of a track seeds Ask the library with the roster toggle
  on. The Continue row (in-progress tracks, most recently read first, opening at the first
  unread lesson) sits at the top of the library; the certificate wall (every finished track
  and path, dated) sits at the BOTTOM, on purpose.
- **Read-aloud is BUILT AND SWITCHED OFF** (`READ_ALOUD_ENABLED = false` in
  `client/src/components/read-aloud.tsx`; Scott, 2026-10-04: "remove the option, we don't know
  if anyones going to even use it, so once it becomes a need we will add it"). The code stays:
  `server/read-aloud.ts`, `shared/read-aloud-text.ts`, the routes. With the flag on, every
  class page and every track lesson has a Listen control.
  With no provider it reads with the device's own voice and SAYS SO (Scott asked for a real
  voice, and the device voice is not one). A natural voice needs `READ_ALOUD_PROVIDER=openai`
  and `OPENAI_API_KEY` on Render, which are Scott's to set; then a page is narrated ONCE, cached
  under `STORAGE_PATH/narration` keyed by provider, voice, model and text, and served public by
  URL like a lesson video. `READ_ALOUD_VOICE` (default alloy) is the one narrator for the whole
  library. The admin preview uses the device voice only. Anthropic offers no text-to-speech, so
  this is a second provider and a second bill, logged to the console per narration.

Later the same day, Scott: "what else can we build/add for the coaches corner?" and then "build
it all in order" less office hours, session plans, printable handouts, program templates and
lesson video. What landed:

- **THE PEER DISCUSSION BOARD IS GONE** (2026-10-11, Scott: "i don't want a discussion board so
  delete that too"). It existed 2026-10-03 to 2026-10-11: `coach_discussion_threads`, `_replies`,
  `_reports`, nine coach routes under `/api/coach/discussion`, six admin ones, the Discussion tab
  on `/coach/coaches-corner`, `/admin/coaches-corner/reports`, the board paragraph of the monthly
  digest draft and the two counters on the analytics page. All removed, and the three tables are
  DROPPED by `reconcile-schema.ts` (IF EXISTS, reports then replies then threads, proven on a
  database that had them and on a fresh one). **The App Store listing text for the add-on still
  reads "Coach library, programs and peer discussion"** -- that is in App Store Connect, not the
  repo, and is Scott's to edit; nothing in the app or the review notes points at a board now. Do
  not rebuild it on the strength of that listing line.
- **Learning paths** (`academy_paths`, `academy_path_tracks`): ordered sets of tracks for a kind
  of coach, three seeded (`COACHES_CORNER_PATHS_2026_10`, by track title, created once), edited
  on the admin Coaches Corner page. A path is complete when every track in it is, and earns its
  own certificate (`/coach/coaches-corner/path-certificate/:id`). `academyProgressForCoach` in
  routes.ts is the one progress computation the catalog, the paths and both certificates read.
- **THE MONTHLY DIGEST IS GONE** (2026-10-11, Scott: "remove the monthly digest i have no idea
  what that even is, just delete it in totality, no need"). It existed 2026-10-03 to 2026-10-11:
  an admin drafted "what's new in Coaches Corner" from the last thirty days, tested it on
  themselves and sent it to every coach holding the add-on with `notifyEmail` on, reusing the
  launch list's campaign table under `audience = "coaches_corner"`. All removed -- four admin
  routes under `/api/admin/coaches-corner/digest*`, `coachesCornerDigestRecipients`,
  `AdminCoachesCornerDigest` and its render on the admin Coaches Corner page, and
  `coaches-corner-digest.itest.ts`.
  **AND SO IS THE SHARED PLUMBING THAT ONLY IT USED, WHICH IS THE HALF A DELETION USUALLY
  LEAVES BEHIND.** Four `storage.ts` methods (`listCoachesForDigest`, `findRunningCampaign`,
  `createCampaign`, `listCampaigns`) had the digest as their ONLY caller -- the launch list runs
  its own inline queries in `email-list.ts` -- so they went with it, and the
  `emailListCampaigns` import with them. `runCampaign` loses its optional `recipients` list and
  its `brandForUserId` pass-through (the launch list always took the `??` fallback), and
  `CampaignRecipient.unsubscribeUrl` is `string` rather than `string | null`, because the
  nullable link was what selected the SECOND footer: "your Forge account has Coaches Corner,
  turn off email notifications". A sentence about an account entitlement in a renderer nothing
  reaches with one is exactly the stale copy that reads as live.
  **The simplification is now load-bearing, not incidental**: `email-list.test.ts` asserts every
  rendered campaign email carries an Unsubscribe anchor and neither sentence of the old footer,
  and that the nullable type has not come back -- a PUBLIC mailing with no way out of it is not
  a style choice, and before this the renderer could represent one. Two mutations, both caught.
  **What is NOT deleted, on purpose: any `audience = "coaches_corner"` row already in
  `email_list_campaigns`.** A campaign row is the record that mail really went out, and erasing
  a sending record is a different act from deleting a feature. The launch-list screen filters on
  its own audience, so those rows are invisible rather than mislabelled; say the word and they
  go in one statement. The column is plain `text` with a default and no enum or check
  constraint, so none of this needed a migration.
  **Not to be confused with the WEEKLY digest** (`athlete_digests`, `coach_digests`, the
  dashboard cards, the AI calls at 450/500 tokens), which is a different feature and untouched.
- **Ask the library takes the roster, opt in per question** (`getRosterContextForCoach`):
  aggregates only (count, ages, sports, positions, season phase, teams), never a name. The model
  does not need the names and so does not get them.
- **Completion analytics** at `/admin/coaches-corner/analytics`: per track started, finished,
  quiz attempts and pass rate, per lesson read-by, and the questions most coaches miss
  (`academy_quiz_attempt_answers`, written with every attempt). Counts only; no coach is named
  and the test asserts it.
- **Coach-submitted questions** (`coaches_corner_questions`): "This didn't answer my question"
  on any chat answer files the question and the answer that fell short; the admin reads the open
  list on the analytics page and resolves each. The next track is written from this list.
- **Migration order matters in `reconcile-schema.ts`.** Twice in this batch a new CREATE or
  ALTER referenced a table created later in the file and only a fresh `db:reconcile` caught it
  (the integration harness runs the file on an empty database). Run it against a throwaway
  database before pushing any migration edit, as the Tests section says.

## Classes for athletes: flashcards, four quiz shapes, notes, the coach's view, two new classes

Added 2026-10-04. Scott: "is there a way for us to make ai flashcards? Or have the coach set the
flashcards? Can we turn that on/off? ... Can we add like a drag and drop quiz? Or fill in the
blanks? ... we only have the one lesson, let's add some more, we cater to multiple sports" and
then "Build it all in order and what you suggested". Coaches already create classes
(`POST /api/coach/classes`); Forge-official classes stay admin-only. Nothing changed there.

- **Flashcards are per lesson and off by default** (`classLessons.flashcardsEnabled`,
  `flashcards`). Typed in the builder or drafted from the lesson's pages
  (`POST /api/classes/lesson-flashcards/draft`). The reader runs them between the reading and
  the quiz; a lesson with them off serves none, and the cards stay stored.
- **Four quiz shapes, one grader.** `shared/class-quiz-grading.ts` grades multiple choice,
  fill-in-the-blank (`___` in the text, `payload.accepted`, compared after normalising), ordering
  (`payload.items`) and matching (`payload.pairs`) on the server AND in the builder's preview.
  `athleteFacingPayload` shuffles ordering items and matching rights ON THE SERVER, so the wire
  order never carries the key. The key comes back only on the graded result. "Draft quiz from
  this lesson" (`POST /api/classes/lesson-quiz/draft`) mixes the shapes.
- **Every quiz attempt is kept** (`class_lesson_quiz_attempts`, one right/wrong per question,
  never the athlete's text). `GET /api/coach/classes/:id/insights` is the coach's view: which
  questions each athlete missed, which the roster misses most, and each athlete's notes.
  Scoped exactly as the roster is. Admin has no twin; the builder shows it under
  `/api/coach` only.
- **Notes are the athlete's, per page** (`class_lesson_notes`), written from the reader, read
  by the athlete and by the coach who enrolled them, never by another athlete. The panel says
  so. An empty save deletes the row.
- **A class carries a reading level** (`classes.readingLevel`, `shared/class-reading-level.ts`)
  that every AI draft for it reads (pages, cards, quiz) and the catalog card shows. Null reads
  as high school.
- **The reader** shows a progress bar and a minutes estimate (`client/src/lib/lesson-reading.ts`,
  200 words a minute), draws a "Key points:" block as a boxed summary and "> " lines as a
  pull-quote (syntax in the builder's hint and the AI drafter's prompt), and sizes every photo
  the same. Every hitting chapter now ends on a Key Points page.
- **A drill can carry its own clip** (`skill_program_exercises.videoUrl`, set in the class
  builder) which the drill day plays inline ahead of the drill's library video.
  `client/src/lib/video-embed.ts` is the one embed helper, shared with the reader.
- **The learning streak** (`shared/learning-streak.ts`): consecutive UTC days with a lesson read
  or a quiz sat, in any class, on the athlete's progress payload. **The class certificate**
  (`/athlete/classes/:id/certificate`) issues only once the enrollment is complete, names Forge
  and no certifying body.
- **Repo-written classes** live in `server/seed-data/forge-classes/` (`ForgeClassContent`):
  drills by NAME from the skill library (the seed throws on a missing one), six chapters each
  with pages, a Key Points page, cards and a mixed quiz. `server/seed-forge-classes.ts` creates
  each once by name and re-syncs pages, cards, level and quiz every deploy; the drill tree is
  left alone because session logs hang off it. Eight classes (Scott read the first two,
  2026-10-04: "Those two classes look good, build the rest"): Fundamentals for Every Athlete
  (first in the catalog, middle-school level, category "Fundamentals" and so no sport's),
  Pitching, Basketball shooting, Football receiving, Soccer attacking, Volleyball, Wrestling,
  Track sprinting. `classes.test.ts` pins the shape, the drill names against seed.ts, every
  question against the input schema, that no two pages share a twelve-word run, and no camera
  accuracy claim. Wrestling's top chapter defers every turn to the coach on the mat; keep that
  line. The Fundamentals camera chapter says exactly what `camera-accuracy-copy.ts` says and
  never where to stand (Rule #1); keep both.
- **ONE PRICING RULE FOR EVERY FORGE CLASS: ALL CLASSES, $19.99 A MONTH** (2026-10-04, in
  three steps the same day: "yes 14" (chapter one free, the rest with the camera plan), then
  after seeing the catalog's size "make it a monthly purchase of $19.99", then "for all free
  agents ... i want to bar athletes from it, they have access to the classes, but only the
  ones their coach gives to them"). `shared/class-pricing-rule.ts` and `ALL_CLASSES_ADD_ON_ID`
  in `shared/free-agent-tiers.ts`: a Free Agent add-on on top of any tier, Apple product
  `...addon.all_classes_v1` (its own group, never the tier group), Stripe
  `STRIPE_PRICE_FREE_AGENT_ADDON_ALL_CLASSES`. Chapter one of every Forge class is the free
  preview; every chapter after it needs the add-on. A COACHED athlete never buys it and never
  meets the wall: they read every chapter of the classes their coach enrolled them in, and
  nothing else (the catalog is Free-Agent-only already). No tier includes classes. No seeded
  chapter carries a price (the hitting class's $49.99 chapter two is cleared on deploy); the
  per-lesson purchase machinery stays, unused. The gate is `classTierGated` in routes.ts,
  passed into `getClassProgressForAthlete`, `recomputeClassProgress` and the enrol path as
  `tierGated`: a gated chapter is `locked_tier`, unreadable through the content route, never
  on the calendar, and the chapter row offers the add-on (`AllClassesCard`). Beta, a trial and
  enforcement-off open it like every add-on, so nobody meets the wall while nothing is
  charged. `server/class-pricing-rule.itest.ts` proves the gate; the class builder says the
  rule above the lessons.
- **The Classes landing and the catalog** (2026-10-04): the athlete's sport first with a "For
  your sport" label (`shared/class-sport-match.ts`, decided on the server as `forYourSport`);
  Continue on every enrolled class opens the reader at the last page read (the page index is a
  per-browser convenience in localStorage, `startAt: "resume"`) or at the quiz that is left
  (`my-classes.next`); the review deck at `/athlete/classes/review` deals every card from
  every lesson read, across classes, shuffled on the server; the streak and every certificate
  sit at the BOTTOM of the page on purpose (Scott: "yes 11 at the bottom").
- **The hitting class's chapter pages carry no video** (Scott, 2026-10-04: "remove the links
  in the search, since the videos are empty"). The YouTube search links are gone; the slot is
  `videoUrl` on the page and a real clip goes in when he sends one. An unverified id is an
  invented screen (Rule #3), so none is guessed.
- **THE 2026-10-08 PROOFREAD, AND HOW A TRACK CORRECTION REACHES PRODUCTION.** Scott: "read
  over the athlete and coaches classes, just check for spelling, grammar, and make sure the
  information actually matches." All nine athlete classes (the eight plus American Hitting) and
  all twenty-four Coaches Corner tracks were read in full, by file ownership, five sessions in
  parallel. Spelling is US everywhere now (the Coaches Corner tracks were UK-spelled in fourteen
  files: "practise", "fibre", "favour", "centre"; 87 words moved). Information fixes worth
  knowing: the corner three is NOT the shortest three on a high-school court (NFHS is one even
  arc; page, flashcard and fill-blank all said it was), a red dot is a slider's spin not a
  curveball's, a high crotch has the head OUTSIDE the hip, riding time is a college rule, a
  back-row setter may attack from behind the line, RPE is a Rating, the moment arm is the
  DISTANCE (the track called the product the moment arm, three places), the strength profile
  caps at twelve reps not six, the readiness score reads hydration, a wrestler's periods are
  folkstyle's three-by-two, and "Forge's asymmetry flags are built for exactly this read" now
  carries the camera caveat. **Rule #1 reached the classes too**: eleven sentences told the
  athlete where to film from ("from the side", "down the line and from the pitcher's view") and
  now say "the same way each time". Left as written and worth a coach's eye: the hitting class's
  "later, deeper" cue on a high pitch; soccer's "the other eighty-nine" minutes (a high-school
  game is eighty).
  **A CORRECTED TRACK LESSON NEVER REACHED PRODUCTION BEFORE THIS.** The athlete classes re-sync
  pages, cards and quiz on every deploy (`seed-forge-classes.ts`), but a Coaches Corner track is
  created by title once and its lessons never touched again, because an admin can edit them from
  the builder -- so every text fix above would have landed on a fresh database only, the Barbell
  Shoulder Press instructions bug in its third home. `server/seed-coaches-corner-lessons.ts`
  (`resyncRepoTrackLessons`, called from the track seed) overwrites a stored lesson or quiz
  question ONLY when its current text hashes to a version Forge shipped
  (`shipped-lesson-hashes.ts`: `SHIPPED_LESSON_CONTENT_HASHES`, `SHIPPED_QUIZ_QUESTION_HASHES`,
  append-only; the first 96 and 157 are the text at `00ce07df`, before the proofread). An
  admin-edited row hashes to nothing there and is left alone and named in the deploy log.
  Questions and answers are updated IN PLACE by orderIndex, never deleted, because attempts hang
  off their ids. **After editing any track, run `npx tsx scripts/record-shipped-lesson-hashes.ts`
  and commit**: `shipped-lesson-hashes.test.ts` fails until the new version is recorded, which is
  what lets the correction after this one recognise it. `coaches-corner-lesson-resync.itest.ts`
  proves all three branches on real rows. The original seven tracks moved out of `seed.ts` into
  `seed-data/coaches-corner/original-seven.ts` for this (byte-identical plus the proofread), so
  `ALL_COACHES_CORNER_TRACKS` is the one list. Server-side: ships on a Render deploy, no build.

## Full Personalization: the Branding page, and what it reaches

Added 2026-10-03. Scott: "if cal berkley used us, can they change everything to blue and gold?
every single thing", with Powered by Forge watermarked everywhere, and "make sure there is a
place to actually edit it all in the coaches/admins profiles ... in order of how the app
appears, login page first, landing page, emails, so on and so forth." One add-on, Full
Personalization at $24.99 (included for rosters over 20); the old Custom Colours and Team
Identity add-ons are folded into it.

- **One page edits all of it:** `/coach/branding` (`client/src/pages/coach/branding.tsx`), six
  sections in the order the app appears -- login, home, emails, athlete screens, public page,
  everywhere -- each previewing the REAL component in the draft brand. The shell's Branding menu
  item goes there; the org `TeamBrandingDialog` is gone from the shell and the team-scope one
  stays on the roster. Pull-colours-from-a-logo (`client/src/lib/image-colors.ts`) and a saved
  palette answer "some schools have weird colours": any hex was already accepted.
- **The look is more than two colours.** `users.brandBackgroundHue` / `brandBackgroundStrength`
  (the neutral ladder in `index.css` is `calc(N% * var(--neutral-sat))` under `--neutral-hue`),
  `brandHeadingFont` (`shared/branding-options.ts`, loaded by `ensureBrandFontLoaded`),
  `brandSlug` (the program's address: `/team/<slug>` and `/login?team=<slug>`, one per program,
  409 on a clash) and `brandSenderName`. `computeBrandingStyle` is the ONE function that turns
  a brand into CSS variables; every branded screen calls it, including the public page.
- **The screens before sign-in wear the brand the visitor last saw.** `remembered-brand.ts`
  keeps the last effective brand in localStorage and reads `?team=` on the login link, so an
  athlete's login screen is their program's, not Forge's. `BrandedMark` draws the logo and
  name there, with Powered by Forge under it.
- **Emails wear the program too, and never drop the word Forge.** `sendEmail({ brandForUserId })`
  rewrites the shared header after the fact (`server/email-branding.ts`): band colour, logo,
  team name, "Powered by Forge" in the band, buttons recoloured, "Sent by <program> via Forge",
  and a From line of "<sender> via Forge" on the verified address. Every builder keeps its
  orange header as written -- the rewrite is the one place -- and HTML without that header is
  left alone rather than half-branded. `POST /api/coach/branding/test-email` sends the welcome
  email to the coach's own inbox. The lookup is one more await before a fire-and-forget send, so
  a test clearing `testOutbox` after a sign-in filters on recipient or subject, never count.
- **Charts:** the second series is `--chart-2`, the program's secondary when set, the old blue
  otherwise. Canvas colours (`video-overlay.ts`, `share-card.ts`, the watermark) stay Forge's:
  the watermark IS the Powered by Forge mark and the overlay is diagnostic.
- **Not changeable:** the app's name and icon on the phone (Apple's build, not a setting), and
  the Forge mark that says Powered by Forge.
- `server/branding-page.itest.ts` proves the slug rule, the athlete's effective look, the test
  send and a branded password reset beside an unbranded Free Agent's.

## The launch email list

Added 2026-10-02, the night the site went up behind "Coming soon". Scott: "can we have people
signup to like a newsletter or email list? way to mass emails to everyone for discounts or
something, and then obviously before we launch have people sign up to an email list."

- **One form, two places.** `EmailListSignup` (`client/src/components/email-list-signup.tsx`)
  on the coming-soon card and in the marketing footer; `POST /api/public/email-list`. The
  rules live in `server/email-list.ts` and `server/email-list.itest.ts` proves each.
- **Joining never says whether the address was already there.** Same answer for new, repeat
  and re-join, so the form cannot be used to test who is on the list.
- **The link in the email never acts.** `/unsubscribe?token=` is a page with one button; the
  POST is what writes. Mail scanners fetch every link. Same rule as the new-device email, and
  `server/email-list.test.ts` refuses a GET unsubscribe route.
- **Unsubscribing keeps the row**, flagged. A re-join is the person's own act from the form,
  never a side effect of a send or an import.
- **Recipients are read when the send starts**, never from the count the admin screen showed.
  The send runs in the background and the campaign row carries its counters; the screen polls.
- **Admin screen** at `/admin/email-list` (nav: Email List): counts, CSV of the active list,
  send-a-test-to-myself, send-to-everyone, every mailing ever sent. Server-side; ships on a
  Render deploy, not a build.
- **The Privacy Policy does not mention the list yet.** It is a reviewed document and is not
  edited here; `docs/legal-open-questions.md` question 11 carries it to counsel.

## The site is visible, sign-up is closed: "Coming soon"

Added 2026-10-01. Scott: "we have a website, but we need to hide how people can access it ...
build like a coming soon icon where people can see it but not sign up." The marketing pages
stay up and indexable. Every way to create an account is closed to the public and reads
"Coming soon"; a person holding the invite code still signs up.

- **Two Render variables.** `PUBLIC_SIGNUPS_OPEN=false` closes it; unset or anything else is
  open, so a deploy missing the variable is the launched product, never a locked one.
  `SIGNUP_INVITE_CODE` is the code (case-insensitive, trimmed); with none set a closed site has
  no door, which is a valid state. `server/signup-availability.ts`.
- **One rule, asked by both sides.** `GET /api/public/signup-availability` tells the client
  what to draw; `POST /api/auth/signup` refuses with 403 and `signupClosed: true` without a
  valid `inviteCode` in the body. The button is presentation; the route is the gate.
- **One CTA component.** `SignupCta` and `SignupLink` (`client/src/components/signup-cta.tsx`)
  are the only things that link to /signup; `signup-is-closed-everywhere.test.ts` refuses a
  bare link anywhere else. Unknown draws the open label disabled, so the page never flashes.
- **The invite travels as `/signup?invite=CODE`** (the link to send a tester) or is typed on
  the signup page's coming-soon card, and is kept in sessionStorage so the rest of the site
  opens up for that visitor until the browser closes. Never stored on the account.
- **What stays open:** login, password reset, a guardian claiming a minor's account, an athlete
  claiming a coach-provisioned account, a staff coach joining by invite code INSIDE a signup
  that already passed the gate. None of those is public sign-up.



Added 2026-09-21. Scott wanted three things -- a comparison against other athletes, a
per-muscle map like the one in the screenshots he sent, and an interactive figure beginners
can tap to filter exercises. All three shipped in #156. The decisions, because every one of
them will read as an arbitrary constraint to somebody who wasn't here:

- **A PERCENTILE, NEVER A RANK.** "#4 of 11 in 16-17" plus a coach who knows their roster is
  a name, and `server/leaderboard-teammate-privacy.itest.ts` already records what a leaderboard
  gave away once: a hundred children's names at a named club, each with age, height, body
  weight, sport and position, readable by anyone who saw the coachCode on a flyer. A rank is
  also volatile in a way a percentile is not -- one teammate PRs and you drop three places for
  reasons that have nothing to do with you. Scott, 2026-09-21: "we don't track people by their
  names, nor do I want them to be able to."
- **Under `NORM_MIN_COHORT` (30) PER GROUP there is no number.** Not per cohort: thirty
  athletes in an age band does not mean thirty of them have ever trained calves. A percentile
  over the four who have is the thin claim the floor exists to refuse, and the existing cohort
  norms already answer this way.
- **Forge-official exercises only**, and `exercises.isForgeOfficial` is now an EXPLICIT flag.
  It was inferred from "owned by an admin", and this feature makes that inference decide what
  every athlete on the platform is measured against -- the day an admin logs a personal
  exercise it would silently join the standards. `classes.isForgeOfficial` already made this
  argument; exercises now follow it. Backfilled from admin ownership, which is what the library
  means by Forge content today. Scott: "Coaches can't edit those exercises, only admins, so in
  effect we created them."
- **Hand-logged weight and reps only. NEVER a camera number.** Everything the camera produces
  is uncalibrated and carries `CAMERA_ACCURACY_PURCHASE_WARNING`; a score built on it would
  inherit that warning and the whole feature would ship with an asterisk. Hand-logged load is
  the one measurement in this app that is simply true, and that is the entire reason this
  feature can make a claim at all. Enforced in the SQL, not at a call site.
- **Twelve reps or fewer.** Past that Epley extrapolates muscular endurance into a maximal
  claim -- a set of thirty bodyweight squats is not a 3x bodyweight single, and without the cap
  it scores as one.
- **No bodyweight means no score.** A number computed against a guessed bodyweight looks
  exactly like a real one.
- **A LIFT IS SCORED AGAINST THE WEIGHT THE ATHLETE ACTUALLY WAS ON THE DAY.** Fixed
  2026-09-21; this section used to carry it as a known gap on the grounds that a weight history
  was its own piece of work. It was not: `body_metrics` has been a dated per-athlete weight log
  since long before the strength profile, and the score simply was not reading it.
  `bodyweightAtLiftSql` takes the most recent entry on or before the lift's date and falls back
  to `users.bodyWeightLbs` -- the number the score used before, so an athlete who has never
  weighed in sees exactly what they saw yesterday. Three consequences worth keeping straight:
  a kg weigh-in is converted before it becomes a denominator; the best lift for a group is now
  the best RATIO, which is not always the heaviest bar once the denominator can move; and the
  COHORT query uses the same rule, because a mixed denominator would put the two sides of a
  percentile on different scales. `server/strength-profile.itest.ts` proves each against real
  Postgres.
- **The bands are relative to FORGE'S population, not world standards.** Forge has no validated
  standards table and inventing one would repeat the uncalibrated-numbers problem the camera
  work spent months on. The card says "ahead of 68% of athletes your age", which is a claim the
  data supports. Swapping in published per-exercise standards later needs no UI change.
- **Every coaching line names a MOVEMENT, never a body part.** Forge has thirteen-year-olds on
  it: "bring up your abs" is a sentence about a child's body, "your trunk flexion is behind
  your squatting" is a sentence about their training. `MOVEMENT_FOR_GROUP` in
  `shared/strength-score.ts` is what makes that automatic, and the test asserts the body-part
  words never reach the screen. Scott: "Love the minors and framing addition."
- **The body map never replaces text search** (Scott, explicitly). It exists for the athlete
  who does not know what a lat is; anyone who does will type "hamstring" and expect it to work.
  It drives the SAME `muscleGroupFilter` the chips use, so there is one filtering path rather
  than two that can disagree. Collapsed on a phone and open on a desktop, decided by CSS --
  a viewport read in JavaScript is wrong on a tablet, wrong after a rotation, and wrong on
  first paint.
- **THE ATHLETE NARROWS THEIR OWN COMPARISON.** Added 2026-09-21, same day, after Scott asked
  "can we create a filter? so the athlete can get a more narrow view when they want?" -- a
  17-year-old sees all 17-year-olds, then can choose males, then male football players. Two
  optional toggles (gender, sport); age band is never optional, because a fourteen-year-old
  measured against adults is not being given a percentile, they are being given a
  discouragement.
- **The earlier differencing objection to this was OVERSTATED, and that correction matters.**
  The Query Engine warning is about an ADMIN with arbitrary predicates and 50 queries a day,
  who can construct two cohorts differing by one person. An athlete has two preset toggles,
  cannot express "everyone except this teammate", and the 30 floor applies to EVERY view --
  so the smallest group any comparison can describe is thirty people, and the difference
  between two views is a fact about aggregates. Do not re-raise this as a reason to remove the
  filter; it was considered and answered.
- **A filter can only ever make the number disappear**, never make it describe a group too
  small to be a distribution. Narrowing to a thin cohort shows nothing, and the chips stay on
  screen in that state -- they are deliberately rendered OUTSIDE the empty/scored branch,
  because a filter that hides the control which undoes it strands the athlete. That exact bug
  was written and caught before it ran; `client/src/lib/cohort-filter-has-an-escape.test.ts`
  keeps it caught.
- **Gender narrows only for male and female**, and not because the other answers are less
  valid: a cohort of athletes who chose "prefer not to say" is a group defined by a privacy
  choice, and measuring somebody against it would turn that choice into a category. They get
  the broad comparison, which is the default everybody starts on. `readableGender` also exists
  so a storage word like `non_binary` can never appear in a sentence about a child.
- **A filter the athlete cannot satisfy is dropped, not applied.** Somebody with no sport on
  file asking to narrow by sport would otherwise meet "not enough athletes" forever with
  nothing to explain why. The response carries `available` so the UI hides a toggle rather
  than drawing one that does nothing.
- **The body map is a CONTROL in both places it is drawn, and the two taps do different jobs.**
  In the exercise picker a tap filters exercises; in the strength profile a tap opens what was
  actually lifted for that area (date, lift, reps x weight, nothing more). The scored list beside
  the figure opens the same sheet, because several scorable groups have no drawn region and a
  map-only entry point would make their history unreachable.
- **The muscle-group history is FORGE-OFFICIAL ONLY, and it says so on screen.** Scott,
  2026-09-21: "only forge specific exercises, not coach created exercises" -- which overruled the
  recommendation to show every lift. It is also structurally required: the history sits under the
  percentile, so if it widened to coach-created exercises a tap could show a lift heavier than the
  one the score was computed from and the score would read as broken rather than as scoped.
  Enforced in the SQL (`getMuscleGroupHistoryForAthlete`), stated in the dialog so a missing lift
  reads as a rule rather than as lost data. The history URL is DERIVED from the profile URL
  (`strength-profile` -> `muscle-history`) so a caller cannot wire an athlete's own history behind
  a coach's roster-scoped profile by getting one prop right and the other wrong.

- **A logged load is shown in the READER'S unit, and a set already in that unit is never
  converted.** Scott, 2026-09-21: "if they want to see kg let them see kilos, even if the other
  athletes put it in lbs the conversion is 2.2." `weight_lbs` is a normalised comparison column,
  so display is a separate concern: the history carries the AS-LOGGED weight and unit beside it,
  and a kg set read back in kg prints exactly what the athlete typed. `shared/weight-units.ts`
  is the one conversion. The factor is 2.20462 rather than 2.2 for one visible reason -- a kg
  lift is stored through 2.20462, so reading it back at 2.2 turns a 100 kg lift into 100.2 kg,
  a number nobody lifted.
- **The history's date window is a server-side inclusive floor** (`since=YYYY-MM-DD`), not a
  client-side slice, and "All time" is always offered so a narrow window can never be mistaken
  for an empty history. Same reasoning as the cohort chips.

- **The cohort sentence comes from the SERVER** (`cohortLabel`). A client that assembled its
  own description could drift from the group the query actually used, and the drift would be
  invisible.

## Speed and findability, 2026-09-20

- **The schema never enters the client bundle.** `shared/schema-constants.ts` carries the
  handful of constants the client reads; `shared/schema-constants.test.ts` pins each to the
  schema's value. One literal import of `shared/schema.ts` from a page used to drag 291 kB of
  schema plus zod and drizzle into the eager entry. `client/src/lib/bundle-budget.test.ts`
  holds the eager budget and `camera-pipeline-is-lazy.test.ts` refuses a static import of any
  tracker dialog, MediaPipe, onnxruntime or pose-tracking from a page.
- **Dialogs mount on first open** through `lazyDialog` and stay mounted after close, because
  tracker dialogs finish their save path after `onOpenChange(false)`. Do not swap it for a
  plain lazy that unmounts on close.
- **Per-request memo** (`server/request-cache.ts`, AsyncLocalStorage) caches getUser, staff
  links, team scope and assignment reads within one request and is cleared on any write
  statement. The HTTP test harness mounts the same scope so itests issue production's
  statements. Jobs and the seed run outside a request and see no memo.
- **Static cache policy** lives in `server/static-cache-policy.ts`: hashed assets immutable,
  model/wasm files a day with ETag, HTML always revalidated.
- **The session store** only adopts the stored JSON expiry when nothing newer is known;
  touch() moves the column, not the JSON, and re-learning the JSON caused one UPDATE per
  request after five minutes. `server/session-touch-throttle.test.ts` pins it.
- **SEO is data-driven from `shared/public-routes.ts`**: sitemap, prerender, per-page head,
  robots and JSON-LD all read it. Unknown paths get 404 with a noindex app shell. No ratings,
  social profiles or accuracy claims in structured data; `shared/seo-head.test.ts` scans.
  CLOSED 2026-10-16: the public pages' BODIES are prerendered at build time (see "The 2026-10-16
  SEO and speed pass" below); the legal documents keep an empty root because their text is the
  API's.

**Three things parked by Scott, 2026-09-20 ("flag those 3 needs, we can do those later"):**
1. **Smart App Banner: done.** `VITE_APP_STORE_ID` is set on Render (Scott, 2026-10-04); the
   banner is injected from it and shows in Safari once the app is released in the store.
2. **FAQ on /for-high-schools with FAQPage JSON-LD: DONE 2026-10-08** (`shared/high-schools-faq.ts`,
   ten questions, rendered on the page and emitted as the one FAQPage from the same list; confirmed
   on the live host 2026-10-11). The rest of this entry is the history of what it was meant to be.
   Highest search payoff of the SEO proposals. Questions come from facts in this file (FERPA does not apply; a minor's account is
   inert until a guardian claims it; where data lives; the four validated movements and the
   caveat; $4 an athlete in bands, not charging in beta; more than one coach per team; what
   deletion keeps). Scott reads the draft before it ships; `shared/structured-data.ts` has the
   place to emit the schema once the visible FAQ exists.
3. **Barlow Condensed is LOADED since 2026-10-04**: self-hosted at `client/public/fonts/`
   (600 and 700, latin, ~15KB each), `@font-face` with swap in `index.css`, the 700 preloaded
   in `index.html`. It is the "Forge (condensed)" choice on the Branding page and ships in the
   native bundle so headings draw offline.

**Video review work is planned in `docs/video-review-plan.md`** (2026-09-20). Read it before
touching `video-analysis-dialog.tsx`, `video-annotation-dialog.tsx`, `set-video-review.tsx` or
anything under a `video-review` name; it has the phase order and the checklist.

## Documents: what every role can see, sign, download and send

Added 2026-09-20 after a runtime + code audit of every document surface (Scott: "every one can
be downloaded, reuploaded, everyone can sign them, the appropriate documents get to the
appropriate profiles, coaches can email them straight to their lists, the athletes/coaches can
see whats live on their profiles and whats missing"). State of the code:

- **Every public legal document has a page and a PDF**: `GET /api/legal-documents/:type.pdf`
  for the public set, plus `research_consent.pdf` served from the reviewed constant (an explicit
  branch BEFORE the enum lookup; it must never become an admin-editable row). Nothing leaving
  the app is titled "(Draft)".
  **THAT WAS SEVEN OF EIGHT UNTIL 2026-10-08, AND IT TOOK A LIVE FETCH TO FIND THE EIGHTH.**
  `parental_notice` was in `LEGAL_DOC_TYPES` (seeded, admin-editable, attorney-reviewed) and
  absent from `PUBLIC_LEGAL_DOC_TYPES`, so both public routes 404'd where the other six served,
  for as long as the public set has existed. It is the worst of the eight to lose: every other
  document is addressed to somebody with an account, and this one is addressed to a guardian who
  may have none and no reason to make one -- so the email IS its delivery, and a guardian who
  deleted it, or who wanted to read the notice BEFORE claiming their child's account, had
  nowhere to go. Now at `/parent-notice`, and emailable to a roster, which is the right outcome
  rather than a side effect (it is the one document a coach has an obvious reason to send to
  every guardian at once). Delivery is unchanged -- still emailed, still snapshotted into the
  guardian's consent record at claim time, which is what makes it evidence.
  **NOT `/guardian-notice`**, which it was called for one commit: robots.txt disallows the authed
  prefixes wholesale, `/guardian` among them, so the page would have been sitemapped and blocked
  from crawling at once. `seo-head.test.ts` caught it on the first run.
  **THE LESSON IS THE ASSERTION'S DIRECTION, and it generalises past documents.** The one scan
  covering this iterated `PUBLIC_LEGAL_DOC_TYPES` asserting each had a page -- which cannot see
  a document that was never in the set it iterates. A subset assertion is blind to exactly the
  omission it looks like it covers. The two lists are now held EQUAL, with a
  `NOT_PUBLIC_ON_PURPOSE` list that is EMPTY and whose entries must carry a reason over forty
  characters -- the same shape as `FITTED_OVERRIDES` in the camera registry: the machinery for a
  divergence exists, the list is empty, and adding to it costs a sentence that shows up in a
  grep. The reverse direction is pinned too, so a type cannot be served publicly with no admin
  editor behind it. Five mutations, each caught by the right test.
  Also fixed with it: `parental_notice_ack` in `shared/consent-catalog.ts` carried
  `page: null, pdfType: null` because there had been nothing to point at, so "What you've agreed
  to" listed the one document addressed to the reader and offered no way to reread it.
- **A JSX STRING ATTRIBUTE IS A LITERAL, AND TWO PUBLIC LEGAL PAGES SHIPPED PROOF OF IT.** Found
  2026-10-08. The AI Terms and Research Consent pages carried
  `otherLabel="Privacy Policy \u2192"`, which renders those six characters on screen -- JSX
  processes escapes inside `{"..."}`, never inside a quoted attribute. The five older pages had
  the real character all along, and this was found by copying one of the two broken ones to make
  a third, which is how the class spreads. All three carry the character now and
  `documents-surfaces.test.ts` scans for a `\u` escape in any label or title on those pages.
- **A waiver kind has to belong on the profile it is filed against.** The upload route accepts
  the target's checklist kinds (`uploadableKindsFor`) plus "other"; the institutional agreement
  only from the primary coach the server says owes one. Before this an athlete could file a
  signed Service Agreement against themselves and it read as a school's signature.
- **"What you've agreed to"** (`GET /api/account/consents`, guardian and coach variants) is the
  only listing of consent_records for a person. `shared/consent-catalog.ts` maps each consent
  type to its page and PDF, keyed by the enum so a new type is a type error until named.
  `givenBy` is a role word, never a name. Stale is a TEXT comparison for terms and the biometric
  consent, `staleTerms` for research, false otherwise.
- **Coach email-to-roster**: "Ask" emails adults directly and minors' guardians (link to the
  child's page), keeps the 24h floor, and reports `emailed | in_app_only` per target so the
  toast says what actually left. `POST /api/coach/legal-documents/:type/email-roster` sends a
  public document as page + PDF links, roster-scoped and per-team narrowed, one email per
  address. `sendEmail` has no attachments, so links, not files.
- **A guardian gives the biometric consent after the claim** from the dashboard card; a minor's
  camera button says so instead of dropping the numbers. Withdrawal stays the existing
  withdraw-consent, because that is the software the reviewed text describes.
- **Staff coaches see the primary's signed Service Agreement read-only**; sign, upload and the
  blank download stay primary-only (`required` still gates them).
- **The admin research card cites the export cell floor from the server** (`exportMinCell`),
  never a hand-typed 10.

## The document gate now gates something, and is inert through beta

Added 2026-09-22. The gate's own dialog has said "You can look around Forge, but training,
skills and the camera stay locked until these are on file" since it was written, and
`useDocumentGuard` -- the hook that does the locking -- had NO CALLERS. The only thing wired up
was an informational banner on the athlete dashboard, so an athlete with no participation waiver
read the warning and trained anyway.

- **`DocumentsGate` wraps the athlete's workout and skill-workout ROUTES**, not each button.
  Same reasoning as `SkillsGate`: those screens are reached from the dashboard, the calendar and
  a deep link, and guarding every control that leads to one is a list somebody falls off. The
  camera lives inside those pages, so it needs no gate of its own.
- **BLOCKING REQUIRES THE SERVER'S `enforced` FLAG, and in beta it is false.** This is the part
  that matters: only `medical_clearance` is in `BETA_DEFERRED_DOCUMENTS`, so
  `participation_waiver` is outstanding for essentially every athlete on the platform right now.
  A gate reading `complete` alone would have locked the entire roster out of training the moment
  it shipped. `enforced` follows `BILLING_ENFORCEMENT_ENABLED`, the same switch billing uses, so
  the two cannot drift. `missing` is still returned either way -- the banner naming what is
  outstanding is useful whether or not it stops anything. The checklist and the wall are two
  different decisions.
- **A tap made before the answer arrives is HELD, not swallowed.** `useDocumentGuard` used to
  return early on `blocked === undefined`, which makes the button dead while the request is in
  flight with no spinner and no refusal -- so the athlete taps again and nothing happens twice.
  "Unknown is not yes and not no" is the right rule for what to DRAW (see `useCameraAccess`); it
  is the wrong rule for a press somebody has already made.
- **`DocumentsGate` renders its children while the answer is unknown**, which is the opposite of
  `SkillsGate` and deliberate. A skills page behind an unpaid tier should not flash into view; a
  training page is one the athlete is overwhelmingly likely to be allowed on, and enforcement is
  off entirely today, so a spinner on every navigation would cost every athlete a wait to catch
  a case that currently never fires.
- **Only an athlete is gated.** A coach's credentials matter as much, but locking a coach out of
  their own roster mid-season is a different decision with a different blast radius and has not
  been made. The server answers for a coach too; nothing acts on it.
- `client/src/lib/the-document-gate-actually-gates.test.ts` pins all four: the routes are inside
  the gate, blocking requires `enforced`, the held tap, and the dialog naming each document.

## A school picks its plan at signup by typing a number

Added 2026-09-19. Scott: "make schools pick a plan at signup ... can we have them type in how
many athletes they will have?" Yes: the price is already $4 an athlete in bands, so the number
IS the plan. `users.plannedAthleteCount` is what the school SAID; the roster is what they HAVE;
billing uses the larger (`getBilledAthleteCountForCoach`).

- **Coach signup requires `expectedAthletes`** and sets `billingTier` from `bandForAthleteCount`.
  That is what makes the Service Agreement offered with no admin step. `isBetaAccount` is NOT
  touched -- it stays the deliberate enforcement switch, so nothing is charged or capped in beta.
- **`GET/PUT /api/coach/plan`** is the one place the plan is read and changed; PUT is primary
  coach only. The coach billing page shows planned, roster, billed band, and an `atCap` notice.
- **The Stripe webhook writes the band** on a coach subscription (`applyCoachSubscriptionBand`),
  and `plannedAthleteCount` only ever moves up from it. Nothing writes it on the Apple path.
- **At the ceiling the join is refused**, and the message says the coach must move up a plan.
  Moving up is the same $4 a head, so guessing low costs nothing. Enforcement semantics unchanged.
- **An assistant coach skips the question.** Ticking "I'm joining a program that's already on
  Forge" at signup swaps the headcount for the head coach's staff invite code
  (`staffInviteCode` on `signupSchema`). The code is checked before the account is created, the
  row gets no plan of its own, and the account lands on the staff in the same request.

## A changed Terms of Use is accepted again, never assumed

Added 2026-09-19 on counsel's answer: "we can change the terms without telling you, and
continued use constitutes acceptance" is an illusory contract; an existing user must get
notice and an accept-or-reject step. Section 16 of the signup Terms now promises exactly that,
so the software has to do it.

- **The rule is a text comparison, not a version flag.** `storage.getTermsAcceptanceStatus`
  compares the user's `agreedToTermsText` snapshot with the live agreement, both cut at
  `HEALTHCARE_NOTICE_MARKER` so the clinician note the seed appends is not a change. Any
  other difference means "ask again". There is no "minor edit" escape hatch on purpose: an
  admin edit to the live agreement re-asks the whole platform, which is what a change to a
  contract costs.
- **Adults are blocked in the client, not the server.** `TermsReacceptanceGate` in App.tsx
  is a non-dismissable dialog with the full text, a checkbox and Accept, or sign out.
  `POST /api/auth/accept-terms` snapshots the new text and writes a `terms_of_service`
  consent record. The server only reports `needsTermsAcceptance` on the public user.
- **A minor is never locked out.** Their guardian gets one email (`terms-change-notice.ts`,
  sent after the seed applies a new version, marked on the MINOR's row by
  `termsReacceptNotifiedAt` so a redeploy does not re-send) and a card on the guardian
  dashboard; `POST /api/guardian/terms-reacceptance` accepts on the child's behalf and the
  record names the guardian. Scott's call: locking a child out for a parent's inaction is
  the wrong trade.
- **Every existing user meets the gate once** after the 2026-09-19 deploy, because counsel's
  text differs from whatever they accepted. That is the intended first run, not a bug.
- **AN ADMIN'S OWN EDIT RE-ASKED EVERY ADULT AND EMAILED NO GUARDIAN, FOR THREE WEEKS**
  (found 2026-10-11, working the launch row "edit the live agreement, every adult meets the
  dialog once, the minor's guardian gets the email"). Parts 1 and 2 of that row have always
  passed; part 3 could not. **The adult half needs nothing wired and the guardian half is a
  call somebody has to make**, and only one of them was made: `getTermsAcceptanceStatus`
  compares the live document with the snapshot on the account, so a changed document puts
  itself in front of every adult at their next request, while
  `notifyGuardiansOfTermsChange()` had exactly ONE non-test caller -- `server/seed.ts` --
  and the seed only ever upgrades a document it still recognises as a version Forge shipped
  (`nextSignupAgreement` returns null for an admin's own wording). So the moment the terms
  were edited through `/admin/documents`, the seed went silent forever and the one population
  that cannot answer for itself was the one nobody was told about.
  `PUT /api/admin/legal-agreement` calls it now: the old document is read BEFORE the save,
  both sides reduced by `coreAgreementText` (so a no-op re-save, and the clinician notice the
  seed appends, email nobody), the call is inside a try/catch because **a mail problem must
  never lose a saved legal document**, and the count comes back in the response.
  **AND THE TOAST HAD BEEN WRONG SINCE THE GATE SHIPPED**: "new signups will see this text",
  which reads as "existing users will not" -- it now says every existing account will be asked
  again and how many guardians were written to, so an admin learns it from the Save button
  rather than from the platform. Client half: `verify_build`.
  `server/an-admin-edit-of-the-terms-notifies-the-guardians.test.ts` SCANS for a write path
  with no notice beside it (seven mutations, each caught by the right case) and
  `terms-reacceptance.itest.ts` drives the real route; three of its four new cases go red
  against the pre-fix handler. **Fourth instance of one class in a week** -- the Coaches
  Corner lesson re-sync, the Barbell Shoulder Press instructions, `videoEligible: false`
  surviving the canonical-list swap, and now this: a correction or a notice wired only to a
  path nobody takes, invisible because the path that IS taken looks like it worked.

## Per-team coach assignment

Added 2026-09-19. Scott: "for a school, can they assign more than one coach to a team?"
It had been discussed and never built. `team_coaches` in `shared/schema.ts` carries the
rules as a comment; `server/team-coach-assignment.itest.ts` proves each.

- **A staff coach with no assignment anywhere sees everything, as before.** Nothing changes
  for an existing staff until the primary coach assigns somebody. The first assignment is
  what turns narrowing on, for the assigned coaches only.
- **A narrowed coach sees their teams and the athletes ON those teams**, through
  `getCoachTeamScope`. Both `getRosterForCoach` and `getRosterAthleteForCoach` are scoped,
  because every per-athlete coach route 404s through the second one; scoping only the list
  would hide a name and leave every URL working.
- **Only the primary coach assigns**, and only coaches already on the staff. An assigned
  coach widening their own assignment would make the scoping decorative.
- **`assertOwnsTeam` derives from `getTeamsForCoach`**, so the member, branding and
  challenge routes are scoped without being touched. Keep it derived.

## AI Coach + Video is ON SALE, with the accuracy warning attached

Superseded 2026-09-19 (same day). It was withdrawn that morning -- "we need to stall the $19.99
package for now, keep it in the code, but don't let it be accessible" -- and put back the same
day on the other answer: sell it, and say plainly what the buyer is getting. Scott: "list a
warning for the $19.99, while this does record video, it's not accurate purchase at your own
risk."

Both answers were defensible and the second is the one in force. The VIDEO works -- it records,
it saves, a lift can be watched back, and for a lot of people that alone is the product. What
does not work is the NUMBERS derived from it. Selling the tier with that stated up front is
honest; selling it silently is not.

- **The warning is the condition of the sale, not decoration on it.** Every surface that offers
  the tier carries `CAMERA_ACCURACY_PURCHASE_WARNING` -- /pricing, the landing cards, the athlete
  upgrade screen -- through `<CameraMetricCaveat variant="purchase" />`.
  `client/src/lib/video-tier-warns-before-purchase.test.ts` scans for a surface that pairs
  `hasVideoFormCheck` with a price and fails if it has no warning, and it names the three known
  surfaces too, so a rename cannot quietly turn the scan green.
- **The purchase variant can never be dismissed, whatever the caller passes.** Every other caveat
  tells a reader not to trust a number in front of them; this one is a material fact about what
  somebody is about to pay for, and it is not something they can acknowledge away before the
  transaction. `canDismiss` excludes the variant rather than trusting the `dismissible` prop.
- **The warning follows the ENTITLEMENT, never a tier id.** A sales surface that names
  `ai_coach_video` as a literal keeps its own idea of which tier is which -- the bug the checkout
  route already had. The test scans for that literal on all three surfaces.
- **The withdrawal machinery is KEPT, and this is why the file is still there.**
  `shared/tier-withdrawal-machinery.test.ts` (was `withdrawn-tier-stays-off-sale.test.ts`) and
  `WITHDRAWN_FREE_AGENT_TIERS` (empty today) stay because they are the difference between a tier
  being unsellable and a tier being BROKEN for the people already on it: the admin screen labels
  withdrawn entries, the checkout route refuses them, and `entitlementsForFreeAgentTier` ignores
  the list entirely so a withdrawal can never revoke a feature somebody is paying for. Next time
  something is pulled that is one line in each of two arrays, not a design exercise under time
  pressure. Do not delete the machinery because the list is empty.
- **Two lists, and the difference between them is somebody's subscription.**
  `FREE_AGENT_TIER_ORDER` is WHAT IS FOR SALE; `ALL_FREE_AGENT_TIER_IDS` is WHAT HAS EVER BEEN
  SOLD, read by everything that resolves an EXISTING subscription (Apple receipt verification,
  the stored-value schema, the admin screen). They are identical today and still separate on
  purpose.
- **Never hand-type the tier list.** The checkout route named the three ids as literals, so
  withdrawing a tier elsewhere would have left that one endpoint still selling it. It derives
  from `FREE_AGENT_TIER_ORDER`, and the test scans for the literal.
- **Nothing to do at Apple.** The withdrawal's one open action was marking the Product
  unavailable in App Store Connect, and it was deliberately deferred -- so the Product is still
  live and the tier going back on sale needs nothing doing there. If it is ever withdrawn again,
  that step comes back with it.

## Add-ons: the purchase path exists, and beta means free

Added 2026-09-19. Scott: "we are still in beta, build the framework, but keep it free for now."
Two entitlements had no purchase path at all: the three sport-coach add-ons (golf_swing, hitting,
pitching) and Coaches Corner, which the copy said came with a "Pro coaching plan" nothing sold.

- **One resolver each, asked by both sides.** `sportCoachAccessFor` and `coachesCornerAccessFor`
  in `server/routes.ts`; `GET /api/athlete/entitlements` and `GET /api/coach/entitlements` are
  how the UI asks. The client never re-derives it (the old page read raw ownership and missed
  the trial and enforcement-off cases).
- **Beta, an active trial, or enforcement off = all add-ons unlocked**, the same short-circuit
  `getEntitlements` already applies. `addOns` answers "may I open it"; `ownedAddOns` answers
  "did I pay for it". They differ for every account today.
- **Checkout is wired and dormant.** `POST /api/billing/checkout/free-agent-add-on` and
  `/coach-add-on` take `{ addOnId }` from the shared lists (never hand-typed), sit behind
  `chargingClosed()` like every other checkout, and the webhook kinds `free_agent_add_on` /
  `coach_add_on` append ownership with de-dupe. Apple: `appleProductIdForFreeAgentAddOn`, and
  `applyAppleIapVerification` recognises add-on products (without that an iOS purchase would
  verify as "unrecognized product": money taken, nothing granted). Add-on products must NOT go
  in the tier subscription group at App Store Connect: add-ons combine, tiers are exclusive.
- **Coaches Corner is sold in the app too** (2026-10-03, Scott: "we need to add coaches corner to
  apple in store purchase"): `appleProductIdForCoachAddOn("coaches_corner")` is
  `...addon.coaches_corner_v1`, in its own "Coach Add-ons" subscription group, created in App
  Store Connect that day and submitted with 1.1. `POST /api/account/apple-iap/verify` is the one
  verify route for any signed-in buyer; it scopes `applyAppleIapVerification` by role so a
  coach's receipt grants `billingAddOns` and an athlete's grants a tier, never the other way.
  The review notes say a coach can buy exactly this one thing.
  **The ATHLETE products in App Store Connect** (2026-10-05): all three in ONE group ("Basic
  Monthly Sub", levels ai_coach_video 1, ai_coach 2, basic 3): `...freeagent.basic_v2`,
  `...freeagent.ai_coach_v3` $9.99 and `...freeagent.ai_coach_video_v3` $19.99. The two
  `_v2` AI ids were created 2026-10-04 each in a group of its own, which made them unrelated
  products (the sandbox held Basic and AI Coach + Video at once); a subscription cannot change
  group and an id cannot be reused, so they were recreated as `_v3`
  (`APPLE_TIER_PRODUCT_SUFFIX` in `shared/free-agent-tiers.ts`, mirrored in
  `AppleIapPlugin.swift`, pinned by `apple-product-ids.test.ts`). The All Classes add-on
  `...addon.all_classes_v1` $19.99 is in its own group, as every add-on must be.
- **Prices confirmed 2026-10-03** (Scott: "keep them"): Coaches Corner $19.99/mo, sport coaches
  $7.99/mo each, in the shared constants. The video workbench is NOT an add-on any more (same
  day: "there are 3 tiers, built on purpose, and anyone being coached gets it already"); it
  rides with the camera entitlement through `useCameraAccess`. The Stripe Prices and the
  App Store products are created to match on launch day; `missingPriceEnvVars()` names the
  env vars.
- **Personalization is one add-on, Full Personalization at $24.99** (2026-10-03, Scott: "don't make
  them individual add ons, make them only the full personalization page"). The four pieces stay
  as ids because full_bundle resolves to them and an account granted one earlier keeps it;
  `BILLING_ADD_ON_ORDER` is what is offered, `ALL_ADD_ON_IDS` what can be owned. Admin-assigned,
  no checkout, no Apple product.
  **FLAGGED 2026-10-05 (Scott): Full Personalization still has to be ADDED TO APPLE before a
  coach can buy it themselves.** There are exactly TWO coach add-ons -- Full Personalization
  ($24.99) and Coaches Corner ($19.99) -- and only Coaches Corner is sellable today:
  `COACH_PURCHASABLE_ADD_ON_ORDER` is `["coaches_corner"]` alone, so Full Personalization has
  no checkout on either rail and `appleProductIdForCoachAddOn` is never asked for it. Making it
  buyable is four things, none of them done: an App Store Connect auto-renewable product in the
  **Coach Add-ons** group (never the tier group -- add-ons combine, tiers are exclusive), a
  Stripe Price in `STRIPE_PRICE_COACH_ADDON_FULL_BUNDLE`, `full_bundle` added to
  `COACH_PURCHASABLE_ADD_ON_ORDER` (which is what puts it in `missingPriceEnvVars()` and in
  both checkout enums, since every one of those derives from the list rather than naming ids),
  and the coach billing page's StoreKit button offering it the way it offers Coaches Corner.
  Until all four exist it stays admin-assigned, which is a working state, not a broken one.
  NOT the same as the three sport coaches: those are FREE AGENT (athlete) add-ons, not coach
  ones -- see FREE_AGENT_ADD_ON_ORDER -- and they are withdrawn and refused at checkout.
- **The locked state for a non-comped account says "not available yet"**, never "free in beta":
  that branch is reached only by an account that is not comped.
- **THE COACH PLAN ($4 AN ATHLETE IN BANDS) IS SOLD ON THE WEB AND NEVER THROUGH APPLE, AND THE
  APP MAY NOT SAY SO** (2026-10-08). Scott: "we don't need to as i want coaches to do that through
  the app [web]" and then "do a quick check and make sure nothing in the app says it so we stay
  safe." Guideline 3.1.3(c) lets a program be billed by card outside Apple, on the condition that
  the iOS app never prices that plan, links to its checkout, or tells a coach where to go and buy
  it (3.1.1). Four places did and are fixed: the coach billing screen's native copy ("Open Forge
  in a browser to subscribe" is exactly the steer; it now says the plan is set up outside the app
  and shows what it covers), the login screen's "View pricing" link (web only), the coach signup's
  band line (the band alone on the phone, the money on the web), and `requireWebCheckout`'s
  refusal, which said "pay by card" in a browser. `/pricing`, `/for-high-schools` and
  `/for-athletes` are wrapped in `WebOnlyPage` in App.tsx and go to login inside the native app;
  on the web they are untouched and still indexed. `native-paywall-never-points-at-the-web.test.ts`
  pins all of it. Do not add the coach plan to App Store Connect: a program's subscription is not
  a consumer purchase, and selling it both ways would put the roster cap and the Stripe webhook
  (`applyCoachSubscriptionBand`) on two rails.

- **RENDER WAS READ DIRECTLY FOR THE FIRST TIME 2026-10-10, AND `PAYWALLS_DISABLED=true` IS SET ON
  PRODUCTION.** A read-only Render API key is a Network secret in the Claude Code cloud environment
  (Bearer injected by the proxy for `api.render.com`), so a session can read the service's env
  vars, deploys and logs itself -- print switch values only, never a secret, and NEVER edit a
  production variable without Scott's word. The flag matters because `hasAthletePaidForAiAccess`
  returns true on it BEFORE reading `BILLING_LIVE` or the tier, and `cameraAccessFor`,
  `skillsAccessFor` and `requirePaidAiAccess` all go through it: today EVERY Free Agent has the
  camera, skills and AI chat whatever their tier. Two earlier notes in this file reasoned the
  opposite from the code alone ("cameraAccessFor answers false for EVERY Free Agent except the
  comped demo address") and are wrong while this flag is set. **UNSET 2026-10-11 with the rest
  of the launch switches** (see "BILLING IS LIVE" under the settled questions); it was the one
  that made a Basic Free Agent's record button disappear, and audit row B6 is runnable now. Also read off
  the service: `APPLE_IAP_LIVE` is ALREADY true (the sandbox runs needed it), `APPLE_APP_APPLE_ID`
  is set, `ANTHROPIC_FAST_MODEL` / `ANTHROPIC_MODEL` are absent (the Haiku 5.5 default is what
  runs), all 56 names the code reads are present or deliberately absent, and `PII_ENCRYPTION_KEYS`
  is an unread leftover beside `PII_ENCRYPTION_KEY`. **`/api/webhooks/apple` has received NOTHING
  in 72 hours of logs** across every sandbox purchase, which a sandbox subscription's five-minute
  renewals should have produced by the dozen -- the Sandbox server URL in App Store Connect is a
  separate field from the Production one and is the first thing to check.

- **THE LAUNCH IS iPHONE ONLY; ANDROID IS PARKED** (Scott, 2026-10-10: "I don't have an android
  phone to test anything on, will launch on iPhone only for now"). The Android shell, Health
  Connect, Google Play Billing (`GOOGLE_PLAY_BILLING_LIVE` unset, so it sells nothing) and the
  Play privacy URL stay BUILT and untested; nothing is removed and no Android row sits on the
  launch checklist. Do not ask for an Android device to close an audit row, and do not treat an
  Android-only path as launch-blocking. It comes back as its own pass when a phone is in hand.
  Also the same day, on Scott's word: the leftover `PII_ENCRYPTION_KEYS` was deleted from Render
  (36 variables now). `PAYWALLS_DISABLED` stays set for now by his decision ("we will handle the
  paywall stuff later"); it is still on the launch-day order.

- **THE EIGHT AUDIT ACCOUNTS EXIST ON PRODUCTION (2026-10-10), AND TWO DEFECTS CAME OUT OF THE
  FIRST HOUR WITH THEM.** Scott: "you're the only one working. Do what you need." Made through the
  real signup with the invite code in headless Chromium: a `+coach` plus-tag on Scott's inbox (primary,
  planned 34, team "Audit Varsity"), `+staff` (by staff code, assigned to that team), `+athlete`
  (adult, on the coach's code and the team), `+fa1`/`+fa2`/`+fa3` (Free Agents), `+minor` (DOB
  2015, held for `+guardian`, who does not exist until the claim). The harness and screenshots
  live in the session scratchpad, not the repo; the password is in `audit/creds.json` there.
  Delete them through the real delete path (audit row E5) once Scott's rows are done; the admin
  account was never used. What they found: **the coach billing page quoted two plans on one
  screen** (the lower "Your plan" card read `bandForAthleteCount(roster.length)` while the plan
  card read the billed count, so $160 and $20 sat together; it reads `plan.billedCount` now), and
  **Ask the library returned 503 to an ordinary question** because the answer ran past
  `maxTokens: 900` and `callAnthropic` discards a `max_tokens` result -- the right rule for JSON,
  the wrong outcome for prose. The prompt now asks for under 350 words and the cap is 1,600;
  the same question answers in 360 words with four citations. **Three things that look like
  bugs and are not:** the leaderboard caveat is on the Speed & Agility tab only, because the
  Strength tab ranks HAND-LOGGED 1RMs and carries no camera number; an adult athlete who does
  not tick the biometric box at signup starts with `trackingOptOut: true` by design and can turn
  it on later (`server/auth.ts`, the `agreedToBiometricRelease` branch); and a scoped-out athlete
  URL draws "We couldn't load this athlete's profile" for a staff coach, which is a 404 shown as
  a read failure, not a leak. **`api.resend.com` is refused by the Claude Code environment's
  network policy**, so a session cannot read sent mail; email links (claim, reset, device
  approval) come from Scott's inbox.

- **A NEW PAGE DREW THE APP'S 404 FOR EVERY EXISTING VISITOR UNTIL THEIR SERVICE WORKER UPDATED**
  (2026-10-10). Scott, tapping "Notice to Parent or Guardian" in a roster email: "Notice to
  guardian gave me a 404." The link was `/parent-notice`, the server answered it 200 with the
  right title, the route was in `App.tsx`, and none of that reached his phone: `client/src/sw.ts`
  handed EVERY navigation the index.html it had precached at install, online or not, and that
  shell names the bundle it was built with, which carries the ROUTER. So for the window between a
  deploy and the worker's background update, a route added in that deploy rendered `NotFound`
  from a router that had never heard of it -- and that window is every deploy that adds a page,
  for every visitor who had the app open before. The same mechanism explains "the confirm emails
  works" minutes later: by then the worker had updated. A signed-out headless probe could never
  reproduce it, because a fresh browser has no stale worker; the thing to suspect when a URL
  answers from `curl` and 404s on a phone is the service worker, not the route table.
  `answerNavigation` in `client/src/sw-shell.ts` is the fix: the LIVE shell from the server first
  (sent `no-cache` with an ETag, so usually a 304), the precached shell only when the network
  cannot answer -- offline, a 5s timeout, or the 502 a Render deploy serves for half a minute. A
  404 from the server is served as it came, since the server decides what is a page. Offline deep
  links work exactly as before. `the-shell-is-never-served-stale-online.test.ts` drives the
  handler with real promises and reads `sw.ts` to prove it is the thing wired in; reverting the
  worker turns two of its nine cases red. The native app is unaffected either way (no service
  worker on the `capacitor://` scheme); the web bundle still ships in it, so `verify_build`.

- **THE NUTRITION Q&A FAILED THE SAME WAY ASK THE LIBRARY DID, AND THE STRENGTH CARD TOLD AN
  ATHLETE WITH TWO LIFTS TO LOG A FEW** (2026-10-10, second hour with the audit accounts).
  `POST /api/athlete/nutrition/ask` answered an ordinary protein question with 422 "Sorry, I
  couldn't come up with an answer"; the Render log read `Claude request truncated at max_tokens
  -- discarding partial result` twice, then the 422. `answerNutritionQuestion` ran at
  `maxTokens: 500` on a prose answer, and `callAnthropic` discards a truncated result -- the
  right rule for JSON, the wrong outcome for prose, exactly the Ask the library bug of the same
  morning. Both calls in it are 1,200 now; the prompt still asks for 3-5 sentences. **The other
  free-text call sites all state a sentence count in their prompt beside a cap sized to it**
  (chat 500 for 2-4 sentences, form check 600 for 3-5); a prose call whose prompt names no length
  or whose cap has no headroom is the shape to look for. Also: `strength-profile-card.tsx`'s
  collapsed header read "Log a few lifts to see where you stand" for an athlete with a Back Squat
  and a Pendlay Row on file and a cohort of zero -- the expanded card already said the true thing
  ("Not enough athletes aged 20-24 on Forge yet"), the header did not, and every athlete at launch
  is in that state for months (`NORM_MIN_COHORT` is 30 per group). `hasOwnLifts` picks the
  sentence. The figure and the history sheet stay inside the scored branch by design; the Recent
  PRs list on the same page opens the same lift's trend, so nothing is unreachable.
  **Rows closed on evidence the same hour:** all eight public documents answer 200 as a page and
  as a PDF with no "draft" in either (the ninth, the institutional agreement, was signed in B4);
  thirteen public pages at 390px and 1280px with no horizontal overflow, no tiny text and no page
  error; an athlete's participation waiver uploads (201, "In review" on `/documents`) and an
  institutional agreement filed against an athlete is refused 400; a coach's nutrition targets
  land on the athlete's page with the food log against them and the seven-day strip.
  **A NINTH AUDIT ACCOUNT, a `+coach2` plus-tag, is a coach in a different program with
  no roster**, made to prove the athlete URLs refuse an outsider: every coach route for athlete 21
  (roster, nutrition, food log, wellness, waivers, strength profile, a nutrition write, a team add)
  answered 404 or 403 with no name, entry or number in the body, and the athlete pages drew
  nothing. **Deleted again the same evening with `+fa1`, through the real delete path**: a wrong
  password is refused, the right one answers 204, the session is dead on the next request, the old
  password no longer signs in, and the head coach's roster and programs were untouched. Seven audit
  accounts remain (row E5).
  **AI ASSISTANCE IS FOR COACHES AND FREE AGENTS; A COACHED ATHLETE GETS NONE** (Scott,
  2026-10-10, asked whether the nutrition assistant should see the athlete's food log: "the
  athlete side is fine, athletes should have no ai assistance as they will be primarily coached
  by the staff, the free agent yes, and can give recommendations"). That is what
  `athlete-ai-gating.test.ts` already pins at the routes (`requireFreeAgent`, or null for a
  coached athlete on readiness and the digest); it is now also the reason, in his words, so
  nobody re-opens it as a gap. And the Free Agent's nutrition assistant NOW READS THE LOG:
  `answerNutritionQuestion` carries today's entries and totals and the seven-day trend in the
  prompt (`foodLogBlock`), marked self-reported, with rule 1 restated inside it -- comparing what
  was logged with the targets ON FILE is two of the athlete's own numbers side by side, never a
  prescribed third. `the-nutrition-assistant-reads-the-log.test.ts` pins the reads, the block's
  place in the prompt, and the route gate. Server-side: ships on Render, no build.
  **THE BUILDER'S REST TOGGLE NEVER PERSISTED, AND DRIVING THE REAL SCREEN IS WHAT FOUND IT**
  (2026-10-10, third hour). The program-builder row was closed by driving the real builder in a
  headless browser as the audit coach: Add Day, three exercises through the picker, the Link
  chip, the REST toggle, a drag (Pendlay Row above Back Squat, PointerSensor at 4px), a delete,
  a rest day added and removed, Save Program, Add to My Calendar (201, on the coach's calendar
  the same minute) and the AI Program Builder panel, which added "Day 2: Romanian Deadlift,
  Chest-Supported Dumbbell Row" at 3x8 from one sentence. Every control worked except one: the
  REST toggle read back `restAfterGroupOnly: false` after save, and an API round-trip proved the
  server dropped it -- `updateProgramStructure`'s `exValues` (the reconciling save every Save
  Program takes) listed every other column and not that one, so a new row took the default and a
  reconciled row kept whatever it had. `createProgram` carried it all along, which is why nothing
  noticed. **The control had been cosmetic since the reconciling save was written** (build 598
  shipped the chip and the toggle together). One line fixes it;
  `every-program-exercise-field-is-saved.test.ts` reads the field list off
  `programExerciseInputSchema` and requires each in that block, so the next field added to the
  schema fails there until the save path writes it -- discover from the schema, never a list.
  Server-side: ships on Render, no build.

## Skills are part of the camera tier

Added 2026-09-19. Scott: "The 4.99 and 9.99 should not have access to the skills and skills
library, only exercise."

**Why it rides with the camera rather than sitting beside it:** a skill drill IS a camera
measurement. A sprint is timed by the camera and a mechanics drill is scored by it, so a skill
session on a tier with no camera runs a stopwatch nobody can read. `hasSkills` on
`FreeAgentTierDef` is a third entitlement rather than an alias, but
`client/src/lib/skills-need-entitlement.test.ts` asserts the set of tiers with skills EQUALS the
set with the camera -- stated that way, a future tier that adds video gets skills automatically,
and a tier that gets skills without the camera fails, which is the combination the decision
rejects.

- **Same shape as the camera gate, deliberately.** `skillsAccessFor` in `server/routes.ts` is the
  only place the question is answered -- coach or admin, coached athlete, then Free Agent tier --
  and `requireSkillsAccess`, `requirePaidAiAccess("skillsAi")` and
  `GET /api/athlete/skills-access` all delegate to it. `useSkillsAccess` asks the server and
  imports no tier table; `undefined` until answered, and every call site requires an explicit
  `true`.
- **Two server gates, not one, and collapsing them breaks something either way.**
  `requireSkillsAccess` is the three-branch rule, for routes a coached athlete also reaches;
  `requirePaidAiAccess("skillsAi")` is the Free-Agent-only one, where `requireFreeAgent` has
  already established there is no coach. One gate everywhere would either lock out coached
  athletes or stop asking about the tier.
- **The reads were gated and the writes were not**, which is the wrong way round: a Free Agent on
  a tier without skills could not LIST their skill programs but could still create, edit and
  delete them. All three writes carry the gate now and the test asserts each by verb.
- **Hiding the tab is not the gate, and drawing a tab that always refuses is worse than no tab.**
  `SkillsGate` wraps all five athlete skills pages (scanned, not listed), and
  `athlete/programs.tsx` drops the Skill Programs and Skill Bank tabs from the Library strip
  without access. `FreeAgentGate` goes OUTSIDE `SkillsGate` on the Free-Agent pages: a coached
  athlete has skills access but does not belong on the Free Agent builder, so the "you have a
  coach now" answer has to come first.
- **What Basic and AI Coach keep:** training and nutrition logging, the exercise library, and (on
  AI Coach) the AI chat coach and program builder. The landing and pricing feature lists are
  derived from the flags now -- two lines there were hardcoded and both were wrong, promising the
  AI program builder on Basic and the camera on all three.

## A new device waits on the email

Added 2026-09-19. Scott: "if we notice a device that is not trusted, then have the app send a
message saying we don't recognize this device ... then they click the email tab, then accept the
new device, or deny it, if they deny it have them be guided to a new password screen because
obviously they were hacked." Every role, every device, including athletes; decided over the
coach-and-admin-only option with eyes open to the cost (an athlete whose email a coach typed
wrong cannot get in on a new phone until it is fixed).

`server/trusted-devices.ts` owns the rule; `server/new-device-approval.itest.ts` proves every
branch through the real login route and the real email.

- **A password alone signs in only on a device this account has used before.** Anywhere else the
  sign-in waits, an email goes to the account's address naming the device and its approximate
  location, and the person approves or denies it from there. The waiting device polls and signs
  itself in the moment it is approved. Deny drops every session and every trusted device and
  lands the denier on the new-password screen with a fresh reset token.
- **The question is put to something the owner already holds, never to the new device.** A
  "trust this device?" prompt on the new device is a checkbox a thief ticks. The email is the
  only thing that can decide, and the new device can only ask and, once approved, claim.
- **Order: password, device, then the authenticator code.** The device check runs BEFORE the
  TOTP step so a stolen password meets the inbox first. `server/trusted-devices.test.ts` scans
  the login route for that order.
- **A device is an id the client made up and kept**, `client/src/lib/device-id.ts`, sent on every
  request as `X-Forge-Device-Id`. It is not the User-Agent (every phone of one model shares that;
  session-tracking.ts uses it only for the friendlier "new login" notice) and only its hash is
  stored. A sign-in that sends no id is an unrecognised device that can be approved but never
  trusted.
- **The link in the email never acts.** Mail scanners fetch every link. The email has ONE button
  to a review page; the page has the two choices; only the POST decides. The unit test counts the
  hrefs and refuses a GET decide route.
- **The timer resets.** Trust lasts 30 days from the last sign-in on that device and every sign-in
  moves it forward -- the rule the session cookie already follows. Signing out forgets the device.
  Changing the password keeps the device in hand and forgets the rest; a reset forgets all.
  The account was created on its first trusted device, so signup never meets the email.
- **The three seeded demo accounts are exempt IN CODE**, `DEMO_ACCOUNT_EMAILS` in
  `server/device-trust-policy.ts` -- `coach@forge.app`, `athlete@forge.app`,
  `freeagent@forge.app`. This used to read "exempt by email, `DEVICE_VERIFICATION_EXEMPT_EMAILS`
  on Render", and that was both the wrong shape and, on 2026-09-21, simply not true: the
  variable was never set, so Scott could not sign in to any of the three ("I can't login for the
  demo accounts ... I obviously can't get to those emails as they don't exist"). An env var is
  the right control for a decision an OPERATOR makes -- an email outage, one account -- but these
  three are a fact about the software: the seed creates them and gives them addresses nothing
  delivers to. Never move this back into the environment.
  `DEVICE_VERIFICATION_EXEMPT_EMAILS` still works and ADDS to the list, for anything else.
  Matching is exact and `server/trusted-devices.test.ts` pins the three against the addresses
  `seed.ts` really creates, so a rename cannot leave a stale literal reading as covered.
  `admin@forge.app` is deliberately NOT exempt -- the admin account is Scott's, on a real inbox.
  **THE OWNER'S OWN TEMPORARY EXEMPTION IS GONE TOO (2026-10-11).** `TEMPORARY_ACCOUNT_EXEMPTIONS`
  held Scott's address from 2026-09-21, when the approval link 404'd, with its removal condition
  written on it; Scott confirmed the emailed link reaches the approval page ("that link worked")
  and the list is empty. So his account meets the device email like everyone else, and the thing
  to know for camera testing: **a deleted-and-reinstalled app forgets its device id, so the first
  sign-in after a reinstall waits on one approval from his inbox.** That is the protection
  working, not a bug; if it ever gets in the way of a filming session, the operator route is
  `DEVICE_VERIFICATION_EXEMPT_EMAILS` on Render for the day, never this list.
  **DONE 2026-10-11, ON SCOTT'S WORD, BEFORE THE APP REVIEW RESULT** (2026-10-04 he had said "delete
  them, i will keep using the admin role, so flag for later"; 2026-10-11: "Let's do all 4 ... scrub
  every data point that has ever existed for the beta accounts, especially Jordan athlete, he was
  18 where I'm 36 and all my numbers I've ever recorded were lower weights at testing numbers
  only"). The three review accounts AND the five seeded @example.com roster athletes are retired:
  the seed creates none of them, Forge-official exercises and the flagship program are created
  under the Forge identity directly (`libraryOwner`, Scott's account or `admin@forge.app`) instead
  of under the demo coach and handed over later, and `removeSeededDemoAccounts()` at the END of
  every seed run deletes any of the eight an environment still holds through
  `storage.deleteUserRecord` -- the same cascade and file cleanup as an account's own deletion,
  minus the password check, and the only other caller it may ever have. It runs last on purpose:
  `exercises.coachId` and `programs.coachId` cascade from `users`, so deleting the demo coach
  before the handoffs would take the library with it. `DEMO_ACCOUNT_EMAILS`,
  `COMPED_FREE_AGENT_ENTITLEMENTS` and `DEMO_ACCOUNTS_ALWAYS_SOLD_TO` are empty with their
  mechanisms kept; the per-lesson comped buyer, `DEMO_ACCOUNT_PASSWORD`, the terms-snapshot helper,
  the login page's dev block and the Jordan test-program script are gone. What the cascade does not
  reach is rebuilt or swept on its own: cohort norms rebuild nightly and the research mirror's
  sweep removes an orphan that never consented. **If 1.0 is still in App Review when this deploys,
  the review notes in App Store Connect name accounts that no longer exist** -- Scott's call,
  made with that said; the replacement is a real coach and athlete login he creates, with both
  addresses in `DEVICE_VERIFICATION_EXEMPT_EMAILS`.
  **Deployed 2026-10-11 00:27 UTC: the Render log shows all eight removed** (users 1, 2, 5-10),
  the site answered 200 straight after, and the itest run that captured the emails below lost
  exactly one file -- the demo-account itest deleted out from under it mid-run, not a real red.
- **THE NINE LAUNCH-AUDIT ACCOUNTS ARE PURGED TOO (2026-10-11), AND A COACH'S LOGO OUTLIVED THE
  COACH.** Scott: "Delete all accounts that you created, there are emails that were added through
  the beta that belong to people keep those, purge every inch of data that belongs to all of your
  generated beta accounts." The nine plus-tag addresses the 2026-10-10 audit signed up were put on
  a retired list in `server/seed.ts` for ONE deploy, each handed to `deleteUserRecord` in the same
  end-of-seed pass as the demo accounts; the log carried the id and role, never the address.
  **Deployed 2026-10-11 00:56 UTC: the Render log shows users 19, 20, 21, 23, 24 and 25 removed and
  the inventory at nine accounts** -- 3 and 4 (admins), 11, 12, 15 (coaches), 13, 14, 16, 18 (Free
  Agents), all from August and September, made by people, on no list. Every program, assignment,
  logged day, waiver, nutrition row, team, consent record and upload they made cascaded or was
  unlinked with the rows. **The list was then REMOVED from the seed the same hour**, on Scott's
  "every single piece of code associated with" them: the purge had run, and the harness,
  credentials file, cookie jars and screenshots in the session scratchpad went with it, so nothing
  in the repo or the sandbox names those addresses any more. The admin-owned "Strength" program
  and "Mcconnell Raises" exercise are Scott's, not the audit's, and stay. **The gap this found:**
  `deleteUserRecord`'s coach branch removed authored comment media only, so `users.brandLogoUrl`
  and `teams.brandLogoUrl` files stayed on disk after the row and the team cascaded -- in
  `team-logos`, the one upload directory that is public by URL on purpose, so an orphan there is
  the one kind anybody could still fetch. Both are removed now. The checklist rows that used these
  accounts (device email, three tiers, under-13 claim, the guardian's URLs) are made fresh from
  `docs/pre-launch-audit-accounts.md` when Scott runs them.
- **THE SEEDED ADMIN KEEPS ITS ROW AND LOSES ITS LOGIN** (2026-10-11). Scott: "I think you created
  an admin account too? Delete just the login credentials." `admin@forge.app` is created by the
  seed on a fresh environment and is the library owner wherever Scott's own account does not exist
  (the library cascades from it), so the ROW stays; `lockSeededAdminLogin` in `server/seed.ts`
  replaces its password hash with one no password can produce (a valid hash.salt shape, so
  `comparePasswords` answers false instead of throwing) and drops its web and tracked sessions.
  **Only an account nobody has ever signed in to**: `lastActivityAt` is written by every completed
  login, so null means the seed made it and nobody used it, and a reset-and-sign-in later sets the
  timestamp and the seed never re-locks it -- an admin somebody HAS used is their credential, not
  the seed's, and the log says so instead. Proven three ways on a throwaway database (locked on
  the first run with its session row gone and another user's kept, silent on the second, left
  alone once used). **Deployed 2026-10-11 01:09 UTC: the Render log reads "Locked the seeded
  admin's login (user 4)"** -- so the seeded admin is account 4 (created 2026-08-02) and Scott's own
  admin is account 3, the reverse of what this entry first guessed; the lastActivityAt rule chose
  correctly without the guess. The way back in, if ever wanted, is the password reset to that address.
  **AND THEN REMOVED OUTRIGHT, SAME NIGHT.** Scott: "I thought I asked you to remove the
  admin@forge.app?" The row had been kept as the library owner of last resort; on an environment
  that has Scott's account it is not needed. `retireSeededAdmin` in `server/seed.ts` runs at the end
  of the seed when Scott's account exists: it reads EVERY column that points at `users.id` off
  `information_schema` at run time (never a list in the file, so a table added later is classified
  or refused, never silently cascaded), REASSIGNS the content the admin owns to Scott by plain
  UPDATE (exercises, programs, classes, uploads, knowledge, reference clips, ...), lets the
  account's own rows cascade (sessions, tokens, devices, its own audit trail, ...), and REFUSES --
  keeping the row, locked as before, and naming the table in the log -- if a CASCADE column on
  neither list still holds a row for it. And the seed creates `admin@forge.app` only when Scott's
  account does not exist, so a fresh dev database still has an owner and production never grows it
  back. Proven three ways on a throwaway database: refused while it owned a roster link, handed its
  lift and program to Scott and deleted once the link was cleared, absent on the run after.
- **AND THEN REACTIVATED FOR THE LAUNCH AUDIT, ON A SWITCH SCOTT HOLDS** (2026-10-11, later the
  same night). Scott: "reactivate the admin@forge.app with password <his choice>", after
  "build the admin login like i just stated, no excuses ... then delete the admin profile when
  everything is done." `SEEDED_ADMIN_PASSWORD` on Render is the switch and its value is the
  password HE issued (set by the session at his word, never generated by it and never in a file):
  while it is set the seed creates `admin@forge.app` beside Scott's account, re-applies that
  password on every deploy, and skips both `retireSeededAdmin` and `lockSeededAdminLogin`; the
  moment the variable is deleted and the service redeploys, the rule above runs again and the row
  is handed over and removed. Its address is in `DEVICE_VERIFICATION_EXEMPT_EMAILS` for the same
  window (an operator exemption, not a code one, because it is temporary). Proven four ways on a
  throwaway database: created when set, silent when unchanged, password rotated when the value
  changes, retired when unset. **The way to delete it is to delete the variable and the exemption
  and redeploy**, which is what closes the launch rows that needed an admin.
- **AN ADMIN-ASSIGNED TIER WAS REFUSED WITH BILLING LIVE, AND THE REVIEW ATHLETE WAS THE FIRST TO
  HIT IT** (2026-10-11, found the first time the launch audit assigned a tier through the admin
  login above). `hasAthletePaidForAiAccess`'s live branch demanded an ACTIVE `subscriptions` row
  before it would read `freeAgentTier`, so AI Coach + Video assigned on More -> Users to an
  account with no row (every admin grant ever made) or a cancelled one (account 28, after the
  live Stripe purchase and cancellation) assigned nothing: camera and skills answered
  `tier_excludes_camera` / `tier_excludes_skills` while the upgrade screen showed the tier as
  current. The row decides a TRIAL and nothing else now; a tier on file is a live purchase or an
  admin's grant, because the Stripe webhook and the Apple expired/revoked/refund path CLEAR it
  when a purchase lapses. `free-agent-tier-entitlements.test.ts` pins that the live branch has no
  `return false` and no active/past_due test. Proven on production after the deploy: Basic and AI
  Coach refused, AI Coach + Video allowed, and the review athlete is left on AI Coach + Video.
  **Had this shipped to App Review as it was, the reviewer's camera would not have worked.**
  **Rows closed with the admin login, all against production:** intake import -> claim at
  /claim/:code -> on the roster -> deleted through the real path (needs the coach on a band:
  a coach with no plan has a cap of zero, so the review coach wore the 0-5 band for the test and
  was put back to none); the three tiers on one account; the reader with All Classes on (chapter
  two reads `locked` behind chapter one's quiz, not `locked_tier`; a 60% attempt is graded and
  fails the 80% bar; six cards in the review deck; Continue points at the quiz; streak 1;
  certificate 409 until every lesson is finished) and `locked_tier` again the moment the add-on
  came off; 55 of the 58 admin GET routes answer 200 (the three 400s want a date or a path) with
  no review address on any analytics surface and no athlete email or name on the Users page; a
  same-text PUT on the EULA, a Forge exercise created/renamed/deleted (an admin-created exercise
  is `isForgeOfficial: false` until flipped, by design), a track and a class created/edited/deleted;
  the four queues answer 200 and the DMCA agent address renders on the live Terms. The review
  athlete keeps one Football-class enrolment, one read chapter and one failed quiz attempt from
  this, which is what a reviewer would leave too. **The admin login was retired the same hour**
  by deleting `SEEDED_ADMIN_PASSWORD` and its exemption and redeploying (see the entry above).
- **TWO APP REVIEW ACCOUNTS EXIST ON PRODUCTION (2026-10-11), AND THEY ARE THE ONLY TWO.** Scott:
  "what two review addresses? can you just make them?" Made through the real signup with the invite
  code: account 27, a head coach (planned headcount 10, no plan, no Coaches Corner -- on purpose, so
  the reviewer can BUY Coaches Corner in sandbox, which is what the review notes promise) and
  account 28, an adult Free Agent with the biometric consent given. Both addresses are plus-tags on
  Scott's inbox and both are in `DEVICE_VERIFICATION_EXEMPT_EMAILS` on Render (set by the API, read
  back). The logins are in the session's scratchpad `review/` and were handed to Scott as a file,
  never printed in a log or a commit. They are NOT on any retired list and the seed never touches
  them. **Still Scott's:** assign the athlete AI Coach + Video on `/admin/billing` (enforcement is
  on, so an unassigned Free Agent has no camera, and the review notes describe one), and replace the
  demo logins in the App Store Connect review notes with these two.
- **THE FIRST LIVE STRIPE PURCHASE AND CANCELLATION, 2026-10-11, AND THE TWO THINGS THEY FOUND.**
  Scott bought Basic ($4.99) on the website with his own card as the review athlete (account 28)
  and cancelled it from the Stripe dashboard minutes later. Both webhook deliveries landed on
  `/api/billing/webhook` (04:50:07 and 04:54:25 UTC, 200, no retries), the tier was written on
  purchase and the subscription row went `canceled` on the cancellation -- so the live key, the
  endpoint URL (the service's own `forge-ebhd.onrender.com` host, which is fine; an earlier note
  calling it the wrong path was wrong, the 404 it cited was a request to a different path) and the
  signing secret are all proven. **Found 1: a cancelled Free Agent kept its SKU.** The paid gates
  closed, because `hasAthletePaidForAiAccess` reads the subscription row's status first under
  `BILLING_LIVE`, but `users.freeAgentTier` was never cleared, so the upgrade screen kept marking a
  cancelled plan as current. `customer.subscription.deleted` and the Apple expired/revoked/refund
  path now clear it for a `free_agent` row (`billing.test.ts`). Account 28 still reads `basic`
  from before the fix; clear it on `/admin/billing` or leave it, it grants nothing.
  **Found 2, mine: the beta-ending one-shot sat 1,700 lines ABOVE the `applied_backfills` CREATE
  it reads**, so the reconciler failed on a FRESH database ("relation applied_backfills does not
  exist") -- production never noticed because the table already existed there, and CI's
  integration job, which starts empty, went red on `02c5bf47` and the two commits after it. Render
  auto-deploys on push, so every commit still reached production. The one-shot now sits below the
  table; the ALTER COLUMN SET DEFAULT stays beside the column. This is exactly the "migration
  order matters" rule in the Coaches Corner section, and exactly the check the Tests section says
  to run on any reconciler edit -- which was skipped that hour and cost three red runs.
  **Found 3, also mine, on the run that fixed found 2: NINE INTEGRATION FILES ASSUMED A FRESH
  ACCOUNT WAS COMPED.** The integration config runs with `BILLING_ENFORCEMENT_ENABLED=true` and
  had only ever passed because `isBetaAccount` defaulted true on every fixture row; with the
  column defaulting false, every feature test on the coach side met a real 402 (18 tests across
  academy, Coaches Corner, discussion, digest, branding, plan-at-signup). **A test account is
  comped unless the test says otherwise**: `makeCoach`, `makeAthlete` and `makeLoginableUser` set
  `isBetaAccount: true`, and the five files that test the wall itself pass `false` explicitly and
  are untouched. `plan-at-signup` now asserts a signup is billed, which is the new truth. The same
  run found a real bug: a coach WITHOUT Full Personalization saving only the gated branding fields
  arrived at `updateCoachBranding` with an empty patch, drizzle threw "No values to set" past the
  route, and the request hung. An empty patch is a read now (`branding-page.itest.ts`).
- **THE FOUR CHECKOUT ROUTES READ SIDE BY SIDE, AND THREE OF THEM TOOK MONEY THEY COULD NOT
  HONOUR** (2026-10-11). Six claims about the billing paths were put to me; I checked each
  against the code myself. **Five were real, one was not**, and the one that was not is worth
  knowing because it looks identical to the others.
  **A COACHED ATHLETE COULD BUY A FREE AGENT TIER.** `/api/billing/checkout/free-agent-tier` had
  `requireRole("athlete")` and no `requireFreeAgent` -- while the ADD-ON route immediately below
  it has carried that guard since the day it was written. So the route that takes four times as
  much was the open one: $19.99 a month for AI Coach + Video from an athlete whose camera, skills
  and AI already come from their coach, and whose gates resolve through the coached branch and
  never through `users.freeAgentTier`. Money for something they already had. The client could not
  reach it (`athlete/upgrade.tsx` is behind `FreeAgentGate`), which is exactly why it needed
  closing at the route: **hiding a button is not a permission check** is the standing rule in
  this file, and a checkout is the last place to lean on one.
  **AND AN ASSISTANT COACH COULD BUY THE PROGRAM'S PLAN AND ADD-ONS ONTO THEIR OWN ROW.** Both
  coach checkouts charged the SESSION coach and wrote the purchase to the SESSION coach's row,
  while every read resolves off the PRIMARY's: `getEntitlementsForCoach` takes `coachIds[0]` and
  `ownsCoachesCorner` looks the primary up by hand. So an assistant could pay the band price, or
  $19.99 for Coaches Corner, and the program would be granted nothing -- the band landing in a
  column nothing reads. **Not a direct-POST hole**: `/coach/billing` drew Subscribe and the
  add-on buy button for any staff coach, because that page never asked. `user.isPrimaryCoach` has
  been on `/api/auth/me` all along and only `coach/branding.tsx` read it. An assistant could do
  this by tapping. Both routes carry `requirePrimaryCoachForBilling` now, and `primaryCoachOnly`
  is the ONE implementation with the message as its parameter -- "Only the primary coach can
  change this" reads wrong in front of a card, where what an assistant needs is who to ask.
  **THE APPLE HALF IS A GRANT, NOT A REFUSAL, AND THE DISTINCTION IS LOAD-BEARING.** StoreKit
  takes the money before the server is ever asked, and the phone does not finish a transaction
  the server refuses -- so refusing an assistant's purchase would leave it replaying at every
  launch forever, which is build 611's bug and the reason `RETIRED_APPLE_PRODUCT_IDS` exists. The
  web route refuses before any money moves; `applyAppleIapVerification` now writes a coach add-on
  to `getPrimaryCoachId(userId)`, the row that can carry it, with the buyer kept in the audit row
  (`grantedToPrimaryCoachId`) since the add-on is the program's and the receipt is theirs. The
  Coaches Corner upsell withholds its StoreKit button from an assistant, which is what stops them
  paying by accident in the first place.
  **A FREE AGENT UPGRADING ON THE WEB WAS BILLED FOR BOTH TIERS, FOREVER.** `subscriptions.userId`
  is UNIQUE, so one account has one row and that row holds the TIER's Stripe subscription (an
  add-on's lives in `users.addOnTerms`, which is what makes the fix safe). The handler overwrote
  that id with whatever had just been bought and **nothing cancelled what it replaced** -- Basic
  -> AI Coach + Video on the web meant $4.99 AND $19.99 a month with nothing left in Forge that
  could find the older one. **Apple cannot do this to us, and that comparison is what makes it a
  bug**: all three tiers share ONE App Store subscription group precisely so a swap replaces
  instead of stacking, which is why the two AI ids were recreated as `_v3` on 2026-10-05. The web
  rail had no equivalent. `cancelSupersededStripeSubscription` cancels it with
  `prorate` + `invoice_now`, and is best-effort with an audit row naming what an operator must
  finish by hand -- the purchase has already succeeded and throwing here would roll back access
  somebody paid for to fix a billing duplicate. Same posture, same reason, as the
  guardian-verification refund a few lines above it.
  **AND THE SAME HANDLER COULD NOT RECORD THE SUBSCRIPTION ID AT ALL FOR AN ACCOUNT WITH NO ROW
  -- SIX DAYS AFTER THE APPLE HALF OF THAT WAS FIXED.** `updateSubscriptionByUserId` is a plain
  UPDATE; the row is created at signup by `createTrialSubscription`, which a COACHED athlete
  never meets, so an athlete who later lost their coach is a Free Agent without one. The tier was
  still granted (`updateFreeAgentBilling` writes `users.freeAgentTier`, which is what every gate
  reads), so **the purchase looked fine** -- and `stripeSubscriptionId`, the handle every later
  event matches on, was never written. So `customer.subscription.deleted` found nothing, the SKU
  was never cleared, and a cancelled or refunded tier went on working forever: the bug found on
  the first live cancellation, in the one case where the fix for it cannot fire at all. It
  upserts now, exactly as `applyAppleIapVerification` has since 2026-10-05, and clears
  `cancelAtPeriodEnd` so an account that cancelled and came back is not carrying the flag off the
  subscription it replaced. **Fifth instance of the class this file keeps naming**: a correction
  wired to one of the two paths, invisible because the path that IS taken looks like it worked.
  **EXTRA VIDEO STORAGE WAS PRICED AT $9.99/mo ON `/pricing` WITH NOTHING BEHIND IT.**
  `users.hasVideoStorageAddOn` has no Stripe Price, no checkout route, no App Store product and
  no control on the athlete's own upgrade screen -- an admin ticks a box on `/admin/billing` and
  that is the only way it has ever been granted. It is **the same bug as the three withdrawn
  sport coaches a few lines above it on the same page**, which the 10-08 price sweep caught; that
  sweep could not catch this one, because it scanned for `SPORT_COACH_ADD_ON_IDS` -- the thing it
  already knew about. The page now states the included caps (5 favorited / 10 total, every plan)
  and no price. `every-public-price-can-be-bought.test.ts` **discovers** the prices instead: it
  reads `shared/` for everything that defines a `monthlyPriceCents`, reads each public marketing
  page, and requires every price a page renders to be BUYABLE with its rail named or listed in
  `PRICED_WITHOUT_A_CHECKOUT` with a reason over eighty characters. There is one such entry --
  Full Personalization at $24.99, admin-assigned by Scott's decision ("we won't be adding to
  apple, which is fine", 2026-10-08) -- so the machinery exists, the list is nearly empty, and a
  third entry costs a sentence that shows up in a grep. Same shape as `FITTED_OVERRIDES` and
  `NOT_PUBLIC_ON_PURPOSE`.
  **THE ONE THAT WAS NOT A DEFECT, recorded so it is not re-raised**: the store verify paths map
  every add-on in `FREE_AGENT_ADD_ON_ORDER`, withdrawn ones included, so an Apple transaction for
  a withdrawn sport coach would be honoured. That is the DECIDED design, not an oversight --
  `ALL_FREE_AGENT_TIER_IDS` exists precisely because "what is for sale" and "what has ever been
  sold" are two questions, and `entitlementsForFreeAgentTier` ignores the withdrawal list "so a
  withdrawal can never revoke a feature somebody is paying for". A withdrawal stops new SALES
  (the checkout refuses, `addOnIsOffered` draws no card, the product is pulled at Apple) and
  never refuses or revokes a purchase. The three sport coaches have no App Store product anyway.
  **AND A TEST WENT RED FOR A COMMENT, WHICH IS ITS OWN LESSON.**
  `stripe-checkout.test.ts` asserted `requireWebCheckout` appeared within `idx + 220` CHARACTERS
  of each route's path; the paragraph explaining the new guard pushed it past 220. A window
  measured in characters fails for prose and, worse, PASSES for a route whose guard sits 219
  characters away in an unrelated handler. It reads the middleware list now -- from the path to
  the handler's own `async (`, which is exactly the middleware and nothing else -- the same way
  the new checkout scan discovers it.
  Four files of tests, every one mutation-tested: `one-account-never-pays-twice.test.ts` (9 cases,
  three mutations), `a-checkout-only-takes-money-it-can-honour.test.ts` (9, four mutations) and
  its `.itest.ts` twin driving the real routes against Postgres, where each refusal asserts **403
  and not 503** -- a refusal about WHO is asking has to come before anything about whether Stripe
  is configured, or the guard is decorative on a correctly-configured server and nowhere else;
  503 is what all three returned before this. Server-side except the two coach surfaces and
  `/pricing`: `verify_build`.

## THE 2026-10-14 BILLING SWEEP: EVERY PLACE A FACT ABOUT MONEY LIVES TWICE

Scott, with every Apple and Stripe price in place and one real posted purchase and refund behind
us: "sweep it then ... people can purchase our product, everything works from sandbox and a real
posted purchase with a refund." The happy path is proven; this is what the sweep found around it.
**ONE SHAPE ACCOUNTS FOR MOST OF IT, and it is the same shape the 10-11 sweep found: a fact about
money lives in TWO places and a writer touched one of them.** The pairs, each load-bearing:
`users.freeAgentTier` beside the `subscriptions` row; `freeAgentAddOns`/`billingAddOns` beside
`users.addOnTerms`; and the subscriptions row's own per-rail handle columns. Before adding a
writer to any of them, say which other place the same fact lives in.

- **AN ADMIN COULD NEVER RE-GRANT A REFUNDED ADD-ON.** The admin billing panel is the only way an
  add-on is ever comped, and it wrote the owned ARRAY alone -- while `addOnIsActive` reads the
  TERM beside it, where a refund stamp is final and a cancellation's `accessUntil` can be in the
  past. So ticking All Classes for a refunded account saved cleanly, read back ticked, and granted
  nothing, **for good**: no other write in the repo clears `refundedAt`. `reconcileAdminAddOnSave`
  in `shared/add-on-terms.ts` is the rule, beside `addOnIsActive` and with `nextAddOnTerms` moved
  there unchanged so it is a pure function testable with no database. **AN ADMIN GRANT IS NOT A
  PURCHASE** and that decides its shape: the stamps that make the grant inert are cleared, and
  nothing is invented in their place -- no fresh `purchasedAt` (it would open a 72-hour refund
  window on money nobody paid) and no provider handle (Forge sold nothing here). **And a removal
  is REPORTED, never acted on**: un-ticking closes access, the provider keeps charging, and this
  server does not cancel somebody's subscription as a side effect of a checkbox -- so the writer
  warns with the subscription id, logs `add_on.removed_by_admin_still_billing`, and the panel
  names it in a 30-second toast. Same posture as the self-serve cancel route's
  `alsoCancelInAppStore`: say it plainly rather than report a cancellation that did not happen.
  `an-admin-grant-reaches-the-add-on.test.ts` + `.itest.ts`, nine mutations.
- **ONE SUBSCRIPTIONS ROW, TWO RAILS: EITHER ONE ENDING TOOK THE OTHER'S TIER AWAY.** The row is
  UNIQUE on userId and has a column per rail, and neither purchase path cleared the other's. Buy
  Basic in the app, upgrade on the web, then stop the App Store subscription in iOS Settings --
  which is exactly what moving rails looks like -- and Apple's EXPIRED found the row by its Apple
  id and nulled `users.freeAgentTier`, so the athlete paying Stripe $19.99 a month lost the
  camera. The other direction is likelier still: cancel the web one in the Stripe portal and
  `customer.subscription.deleted` nulls the SKU Apple is paying for. **THE RULE IS NOW: A PURCHASE
  TAKES THE ROW, AND THE ROW NAMES ONE RAIL.** The loser's handle is cleared; a superseded Stripe
  subscription is cancelled (Forge can), an App Store one is warned about and recorded (only the
  person can, in iOS Settings) and the web upgrade screen says so BEFORE the second charge. A row
  carrying both is a legacy account and **neither revocation branch clears its SKU** -- withholding
  access from somebody who may be paying is the worse error. **The old comment on the checkout path
  had named this case and left it alone**, judging it a cosmetic duplicate; the access loss is what
  makes it a bug, and the objection it rested on (clearing the Apple id blinds the notification
  lookup) is answered by the app's own verification writing the handle back at the next launch.
- **`billing_audit_log.stripe_event_id` IS UNIQUE, AND `revokeEverythingForSubscription` PASSED ONE
  DELIVERY'S ID TO TWO INSERTS.** It is the idempotency check `handleStripeWebhookEvent` makes, so
  the second insert throws, 500s the refund webhook, and leaves Stripe retrying a delivery that has
  already done half its work. Both halves can find something (an add-on's subscription id lives in
  `users.addOnTerms`, matched by a text LIKE; a tier's in the subscriptions row). One row per
  delivery claims the id now; the rest carry it in their detail. **Mocked storage has no constraint
  to violate, which is why no unit test could see it** -- the itest drives the real handler against
  real Postgres, and that is the general lesson: a uniqueness rule is only testable where the index
  exists.
- **AN APPLE REFUND REACHED ONE OF SEVERAL ACCOUNTS HOLDING THAT TRANSACTION.**
  `appleOriginalTransactionId` carries no unique constraint and one subscription can land on two
  accounts (detected and warned about since 10-13, never refused -- Apple has taken the money by
  then). The handler took `[row]` off an `UPDATE ... RETURNING` that cancelled every row, so the
  refund cleared one SKU and left the other account a free tier; the renewal branch granted the
  tier to one of them for the same reason. Both branches loop every holder
  (`subscriptionRowsForAppleTransaction`).
- **FIXED 2026-10-15, WITH A LOCK RATHER THAN THE SQL THE SWEEP SKETCHED: every writer of
  `users.addOnTerms` was a read-modify-write of the WHOLE json object.** `addFreeAgentAddOn`, `addCoachBillingAddOn`,
  `scheduleAddOnRemoval`, `restoreAddOn`, `revokeAddOnAfterRefund` and the admin save all
  `getUser` then `set({ addOnTerms: nextAddOnTerms(...) })`, and the owned ARRAYS are written the
  same way -- so two writes landing on one account inside the same few milliseconds lose one of
  them entirely. The collision is across add-ons, not just within one: a Free Agent add-on and a
  coach add-on write different array columns and the SAME terms object. **The consequence is this
  file's recurring shape**: a lost term is an add-on whose `stripeSubscriptionId` was never
  recorded, so nothing can ever cancel or refund it, silently and for good; a lost array append
  is an add-on that was paid for and not granted. **The sketch in the first version of this entry was the
  worse answer and is kept because the reasoning is what decided it**:
  `jsonb_set(coalesce(add_on_terms::jsonb,'{}'), ARRAY[$id], $term::jsonb, true)::json` writes one
  key and cannot clobber another add-on's, plus a containment-guarded `||` append for the array --
  but it is fiddly on a `json` (not `jsonb`) column, it needs two statements, and **it does
  nothing for the narrower same-id race**, because a purchase's term is COMPUTED from the prior
  record (it clears `accessUntil` and `refundedAt`). That last clause is the answer: the thing
  wanted was a transaction, so the transaction is the whole fix.
  **`mutateAddOnsAtomically` in `storage.ts` is it** -- one `db.transaction` that reads the row
  `.for("update")` and writes it on the transaction's own handle, with a PURE `decide` callback
  returning the patch plus whatever the caller reports. All seven writers go through it
  (`addFreeAgentAddOn`, `addCoachBillingAddOn`, `scheduleAddOnRemoval`, `restoreAddOn`,
  `revokeAddOnAfterRefund` and both admin saves), in the idiom `publishMovementProfile` already
  used. The read deliberately does NOT go through `getUser`: that is memoised per request, and a
  memo filled before the lock was taken is exactly the stale read this exists to stop.
  **The admin saves BRANCH, and that is load-bearing.** `updateFreeAgentBilling` is also how the
  Stripe and Apple paths write `users.freeAgentTier` -- the hot path every purchase takes -- so
  only the branch carrying an owned array (the admin panel's PATCH, the only caller that sends
  one) takes the lock; the WHOLE patch goes inside it, since writing the arrays and the terms in
  two statements leaves them able to disagree. The returned row is built from the locked row plus
  the patch rather than from a RETURNING clause, so what it reports is exactly what that
  transaction wrote.
  **`two-add-on-writes-never-lose-one.itest.ts` is REAL concurrency**, not a simulation:
  `Promise.all` over the actual methods against real Postgres, twelve rounds a case. Remove the
  `for("update")` and SEVEN of its eight cases go red -- the transaction alone is not the fix, the
  lock is. The eighth states the same-id property and says in its own comment that it still passes
  without the lock, so nobody reads it as proof.
  `every-add-on-write-takes-the-lock.test.ts` is the ratchet beside it and DISCOVERS the writers
  from the source: an `addOnTerms:` write anywhere outside the named seven fails it, which is the
  assertion direction this file keeps having to relearn.
- **FIXED 2026-10-15: a Free Agent who self-enrolled in Forge classes and later joined a coach
  read every paid chapter free.** `classTierGated` asked the ATHLETE ("do they have a coach")
  where Scott's rule is about what the COACH gave ("only the ones their coach gives to them"), and
  the catalog being Free-Agent-only was what did the work -- a coached athlete had no other way to
  hold a Forge enrolment they were not given.
  **THE DECISION IS PER ENROLMENT NOW, NOT PER ATHLETE**, which is what a boolean could not
  express: `classGateFor` returns a `ClassAccessGate` (`shared/class-pricing-rule.ts`) and
  `classGateStateFor` applies it against `classEnrollments.coachId`, which equals the athlete for
  a self-enrolment. One account can hold one of each and they are gated differently, which an
  itest case asserts head-on.
  **The state is `locked`, NOT `locked_tier`** -- the half the 10-14 note correctly named as the
  blocker. `locked_tier` renders `AllClassesCard` and `requireFreeAgent` refuses that purchase to
  a coached athlete on both rails, so gating them that way is a dead buy button; plain `locked` is
  the ordinary not-open-yet state and the thing to do about it is ask their coach. No new state,
  no client change, server-only deploy. The copy is the generic one, which is the known cost.
  **AND THE ADD-ON IS CHECKED BEFORE THE COACH**, which is what keeps the fix from costing
  somebody something: All Classes was sold as "the whole catalog, current and future, for any
  athlete on any plan or with any coach", so an athlete who BOUGHT it and then joined a program
  keeps every chapter. Closing a free-access hole by taking away chapters somebody paid for would
  be the worse bug, and asking about the coach first does exactly that -- there is a mutation test
  for the ordering. `shared/a-class-the-coach-did-not-give.test.ts` (pure, four combinations plus
  the ordering scan) and three new cases in `server/class-pricing-rule.itest.ts`.
- **AND FOUR MORE, 2026-10-15, FINISHING THE SWEEP'S OWN LIST.** Each one the sweep had either
  named as open or not reached at all:
  **A RETRIED CHECKOUT GRANTED A TIER NOBODY WAS PAYING FOR, PERMANENTLY.** Stripe retries a
  failed delivery with backoff for up to three days and promises no ordering BETWEEN event types,
  so a `checkout.session.completed` can be re-delivered long after the subscription it created was
  cancelled or died in dunning -- and that subscription's `customer.subscription.deleted` can be
  processed FIRST, match on an id this handler has not written yet, find nothing, and do nothing.
  Either way the retry grants with no live subscription behind it and **nothing is left that can
  ever take it back**: the revocation already ran, and `wasStripeEventProcessed` refuses to run it
  twice. Free access for good, out of one transient 500. `stripeSubscriptionIsDead` asks Stripe
  for the CURRENT status (terminal only -- `past_due` is dunning still trying and `trialing` is a
  live subscription that has not charged), and the guard sits ABOVE every subscription-mode branch
  rather than with the tier: an add-on has its own Stripe subscription, its id lives in
  `users.addOnTerms`, and both add-on revocation paths match on that id, so it is the same hole one
  table over. **FAIL-OPEN** on an unreadable answer or no Stripe client, in the direction that
  costs Forge rather than the buyer -- the common delivery is the first one, seconds after a
  successful checkout, and refusing on unknown lets an API blip take away access somebody just
  paid for. Same posture as the guardian-verification refund. The delivery's id is claimed on the
  refusal row so Stripe stops retrying. `a-grant-needs-a-live-subscription.test.ts`, 15 cases,
  four mutations.
  **A FAVORITED DRILL CLIP WAS EXEMPT FROM THE CAP THE STORAGE ADD-ON RAISES.** Two retention
  rules, two places. The TOTAL cap is the nightly sweep and has always covered both sides (its
  rows carry `source: "set" | "skill"`); the FAVORITED cap is a synchronous trim on save --
  because un-favoriting deletes nothing and so needs no grace window -- and it read workout tables
  only, with one caller, `submitWorkoutLog`. So an athlete could favorite every drill clip they
  ever recorded. That is the cap the $9.99 add-on raises (5 -> 10), which makes an unenforced cap
  on one side something somebody paid for and did not get, and on a minor's account it is a
  data-minimisation promise going unkept for every drill. `enforceSkillVideoRetention` is the
  twin, and two things about it are load-bearing: it filters on `skillSessionLogs.athleteId`
  rather than joining through `skillDayLogs`, because `skillDayLogId` is NULLABLE and
  `createSkillSessionLog`'s plain-append fallback leaves it null (the mutation that passes every
  other assertion); and it runs at all THREE exits from that method and on every save, not only
  one carrying a video. `the-favorited-cap-covers-drills-too.test.ts` + `.itest.ts`, seven
  mutations; the unlimited no-op is scan-only on purpose, since with the guard gone the comparison
  is `length > Infinity` and nothing observable changes.
  **A PROMOTED COACH RAN A ROSTER AND WAS NEVER ASKED FOR THE INSTITUTIONAL SERVICE AGREEMENT.**
  `getInstitutionalAgreementStatus` keyed on `plannedAthleteCount || billingTier` -- what the
  school SAID or what they PAID, both statements -- and three ordinary paths produce a primary
  coach with neither: `setUserRole` (an admin's "Change role") writes no plan; an assistant who
  joined by staff invite code is deliberately given none and becomes primary the moment they
  leave the staff; and a coach can clear their own number. Each then builds a roster and the
  documents page draws nothing, which is a **legal surface failing silently** -- the shape this
  file has now found five times. The roster is consulted LAST and only when both columns are
  absent, so neither existing behaviour moves (a school that stated a number and added nobody
  still owes it), and ONE athlete is enough, because the agreement is about handling a program's
  athletes at all. A staff coach still reads the primary's and never signs their own.
  `a-roster-is-asked-for-the-agreement.itest.ts`. No money impact; it is the paperwork.
  **AND THE SKILL BANK / SELF-ENROLMENT / `addOnTerms` ITEMS the sweep left open are closed in
  the entries above.**
- **AND THREE MORE ON THE ADD-ON RAIL, 2026-10-15, FROM AN AUDIT THAT DIED HALFWAY.** The panel
  lost 29 of 63 agents to a session limit, including its completeness critic, so one finding
  reached both verification lenses and the rest arrived unverified. Every claim below was checked
  against the code before anything moved, and **one of the three was reported against the wrong
  route** -- the consequence held and the mechanism was one route over, which is the argument for
  never acting on an agent's report directly.
  **AN APPLE ADD-ON PURCHASE CANCELLED THE CARD SUBSCRIPTION AND THEN REVOKED WHAT IT HAD JUST
  SOLD.** `nextAddOnTerms`' purchase branch is `{ ...prior, purchasedAt, accessUntil: undefined,
  refundedAt: undefined }` -- it resets the two stamps and carries every OTHER key of the prior
  term through, the other rail's handle among them. So buying All Classes or Coaches Corner in the
  app on an account that had bought it on the web left BOTH handles on one term:
  `supersededStripeSubscriptionId` then names the old Stripe id (an Apple purchase passes no
  `provider.stripeSubscriptionId` to compare against), the route cancels it, Stripe sends
  `customer.subscription.deleted`, and `endAddOnsForDeletedStripeSubscription` matches
  `term.stripeSubscriptionId === S` -- still S -- and ends the add-on just paid for. The TIER has
  had both halves of this rule since 10-14; the add-on had neither, one table over, which is why
  the sweep that fixed the tier missed it (its itest exercises a TIER product and the term was
  never in scope). The clear is guarded on the purchase NAMING a rail, so an admin grant -- which
  passes no provider -- never wipes the handle of a subscription still billing, that handle being
  the only thing that can ever cancel or refund it. The superseded APPLE id is handed up and
  recorded, never acted on: only the person can stop an App Store subscription.
  **AND THE PAID MONTH HAD NEVER ONCE BEEN HONOURED.** `billing.ts` read `current_period_end` off
  the `Subscription`, and Stripe REMOVED that field and moved it to `SubscriptionItem` (SDK
  22.5.0, API 2026-07-29.dahlia; the CHANGELOG says so in two lines and the installed interface
  carries only `cancel_at_period_end` -- there is now a case asserting that against the package on
  disk). An `as unknown as` cast silenced the one compiler error that would have said so. So the
  read was ALWAYS undefined, `addOnAccessUntil` ALWAYS `new Date()`, and every Stripe add-on
  cancellation took the `accessUntil <= now` branch: `revokeAddOnAfterRefund`, which strips the
  add-on AND stamps `refundedAt`. A coach who cancelled Coaches Corner in the Stripe portal lost
  it that second instead of at the end of the month they had paid for, and the stamp meant
  `restoreAddOn` could not give it back -- only an admin tick clears that. The exact inverse of
  Scott's rule, under a comment that had promised the paid month since the day it was written.
  **A COACHED ATHLETE'S RECEIPT REPLAYED AT EVERY LAUNCH, FOREVER, WHILE APPLE CHARGED.**
  `POST /api/account/apple-iap/verify` -- the route the app actually calls -- answered 403 "A
  coached athlete's plan is their program's", a true sentence and the wrong act. `verifyAndFinishOnce`
  finishes on exactly 410 and 409, the two refusals that can never become a grant; a 403 fell to
  the bare `throw`, so StoreKit re-sent it at every launch indefinitely. Reachable with nobody
  doing anything odd: buy a tier as a Free Agent, then join a program. **Finishing it would have
  been the wrong fix** and that is why this is a GRANT: unlike 410 and 409 this refusal is
  TEMPORARY -- leave the program and the subscription is grantable again -- so finishing it
  discards a subscription somebody is still paying for. Same answer CLAUDE.md already settled for
  an assistant coach's add-on receipt. **Recording it grants nothing extra**, which is what makes
  it safe rather than a free-access hole: `cameraAccessFor` and `skillsAccessFor` return on the
  coached branch BEFORE the tier is read, so `users.freeAgentTier` sits inert and stops being
  inert the day they leave the program -- the right outcome for money they paid. The warning and
  the `apple_iap.coached_athlete_purchase` row say they are paying Apple for what their program
  already covers; a sentence, never a refusal. **The panel reported this against
  `/api/athlete/apple-iap/verify`**, whose `requireFreeAgent` guard would do the same thing and
  which NOTHING calls -- a test now pins which route the client uses, because the day that flips
  the dead guard becomes live and the bug returns.
  **AND CLEARING A PLAN NOW WARNS, WHICH THE ADD-ON HALF DID AND THE TIER NEVER DID.** The last
  item on the panel's list, and the mildest: an admin setting `freeAgentTier` or `billingTier` to
  null closed access correctly and said nothing, while the provider went on charging. Un-ticking
  an add-on has warned since 10-14 with exactly this rule -- "a removal is REPORTED, never acted
  on" -- so the asymmetry was the whole defect. `liveSubscriptionHandleFor` is the narrower
  sibling of `liveBillingHandlesForRoleChange`: that one asks what the NEW role stops reading and
  needs a role to compare against, this one asks the question an admin clearing a plan has, where
  the role is not changing and only the row matters. Only a LIVE status counts (a cancelled row
  and a row with no provider id are nothing to chase, and a warning about those is the kind
  nobody reads twice), it fires only on a CLEAR rather than on every save, and the panel's toast
  names the RAIL -- a Stripe subscription an operator can end in the dashboard, an App Store one
  only the buyer can stop in iOS Settings. Client half: `verify_build`.
  **AND A 1-IN-5 FLAKE IN THE BILLING SUITE, found on the way and worth the detour** because one
  of its two tests is "the beta gate refuses every checkout path". `checkout-session.test.ts`
  restored env with `process.env = { ...savedEnv }`, which REPLACES the process-wide object rather
  than editing it; vitest runs several files per worker and `vi.stubEnv` records its restores
  against the reference it saw, so swapping the object out from under a sibling stranded that
  bookkeeping and this file and `billing-enforcement-flip.test.ts` failed together. Every write in
  it goes through `vi.stubEnv` now; eight full runs clean after. **I first said a new test file
  caused it, on one run each way, and that was wrong** -- one run either way proves nothing about
  a flake, and the hazard was never in the new file.
- **SEVEN FROM THE 2026-10-15 SECURITY REVIEW, ALL ON THE MONEY PATH, NONE REACHABLE BY AN
  OUTSIDER.** Scott: "can we run security checks" and then "great fix what you can." Three review
  passes over `1085235d..fe0ea07c` found no authorization hole, no cross-account read, no mass
  assignment, no injection, signatures verified on all three provider rails, idempotency sound and
  the add-on writers all under the lock; what they found was Forge's own billing doing the wrong
  thing with money somebody really paid. Every claim was read off the code before anything moved,
  and one of the seven was reported against the wrong route (the dead `/api/athlete/apple-iap/verify`
  guard, which nothing calls; a test now pins which route the client uses).
  **A join through an ASSISTANT coach's code was never re-billed.** Both callers in `auth.ts` hand
  `rebillCoachBandAfterJoin` the coach resolved from the typed code, a staff coach has a code of
  their own, and `syncCoachSubscriptionBand` read `getSubscriptionForUser(assistant)` -- no row,
  `no_stripe_subscription`, silent no-op. The seat counted against the program (both seat reads use
  the effective ids) and the Stripe quantity never moved until the primary opened the plan page. It
  resolves `getPrimaryCoachId` first now, and the audit row names the code it came through.
  **A full refund or a dispute revoked access and never cancelled the subscription at Stripe.**
  Refunding an invoice in the dashboard does not cancel the subscription; that is a second click,
  the one skipped on a goodwill refund. So the row went `canceled` and the SKU came off while the
  card went on being charged every month, and the next `customer.subscription.updated` (every
  renewal is one) wrote the live status straight back with nothing re-granting the tier.
  `revokeEverythingForSubscription` now cancels at Stripe after revoking -- best-effort, no
  proration (the money already went back), an audit row either way, never thrown -- and carries the
  cross-rail guard the cancellation path already had.
  **An assistant's in-app Coaches Corner receipt cancelled the PROGRAM's card subscription.** The
  grant correctly lands on the primary's row (10-11), and that write went through the purchase
  branch like any other: it set the assistant's Apple handle on the program's term, cleared the
  program's Stripe handle, handed it up as superseded, and the verify route cancelled it with
  proration -- leaving the program's add-on riding an App Store subscription on an assistant's
  personal Apple ID that nobody at the program could see or stop. The one-rail rule is about ONE
  ACCOUNT on two rails; two people paying for one program is not that. `addCoachBillingAddOn`
  takes `boughtBy`, and when the buyer is not the row's owner and the row already holds the add-on
  LIVE from a provider it writes nothing and reports `programAlreadyPays`; the verify path records
  `apple_iap.program_already_pays` with `alsoCancelInAppStore` and returns ok, the same posture as a
  coached athlete's tier receipt. An admin grant (no handle) or a lapsed term is still taken over.
  **A subscription that died in dunning handed its add-ons the whole UNPAID month.** The period
  Stripe reports on an `unpaid` subscription is the period of the invoice that was never paid, and
  `endStripeSubscription` passed it down as the paid month while the tier on the same event ended at
  once. `unpaid` ends the add-ons now; a cancellation still honours the month that was paid for.
  **The Apple holder check counted ENDED rows.** Apple keeps the same `originalTransactionId` when
  a subscription in a group is bought again after it expired or was refunded, so a family Apple ID
  subscribing on a second account met the 10-15 enforcement's 409, the phone finished the
  transaction, and a paid subscription entitled nobody, for good. `accountsHoldingAppleTransaction`
  counts only rows the subscription still entitles (not `canceled`; an add-on term matched EXACTLY
  and active, where the text prefilter alone also matched a numeric id that is a prefix of
  another), and `releaseAppleTransactionFromEndedRows` nulls the handle on other accounts'
  `canceled` rows at the grant -- because `applyAppleServerNotification` loops EVERY row naming
  the id on a renewal and would otherwise revive the dead one.
  **The self-serve cancel route wrote the end date onto whatever term existed by then.** Read the
  term, call Stripe, write -- three steps, and a purchase landing between them replaced the term
  with a new subscription whose paid month the end date then closed. `scheduleAddOnRemoval` takes
  the handles the caller decided on and compares them UNDER the lock; a mismatch writes nothing
  and the route answers 409. The webhook caller passes none: it matched by the id Stripe ended.
  **Cancelling an add-on bought before terms were recorded invented a purchase time of now**, so a
  months-old purchase answered `refundable: true` the second it was cancelled.
  `PURCHASED_BEFORE_TERMS_WERE_RECORDED` (the epoch) is what `nextAddOnTerms` records instead:
  outside every window, honest, and it parses.
  `the-security-review-fixes-2026-10-15.test.ts` (mocked billing.ts behaviour with controls, plus
  the source scans) and its `.itest.ts` twin (the three lock-and-SQL rules on real Postgres, 17
  cases). Whole unit suite and the neighbouring itests green. Server-side: ships on Render, no
  build (`shared/add-on-terms.ts` gains one export the client never references).
  **Open and Scott's:** the repository is PUBLIC on GitHub.
- **NO FREE AGENT TIER COULD BE ASSIGNED BY AN ADMIN, AND THE FIRST ATTEMPT AFTER LAUNCH FOUND
  IT** (2026-10-11). Scott, on More -> Users with the App Review athlete expanded: "This is all I
  see" -- Reset MFA and Change role, no billing panel. `AdminBillingAssignment`'s athlete form
  looked the account up through `GET /api/admin/athletes/lookup?email=`, and the Users page
  withholds every athlete's email from admins on purpose (`admin-identity.ts`, "identity withheld
  from admins" is the anonymity rule, not an age flag), so the form was handed "", the route
  answered 400, and `if (!data) return null` made the whole panel vanish without a word. The coach
  form never had the problem because a coach's email is shown. The read is by id now
  (`GET /api/admin/athletes/:id/billing`, the same id the page used to draw the row, returning the
  billing fields and nothing a person could be recognised by, so no access-log row); the email
  lookup stays for the support case it was written for.
  `admin-assigns-a-free-agent-tier-without-an-email.itest.ts` reads, assigns and reads back, and
  scans the panel so it can never be pointed back at the email route. Client change: `verify_build`.
- **THE DAILY CHECK-IN OPENED THE HEALTH PERMISSION SHEET BEFORE COUNSEL'S DISCLOSURE, AND NOW
  THE DISCLOSURE READS FIRST ON EVERY PATH** (2026-10-11). Scott, closing the launch row "Apple
  Health switch: counsel's disclosure reads before the permission sheet": "build that out." The
  Settings switch had the sentence beside its checkbox since build 597 and was fine. The other two
  ways into HealthKit were not: `WellnessGate` called `promptHealthSyncOnce` on an athlete's first
  check-in, which opened the OS sheet by itself with nothing read first, and its Sync button called
  `enableHealthSync` straight away when sync was off -- so an athlete who never opened Settings met
  the permission before the disclosure, every time. The sheet lists what Forge READS; counsel's
  sentence says where it GOES (the third-party AI provider), which is the part Apple reads a
  health app for. `shared/apple-health-disclosure.ts` is the one constant, verbatim from the
  Privacy Policy's section 7 and pinned against it; the Settings switch renders it, and the
  check-in now raises a card (the sentence, Turn on, Not now) in both cases -- `enableHealthSync`
  is called from the card's Turn on alone, and Not now is recorded through `markHealthSyncPrompted`
  so the card does not return every day and never reaches the sheet. `promptHealthSyncOnce` is
  gone. `client/src/lib/apple-health-disclosure-reads-first.test.ts` scans every file under
  `client/src` that can reach `Health.requestAuthorization` and requires the constant on each;
  mutation-tested both ways. Client change: `verify_build`.
- **A GUARDIAN INVITE LINK BOUNCED A SIGNED-IN PARENT TO THEIR OWN DASHBOARD** (2026-10-11, the
  first under-13 run of the launch audit). Scott, tapping the emailed "set up your account" link on
  the phone he is signed in on: "it brings me to my admin profile, but when i hover over it it gives
  me this" -- the mail preview (no session) drew the claim form; the tap (his session) did not.
  `guardian-claim.tsx` redirected ANY signed-in user to their own home, which is exactly the parent
  who also has a Forge account -- a coach who signs their own child up, the commonest guardian a
  school program will produce -- and it said nothing about the invite. The page now shows the
  invite on the signed-in branch (who it is for, who you are signed in as) with one button, sign
  out and continue: the logout keeps the URL, so the token survives and the claim form renders in
  place once the session is gone. The preview query is no longer gated on `!user` (it is public
  and the card needs the address). `a-guardian-link-opens-while-signed-in.test.ts` scans the page:
  no redirect, no navigation on that branch, the preview not gated on a session. **`claim.tsx`
  (an athlete claiming a coach-provisioned account) has the same redirect and is left alone** --
  a coach-provisioned athlete has no account to be signed in as, so the bounce there is a stray
  tap, not a parent locked out. Client change: `verify_build`.
  **AND THAT FIX BROKE THE SUCCESSFUL CLAIM, FOUND ON THE FIRST REAL ONE (2026-10-15).** The
  render-time redirect it removed was also the only thing that carried a JUST-CLAIMED guardian
  off the page. Off the Render log: preview 200, claim 201, then three seconds later the preview
  again -> 404, because a claimed token is consumed -- and the page drew "Link not valid" over a
  claim that had worked (Scott, screenshot: "It did work but."). The claim's `onSuccess` now sets
  the session and `setLocation("/guardian")`; a signed-in GUARDIAN opening any invite link gets a
  "Guardian access is set up" card with one button to the dashboard, checked BEFORE the sign-out
  card so a parent re-tapping their own email is never told to sign out; and the invalid-link copy
  names the athlete's own resend (`POST /api/account/guardian-invite/resend`), since a Free Agent
  minor has no coach to ask. The test now forbids a render-time `<Redirect` only and requires the
  post-claim navigation. **The guardian account and link were created correctly both times**; the
  server was never wrong, the page was. Client change: `verify_build`.
  **Also from this run, both on production with plus-tag accounts:** the device email is proven
  both ways (approve from Scott's pasted link signed the waiting device in and trusted it; deny
  from his inbox dropped every session, refused the waiting device and put him on the new-password
  screen -- "it said everyone was signed out and made me change my password" is the design), and
  the under-13 signup holds the minor with `guardian_link_required` on the camera route until the
  guardian claims, which is where this bug was met.
- **THE VIDEO RETENTION SWEEP RUNS NIGHTLY ON PRODUCTION AND HAS NEVER HAD ANYTHING TO PURGE**
  (2026-10-11, read off the Render log when the launch row was closed). `video-retention-cap-sweep`
  starts 09:00 UTC every day and finishes ok in ~25ms; it logs a line only when it warned or purged
  something, and no such line exists, because nobody has more than the cap's ten unfavorited videos
  on one exercise yet. The purge keeping every number is proven by `minor-video-retention.test.ts`
  and the "Purging a video never touches its metrics" invariant, not by a production event; the
  first real purge will be the first time it is watched, and the log line to look for is "Video
  retention sweep: warned N, purged N."
- **NINETEEN EMAILS RENDERED AT PHONE WIDTH, NONE OVERFLOW** (2026-10-11). The 10-09 read covered
  the words; nobody had drawn them at 390px. Method, reusable: run the integration suite with a
  setup file that wraps `testOutbox.push` and writes every captured body to disk (the suite sends
  real emails through the real routes into that array), then render one per subject in headless
  Chromium at a 390px desktop-mode viewport with a viewport meta injected -- `isMobile: true`
  lays an email out at the 980px legacy width and hides every overflow, which is the first
  thing the first run got wrong. Nineteen distinct subjects, no horizontal overflow, the Forge
  band on all, no text under 12px bar one footer line. The progress report is the one email the
  suite never sends and was not rendered. One thing to know when reading a captured guardian
  email: its "Notice to Parent or Guardian" body is EMPTY in the test database because no legal
  document is seeded there; on production it carries the notice.
- **THE DROPPED-FIELD SWEEP FOUND ONLY THE ONE** (2026-10-11): `every-program-exercise-field-is-saved.test.ts`
  now holds the program, program-day, skill-program, class-lesson and academy-lesson saves
  against their input schemas, discovered from the schema source; the builder's exercise save
  was the only hole. And every free-text AI call (readiness 350, athlete digest 450, coach digest
  500, chat 500, form checks 600, library 1,600, nutrition 1,200, page transcription 4,096)
  states a sentence count in its prompt beside a cap sized to it, which is the property that
  keeps `callAnthropic`'s discard-on-truncation rule from eating a prose answer.
  `DEVICE_VERIFICATION_DISABLED=true` is the kill switch for an email-provider outage. With no
  email provider configured at all (a dev box) the gate stands down and says so once.
- **The test harness pre-trusts its client.** `loginAs` calls `trustClientDevice` first, so the
  sixty-odd HTTP tests that are not about this gate never meet it. Under vitest `sendEmail`
  captures to `testOutbox` instead of returning not_configured, which is how the approval test
  reads its own link.
- **Existing sessions were not touched by the rollout.** Nobody was signed out; the first sign-in
  after a session ends or a sign-out goes through the email once, and that device is trusted
  from then on.

## Who may use the camera, and who is told not to trust it

Added 2026-09-19. Scott: "they can use it for form checks, but the data can't be trusted yet, and
look at our other two free agent profiles, they should not have access to the camera."

**ACCESS -- one rule, asked by both sides.** `cameraAccessFor` in `server/routes.ts` is the only
place the question is answered: a coach or admin filming their own training always may, a coached
athlete always may (their video is bounded by the team retention cap, not a tier), a Free Agent
may only on a tier with `hasVideoFormCheck` -- `ai_coach_video` alone, which is on sale and
carries the purchase warning (see the section above). `requireVideoTrackingAccess` and `GET /api/athlete/camera-access` both delegate to it.

- **The client never re-derives it.** Two copies of a three-branch rule disagree silently, and the
  disagreement is only visible to the person it strands: a button nobody can use, or a hidden
  button somebody paid for. `useCameraAccess` asks the server.
- **Hiding a button is not a permission check.** The upload routes keep their own gate. A client
  is a thing anybody can edit, and `client/src/lib/self-training-video-upload.test.ts` asserts
  the routes never come to rely on the UI having asked first.
- **Unknown is not yes and not no.** `useCameraAccess` returns `undefined` until answered and
  every call site requires an explicit `true`. Defaulting to yes flashes the button at someone
  who cannot use it; defaulting to no flashes its absence at a coach who can.
- **What this fixed:** nothing client-side asked at all. The record button was drawn on
  `trackingLevel !== "none"` alone, so a Basic or AI Coach Free Agent filmed a set, watched it
  analyse, and hit a 402 only when the clip tried to save -- numbers on screen, video gone. Worst
  possible order to meet a paywall, and it reads as a bug rather than a price.
- **Both workout pages, not one.** `skill-workout.tsx` runs the sprint and mechanics trackers and
  was missed on the first pass. `client/src/lib/camera-needs-entitlement.test.ts` counts the gate
  against the `trackingOptOut` checks in both files, so a control added to one branch and
  forgotten on the others fails.
- **Watching a clip you already recorded is never gated.** The form-check button previews an
  existing video or records a new one, and only the second is a purchase. Hiding the first takes
  something away rather than withholding something unbought, and it would bite hardest on sets
  filmed before a subscription lapsed.

**THE BIOMETRIC RELEASE IS ASKED OF EVERY ROLE THAT FILMS, NOT OF ATHLETES ALONE** (2026-10-19,
the first calibration session on the admin account). Three lifts saved beside the OVR, every save
200, every clip 201, and the capture export came back EMPTY. Four athlete-only gates in a row:
`captureField` withholds the trace with no release on file (right); `toPublicUserWithSections`
computed `biometricReleaseRequired` for athletes only, so a coach or admin was offered Record and
never asked; `recordBiometricRelease` refused any role but athlete; and the export's query asked
for a non-empty trace, the one thing the gate withholds. `shared/roles-that-film-their-own-training.ts`
is the set {athlete, coach, admin} that `cameraAccessFor` already grants, both flags and the
recording method read it (adult test role-first: an admin row may have no birthday), and
`cameraCaptureEvidence()` is the ONE membership rule for the report AND the export -- a trace-less
capture is a row with `traceAbsentBecause` naming the consent, never an absent row. **Today's
three traces are gone for good (correctly); the numbers and diagnostics are not** and arrive in
the next export download. **Scott accepts the release once on the admin account and every set after
carries its trace.** Also: the 20-capture corpus of 10-09 was filmed on the purged demo athlete and
is gone from production (1213 orphan `workout_set_entries` rows holding frames, 0 foreign keys --
cleanup awaits his word); the repo's replay fixtures are unaffected. Server-side: ships on Render.
See docs/camera-tracking-notes.md, "Three lifts beside OVR, 2026-10-19".

**TRUST -- the caveat goes on every surface that shows a camera number.**
`shared/camera-accuracy-copy.ts` is the one copy module and still exists to be deleted when
calibration lands. What was missing was any check that it had been PUT everywhere.
`client/src/lib/camera-caveat-coverage.test.ts` scans `client/src/pages` rather than holding a
list -- same reasoning as the tracker-dialog scan below -- and immediately found five surfaces
with no warning at all: both leaderboards, the admin query engine, and the skill workout page.

- **A leaderboard is the worst place to miss it.** A chart is one athlete's trend read by someone
  who knows that athlete. A leaderboard is a comparative claim about PEOPLE: it puts names in an
  order, and an order invites a decision about who runs with the ones. Camera timing has never
  been checked against a stopwatch, so the gap between adjacent rows may be entirely measurement.
- **Both leaderboards and the query engine are PERMANENT, not dismissible.** The dismissal flag is
  shared across every dismissible instance, so a coach who cleared it once on their own workout
  screen would never have seen it on the ranking page -- a dismissible caveat there would have
  been a no-op for exactly the people who use the app most.
- **An exemption needs a reason, and the reason must be "no reader sees a number here."** Never
  "this one is fine". `movement-knowledge.tsx` is exempt because its bar-path number is a
  THRESHOLD somebody is setting, not a measurement of an athlete.

## Capture diagnostics

Added 2026-09-16, after a bench set that failed three separate ways left no
record of any of them. These are invariants, not preferences -- the same
standing as the athlete-data ones below. If a change makes one false, the
change is wrong.

- **A capture that fails is the one whose record matters most.** When a
  tracker cannot trust its numbers it does not discard the take: it writes an
  empty or scale-free metrics row, a `trackingDiagnostics` blob saying why,
  and saves the clip for the coach. That blob is the only account of what went
  wrong, and the admin tracking report over those blobs is the entire feedback
  loop for this pipeline. Nobody can fix a camera problem from a set that
  silently came back empty, so losing the explanation costs more than the
  failed capture did.
- **Every exit from a save path hands the metrics up.** Ten tracker dialogs
  shared one shape: if the video upload threw, the catch toasted and stopped --
  no `onCapture`, no close -- so a failure in a separate concern took the
  diagnostics with it and left a set indistinguishable from one where record
  was never pressed. Six more did the same thing under a comment reading
  "genuinely nothing left to salvage", which was backwards: the failure IS the
  thing to salvage. `client/src/lib/refused-capture-survives.test.ts` enforces
  it -- if a `try` calls `onCapture`, its `catch` must too. The one escape is
  writing `diagnostics-exempt: <why>` in the catch, which costs a sentence of
  justification and shows up in a grep.
- **The test scans the directory; it never holds a list.** That file began as
  a hand-written list of the eight dialogs known to have the bug. Rerun as a
  scan over `*tracker-dialog.tsx` it immediately found six more. There are
  fifteen and the next one will not be on anybody's list.
- **A field the client sends must be declared in `trackingDiagnosticsSchema`.**
  A zod object strips what it does not declare, silently, with no error
  anywhere -- three takes were filmed specifically to read the scale-source
  diagnostics and the insert had already dropped them. This has happened
  twice. `shared/tracking-diagnostics-roundtrip.test.ts` derives the field
  list from the client type rather than restating it, for the same reason the
  dialog test scans rather than lists.
- **The report never drops a set for lacking diagnostics.** Membership in
  `getRecentTrackedSetsForAdmin` is any camera-derived column, not the
  diagnostics blob, and an entry that arrived without one says so. A capture
  that lost its own explanation has to be visible AS that, because "invisible"
  and "never happened" are the same thing to whoever is reading the page.
- **Report membership is decided by the SET, never by the program row beside it.**
  The membership test used to also require `programExercises.trackingLevel` to be
  present and not `'none'`. That column is live and editable, and turning
  tracking off on an exercise is exactly what somebody does after a few takes
  come back unusable -- so that one click removed every past capture on it from
  the report, the failed ones that prompted it first among them. The takes worth
  reading about were the takes it hid. It was redundant too: a hand-logged set
  has no camera-derived column and never reaches the filter. Anything that
  narrows membership by what the program says TODAY is the same bug again.
  `server/capture-diagnostics-round-trip.itest.ts` turns tracking off after the
  set is logged and asserts the entry is still there.
- **Membership is EVERY camera-derived column, from one classified list.** It was four --
  diagnostics, peak velocity, bar path deviation, jump height -- which between them
  describe bar-path and jump captures and nothing else. Kettlebell swing, med ball,
  the golf/baseball swing, sprint and sled push write none of the four, so five
  capture modes never appeared on this page at all, and the page gave no sign:
  an absent row and a mode nobody filmed look identical. `CAMERA_DERIVED_SET_COLUMNS`
  in `shared/schema.ts` is now the single list, and
  `shared/camera-columns-are-classified.test.ts` reads the table's real columns and
  fails on any that is in neither it nor `NON_CAMERA_SET_COLUMNS` -- so a new capture
  mode cannot skip the report. `formCheckVideoUrl` stays OUT deliberately: a
  hand-uploaded form video is not a capture.
- **Nothing about the set's identity is inner-joined.** `workoutLogEntries.exerciseId`
  is nullable (`resolvedExerciseId ?? fallbackExerciseId ?? null`), and the report
  inner-joined `exercises` on it -- which does not produce a row with a missing name,
  it produces no row, for a capture that really happened. It is a LEFT join and the
  entry reads "(exercise no longer resolves)". Three silent drops have now been found
  in this one query; treat any narrowing of it as guilty until tested.
- **One end-to-end test backs the two scans.** The dialog scan and the schema
  round-trip are both text scans -- they catch the two ways this has actually
  broken, and neither runs a line of the pipeline. Between the dialog and the
  report sit a zod parse, an insert, a json column and a WHERE clause, and the
  `trackingLevel` hole above lived in the last of those with both scans green.
  The itest submits a REFUSED take through the real parse and reads it back off
  the report. Keep all three; they fail for different reasons.
- **The tracking report is server-side.** It is served from `storage.ts`
  through `/api/admin/tracking-report/entries`, so a fix to that query ships on
  a Render deploy, not in a TestFlight build. Worth saying out loud when
  someone is testing report changes by installing a build.

## A set that was logged and a set that reached the server

- **A transport failure must never be an `ApiError`.** `fetch()` rejects with a
  bare TypeError for anything that never reached the server. Wrapping that in a
  readable message was right; wrapping it in an `ApiError` with status 0 was not
  and it cost a logged set: the autosave classifies with
  `err instanceof ApiError && err.status !== 401 && err.status < 500`, status 0
  satisfies both halves, so a save that failed because the phone blinked was
  filed as a payload the server would keep refusing -- thrown instead of queued,
  never retried, and the offline rescue that exists for exactly this case could
  not run. The rule is structural rather than a better number: `NetworkError`
  extends `Error`, so every `instanceof ApiError` branch in the app behaves as
  it did before the wrapper existed, including ones nobody thought to check.
- **`client/src/lib/transport-failure-is-retryable.test.ts` guards it two ways,
  on purpose.** Three assertions scan the source, because the classifier lives
  inline in `workout.tsx` and cannot be reached without rendering the screen.
  Three more stub `fetch` into rejecting and evaluate that same condition
  against the error that actually comes out. A regex is satisfied by a file
  containing the right words; the bug was about what `apiRequest` threw.
- **A queued save's BODY lives in a file on the phone, never in localStorage.** Added
  2026-09-28 after two tracked squat sets were lost: a merge to `main` redeployed Render while
  Scott was testing, the saves queued, each carried ~6MB of skeleton frames, and the web view's
  localStorage quota is about 5MB and cannot be raised. The queue trimmed the replay to fit and
  the sets never reached the server. `client/src/lib/pending-log-files.ts` writes the body to
  the app's Data directory through the Capacitor Filesystem (the same place the video queue
  keeps its files, bounded by the phone's free space); only the index entry stays in
  localStorage, so the synchronous callers keep working. On the web there is no Filesystem and
  the inline path is what it always was. A file that cannot be written falls back to inline; an
  index entry whose file is gone is dropped rather than retried forever; `takePendingLog` is
  async because it has to read the file. `offline-queue-file-backed.test.ts` drives a 6MB body
  through a 5MB store. Also: **never merge to `main` while Scott is testing a build** -- the
  deploy restarts the server and that is what put the saves in the queue to begin with.
- **The debug console logs every save outcome, and that stays.** `logDebug("SAVE", ...)`
  fires on the POST succeeding, on it failing with the status, on the
  classification, and on a queue. Whether a set reached the server was the first
  question asked when one disappeared and there was no way to ask it -- the
  cause sat undetected for four builds. There is no console to read on an
  iPhone, so this is the only instrument.

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

## Hydrate-in-an-effect, save-the-whole-state

A shape that turned up FOUR times in one audit, in four different files, with
two different symptoms. Worth recognising on sight rather than rediscovering.

```
const [content, setContent] = useState("");        // or [], or a DEFAULT_ constant
const { data } = useQuery(...);
useEffect(() => { if (data && !hydrated) { setContent(data.content); ... } }, [data]);
// ...and a Save that PUTs the whole of that state back.
```

**On a failed read the effect never runs**, so the state keeps its empty initial
value, and then one of two things happens:

- **The destructive one.** The editor renders anyway, showing empty, and Save
  writes that emptiness over the real record. `manage-roster-groups-dialog`
  (a rename would PATCH the default Group A/B/C over the coach's real groups),
  `SignupAgreementEditor` and `LegalDocEditor` (an empty box over the live
  signup agreement or a legal document), `academy-track-builder` (Save
  deletes every lesson and quiz question in the track). Nothing is corrupted
  here -- a whole record is REPLACED, which no field-level validation catches.
- **The invisible one.** The page guards on `isLoading || !hydrated`, and
  `hydrated` never becomes true, so it spins forever. `program-builder`,
  `skill-program-builder`, `class-builder`, and the compliance snapshot on
  `admin/documents`. A spinner that never resolves reads as a slow page rather
  than a broken one, so nobody retries it and nobody reports it.

The fix is the same either way: give the query `isError` and render
`<ReadFailed>` BEFORE the editor or the spinner. The editor does not open until
the read lands.

**There is no scan for this one, deliberately.** grep cannot separate "an effect
that copies query data into state which is later saved wholesale" from any file
that merely contains a read, an effect and a write -- an attempt matched thirty
files, most of them fine. A ratchet with thirty false positives is worse than
none, because people stop reading it. This section is the substitute; if
somebody finds a reliable way to detect the shape, a scan beats a paragraph.

## Every legal document ALREADY EXISTS. Nothing needs writing.

Written down after an hour was spent generating a second EULA in Rocket Lawyer
for a document Forge has had since 2026-09-16, live at /eula. The cause was a
list headed "four documents under review", which meant "these need a lawyer's
eyes" and read as "these need producing". Do not repeat that: when asked what
legal work is left, say the state of each document before naming any task.

**Eight documents, all with usable text, none carrying draft language**
(`server/seed-data/documents-are-not-drafts.test.ts` enforces the last part). **EVERY ONE OF
THEM WAS BUILT THROUGH ROCKET LAWYER WITH FORGE'S ATTORNEY THERE.** Scott, 2026-10-01: "all of
those were built on rocket lawyer, label them as such." Some started from a Rocket Lawyer
template and were modified by the attorney (the Service Agreement, the AI Terms, the Privacy
Policy), some the attorney wrote because no template fit (the Terms of Use, the research
consent, the Assumption of Risk, the biometric consent); the file headers record which. The
distinction is history, not standing: the attorney is Rocket Lawyer's, every text is theirs,
and a question about any of them goes back to that attorney through Rocket Lawyer.

| Document | Where | Built on Rocket Lawyer |
|---|---|---|
| Privacy Policy | `legal-documents-draft.ts` | Yes, attorney-reviewed |
| Notice to Parent or Guardian | `legal-documents-draft.ts` | Yes, attorney-reviewed |
| EULA | `legal-documents-draft.ts` | Yes, attorney-reviewed |
| Terms of Use (signup AND /terms) | `signup-agreement.ts` | Yes, attorney's rewrite |
| Video and Biometric Consent | `biometric-release.ts` | Yes, built with the attorney |
| Assumption of Risk | `assumption-of-risk.ts` | Yes, attorney's opinion on the text |
| AI Terms of Use | `ai-terms-of-use-draft.ts` | Yes, template modified by the attorney |
| Research consent | `shared/research-consent.ts` | Yes, attorney's rewrite |
| Institutional Service Agreement | `shared/institutional-service-agreement.ts` | Yes, drafted with the attorney |

The Institutional Service Agreement is the ninth document here and was always on Rocket
Lawyer; it is listed with the eight because the question "which documents are the lawyer's"
has one answer, and a list that leaves one out invites a second EULA being generated for it.

The `_DRAFT` suffixes are historical variable names, not banners. The remaining
`DRAFT --` strings in the repo are the `from` side of LIVE_DOCUMENT_PATCHES,
which strip that language out of documents an older installation stored; they
have to stay.

There used to be nine. Scott merged the two Terms on 2026-09-19 ("merge them, just one less
document that gets in the way"): `TERMS_OF_SERVICE_DRAFT` is retired, six of its clauses were
carried into `SIGNUP_AGREEMENT` in its own words, and /terms now serves the document people
actually accept. Do not add a public Terms of Service back.

**Every document is attorney-reviewed as of 2026-09-20, and counsel's answers to the open
questions arrived 2026-10-01** (Scott: "ive gotten counsel answers, the documents are in";
among them, under-13 athletes are accepted, so `ACCEPT_UNDER_13_SIGNUPS` stays unset). Fold
each answer into the clause it changes as a registered version, and move the question out of
`docs/legal-open-questions.md` when it is. Nothing needs writing and nothing is waiting on a
lawyer. The Video and Biometric Consent (built with counsel,
2026-09-17), the Assumption of Risk (counsel's opinion 2026-09-19, question 8), the AI
Terms of Use (lawyer-modified from the Rocket Lawyer draft), the research consent
(counsel's rewrite, live verbatim 2026-09-19, question 9; one word changed to "age" with
counsel's approval 2026-09-20, version 2026-09-20) and the signup Terms of Use (counsel's
rewrite with their five answers folded in, live 2026-09-19, question 10) were reviewed
2026-09-19; the Privacy Policy, the EULA, the Notice to Parent or Guardian and the
Institutional Service Agreement were confirmed reviewed by Scott on 2026-09-20 ("yes the
others are attorney reviewed"). Counsel's second round of answers (2026-10-03, questions 1, 2, 3, 5, 6 and 11) is folded in
verbatim and registered in `shipped-versions.ts`; question 5's mechanism is built the same day: an
under-13 account is held after the guardian claim until a linked guardian's card is charged 50
cents and refunded (`createGuardianVerificationCheckout`, `needs_guardian_verification`),
which is not a sale and does not sit behind `BILLING_LIVE`. The Stripe webhook on Render is
what writes the record, so a Stripe outage holds a child's account, never releases one. Changing any of these is
changing a reviewed document: register a version, never edit in place.
A change to the research consent text re-asks everyone; the deletion-retention gate
recognises the disclosure under the current heading and every prior one
(`PRIOR_DELETION_RETENTION_HEADINGS`), so an earlier yes keeps counting for what it said.

**Do not regenerate a document in Rocket Lawyer to "improve" one of these.** A
generic template is a worse fit, not a better one. The EULA is the proof: the
Rocket Lawyer version licenses "one copy on one computer", forbids multi-user
networks (a roster IS one), offers an archival copy on non-hard-drive media,
refunds "exclusive of shipping and handling", carries NONE of the five
Apple-required clauses, and has an entire-agreement clause broad enough to
argue it supersedes the Terms, the Privacy Policy and the biometric consent.

## Settled questions that keep getting re-litigated

Written down because they have come up more than once and been answered the
same way each time. Re-opening one costs a round trip; if the answer changes,
change it HERE rather than arguing it again from scratch.

- **FERPA and "school records" do not apply.** Raised as a gap at least twice,
  and wrong both times. Forge receives name, gender, age, sport and position --
  the textbook definition of directory information, which is what schools
  disclose about athletes routinely. No GPA, no majors, no transcripts, no
  disciplinary records, nothing out of a student information system. A school
  official addendum or a data-processing agreement is procurement paperwork a
  particular school may hand Forge; it is not a document to write in advance.
  Scott, 2026-09-17: "why would we be handling school records? ... we are not
  getting GPA, we aren't getting majors".
- **Render holds everything.** Postgres on Render is the database and
  `STORAGE_PATH` on Render is where every video and uploaded document lives.
  Stripe sees payment details, Apple sees sign-in. Anthropic receives the text
  of a prompt at the moment of a model call and stores nothing -- it is not
  where the data lives, and saying so to a school would be wrong.
- **Coaches supply athletes, not data about themselves.** What Forge holds for
  a coach is their team and their card. A separate coach acceptable-use
  agreement is not needed. The one real edge: a coach uploads OTHER people's
  documents (`medical_clearance`, `emergency_authorization` are minors'
  records), so the warranty that they had the right to upload it belongs in the
  upload flow, not in a new agreement.
- **No child medical consent form and no emergency contact field.** Forge is
  never present at a session, so a treatment authorization has no recipient,
  and an emergency contact is a third party's personal data with no operational
  path. The coach knows who to call. Asked and answered, 2026-09-06.
- **BILLING IS LIVE AS OF 2026-10-11. THE BETA IS OVER.** Scott: "Set all billing as live,
  everything true, the beta is over." This entry used to say payments stay off through beta (Scott,
  2026-09-17 and 2026-09-19) while the Terms described the paid plans for launch; the Terms were
  right and the launch position is now the only position. What was done, all in one hour: on
  Render, `BILLING_LIVE=true` (the card rail), `BILLING_ENFORCEMENT_ENABLED=true` (a tier
  restricts), `APPLE_IAP_ENVIRONMENT=production` (`APPLE_APP_APPLE_ID` was already set), and
  `PAYWALLS_DISABLED` UNSET -- and taken out of `render.yaml`, where it had been pinned to
  "true" as a blueprint value that a sync would have re-applied. In the code, `isBetaAccount`
  defaults FALSE (schema and `ALTER COLUMN ... SET DEFAULT`) and every existing row was flipped
  ONCE behind the `beta_ended_2026_10_11` marker in `applied_backfills`, so the admin billing
  panel's "Beta account" tick still comps one account deliberately and is never undone by a
  deploy (proven on a throwaway database: flipped once, a re-ticked row survives a second run, a
  new row defaults false). And every sentence that told a reader Forge was in beta or that nothing
  was charged is gone -- `BETA_NOT_CHARGING_NOTICE` and its three public surfaces, plus six
  in-app sentences the old test never knew about; `shared/the-beta-is-over.test.ts` scans pages,
  components and shared for the phrases so none returns. **What this means for the accounts that
  exist:** the seven beta people (three coaches with no tier, four Free Agents with no tier) are
  no longer comped; a coach with no tier has an athlete cap of zero (the roster they have stays,
  new joins are refused until a plan is bought on the web) and a Free Agent with no tier has
  logging and the library and buys the camera, skills and AI in the app. **NOT touched, each its
  own decision:** `PUBLIC_SIGNUPS_OPEN` is still `false` and is HELD by Scott until the app is live
  in the store (2026-10-11: "Don't open public signups yet, the app isn't live, I won't want Apple
  getting pissed"; the hold lasts until he lifts it) and `GOOGLE_PLAY_BILLING_LIVE` is still unset (Android is parked). The Stripe keys
  on Render are whatever Scott put there; a TEST-mode key with `BILLING_LIVE` on charges fake
  cards, a LIVE-mode key charges real ones, and only the dashboard says which.

## What deletion keeps, and what it does not

**BUILT, 2026-09-17, commit `90f925e`.** This section used to say "not yet done" and
stayed that way after the work landed, which cost a session on 2026-09-19 that set
out to build it again. State of the code, so nobody re-derives it:

- `deleteOwnAccount` is still a total wipe of the `users` row and everything that
  cascades from it. What changed is one call before the delete:
  `retainSubjectAfterDeletion` in `server/research-mirror.ts` marks the athlete's
  `research_subjects` row `retainedAfterDeletion = true` when ALL of: they are in the
  mirror (`researchSubjectId` set), `trackingOptOut` is false, `researchDataConsent`
  is true, and the research-consent text they actually signed (snapshotted in
  `consent_records.documentText`) carries the `IF YOU DELETE YOUR ACCOUNT` section.
  Anyone who consented under the older text is NOT retained retroactively.
- The nightly sweep selects only `retainedAfterDeletion = false` rows when deriving
  orphans, so a retained subject can never be reaped or re-linked. There is no FK
  from `research_subjects` to `users`; the only pointer is `users.researchSubjectId`,
  which dies with the user.
- `shared/research-consent.ts` says it in the text: the scrubbed record survives
  deletion because consent was given as an account holder; withdraw FIRST, then
  delete, to leave nothing. `shared/research-consent-disclosure.test.ts` pins the
  heading; `server/research-retention-on-delete.itest.ts` proves every branch.
- Extract denominators report `formerAthletes` separately so a cohort never reads
  "12 of 8" against the live-row count.

**Two flags, and the mirror requires BOTH.** `trackingOptOut` is collection for
the athlete's own coaching; `researchDataConsent` is opt-IN inclusion in the mirror.
"Didn't opt out" and "consented to research" are different populations. Any plan
that says "keep the non-opted-out athletes' data" means widening mirror membership,
which is a consent question, not a deletion change.
- **THE APP TOLD A HINGE TO BREAK PARALLEL** (2026-10-08). Scott, on a Romanian Deadlift filmed
  135lb x 5: "For the deadlift, knees only reached -148? What's that number, and where did it come
  from?" It was **148 DEGREES**, not -148 -- the dash was the app's own `~`. The number is the
  interior hip-knee-ankle angle at the deepest point of the set, the 5th percentile across every
  tracked frame (`frameKneeAngles` -> `percentile(kneeAngles, 0.05)`); it cannot go negative,
  `worldAngleAtVertex` is an `acos`.
  **The sentence beside it is the bug.** "Aim to break parallel" is squat coaching, and the RDL's
  own library instruction reads "Soft knees, push hips back". 148 degrees IS a correct RDL, and an
  athlete who followed that cue would turn a hinge into a bad squat. `LOWER_BODY_MOVEMENT_TYPES`
  (`{Squat, Hinge, Lunge}`) answers "are the legs doing work here" -- right for the ROI landmarker
  and for the faults that describe the legs, wrong for the two faults whose WORDS assume a squat.
  `SQUAT_PATTERN_MOVEMENT_TYPES` (`{Squat, Lunge}`) gates `shallow_depth` and its twin
  `forward_lean` ("excessive forward lean at the bottom" -- on a hinge, a folded torso IS the rep).
  Knee valgus, pelvic drop and heel rise describe something real on a deadlift and KEEP the wider
  gate; taking them too would be a refusal nobody asked for. A RULE, not a fitted number, so it is
  shared and `FITTED_OVERRIDES` stays empty. **Third instance of one error class in four days**
  (the RDL's height ruler 10-05, the shoulder press's seated label 10-06) and the first where what
  was wrong was a SENTENCE rather than a ruler.
  **AND THE NUMBER HE ASKED ABOUT HAD NEVER REACHED AN EXPORT**, which is why it had to be
  reconstructed from the code: `faultEvidence` carried `bar_path_drift` and `bar_tilt` and nothing
  else. All five lower-body faults now note what they read and what they were judged against,
  firing or not, with `suppressedBecause: "movement_is_a_hinge"` on a held sentence. Records and
  gates nothing (Rule #1). `a-hinge-is-not-a-shallow-squat.test.ts`, mutation-tested both ways.
  Known gap, recorded not filled: only `av-bar-tracker-dialog.tsx` passes an evidence array.
  **`forward_lean` did not fire on this take and that is NOT a reason to leave it** -- it stayed
  quiet only because `measuredPosture.torsoFromVerticalDeg` read **7.13** on a hinge over 436
  frames, where an RDL should approach 90. A second measurement problem is not a gate. That 7.13
  is open and is the next thing to read on a hinge.
  **The same session is the refit case 2026-10-05 asked for, and NOTHING was refitted.** Back Squat
  ROM -6.9% / mean -12.0% / peak +1.6%; RDL ROM **-3.7%** (the hinge fix holding, no height ruler
  in its candidate list); Box Jump 67.2cm onto a 24in box, the first one in range. On the squat the
  `height` ruler carries **66.7%** of the blend and reads **-15.8%** against the scale the sensor
  requires, while `body_3d` (+4.7%) and `depth` (+8.0%) bracket it -- but 10-06 measured
  `shoulder_width` as the LEAST biased voter and this take puts it at +15.7%, so one standing take
  is not a fit. **And the RDL's peak velocity is unusable**: `trace.repPeaksFlooredToMean: 4`, all
  four reps' instantaneous peak came out BELOW the rep's own mean and was set equal to it (hence
  peak == mean == 0.72 against the OVR's 1.70), beside 4 reps found on a 5-rep set and an eccentric
  reading faster than the concentric -- three signs pointing at the drive window landing on the
  wrong phase for a movement that starts by going DOWN. Named, not fitted.
  See docs/camera-tracking-notes.md, "Three lifts beside OVR, build 639, 2026-10-08".
  Calibration work: uploaded on commit.

## The 2026-10-16 SEO and speed pass, read off the live host

Scott, with 1.0 in App Review and no sensor to film beside: "let's do some search engine
optimization, we did do this before, but let's check again, and then can we try to speed up the
app at all?" Everything below was MEASURED on forgeperformancesystems.com first (curl for
headers and sizes, headless Chromium at 390px for paint timings and the request waterfall, the
Render API for the instance and the database) and fixed second. What the measurements said:

- **The server is idle.** Render Starter in Oregon, one instance, CPU under 1% and memory
  170-280 MB of 512 over the last day. Nothing here is compute; every cost is a round trip, and
  a round trip to Oregon is 250-700 ms from the east coast because NOTHING is edge-cached:
  `cf-cache-status: DYNAMIC` on every response, hashed `/assets/*` included. Render's own
  Cloudflare layer does not cache a web service's responses. **The one lever this repo cannot
  pull is Scott's: put Cloudflare (free plan) in front of the domain** -- nameservers moved from
  GoDaddy, proxy on, SSL "Full (strict)" -- and the immutable assets, fonts and screenshots are
  served from the edge, which takes ~300 ms off every asset for everyone outside Oregon. Render
  documents the setup. Not done; a DNS change is his to make.
- **Every page load was reporting a CSP violation.** The inline theme script in index.html
  (added after the CSP comment that said there were no inline scripts) failed `script-src
  'self'` under the report-only policy, so every visitor POSTed /api/csp-report once per page
  and the server logged a warning per visit. Allowed by its SHA-256 now
  (`server/csp-inline-scripts.ts`); the test DERIVES the hash from client/index.html, so an edit
  to the script -- even its indentation -- fails until the constant is updated. **That is the
  rule for the one inline script**: hash, never `'unsafe-inline'`.
- **Fonts, the marketing screenshots and the root icons were `no-cache`** and re-asked for on
  every visit (a conditional request each, a 304 each, a round trip each). A day now, like the
  pose runtimes (`static-cache-policy.ts`).
- **The home page painted nothing for a whole round trip.** `HomeRedirect` drew a full-screen
  spinner until /api/auth/me answered, for a FIRST-TIME visitor -- the one person the marketing
  page is for; first contentful paint measured at 2.5 s with the HTML at 0.6 s. It paints the
  landing page through the check now, on the web, unless `lib/session-hint.ts` says this browser
  has signed in before (set on a signed-in answer, cleared on a signed-out one, so a coach whose
  24 h persisted cache has aged out keeps the spinner and never sees the marketing page flash).
- **THE BODY OF EVERY PUBLIC PAGE WAS `<div id="root"></div>`.** The 2026-10-02 prerender baked
  the head only, by design ("the deliberate cheap 90%"). To Google that is a page rendered later
  in its queue; to Bing, DuckDuckGo, the LLM-backed engines and every link unfurler it was a site
  with titles and no words. `client/src/entry-prerender.tsx` renders the REAL page components
  with react-dom/server (a second Vite build, `vite.prerender.config.ts`, into dist/prerender;
  `scripts/prerender.ts` puts the markup inside the root). Ten routes carry their body: the
  landing, pricing, for-high-schools, for-athletes, camera-validation, the movement index and
  the four movement pages. The legal documents do not and cannot: their text comes from the
  API, where an admin edits it. Three things keep it from being a worse experience than the
  spinner it replaces, each pinned by `public-pages-prerender-their-bodies.test.ts`:
  - **The home page's body goes to `home.html`, served at "/" by `servePrerendered`; index.html
    keeps an empty root.** index.html is what the native app boots from, and a landing page in
    its body would flash inside the app before React sends it to the login screen.
  - **The public pages are EAGER imports now** (+40 kB / +9.4 kB gzipped on the entry; the
    budget in `bundle-budget.test.ts` is raised by exactly that with the reason). A lazy page
    would replace content the visitor is already reading with a Suspense spinner for one more
    round trip. The native app pays those 9 kB for pages it never shows; known, and the reason
    nothing larger goes eager on the same argument.
  - **The first mount holds still** (`lib/prerendered-boot.ts`, read by the router's page
    transition) so the content does not blink out and fade back in; and a browser with the
    session hint gets `html.had-session` from the same inline script, under which index.css
    hides the prerendered markup until React mounts -- that person is on their way to a
    dashboard.
  React mounts with `createRoot().render()`, not `hydrateRoot`: the markup is replaced, not
  hydrated, which costs nothing visible (identical output) and avoids every hydration mismatch
  the providers would produce. Verified on the built dist in headless Chromium: with JavaScript
  off, every prerendered route carries its H1 and 1,100-4,900 characters of text and /terms
  carries none; with it on, React mounts over all of them with no console error and no spinner.
- **THE PRODUCTION DATABASE IS 61% FULL WITH NO USERS.** Off the Render metrics API: forge-db
  (basic_1gb, Postgres 18, Oregon, point-in-time recovery available from 2026-10-08) holds
  623 MB of a 1,020 MB disk, and nothing in Forge could say what. `server/database-size-job.ts`
  logs one line at every boot and daily at 08:00 UTC -- total size and the twelve largest tables
  by `pg_total_relation_size` with row estimates, sizes only, never a value -- so the next
  deploy's log answers it. Read that line before anything else: if it is the skeleton traces, the
  retention sweep needs a row cap; if it is the knowledge library, the plan goes up. A full disk
  stops every write on the platform at once.
  **ANSWERED ON THE FIRST BOOT (2026-10-16 20:02 UTC):** `Database size: 488.6 MB total;
  workout_set_entries 450.5 MB (~17,643 rows); knowledge_passages 13.1 MB; everything else under
  1 MB.` One table is 92% of the database, and it is the one that carries `skeleton_frames`, the
  per-capture skeleton trace that the build-620 console measured at ~10 MB a set. The 134 MB
  between that total and Render's 623 MB of disk is WAL and dead tuples, which is ordinary.
  **The video retention sweep never touches this column** -- "purging a video never touches its
  metrics" is the standing rule and the skeleton frames are among what survives -- so the table
  grows by the trace of every filmed set, forever, and never shrinks. At ~10 MB a take, the
  remaining ~400 MB of the 1 GB disk is roughly forty more filmed sets, which is a calibration
  week. **Two moves, Scott's call, not made:** the cheap one is the next Render disk size
  (basic_4gb); the right one is to keep a capture's trace where its video is kept -- a file under
  `STORAGE_PATH`, with the row holding its path -- which is the shape `pending-log-files.ts`
  already uses on the phone for the same object and the same reason. The research mirror, the
  replay harness and the admin tracking report read the column, so that is a migration with
  readers to move, not an evening.
  **DONE THE SAME NIGHT, SERVER-SIDE, ON SCOTT'S "PUSH NOW"** (a server deploy cannot touch the
  binary Apple is reviewing). `server/set-trace-files.ts`: a new capture's frames go to
  `UPLOADS_ROOT/set-traces/<athleteId>/<logId>-<exerciseKey>-<set>-<random>.json`, the row carries
  the `/uploads/...` path in the new `skeleton_frames_path` column and `skeleton_frames` null.
  The three rules the inline column had (an omitted key carries the prior forward, an explicit
  null clears, no consent on file means nothing new lands) are kept exactly -- "forward" is now
  the PATH, a string, where it used to be ten megabytes re-inserted on every save of the day. A
  retake writes a new file and deletes the old after the commit; a rollback deletes what it
  wrote; the ledger (`uploaded_files`) is told about each. `set-traces` is in `GATED_UPLOAD_DIRS`
  and nothing ever signs or fetches one: both readers (`getSetClipFramesForAthlete`, the replay
  export) open the file on the server and answer the same frames as before, and the clip list
  counts either column. Account deletion removes the athlete's directory. The retention sweep
  is untouched: a trace is a metric and lives as long as its row.
  **`server/set-trace-offload-job.ts` moves the old rows**, five at a time for a minute at boot
  and daily at 07:00 UTC, each nulled by an UPDATE guarded on the column still being non-null,
  and runs a plain `VACUUM (ANALYZE)` after a batch that moved anything. The Render disk-usage
  number does NOT fall after it -- the space is reusable, not returned; that needs a `VACUUM FULL
  workout_set_entries` in a quiet hour, by hand, which takes an exclusive lock on the busiest
  table in the app and is why the job never runs it. Read `[job:set-trace-offload]` in the log:
  "moved N ... M still in the table" until M is 0.
  **AND THE DISK NUMBER DID NOT FALL, SO RENDER MAILED "NEARING ITS STORAGE LIMIT" ON 2026-10-23.**
  The offload finished on the 16th ("0 still in the table" every run since); the table still
  measured 447 MB for ~114 live rows, all of it dead space a plain VACUUM frees for reuse and
  never hands back. Render's metric read 0.64 GB of 1.02 GB with a 0.79 GB peak when the mail
  went out, so there was no outage coming, only a number that would never go down.
  `server/set-entries-vacuum-full.ts` is the by-hand step made automatic, under the conditions
  that made it safe: boot only, under the job lock, behind the dated marker
  `vacuum_full_set_entries_2026_10_24`, and ONLY when no row still holds frames inline and the
  live rows are estimated under 50 MB (a rewrite of 114 rows is seconds, at boot, with nobody
  talking to the table; a big live table goes back to being a quiet-hour job and the log says
  so). A skip writes NO marker so the next boot tries again; the marker goes on AFTER the vacuum.
  Log line to look for: `[job:set-entries-vacuum-full] vacuumed: workout_set_entries 447.x MB
  -> ~1 MB`. Unit test drives the four branches on a fake db; the itest runs the real
  `VACUUM (FULL, ANALYZE)` through the pool. Server-side: ships on Render, no build.
  **One vitest lesson from writing it: `beforeEach(() => mock.mockReset())` returns the mock,
  and vitest calls a hook's returned FUNCTION as its cleanup** -- so the runner itself invoked
  the fake with no arguments and every case read as a bug in the code under test. Braces. `skeleton-frames-live-on-disk.itest.ts` (8
  cases on real Postgres and a real disk: the write, the carry-forward with an untouched file,
  the retake, the null, no consent, both readers plus the clip list, the offload and its second
  idempotent run, the account deletion) and the `.test.ts` scan beside it. Sixteen neighbouring
  itests (90 cases) green on the same database.

  **AND THE OFFLOAD JOB MOVED ZERO ROWS FOR A WEEK, BECAUSE ALL 1,213 WERE ORPHANS. CLEARED
  2026-10-22 ON SCOTT'S "DO IT ALL", AND IT WAS NOT A SPACE SAVING.** Off the log the job itself
  started printing: `1213 rows hold frames but none joined to a day ... the table has 0 foreign
  keys, 19797 sets in all, 19683 with no entry`. The offload cannot move a row whose entry is
  gone -- it resolves the athlete id through the day to name the file -- so it reported `moved 0`
  every boot while 451 MB of a 489 MB database sat in that one column.
  **THE ROWS BELONG TO ACCOUNTS THAT WERE DELETED, AND THE CASCADE THAT SHOULD HAVE TAKEN THEM
  HAS NEVER EXISTED ON PRODUCTION.** `shared/schema.ts` declares `logEntryId` with
  `onDelete: "cascade"`; the live table had ZERO foreign keys. `server/check-schema-drift.ts` had
  already written down why: the reconciler is additive-only, `CREATE TABLE IF NOT EXISTS` is a
  no-op against an existing table, so a `REFERENCES` inside one of those blocks only ever reached
  databases where the table did not yet exist -- and production is the one database that is never
  fresh. The set ids reference entries 2..6595 while entries only exist from 6229, so everything
  below is residue of the accounts retired 2026-10-11. **A deleted account's skeleton trace is the
  one leftover this repo's deletion promise does not allow** (Scott that day: "purge every inch of
  data"), so this is a deletion finishing, not a disk tidy.
  `server/orphan-set-rows-cleanup.ts` does both halves in ONE order and that order is the whole
  design: the orphans go first, the cascade goes on second, and **the cascade is attempted only
  once the orphan count is zero** -- the guard `check-schema-drift.ts` demands in words ("adding a
  cascade to a table that has accumulated orphans will either fail outright or start deleting rows
  that survived precisely because the constraint was missing"). It is a JOB rather than SQL in the
  reconciler because two of the columns are FILES (`skeleton_frames_path`, `form_check_video_url`)
  and SQL cannot unlink one; a row removed with its path on disk trades a database orphan for a
  filesystem orphan plus an `uploaded_files` row pointing at nothing.
  **`cleanupOrphanedVideoRows` IS WHY THERE WERE 1,213 AND NOT 1,078.** That method found this
  exact class in 2026-08, nulled the video columns, kept the rows and never added the constraint
  -- and `check-schema-drift.ts` names the episode as the mistake not to repeat. A cleanup without
  the constraint comes back.
  **RAN ON PRODUCTION 2026-10-23 00:19 UTC:** `cleaned: 19683 orphan set rows deleted (19683
  found, 1224 held skeleton frames, 11 files removed); 0 remain; foreign key ADDED.` The Render
  disk number does NOT fall from this -- the space is reusable, not returned; that still wants a
  `VACUUM FULL workout_set_entries` by hand in a quiet hour.
  Ten itest cases on real Postgres, each **dropping the cascade first** because the test database
  HAS it -- the same asymmetry that hid this for months. The guard case needed a TRIGGER to reach
  at all (an orphan re-inserted as the last one is removed, which is the real race), and without
  that case nothing noticed when the guard was taken out. Five mutations, each caught by the right
  case.

  **AND THE DRIFT CHECK HAD NEVER ONCE RUN AGAINST PRODUCTION, WHICH IS WHY NONE OF THIS WAS
  VISIBLE.** `npm run db:check-drift` is wired into CI's "Check for foreign-key drift" step, and
  CI runs it against a database the same job created minutes earlier, where every constraint was
  written by the `CREATE TABLE` that made the table. **It passes trivially there, every time.**
  `server/fk-drift-job.ts` runs the same comparison at every boot and daily and **repairs
  nothing** -- a boot job IS a build step, which is exactly what that file says must not decide
  this. First run, 2026-10-23: **4 of 225 declared keys missing** -- the `workout_set_entries` one
  above, plus THREE on `assignment_correctives` (`assignment_id`, `program_day_id`, `exercise_id`)
  that no audit had ever looked at. It also counts what each missing key WOULD take with it, per
  key, because "missing" alone does not separate a one-line migration from a 19,683-row deletion;
  a count that cannot be taken reads "could not count" and never zero.
  **ONE BUG FOUND IN WRITING IT THAT WOULD HAVE CRASH-LOOPED THE DEPLOY**, and it is the reason
  for the three-file split: the job first imported `check-schema-drift.ts` to reuse its
  comparison, and that file is a CLI -- `main()` at module scope, `process.exit(1)` on drift. The
  server importing it would have connected, compared and killed the process on any database with
  drift, and **production has drift, which is the entire reason the report exists.** Caught as an
  unhandled "process.exit unexpectedly called with 1" in the unit run. The logic is its own
  side-effect-free module now (`server/foreign-key-drift.ts`), the CLI keeps its exit code, and a
  test forbids `process.exit`, a top-level `main()` and any path from the server to the CLI.
  **THE GENERAL RULE: NOTHING THE SERVER IMPORTS MAY EXIT THE PROCESS**, and `reconcile-schema.ts`
  and `seed.ts` are the other two files in this repo with a bare top-level `main()`.
- **Recorded, not changed:** the sitemap's `lastmod` is the commit date (fine); the HTML ships
  ~2.5 KB of its own comments, which brotli makes nearly free; `/api/auth/me` and the two
  Capacitor web-plugin chunks are the only requests between the entry and the first React paint.
- **Could not be checked from this sandbox:** the domain's mail authentication (SPF, DKIM,
  DMARC) -- DNS is refused by the environment's network policy. The Resend dashboard's domain
  page says whether the records are verified; if they are not, every email to a parent is a
  spam-folder candidate. Scott's to read.

## FORGE STUDIO: THE ART MOD, 2026-10-24

Scott: "lets just add pure art to you, such as smoothing out the body map, upgrading your
capability to draw and smooth and render" / "build them all in order". It is a Claude Code mod
(a plugin of function hooks) checked into the repo at `.claude/skills/forge-studio/`, so every
session on Forge -- this one and the Opus one -- loads the same tools. Nothing in it reaches the
app: no build, no Render deploy.

- **`/studio`** opens a pane beside the chat showing the current render with a strip of earlier
  versions and three buttons: **Approve** (recorded on the version, and Claude is told to treat
  it as the keeper), **Redo** (fills the prompt with "another pass on ...", Scott finishes the
  sentence) and **Compare** (the previous version beside the current one).
- **`/tune knob value [knob value ...]`** reruns the body-map FINISH stage with those knobs,
  shows the result in the pane and asks Claude to republish the review artifact
  (https://claude.ai/artifact/547k9BLoUmuYF12LvyA3dM is in `register.tsx` as `ARTIFACT`).
  `/tune list` prints the fourteen knobs with defaults; `/tune reset` goes back to them.
- **Tools Claude calls:** `render` (the pipeline, any stage, with knobs), `show` (any image file
  into the pane), `cloudinary_enhance` (improve / upscale / enhance / background_removal through
  Cloudinary; needs `CLOUDINARY_URL` as a secret and `api.cloudinary.com` + `res.cloudinary.com`
  on the network policy, neither set yet -- the tool says so and exits 2 without them).
- **`tools/body-map/`** is the pipeline that produced the body-map artifact, moved out of the
  session scratchpad so it survives the container: `pipeline.py --work DIR --stage all|hd|preview
  --set knob=value` runs extract -> components -> assign -> cleanup -> face -> hd -> preview and
  prints one `RESULT {json}` line; the four source renders are in `source/`; the artifact page
  in `page/`. A full run is ~75 s here; `hd` alone is the fast path `/tune` takes. Renders land
  in `.studio/` at the repo root, git-ignored.
- **Loading:** a project plugin in `.claude/skills/` loads with the session; this session also
  symlinked it into its mods folder. `claude plugin validate` and `claude plugin test` both
  pass (two tests, four surfaces); the hooks module type-checks against the 2.1.310 API with
  the tsconfig recipe in the types file header. Two things that cost a round each: an `atom`
  ref's plugin and key must be STRING LITERALS (the scan reads them), and a tool hook's answer
  is `{ result, text }` or `{ isError: true, result, text }`, never `{ text, isError }`.
- **The body map itself is NOT wired into the app.** Scott, 2026-10-24: "no don't wire, i want
  to work, give me the artifact." He works it through the artifact and `/tune`; the wiring into
  `client/src/components/body-map.tsx` waits on his word.

## The top-twenty list, 2026-10-15: what Scott decided and what shipped

Scott handed over a table of the twenty biggest consumer fitness apps (Hevy, Fitbod, Strong,
MyFitnessPal, Cronometer, Caliber, Ladder, RP, Fitness+, NTC, Peloton, Future, JEFIT, Freeletics,
FitOn, Centr, SmartGym, Down Dog, pliability, Garmin Connect) and asked how Forge matches up.
None of them is what Forge is -- a coach-and-roster platform with a Free Agent lane -- and the
real competitors (TeamBuildr, TrainHeroic, Bridge, Volt) were not on it. The fifteen-item read-out
and his answer to each, so none is re-opened:

- **Watch app: not now.** Asked whether people actually log from a watch -- a minority do; the
  wrist's real uses are the rest timer and live heart rate, and the athletes here are teenagers
  logging on phones in a weight room. Apple Health is already read after the fact.
- **Android: parked** (no device; "I'm not going to blind launch it"). Still built, still untested.
- **Exercise demo media: in progress.** Mobility and warm-up content comes AFTER the video library,
  maybe as a class or as something the AI learns to program; flagged, not built.
- **AUTOREGULATION IS FOR FREE AGENTS ONLY, SHIPPED.** Scott: "lets have it auto regulate for the
  free agent classes, not the athletes as they are controlled by the coach."
  `shared/autoregulation.ts`: today's readiness (the check-in's 0-100 score) overlaid on the lift's
  last RPE -- red 10% off, yellow 5% off, green plus 2.5% after an easy session, repeat after a
  hard one, 5% off after a 10, nothing without a check-in. Attached per exercise in
  `getWorkoutDayDetail` ONLY when `getCoachesForAthlete` is empty, and drawn on the workout card
  as a sentence with a Use button beside the existing last-session suggestion. It never rewrites
  the prescription; `autoregulation-is-for-free-agents-only.itest.ts` proves the same athlete gets
  nothing the moment a coach_athletes row exists. No camera number is read.
- **No free tier.** "I don't need it free to start, we will be offering limited coupon codes at
  launch and other holiday things." **AND NOTHING ACCEPTED A CODE**, which is fixed:
  `allow_promotion_codes: true` on the five sale checkouts (never the guardian's 50-cent card
  check), and on iOS a "Have a code?" button on the upgrade screen that opens Apple's own offer
  code sheet (`redeemOfferCode` in `AppleIapPlugin.swift`, iOS 16+). The code is never seen by
  Forge; the transaction it produces comes back through the existing watcher and is verified like
  a purchase. **Still Scott's: create the offer codes per subscription in App Store Connect and the
  promotion codes in Stripe.** `a-launch-code-can-be-redeemed-on-both-rails.test.ts`.
  **AND THE LAUNCH CODE ITSELF IS FORGE'S OWN, BUILT THE SAME NIGHT** (Scott: "I want 30 days
  free so new users whenever they sign up get 30 days from their original signup date, if they
  sign up October 17th they have until November 17th, if they sign up the 23rd they have until
  November 23rd and so on"). It is the existing redeem-code machinery (`redeemCodes`, created on
  `/admin/billing`, default now 30 days) generalised from head coaches to every new account, and
  two things in his sentence decide the arithmetic in `shared/promo-trial.ts`: **the anchor is
  the signup, never the day the code is typed** (`promoTrialFor(user.createdAt, trialDays)`; typed
  at signup or a week later it ends on the same date, and typed after the window has closed it
  unlocks nothing and says why), and **"the 17th to the 17th" is a calendar month, not 30 x 24
  hours** -- October has 31 days, so a whole number of thirties runs that many months, same day
  and time, clamped to the month's last day; any other count is literal days. A head coach's
  trial is `users.trialExpiresAt` as before; **a Free Agent's is the `subscriptions` row's
  trialing end**, because that is the one thing `hasAthletePaidForAiAccess` lets a trial decide
  (the camera, skills and AI tiers), and `users.trialExpiresAt` stays the coach's. The code is
  checked BEFORE the account exists (`findRedeemableCode` in the signup handler: a typo, an
  expired or a spent code is a 400 with no account), refused for a staff-joining coach and an
  athlete signing up under a coach's code (the program is their plan), and a paying Free Agent is
  left on their plan. Surfaces: the optional field on `/signup`, the Forge-code box on
  `/athlete/upgrade` (beside the renamed "App Store code" button, which is Apple's sheet and a
  different thing), the coach's existing box in account settings,
  `POST /api/athlete/redeem-code`, and `trialEndsAt` on `/api/athlete/entitlements` so the page
  says "free through". **The code VALUE is never in this public repository**: Scott creates it on
  More -> Billing -> Redeem codes. `a-launch-code-is-thirty-days-from-the-signup.itest.ts` drives
  all of it through the real routes (anchoring the window to the redemption instead turns five of
  its eleven cases red); `shared/promo-trial.test.ts` pins his two examples. Client halves:
  `verify_build`.
  **AND A CODE FOR EXISTING USERS IS A DIFFERENT CODE, SO THE ADMIN PICKS TWO THINGS** (2026-10-16,
  Scott: "one month free for new users would be different than 50% off for existing users, a 4th
  of July sale might be 50% off where a new years/Christmas sale might be one month free for all
  users" / "Obviously they have to type the code in to redeem it, but, gives us the option").
  `shared/promo-codes.ts` is the vocabulary: AUDIENCE `new_accounts` (the window after signup, free
  time counting from the signup) or `everyone` (any account, free time counting from the
  redemption, on top of a trial still running); KIND `free_time` or `percent_off`
  (`percentOff` for `discountMonths`). `server/promo-codes.ts` (`redeemPromoCode`) is the ONE
  place the rules meet, called by signup and both redeem routes; storage keeps the queries
  (`findRedeemableCode`, `hasRedeemedCode`, `recordCodeRedemption`, `extendCoachTrial`,
  `extendFreeAgentTrial`) because it cannot import billing. **The card rail is where "existing
  users" live**: a code is created at Stripe WITH the Forge code (`createStripePromoForCode` --
  a coupon, 100% for a free-time code's months, plus a promotion code of the same name so the
  web checkout accepts it; best-effort, the admin toast says when Stripe was not reached), and a
  redemption on an account Forge bills by card puts the coupon on every live Stripe subscription
  (`liveStripeSubscriptionIdsFor`: the tier or coach plan row plus each active add-on's handle)
  -- NEVER a trialing row over a live plan. A percent-off code on an account with no card plan is
  told to type the same code at checkout and spends no redemption. **A plan billed through the
  App Store is Apple's to discount**: either kind is refused with the App Store sheet named, the
  admin copy says to create the same code as an App Store offer code, and nothing is spent. A
  redemption row is written only when something was given. `promo-codes.test.ts` (server, Stripe
  faked) drives the card branches; the itest drives the database ones (17 cases);
  `shared/promo-codes.test.ts` pins the sentences. Migration: six columns on `redeem_codes`,
  proven on a fresh database and on one that had the table. Client: the admin form's two
  selectors and the toasts carry the server's sentence. `verify_build`.
- **ZERO COMMUNICATION BETWEEN USERS WHO ARE NOT BEING COACHED.** "keep the social layer all the
  way out, we will have underage athletes and i want 0, absolute 0 communication between users
  when they aren't being coached." Already true (the discussion board went 10-11) and now a
  ratchet: `no-athlete-to-athlete-communication.test.ts` discovers every table from the schema and
  every athlete write route from the source; a table named like a message must be an AI
  transcript by SHAPE (a role enum whose values include "assistant", one person, no recipient),
  and no table anywhere may carry two people and a body. The eight `*_messages` tables are all
  person-to-model.
- **Widgets, Live Activity, Siri: asked for recommendations**, given in chat: a Live Activity rest
  timer first (lock screen and Dynamic Island, the one thing used mid-set), a Today widget (next
  session, readiness tap) second, Siri through App Intents last. All three need a WidgetKit
  extension target in the Xcode project fed through an App Group by a small plugin; built by the
  same fastlane lane, verified by `verify_build`, tested only on Scott's phone.
- **Camera calibration: coming, slowly.** Demo clips: in progress. Mobility library: in progress.

## Launch-checklist decisions, 2026-10-08 (Scott, working the next ten)

Recorded here because every one of them is a question somebody will otherwise re-open, and two
of them look like bugs to a fresh reader.

- **THE FAST MODEL IS WHATEVER CLAUDE'S FASTEST IS, AND TODAY THAT IS HAIKU 5.5.** Scott: "i
  want the fastest models that claude offers, which is haiku 5.5." The code default is already
  `claude-haiku-5-5`. **The remaining step is NOT in the code**: `ANTHROPIC_FAST_MODEL` is
  `sync: false` in `render.yaml:158`, so a value pinned in the Render dashboard silently wins.
  Clear it or set it to `claude-haiku-5-5`, or the switch does nothing in production and the
  bill stays 7-8x. When a faster model ships, this is a one-line change plus a `RATES` row --
  see the Haiku 5.5 entry for the two properties (`tool_choice` forced, parse-by-type) that
  keep the lane safe.
- **THE COACHES CORNER TRACK QUIZ KEEPS SENDING ITS ANSWER KEY, DELIBERATELY. DO NOT "FIX" IT.**
  Scott, asked directly: "keep it how it is, expand the answer after." `routes.ts` spreads the
  question row so multiple-choice answers keep `isCorrect`, which means a coach can read the key
  in the network tab before answering. That was raised as a finding, put to Scott with the
  recommendation to strip it, and he declined. The reason the key is there is the behaviour he
  wants: `academy-quiz.tsx` opens an answer's explanation on tap AFTER submitting ("Tap a
  multiple-choice answer to see why"), which is self-development material working as intended.
  The athlete class reader is the opposite and stays that way -- it strips the key before it goes
  out, because a class quiz is a coach's view of an athlete. Two libraries, two answers, both
  chosen.
- **FULL PERSONALIZATION IS NOT GOING TO APPLE.** Scott: "we won't be adding to apple, which is
  fine." It stays admin-assigned at $24.99, `COACH_PURCHASABLE_ADD_ON_ORDER` stays
  `["coaches_corner"]`, and the four-step order trap recorded in the add-ons section is now moot
  rather than pending. This is a working state, not an unfinished one.
- **`INSTITUTIONAL_AGREEMENT_SIGNER_NAME` / `_TITLE` stay at the defaults**, "Scott Morrow" and
  "Founder". Confirmed, not assumed.
- **The six newer Forge classes are read and accepted** (Fundamentals, football receiving,
  soccer attacking, volleyball, wrestling, track sprinting). Scott: "done."

**RESOLVED, SAME DAY: COACHES CORNER STAYS ON APPLE, AND IT IS THE ONLY COACH-SIDE APPLE
PRODUCT.** Scott, when the flag below was put to him: "coaches corner is the only thing listed on
apple for the coaches side." Correct, and verifiable in one line --
`COACH_PURCHASABLE_ADD_ON_ORDER` in `shared/billing-tiers.ts` is `["coaches_corner"]`, and every
checkout enum, `missingPriceEnvVars()` and the Apple product map derive from it rather than
naming ids. So "everything paid for by coaches will be through the website" was about what is NOT
being ADDED to Apple (Full Personalization) and about the coach plan, which was always web-only.
Nothing changes. Do not re-raise this as a contradiction.

What was flagged and why, kept because the distinction is the part that will be re-litigated:
the statement taken literally would have meant unselling something already built, tested,
submitted and proven in sandbox, during an open review -- so it was written down rather than
acted on.
- The COACH PLAN ($4 an athlete in bands) is web-only and always was -- Guideline 3.1.3(c)
  allows a program to be billed by card outside Apple, and the app may not price it or point at
  it (`native-paywall-never-points-at-the-web.test.ts`). Nothing to change.
- COACHES CORNER IS SOLD THROUGH APPLE. `client/src/pages/coach/coaches-corner.tsx:176` calls
  `purchaseCoachAddOn("coaches_corner")` through StoreKit on iOS, the product exists in the Coach
  Add-ons group, it was submitted with 1.1, the review notes say a coach can buy exactly this one
  thing, and build 643 proved the purchase in sandbox.
- **The two are different rules, not one, and that is why both can be true at once.** A
  program's roster subscription is a B2B purchase a school pays by card; Coaches Corner is a
  digital subscription a coach CONSUMES INSIDE THE APP, which 3.1.1 requires to be sold through
  IAP. Moving it to the web and pointing the app at a browser is the exact steer that guideline
  forbids and that the scan above exists to catch. If it is ever genuinely wanted it is its own
  decision, taken after 1.0 is approved, and it means removing the in-app purchase path
  entirely rather than adding a web one beside it.

## The launch audit's reachable rows, run 2026-10-08 against the live host

Scott: "look over the rest of the audit, now that you have access to the url can you fix some of
the other things on your own?" Six dimensions probed read-only against
`forgeperformancesystems.com` (GET and HEAD only; no write was ever sent to production, and no
real athlete's clip was fetched to establish anything below -- every upload probe used a
made-up filename, which is enough because the gate answers 403 before the file lookup and an
ungated path answers 404).

**A MINOR'S FORM-CHECK CLIP WAS PUBLIC BY URL THE MOMENT A COACH SAVED IT AS A REFERENCE.** The
one finding that mattered. `POST /api/coach/reference-clips/from-athlete` calls
`copyUploadedFile(videoUrl, "reference-clips")`; the source is in `form-videos` and gated, and
`reference-clips` was in no list, so the copy was served with no session, no signature and no
expiry, forever. The row records `source: "from_athlete"` and `sourceAthleteId`, so the server
knew whose footage it was. `knowledge-sources` -- the purchased textbook -- was unclassified the
same way. Both gated; signing is a global `res.json` sweep keyed on the same predicate, so
nothing needed rewiring and nothing broke.
**THE HAND-WRITTEN LIST WAS THE REAL DEFECT.** `media-url-signing.test.ts` is thorough about the
scheme and named four of six gated directories by hand; a list cannot fail for a directory nobody
put on it. `every-upload-directory-is-classified.test.ts` now DISCOVERS all fourteen (both
spellings -- the `path.join(UPLOADS_ROOT, "x")` destination and the `/uploads/x/` stored URL,
because a scan knowing only one would have missed this exactly where it mattered) and requires
each to be gated or listed public with a reason. It also asserts `copyUploadedFile` only ever
writes into a gated directory, which is the general rule: **a copy of a gated file is still that
file.** The six left public each carry their reason; `team-logos` and `team-branding` cannot be
gated at all, since they draw on `/team/:slug` and the login screen before there is a session.

**A PURCHASED TIER WAS NOT HONOURED WITH `BILLING_LIVE` OFF, AND THE TWO SIDES OF THE APP READ
OPPOSITE SWITCHES.** Worth keeping at hand, because each reads as the other's bug:
- **Coach** (`getEntitlements`): `!ENFORCEMENT_ENABLED || isBetaAccount || trialActive` ->
  everything unlocked. With `BILLING_ENFORCEMENT_ENABLED` unset, flipping `isBetaAccount` off on
  one coach changes NOTHING; the global switch short-circuits first.
- **Free Agent** (`hasAthletePaidForAiAccess`): never consulted `isBetaAccount` at all. It asked
  `BILLING_LIVE`, and with it off returned false for EVERY Free Agent -- no camera, no skills, no
  AI chat, whatever they held -- bar the hardcoded `freeagent@forge.app`.
So a tester who bought AI Coach + Video in the StoreKit sandbox had the purchase verified, the row
written and build 613's upgrade screen marking it their current plan, and still saw no record
button. Builds 612-614 proved those purchases were RECORDED; nothing proved they were HONOURED.
A tier on file is now honoured either way (`tierGrants`, one function for both branches). It grants
only what an admin or a verified purchase put there, and signup never writes `freeAgentTier`, so
no real account's experience changed. **FOUR AUDIT ROWS WERE UNRUNNABLE BECAUSE OF THIS** -- B6,
D1, D9 and F2 all say to flip `isBetaAccount` to see a Free Agent gate, which could never have
worked. B6 works now; the coach-side rows still need the global enforcement switch.
**Do not set `BILLING_LIVE=true` to run the audit** -- it also opens every web checkout
(`chargingClosed`) against real Stripe prices.

**THREE WITHDRAWN SPORT COACHES WERE PRICED AT $7.99/mo ON `/pricing`**, live, in the sitemap at
priority 0.9, while `createFreeAgentAddOnCheckout` refused all three. `athlete/upgrade.tsx` had
filtered correctly all along and carries the argument ("A card saying $7.99, coming soon is still
an offer"), which makes the other two surfaces an oversight. `/pricing` now filters, heading and
all. `athlete/sport-coaches.tsx` is fixed DIFFERENTLY on purpose: that page is how somebody who
HOLDS one opens it, so the card stays and only the price and buy button go. Latent there, because
`billingOpen` is false today. `tier-withdrawal-machinery.test.ts` had no add-on half at all --
that is why nothing caught it -- and now scans every surface mapping `SPORT_COACH_ADD_ON_IDS`.

**AND NO PUBLIC PAGE SAID NOTHING WAS BEING CHARGED.** This file asserted that "the pricing page
still says Forge is not charging yet" and row F3 repeated it; the only such sentence in the repo
was `/pricing`'s `<meta name="description">`, which no reader sees, plus one hardcoded clause in a
`/for-high-schools` FAQ answer. `BETA_NOT_CHARGING_NOTICE` is now one constant on all three
surfaces, which is the load-bearing part: at launch the sentence has to leave all three at once.
**The Terms are deliberately excluded** -- s11 describes the paid plans on purpose, and
`beta-pricing-notice.test.ts` says so in words so nobody sprays the constant over every
money-mentioning surface.

**TWO AUDIT ROWS NOW PASS ON EVIDENCE, and one warning goes with them.**
- **E1's signed-out quarter.** All 280 registered `GET /api` routes fetched with no cookie: 274
  returned 401, and not one returned a name, an email, a date of birth, a stack trace or a 500.
  Only nine have no auth middleware on the line and all nine are deliberately public. Zero
  unguarded write routes (from source -- no write was sent). The authed page prefixes all return a
  byte-identical 4,884-byte SPA shell. Traversal holds; `X-Forwarded-For` cannot bypass the rate
  limiters (`trust proxy` is 1, not `true`); the waiver directory is gated. The other three
  quarters of E1 need real credentials and are still Scott's.
- **G2, better than the two validators would have answered it.** 20/20 JSON-LD blocks parse, every
  @type real, **zero invented property names**, and the no-ratings rule verified on the LIVE output
  rather than the source. Open Graph complete on all 24 pages with every declared
  `og:image:width/height` matching the real PNG IHDR; `og:url` == canonical, `og:title` == title,
  `twitter:image` == `og:image` throughout. Titles 35-59 chars and distinct, descriptions 59-149
  and distinct. **The Smart App Banner is confirmed on the live host for the first time**:
  `<meta name="apple-itunes-app" content="app-id=6801950011">`. `facebookexternalhit`, `Twitterbot`
  and `Googlebot` each receive the same prerendered HTML as an anonymous fetch.
- **THE WARNING: Google's Rich Results Test WILL report the Software App item as missing required
  fields, and that is CORRECT.** The `SoftwareApplication` node carries no `aggregateRating` and no
  `review` because Forge has none. Do not "fix" it by inventing one -- `seo-head.test.ts` refuses
  exactly that, and it would be a fabricated rating on a public page.

**Recorded, not fixed:** CSP is report-only by documented decision (`/api/csp-report` is
collecting the signal); and `ratelimit-remaining` moves non-monotonically across requests, which
reads as per-instance in-memory counters on Render -- so the effective limit is multiplied by the
instance count, which matters only once there is real traffic.

## Reading all sixteen email bodies, 2026-10-09

Five findings, each one a surface nobody had read end to end. Worth keeping because three of them
are the same shape -- a scan that discovers by the wrong signal -- and because two of the emails
are the ones a parent or a school sees first.

- **EVERY IN-APP NOTIFICATION EMAIL WAS SILENTLY UNBRANDED.** `notify.ts` passed
  `brandForUserId: userId` and emitted two bare `<p>` tags. `applyEmailBranding` opens with
  `if (!FORGE_EMAIL_HEADER_RE.test(html)) return html` -- it leaves a body it does not recognise
  alone rather than half-branding it, which is the right rule and was also a silent one. So the
  From line wore the program and the body wore neither the program nor "Powered by Forge", which
  is the deal Full Personalization is sold on. It was left alone because there was nothing in it
  to recognise.
- **THE INSTITUTIONAL SIGNED-COPY CONFIRMATION HAD NO FORGE WORDMARK ANYWHERE** -- the only email
  in the system without one, sent to the notice address named in a signed agreement. It is
  deliberately NOT branded by program (no `brandForUserId`): the agreement is between the school
  and Forge, so the confirmation of what was signed with Forge wears Forge.
- **`server/email-shell.ts` is the one shell now**, moved out of `email-roster-documents.ts`
  BYTE-IDENTICALLY (`email-shell.test.ts` asserts that against the previous implementation, so
  none of the thirteen working emails changed shape) and beside a new `FORGE_EMAIL_HEADER`
  constant. **The regex RECOGNISES a band; the constant is the one to WRITE**, and the test
  asserts the regex matches the constant -- the day they drift is the day a builder emits a header
  nothing matches and goes silently unbranded, which is what notify.ts did by emitting none.
- **THE COACH'S PROGRESS REPORT EMAILED CAMERA-TIMED COMBINE NUMBERS WITH NO CAVEAT.**
  `recordCameraTimedCombineResult` writes a video-timed 40, pro agility or three-cone straight
  into `users.fortyYardDash` and friends, and `snapshotTestingResults` is shared with a coach's
  manual edit -- so there is **no provenance column** and a number in that table may be either.
  The sentence says a time **may** have been camera-timed, which is the only honest claim; a flat
  "these are camera numbers" would be wrong for a stopwatch time. `CAMERA_ACCURACY_INLINE`, never
  a retyped sentence, because `shared/camera-accuracy-copy.ts` exists to be deleted in one place
  when calibration lands. **`camera-caveat-coverage.test.ts` could never have caught this**: that
  scan reads `client/src/pages`, and no email was ever in its scope. CLAUDE.md's rule is that an
  exemption needs the reason "no reader sees a number here", and an emailed progress report is the
  opposite of that.
- **`/pricing` HAD NO NAV AND NO FOOTER**, the only one of the six marketing pages outside
  `MarketingShell` -- a bare `min-h-screen` div. It is indexable at priority 0.9 and reached from
  the login screen, the signup footer and the nav on every other page, so a visitor who landed
  there had the back button and nothing else. The footer is also the internal link graph (see
  `MarketingNav`'s own comment, written when the audience pages were orphans), so a page outside
  the shell is outside that graph in both directions.
- **AND THE CLAIMS SCAN HAD NEVER READ THREE REAL EMAIL BUILDERS**, because it discovered them
  with a `/email.*\.ts$/` FILENAME glob: `progress-report.ts`, `terms-change-notice.ts` and the
  institutional confirmation say nothing about email in their names. It scans the **UNION** of
  that glob and the band itself now -- the band alone would drop `email-roster-documents.ts`,
  whose band comes from the shared shell and whose file no longer holds the literal, so either
  signal alone has a blind spot and the union has neither.
  **Third instance in two days of one shape**: the public legal-doc assertion iterating the set it
  was meant to police (`parental_notice`), the upload-directory list that could not fail for a
  directory nobody added, and now a glob that cannot see a file named something else. **The
  direction of the assertion is the bug every time**, and the cure is always the same -- discover
  from the real world (the table's columns, the filesystem, the emitted band) and require every
  member to be classified.
- **`every-marketing-page-has-a-way-out.test.ts` exists because mutation-testing the /pricing fix
  turned nothing red anywhere.** It classifies every route in `PUBLIC_ROUTES` as a marketing page,
  a legal document (ONE shared reason, because nine copies of "a legal document, as /terms" is
  padding that a per-entry length check would have forced) or deliberately chrome-free with a
  reason over 50 characters, and it refuses a second `min-h-screen` nested inside the shell --
  which is exactly what the first draft of the /pricing fix did. Both mutations caught.

## THE LEDGER, AND THE TWO GUARDS THAT CERTIFIED A BLEND NO BUILD EVER PRODUCED

Added 2026-10-23. This is the accuracy ledger the 10-19 session asked for, and it is here in this
shape because of the defect found while verifying whether it was needed.

**A SEALED COMPARISON MAY NOT READ A LIVE CONSTANT. THAT IS THE WHOLE RULE.**
`height-ruler-uncertainty.test.ts` and `four-lifts-beside-ovr-2026-10-05.test.ts` each hand-rolled
their take's blend from real export candidates, typed the shoulder ruler's uncertainty as `0.1`,
and imported `HEIGHT_RULER_UNCERTAINTY` **by name**. Each half was right when it was written.
Together they are a comparison that is a record of nothing: the sealed half cannot move and the
live half is rewritten by every refit.

**A REVIEW CALLED THE `0.1` STALE AND PROPOSED DELETING IT. THAT IS THE WRONG HALF, AND THE REPLAY
SAYS SO IN ONE NUMBER.** At the uncertainties the ledger now records, all four takes reproduce the
scale the phone really shipped to **0.0000%**. `BIACROMIAL_TOLERANCE_FRACTION` was 0.1 from
`2a19782c` (2026-09-09) until `e70cc096` (2026-10-06) made it 0.2 **and a floor**, so the literal
is faithful history and the IMPORT is the defect. Deleting it would have replaced four records
with four fictions. **This is why an agent's report is verified against the code before anything
moves** -- the consequence it named was real and its cause was backwards.

| take | as filmed | the guard asserted | pipeline today |
|---|---|---|---|
| 10-04 Back Squat | -7.98% | **+1.21%** | -5.97% |
| 10-04 RDL | -7.91% | **-2.26%** | +3.58% |
| 10-05 Back Squat | +5.97% | +5.97% | -3.58% |
| 10-05 RDL | -6.98% | -6.98% | -1.95% |

The 10-04 pair asserted "within 2.5% of the sensor" and passed 5/5 for seventeen days on a blend
that was never on a phone. **It could not have failed**: the one input a refit could reach was
typed by hand. And the 10-05 squat **changed sign** across `e70cc096`, so "the squat reads high"
and "the squat reads low" are both true of one take depending which build is asked -- Rule #5
exactly, from a constant rather than from scatter.

**A THIRD FINDING, AND IT IS IN THE LIVE PIPELINE RATHER THAN A TEST: THE HEIGHT RULER IS NOW
FOUR TIMES AS CONFIDENT AS THE SHOULDER RULER.** That file's first case forbade precisely this --
both are body spans off the same landmarks, so neither has earned the tighter claim -- and it
passed as an EQUALITY between the frozen `0.1` and `HEIGHT_RULER_UNCERTAINTY`, two numbers that
stopped being the same on 2026-10-06. Against the live floor it is 0.1 against 0.2, which is 4x
the inverse-variance weight. **NOT FIXED**: `HEIGHT_RULER_UNCERTAINTY` was fitted jointly on
Scott's squat and his RDL and the 10-20 provenance audit calls it the heaviest lever on two of the
three lifts under test, while the shoulder's 0.2 was fitted across nine takes and is a FLOOR that
can only loosen. Refitting either to restore a symmetry argument, on a day with no sensor beside
the bar, is how a bad constant gets in. The case is **inverted** to assert the asymmetry as it is,
so the day either constant moves somebody decides deliberately which way the relation should go.

**HOW A ROW WORKS.** `shared/accuracy-ledger.ts` carries, per take: the candidates as the export
gives them, **the uncertainty EVERY ruler stated**, whether the height ruler voted (a separate
fact from its uncertainty, because a posture LABEL decides it -- both RDLs shipped WITH a height
ruler and today's pipeline admits none), the shipped scale, and both ranges of motion. **No
imports on purpose**: the replay needs `reconcileScaleEstimates`, which `bundle-budget.test.ts`
keeps out of the eager entry, so importing it from `shared/` would be a route into that bundle for
every page. Each take is replayed **twice**:
- **as filmed**, which must reproduce the scale the phone shipped. That is what makes a row a
  record rather than a reconstruction, and it is the check that proved the `0.1` was history.
- **through the live constants**, whose answer is recorded as `liveErrorPct`. A refit moves it,
  the replay reds, and updating it is where a constant's cost on every already-measured take lands
  in the diff instead of seventeen days later.

**`liveErrorPct` IS PINNED TO A TWENTIETH OF A POINT, NOT TO A THRESHOLD.** A threshold is what
let this sit still: "inside 2.5%" is satisfied by a wide band of wrong answers, and the point is
to notice a MOVE, not to clear a bar. Red here is information, not a failure.

**STATED LIMITS, so the file is not read as more complete than it is.** The four rows were rebuilt
from what those two tests happened to keep, so they carry no `heightInOnFile`,
`spanSpreadFraction`, grip ratio, `cadenceHeld` or rep count -- those are in the export and are to
be filled in for the next take filmed beside a sensor, **never back-guessed**. A sealed row has no
frames, so the replay can only know the shoulder ruler's FLOOR, not what the spread or the grip
floor would have loosened it to. And the hybrid scan does not follow a value computed inside a
helper function.

**THE SCAN STATES WHAT IS FORBIDDEN** -- a frozen value beside a live constant in one
`reconcileScaleEstimates` call -- bounds each call and each property value by **matching its own
brackets** rather than a character window, discovers the live names from each file's OWN import of
`./pose-tracking`, resolves local `const X = <number>` declarations, and strips comments first.
**Its first draft captured the first token after the colon**, so
`c.source === "height" ? HEIGHT_RULER_UNCERTAINTY : 0.1` read as neither frozen nor live -- the
enumerate-accepted-forms trap in a new guise, since matching one spelling of an EXPRESSION passes
for every spelling nobody thought of. Containment over the whole value catches all three
spellings. A counterfactual literal beside a LEDGER lookup stays legal: the row is frozen, so
"what would 0.05 have given on this take" is well-posed, and that is the only comparison in the
height file that ever was.

Eight mutations, each caught by the right case: one row's `liveErrorPct` reds one case; an
as-filmed uncertainty reds the faithful-record replay; **the `e70cc096` refit itself reds FIVE**;
undoing the height refit reds four; the hybrid reds the scan in all three spellings; dropping the
posture gate reds the two RDL rows; a bracket matcher that finds nothing reds the floor. **The
first draft of `liveUncertainty` typed `0.2` for the two 3D rulers** -- the same defect, in the
file that exists to catch it -- so all four are read by name.

Records and gates nothing (Rule #1). No constant moved, no capture is refused, `FITTED_OVERRIDES`
stays empty. A ledger is a MECHANISM, so it is shared across every movement -- the test the
"what 'its own numbers' means" section sets. Tests plus a shared module nothing in the client
bundle references: no build.

## RULE #5: MEASURE THE SCATTER BEFORE FITTING THE BIAS

Added 2026-10-09. Scott, after three sessions of comparisons against the OVR: **"I just feel like
we're starting over everytime."** He was right, and it gets its own number because every
calibration session for a week walked into it.

**THE SAME LIFT DISAGREES WITH ITSELF BY AS MUCH AS IT DISAGREES WITH THE SENSOR.** Same athlete,
same lift, same load, across the 20 captures in the 10-09 export:

| Lift | Load | ROM across takes | hi/lo |
|---|---|---|---|
| Pendlay Row | 135 | 42.6, 46.9, **71.6** | **1.68x** |
| Bench Press | 135 | 25.7, 28.4, 32.0, 32.5 | 1.26x |
| Shoulder Press | 65 | 63.0, 68.1, 71.4, 75.4 | 1.20x |

**It is not drift between builds and it is not me forgetting what I changed** -- the first thing
to rule out, and it is ruled out by the takes that share a build. On 2026-10-07 sets 1 and 2 of
each lift were both the pre-refit control on build **637** (set 3 was the first on 639, so the
three-set groups are NOT one build -- an earlier draft of this entry said they were, and that was
wrong). Sets 1 and 2 on that one build, minutes apart:

| lift | set 1 | set 2 | hi/lo |
|---|---|---|---|
| Bench Press 135 | 25.7 | 32.5 | **1.26x** |
| Shoulder Press 65 | 71.4 | 63.0 | 1.13x |
| Pendlay Row 95 | 35.2 | 32.6 | 1.08x |

A quarter of the bench's range of motion, between two sets, with no code change between them.
The scatter is in the measurement.

**So every session since 10-04 has been fitting a BIAS of 10-25% out of a signal whose
take-to-take SPREAD is 6-24%.** That cannot converge. Each new session's single take lands
somewhere in the cloud and reads as a win or a regression depending where it fell, which is
exactly what "starting over" feels like from the outside. **Before proposing any correction
constant, say what the spread is.** If the spread is the same size as the bias, the honest move
is to reduce the spread, not to fit the mean of it.

`shared/capture-repeatability.ts` computes this over whatever captures the export holds and rides
in the admin capture download as `repeatability`. It records and gates nothing (Rule #1). The
worst group sorts first, and `sameDay` marks the groups that rule out a build change.

Per-ruler scatter, same 20 captures (median CV across lift/load groups, lower is steadier):
**height 7%, body_3d 7%** (present 20/20), **shoulder_width 12%, depth 12%**. On the Pendlay Row
body_3d's spread is **1%** and shoulder_width's is **17-21%**.

- **This does NOT weaken "its own numbers".** The spread is a property of the shared MECHANISM,
  not a number to split 270 ways. Read it beside that section: a RULE gets better for every lift
  at once, and this is a rule about when a fit is admissible.
- **It does not license a correction either.** `FITTED_OVERRIDES` is still empty.

### The shoulder ruler is one span, and the span foreshortens

Measured the same day. It is `BIACROMIAL_HEIGHT_FRACTION x height / measuredSpan` and nothing
else -- scale x span came to **0.438 m** on all three takes, so it is wholly at the mercy of one
measured span, and that span shrinks as the athlete turns while the metres it divides do not.

| take | grip px / shoulder span | shoulder ruler vs sensor |
|---|---|---|
| Bench | **1.47** | **+1.4%** |
| Push Press | **2.06** | **+49.1%** |
| Pendlay Row | **2.91** | **+62.0%** |

Exact ordering on 3/3. A bench grip is ~1.5x biacromial breadth, so 2.91 is a shoulder span read
at half size, not anatomy. **`subjectFacing` read "oblique" on all three and separated none.**
`calibration.shoulderRuler.gripToShoulderSpanRatio` records it and **NOTHING READS IT**: each take
was a different lift and so a different grip, and three confounded points cannot choose an
uncertainty. What settles it is one lift filmed square and oblique.
**`spanSpreadFraction` does not predict this error** -- the press had the TIGHTEST spread (0.042)
and the second-worst error. First evidence either way on a measure added 10-06 for this job.
**Refusing the ruler is not available:** it is the only good voter on the bench (+1.4% against
body_3d's -29.7%), so a blanket refusal takes the bench to -29.7%. Rule #1.

### THE SET-2 PAIRING SETTLED IT, AND A LONE PLATE WAS TAKING THE WHOLE SCALE

Scott filmed a second set of each lift an hour later. The sensor reports its own repeatability
beside Forge's, which is what makes this the pairing that proves the rule above:

| lift | OVR set1 -> set2 | FORGE set1 -> set2 |
|---|---|---|
| Bench 135 | 1.01x | 1.14x |
| Push Press 65 | 1.05x | 1.14x |
| Pendlay Row 135 | **1.03x** | **3.21x** |

**THE ROW SET 2 READ -60.5% BECAUSE A PLATE NOBODY AGREED WITH TOOK 100% OF THE SCALE.**
`body_3d` was -2.7% and `depth` was +0.4%, both at 0% weight; the plate was 60% low at 100%.
The guard for exactly this (build 594, "a plate nobody agrees with is not a plate") tested
`voters.length >= 3`, and `voters` is counted AFTER the 3D-pose collapse folds body_3d and depth
into one witness -- so the commonest ruler set there is, {plate, body_3d, depth}, arrives with
TWO voters and the guard sleeps. **The collapse is right about agreement and wrong as a
corroboration count.** It counts independent non-plate READINGS now, before the collapse; one
non-plate ruler still leaves the plate its rank, which is the tie the original comment protected.

**Replayed over every capture: ONE moved, 13 bit-identical.** After it, all three of the latest
takes are inside 1.5% of the sensor -- bench +1.5%, press +1.3%, row -1.1%.
`a-lone-plate-never-takes-the-whole-scale.test.ts`, mutation-tested three ways. A RULE, not a
fitted number; `FITTED_OVERRIDES` stays empty.

**AND THE BOX DIAGNOSTIC SHIPPED THAT MORNING WAS CIRCULAR.** `plateBoxToExpectedRatio` divided
by the take's final scale, so on a take where the plate WON it returned the plate's own box and
read **1.000** -- a perfect score on the plate that was 60% wrong. It divides by the blend with
the plate removed now. A diagnostic that scores a ruler against itself is worth nothing exactly
when the ruler is the problem; check for that shape in any future "is this sensor right" measure.

### AND THE GRIP SAYS WHEN THE SHOULDER SPAN CANNOT BE RIGHT

Six paired takes, confound broken by filming each lift twice. grip/shoulder 1.47 -> +1.4%, 1.74
-> +8.3%, 2.06 -> +49.1%, 2.16 -> +25.8%, 2.91 -> +62.0%, 3.20 -> +69.2%; five of six order
exactly and the two ROW sets are the same lift and the same grip. Anatomy bounds that ratio --
the widest barbell grip is ~0.81m against 0.23 x stature, a ceiling of 1.85 for this athlete --
so a ratio past it is a shoulder span read too small, and the excess is how much.

Carried as UNCERTAINTY, never a correction, FLOORED so it can only loosen, and the ceiling is
DERIVED per athlete from two constants that already exist. `FITTED_OVERRIDES` stays empty.
**The mechanism is NOT settled and the comment says so**: rotation foreshortens grip and
shoulders together and would leave the ratio invariant, so the likelier cause is the shoulder
landmarks collapsing on a hinged or supine athlete. What is established is that it is measured
from a signal the ruler does not produce and tracks its error across six takes.

Two of fourteen captures move: Pendlay Row set 1 **+23.1% -> -7.4%**, and the 10-08 Back Squat
**-6.9% -> -9.0%**, which is recorded rather than smoothed over. Median absolute error across the
six paired takes 6.1% -> 4.5%.

### AND LOOSENING A RULER MUST NOT LET IT VOUCH FOR ANYONE (the 654 regression)

Set 3 of each lift, same day, found this within an hour of 654 shipping. The grip floor correctly
put the shoulder ruler at 0.587 -- and the agreement tolerance was the looser ruler's uncertainty
DOUBLED, so it became **1.174**. At that width the shoulder ruler "agreed" with a plate 3.5x away
and a body ruler 1.85x away; all three formed ONE cluster anchored on the vaguest witness, and the
plate (stated 0.0133 = 5,625x a body ruler's weight) took **99.5%** of the blend.

**A ruler that cannot tell 1.85x from agreement is abstaining, and an abstention must not vouch
for a third witness.** `MAX_SCALE_AGREEMENT_TOLERANCE` caps the window at 0.4, what a
normally-stated ruler already asked for, so it can only ever make the test STRICTER. The loosened
ruler still loses weight, which is the floor's whole purpose.

**Nine paired takes: median absolute error 10.6% -> 5.4%, worst case 60.5% -> 20.7%.** Only the
three rows and the 10-08 squat move; ten captures bit-identical.
`a-vague-ruler-cannot-vouch-for-anyone.test.ts`. The "stricter only" assertion needs
`corroborated`, NOT `agreedSources` -- two body rulers that disagree are averaged by the fallback
anyway, so the weaker assertion cannot tell a real agreement from that rescue.

**THE LESSON WORTH KEEPING: a change that widens an uncertainty widens a TOLERANCE somewhere.**
Before loosening any ruler again, ask what reads its uncertainty besides the weighting.

### THE BARBELL IS THE RULER SCOTT WANTS AND THE BOX IS 2-7x TOO BIG

Scott, same day: "what happens when the camera can't find my shoulders, it should still be
relying on the barbell which can get an accurate frame almost everytime." Correct, and it is
Rule #4 word for word -- the object is the only ruler whose real size is KNOWN. **The barbell is
found**: the implement appeared on 438 / 135 / 431 frames of the three takes. **Sizing it is what
fails.** Boxed 145x263, 164x314, 418x759 px where a 45cm plate at each take's own scale would be
126 / 111 / 113 px: **2.09x, 2.81x, 6.73x too big**, all aspect ~0.55, all refused on
`aspect_ratio`, and all three refusals correct.

`calibration.objectGate.plateBoxToExpectedRatio` now ships that ratio on **every** take with no
sensor needed -- `plateScaleIfAdmitted` (build 633) is a scale and could only ever be scored
beside the OVR, which is why three sessions of it were unreadable on ordinary days. Near 1.0 is a
box the right size. **It is the number that says whether the retrain worked.**

**THE CAUSE WAS ALREADY WRITTEN DOWN AND THE FIX WAS NEVER RUN.** 10-07 predicted this exactly
from the training data -- "a detector trained on close-ups predicts boxes TOO LARGE, which a
scale pipeline reads as a scale too small" -- and said training was the next step. It had still
not been run. All 266 images are labelled (1611 boxes, barbell 146, plate 465) and
`prepare_dataset.py` splits them 225/41 clean.

### AND IT IS RUN NOW: THE RETRAINED DETECTOR DRAWS BOXES 1.01-1.03x, MEASURED ON HELD-OUT DATA

Scott, on the three rows still being the one lift outside 15%: **"Why didn't you fix everything?
It's no use testing the camera if everything isn't fixed and now we're wasting more time. Fix the
row. Then reupload."** He is right, and the row is not fixable by weighting body rulers, which is
why the three fixes above did not reach it: on set 3 the candidates BRACKET the truth (`body_3d`
and `depth` -21%, `shoulder_width` +46%) and no combination lands on it. Fitting a bone preference
to close that gap is one number fitted on one lift, and every ruler uncertainty is SHARED, so it
would move the bench and press that are already inside 5%. What the row needs is the ruler whose
real size is KNOWN, and that is the object.

Trained on all 266 images / 1,611 boxes. 100 epochs requested, stopped at **epoch 84** by its
time limit; best checkpoint **epoch 59** (mAP50 0.4755), and the 25 epochs after it never beat it,
so the run had plateaued and `best.pt` is the artifact rather than a truncation.

**mAP IS THE WRONG HEADLINE FOR THIS MODEL AND `scripts/med-ball-detector/validate_box_size.py`
EXISTS BECAUSE OF IT.** The pipeline divides a plate's nominal diameter by the box's long edge in
pixels, so a box 2x too large reports a scale 2x too small -- and a detector posts a respectable
mAP with systematically oversized boxes, because a 0.5 IoU threshold tolerates that much slack.
That is exactly what the old model did. So the measurement is the ratio of LONG EDGES against
IoU-matched ground truth, at the pipeline's own `minDetectionConfidence` of 0.25, on the 41
held-out val images: **plate 1.01 at 80% recall (96 boxes), barbell 1.03 at 63% (30)**, dumbbell
1.00 at 43%, all classes median 1.03 over 145 matches. The two rows that carry the barbell lifts
are the two that matter, against a shipped model whose boxes were 2.09x / 2.81x / 6.73x.

**Three caveats, none optional.** `med_ball` (n=2) and `golf_ball` (n=4) medians mean nothing --
the val split was fixed before anybody knew which classes were thin. Recall is modest and that is
the acceptable half of the trade: a box the pipeline refuses is worth nothing and the old boxes
were refused on every take, so 80% of plates at the right size beats 100% at 2x (Rule #1 is
unaffected -- a take with no object still writes its numbers off the body rulers with the
caveat). And this measures `best.pt`, not the shipped `.mlpackage`: `coremltools` converts on
Linux but cannot `predict()`, which needs macOS, so the export is the same graph at fp16 and the
difference is real if small.

**NOTHING HERE SAYS THE ROW IS FIXED.** It says the row's remaining error has one candidate cause
left, that cause is measurably better on held-out data, and the take that settles it has not been
filmed. **No constant moved, no gate loosened, no ruler reweighted** -- if the new boxes are still
wrong the gates refuse them exactly as before and the row reads what it reads today. That is
correct and is why the gates were not touched in the same change. **The shipped proof is
`plateBoxToExpectedRatio` near 1.0** in the next filmed set's `trackingDiagnostics.objectGate`
(in the export since 652), beside `plateScaleIfAdmitted` against the sensor's required scale and
`candidatesSeenOfClass` for the barbell, which is the secondary witness that has never held a
lock.

**A RETRAIN REPLACES THE `.mlpackage` IN PLACE AND NEEDS NO XCODE** -- `project.pbxproj` holds it
as a path reference already in the App target's Resources phase, so `cp -r` is the whole step and
all three files inside it are tracked. It IS a native change: `verify_build`, then `beta`. The
README's old "drag into Xcode" step is corrected.

**`shared/the-shipped-detector-knows-every-class-we-ask-for.test.ts` is the ratchet, and the
failure it exists for is silent.** `targetLabel` hands Vision a class NAME; a name the model does
not carry produces no error, no log and no detection, so the diagnostics read EXACTLY as they do
for a mode that passes no `trackingMode` -- Rule #4's "indistinguishable from being off and
worse". A retrain is where a class gets renamed, dropped or reordered, because the dataset yaml
decides the list and nothing downstream complains. It scans both directions and holds no list of
its own: modes out of the Swift allow-list, classes out of the shipped model's own protobuf label
vector, every mode must be a class. It matches the **tagged** protobuf form (`0x0A <len>
<bytes>`), not a bare substring, and that is load-bearing -- each name also appears twice in the
model's metadata, so on a doctored model with `barbell` dropped from the label vector the bare
search PASSES and the tagged search fails. Four mutations caught. It also pins the class ORDER
and the 640x640 input, so a retrain that moves either has to say so.

### THE PLATE RULER CLAIMED TO BE FOUR TIMES MORE PRECISE THAN THE DETECTOR IT READS

Found 2026-10-09 while projecting what the retrained detector does to the row, which is exactly
when it matters: the retrain is what makes the plate's weight consequential.

`computeReferenceObjectScale` returns `knownRealSizeM / measuredPixelSize` and propagated the
**numerator's** error only -- the plate's casting tolerance, 6mm on 450mm, **1.3%** -- and treated
the denominator as exact. That denominator is a CoreML box's long edge, whose relative MAD is
**0.056** measured on 77 held-out plate boxes. The blend weights by 1/sigma^2, so understating the
noise fourfold overstated the plate's weight **~18x**: 225x a body ruler's where the measurement
supports 12x. **That is the mechanism behind build 653's bug, not a separate one** -- it is why a
plate 60% wrong could carry 100% against two body rulers agreeing to 3%.

`measurementUncertaintyFraction` is the missing term, in quadrature (the two are independent: how
big the disc is, how well it was boxed), **defaulting to zero** so a coach's own tape measure
still states 0 and no other caller moves. A measurement replacing a term that was ABSENT -- the
same move as the grip floor, and what the learning-loop note already argues for in words.
**A property of the DETECTOR, not a movement**, so shared across all 269; `FITTED_OVERRIDES` stays
empty. **Re-measure it on every retrain** -- `validate_box_size.py` prints it.
**Nothing in the corpus moves**: every take whose plate carried weight had it stepped out by
653/655. `the-plate-states-the-detectors-own-noise.test.ts`, mutation-tested six ways.

**AND THE TAIL IS OPEN, WITH NO GATE INVENTED FOR IT.** Projected on row set 3's own candidates,
the blend FOLLOWS the plate at every box size the guards admit -- 1.03x -> -4.3%, 1.16x -> -14.3%,
**1.25x -> -20.1%, worse than the -14.0% the body rulers give alone** -- and the step-out only
fires at ~2.4x. 6% of val plates box past 1.25x. Three reasons that is recorded rather than gated:
the band has never been seen on a real take (every plate so far was 2-7x off and correctly
refused, and a gate fitted to a projection is how the refusals this repo unshipped got written);
`plateBoxToExpectedRatio` reports it directly and has not yet been read on one; and the obvious
lever, a tighter agreement tolerance, is the width the body rulers need to cluster at all.
**What to read on the next filmed set: `plateBoxToExpectedRatio`, then `plateScaleIfAdmitted`.**
Near 1.0 and the row is solved. At 1.2-1.5 the next work is a corroboration rule that can tell a
25% disagreement from agreement -- written against a measured take, never against that table.
