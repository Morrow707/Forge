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
  signup agreement or the Terms of Service), `academy-track-builder` (Save
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

**Nine documents, all with usable text, none carrying draft language**
(`server/seed-data/documents-are-not-drafts.test.ts` enforces the last part):

| Document | Where |
|---|---|
| Terms of Service | `legal-documents-draft.ts` |
| Privacy Policy | `legal-documents-draft.ts` |
| Notice to Parent or Guardian | `legal-documents-draft.ts` |
| EULA | `legal-documents-draft.ts` |
| Terms of Use (signup) | `signup-agreement.ts` |
| Video and Biometric Consent | `biometric-release.ts` |
| Assumption of Risk | `assumption-of-risk.ts` |
| AI Terms of Use | `ai-terms-of-use-draft.ts` |
| Research consent | `shared/research-consent.ts` |

The `_DRAFT` suffixes are historical variable names, not banners. The remaining
`DRAFT --` strings in the repo are the `from` side of LIVE_DOCUMENT_PATCHES,
which strip that language out of documents an older installation stored; they
have to stay.

**The only legal work left is REVIEW**: four documents plus five questions to
counsel (`docs/legal-open-questions.md`), and two blanks Scott has to fill in
the Rocket Lawyer Service Agreement.

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
- **Payments stay off through beta.** The public Terms of Service says Forge
  does not currently charge, and that is correct TODAY. The signup Terms of Use
  describes paid plans because that is the text wanted AT LAUNCH. The two
  reading differently is deliberate, not a contradiction to tidy up. Scott,
  2026-09-17: "we are still in beta, so payments are turned off ... keep
  payments off".

## What deletion keeps, and what it does not

**Current behaviour, so nobody has to re-derive it:** `deleteOwnAccount` is a
total wipe for every role. It deletes the uploaded files, then
`db.delete(users)`, and every child row cascades. There is no `trackingOptOut`
branch and never has been -- the function has been touched three times since
`22fffc9d` created it and was a full wipe in all of them. Nothing was removed
or changed; the retention half was never wired in.

**The intent, stated more than once:** an athlete who did not opt out of data
collection can delete their account, and Forge keeps the SCRUBBED data for
later research -- "15 year old football player that does a certain weight
lifting protocol, i want to see what that looks like" (Scott, 2026-09-17).

**Where the two diverge, and it is one place.** The scrubbed store already
exists: `research_subjects` and its two child tables, read by
`queryResearchCohort`. What breaks is that mirror membership is DERIVED from
the live `users` row (`eligible()` in `server/research-mirror.ts`), so the
nightly rebuild treats a deleted athlete's subject rows as stale orphans and
reaps them. The retention is not blocked by policy; it is undone by a garbage
collector that cannot tell "withdrew" from "deleted".

**The distinction that causes the loop.** Two separate flags, and the mirror
requires BOTH:
- `trackingOptOut` -- collection for the athlete's own coaching.
- `researchDataConsent` -- opt-IN, default false, inclusion in the mirror.

So an athlete who merely never opted out of tracking is NOT in the mirror and
never was. Admin's live surfaces see them through `queryTrackedCohort`, which
reads live rows -- which is why deleting the account removes them from admin's
view entirely. "Didn't opt out" and "consented to research" are not the same
population, and any plan that says "keep the non-opted-out athletes' data"
means widening mirror membership, which is a bigger consent question than the
deletion change.

**What the deletion change takes** (not yet done): keep the subject rows and
null `users.researchSubjectId` in `deleteOwnAccount`; teach the sweep to keep
a deliberately-orphaned subject rather than reap it; and one sentence in the
research-consent text saying the scrubbed record survives account deletion,
because consent was given as an account holder, not in perpetuity.
