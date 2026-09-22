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

- Build **493** is the newest TestFlight build, cut from `8d1a4920` on 2026-09-21.
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
- **Nothing on `main` is waiting on an upload.**

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

## The strength profile: a percentile that names nobody

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
  Open: whether to SSR the six marketing pages.

**Three things parked by Scott, 2026-09-20 ("flag those 3 needs, we can do those later"):**
1. **Smart App Banner** on the website needs the App Store id. One line in
   `client/index.html`: `<meta name="apple-itunes-app" content="app-id=XXXXXXXXX">`. Nobody
   has the id in the repo; Scott supplies it.
2. **FAQ on /for-high-schools with FAQPage JSON-LD.** Highest search payoff of the SEO
   proposals. Questions come from facts in this file (FERPA does not apply; a minor's account is
   inert until a guardian claims it; where data lives; the four validated movements and the
   caveat; $4 an athlete in bands, not charging in beta; more than one coach per team; what
   deletion keeps). Scott reads the draft before it ships; `shared/structured-data.ts` has the
   place to emit the schema once the visible FAQ exists.
3. **Barlow Condensed is named in `client/src/index.css` and never loaded**, so every heading
   renders in the system font. If the brand wants it: self-host two woff2 files, `@font-face`
   with `font-display: swap`, one `preload` in `index.html`. Not a bug, a decision.

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
- **Placeholder prices**: Coaches Corner $19.99/mo, sport coaches $7.99/mo each, in the shared
  constants. Scott sets the real numbers before BILLING_LIVE. Four Stripe Prices and three
  App Store products are the launch-day work; `missingPriceEnvVars()` names the env vars.
- **The locked state for a non-comped account says "not available yet"**, never "free in beta":
  that branch is reached only by an account that is not comped.

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
(`server/seed-data/documents-are-not-drafts.test.ts` enforces the last part):

| Document | Where |
|---|---|
| Privacy Policy | `legal-documents-draft.ts` |
| Notice to Parent or Guardian | `legal-documents-draft.ts` |
| EULA | `legal-documents-draft.ts` |
| Terms of Use (signup AND /terms) | `signup-agreement.ts` |
| Video and Biometric Consent | `biometric-release.ts` |
| Assumption of Risk | `assumption-of-risk.ts` |
| AI Terms of Use | `ai-terms-of-use-draft.ts` |
| Research consent | `shared/research-consent.ts` |

The `_DRAFT` suffixes are historical variable names, not banners. The remaining
`DRAFT --` strings in the repo are the `from` side of LIVE_DOCUMENT_PATCHES,
which strip that language out of documents an older installation stored; they
have to stay.

There used to be nine. Scott merged the two Terms on 2026-09-19 ("merge them, just one less
document that gets in the way"): `TERMS_OF_SERVICE_DRAFT` is retired, six of its clauses were
carried into `SIGNUP_AGREEMENT` in its own words, and /terms now serves the document people
actually accept. Do not add a public Terms of Service back.

**Every document is attorney-reviewed as of 2026-09-20.** Nothing needs writing and
nothing is waiting on a lawyer. The Video and Biometric Consent (built with counsel,
2026-09-17), the Assumption of Risk (counsel's opinion 2026-09-19, question 8), the AI
Terms of Use (lawyer-modified from the Rocket Lawyer draft), the research consent
(counsel's rewrite, live verbatim 2026-09-19, question 9; one word changed to "age" with
counsel's approval 2026-09-20, version 2026-09-20) and the signup Terms of Use (counsel's
rewrite with their five answers folded in, live 2026-09-19, question 10) were reviewed
2026-09-19; the Privacy Policy, the EULA, the Notice to Parent or Guardian and the
Institutional Service Agreement were confirmed reviewed by Scott on 2026-09-20 ("yes the
others are attorney reviewed"). What remains in `docs/legal-open-questions.md` (1 to 6)
are wording and enforceability questions, not unreviewed text. Changing any of these is
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
- **Payments stay off through beta, but the paperwork already describes them.**
  Scott, 2026-09-17: "we are still in beta, so payments are turned off ... keep
  payments off". Scott, 2026-09-19: "when it goes live I don't want to have to
  change paperwork when we launch" -- so the Terms of Use s11 now
  describes the paid plans (Apple in-app, Stripe on the web) even though
  BILLING_LIVE is off and nobody is charged. The pricing page still says Forge
  is not charging yet, which is the truthful statement of TODAY; the Terms
  state the launch position. Do not "fix" either to match the other.

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
