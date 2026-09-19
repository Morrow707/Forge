# Camera system: a briefing for a session that has not seen any of this

Written 2026-09-19 for a fresh session picking up the camera work. It assumes no
prior context and no memory of what has already been tried. Everything here is
either checkable in the repo or marked as a field observation with its date.

**Read `docs/camera-tracking-notes.md` after this.** That file is the engineering
record and is longer and more detailed; this one is the map, the current problem
list, and -- most usefully -- the list of things that look like fixes and are not.
Where the two disagree, that file is right and this one is stale.

---

## 1. What the system is

Three parts, and the split is load-bearing. Anything added has to be one of them.

| Part | What it is | What it knows |
|---|---|---|
| **Body tracker** | Apple `VNDetectHumanBodyPoseRequest` | Where the athlete's joints are. Nothing about equipment. |
| **Object tracker** | `AvCoreMlImplementDetector` (CoreML) | Where the equipment is. Nothing about the athlete. |
| **Overwatch / arbiter** | `shared/tracker-arbiter.ts`, ported to `AvTrackerArbiter` in Swift | Whether to believe either of them. **Owns no sensor of its own, on purpose.** |

Native analysis lives in `ios/App/App/AvBodyTrackingPlugin.swift` (~3,600 lines).
The TypeScript side is `client/src/lib/pose-tracking.ts` (~3,000) and
`client/src/lib/bar-tracking.ts` (~2,700). Fifteen tracker dialogs in
`client/src/components/*tracker-dialog.tsx` drive capture.

Nine tracking modes: `bar_path`, `full`, `jump`, `sprint`, `mechanics`,
`kb_swing`, `horizontal_load`, plus two rotation modes. Olympic lifts
deliberately have no mode -- see §6.

### How overwatch actually works

`arbitrate()` returns one of four verdicts: `agree`, `object_suspect`,
`body_suspect`, `cannot_judge`.

- **It judges in BOTH directions.** The first version only judged the object
  against the body. That is a hierarchy, not cohesion, and it introduced a bug:
  a single jumped wrist landmark could break a perfectly good object lock.
- **The response is asymmetric and must stay that way.** A suspect *object*
  loses its lock (a better answer exists -- re-detect). A suspect *body* gets an
  abstention: skip the frame, leave the lock alone, report nothing. There is no
  better body available.
- **The body is checked FIRST**, before the object gate and before any fresh
  detection. Every statement overwatch makes about the object is measured with
  the body's ruler, so a ruler that just changed length cannot convict anyone.
- **The threshold is in the athlete's own grip widths.** Not pixels, not frame
  fractions. Grip width is measured every frame, needs no calibration, and
  scales with camera distance and zoom exactly as the scene does -- so
  "2.5 grip widths" means the same physical thing at three feet or thirty.
  Every earlier attempt used a frame fraction and needed per-setup tuning it
  never got.
- **A frame overwatch cannot judge PASSES.** No body reading is not evidence the
  object is wrong. It fires only on a positive finding.
- **Each part is judged by a signal the other cannot influence.** The object is
  judged by grip width (the object tracker has no hand in producing it). The
  body is judged by the constancy of its own span. Neither borrows the other's
  sensor.

`shared/tracker-arbiter.test.ts` reads the Swift source and fails when the two
copies of the constants diverge, when the body check stops preceding the object
gate, or when a rejected span could reach the history. **The Swift is a port.
Change one, change both.**

---

## 2. Calibration: what it is and where it breaks

Scale is metres per pixel. Everything in metres, metres per second or watts
depends on getting it right; everything that is a duration or a ratio does not.

**Two sources of scale, in order of preference:**

1. **The athlete's own height**, via `calibrateFromFrames` in `pose-tracking.ts`
   -- nose-to-ankle, or a shoulder-to-hip fallback.
2. **A reference object** in frame -- a plate, whose real diameter is known.

### Known break #1: supine lifts cannot calibrate from height

An athlete lying flat with their feet out of frame cannot produce a nose-to-ankle
measurement. **Bench is therefore the movement where a wrong number is most
likely to be a calibration failure rather than a tracking failure, and the two
look identical from outside.**

A previous attempt switched horizontal press/row to a plate-based scale instead.
Field data the same night showed that made the fused signal noisy enough to
invent readings, and it was reverted. See `av-bar-tracker-dialog.tsx`'s own
comment before proposing it again.

### Known break #2: the plate is not always the plate

A barbell lift tracks the **plate** (`COREML_TRACKING_MODE_BY_EQUIPMENT` maps
`Barbell` -> `plate`). A plate further from the camera measures fewer pixels
across; fewer pixels for the same 0.45m disc means a larger scale, means every
distance in the take inflated.

This is the mechanism that turned **eleven bench reps into eighteen**. The
re-classification pass, written to *recover* from drift, was itself capable of
causing it every thirty frames -- a lock that slid onto a rack plate behind the
lifter passed every check the object tracker had, because it jumps nowhere,
flies nowhere, and genuinely *is* a plate.

`PLATE_TO_GRIP_RATIO_LOW/HIGH` was tightened from `0.25`-`2.5` to `0.45`-`2.0`,
derived rather than guessed (the ratio is depth-independent when both objects
are on the same bar). **Do not widen it back without telemetry.** Widening is
what made the check decorative the first time.

### Known break #3 (the big one): rep segmentation was wrong, and the scale took the blame

The relative gate is 40% of "a typical reversal", and the typical reversal was
the **median of every reversal** an exploratory pass found. That is only the size
of a rep if reps are the majority of what the pass returns, and they are nowhere
near it. A ten-rep bench trace with a sticking point came back as five separate
amplitude populations -- pose noise, the dip, the remainder of the press once
the dip split it, and two clusters of real reps -- and **the reps were the
smallest of the five by count.** The median landed a third of the way up a real
rep, the gate came out below the dip, and the dip became a rep boundary.

**A paired session against a bar-mounted sensor (OVR) found: ten presses
reported as fifteen, per-rep peaks spanning 0.24-1.96 m/s against the sensor's
0.91-1.10 -- while the set MEAN stayed within 3.5%,** because splitting a rep
produces a fast half and a slow half that average out.

**The scale was never the problem, and several builds were spent looking at it.**
If you are debugging bad numbers, check segmentation before scale.

### The rule about calibration poses

**Do not propose one.** Taking a standing reference at the start of a supine set
would give real centimetres on bench with code that already exists, and it was
considered and rejected 2026-09-05. The athlete taps start and gets to their
lift. Nothing may be added to the capture flow that asks them to pose, stand
somewhere specific, or hold still first. Scale comes from the footage or not at
all.

### What survives having no scale

Rep count, per-rep duration, velocity loss %, time-to-peak, and drift as a share
of its own travel are all times or ratios -- metres cancel. Those are returned.
Only metres, m/s and watts are withheld.

**The trace must be normalised to a nominal size before segmentation.** The
acceleration and velocity filters are stated in metres; handed a trace in
arbitrary units, one whose numbers happen to be large reads as a single
continuous physically-impossible event, every frame is rejected, and the peak
collapses to the ceiling. The same five reps segmented as four at one scale and
eight at another until an invariance test caught it.

**Known inconsistency, unresolved:** the calibrated and scale-free paths segment
reps differently (an absolute centimetre floor vs. a relative gate). Same rep
count, slightly different boundaries, so velocity-loss differs by ~16% relative
on a synthetic five-rep squat. The tolerance in the test is not calibrated.

---

## 3. Video saving and diagnostics upload

This is the area Scott reports as actively broken, and it has **three
independent failure surfaces** that produce similar-looking symptoms.

### Surface A: the capture -> set save

Dialogs call `onCapture(metrics, videoUrl?, setNumber?, skeletonFrames?)`.
The workout page folds that into the day's payload and POSTs `/api/athlete/log`.

**The invariant:** *every exit from a save path hands the metrics up.* Sixteen
dialogs once had a `catch` that toasted and stopped -- no `onCapture`, no close
-- so a failed video upload took the diagnostics with it and left a set
indistinguishable from one where record was never pressed. Six more did the same
under a comment reading "genuinely nothing left to salvage", which was backwards:
**the failure IS the thing to salvage.**

`client/src/lib/refused-capture-survives.test.ts` enforces this by scanning the
directory -- if a `try` calls `onCapture`, its `catch` must too. The one escape
is writing `diagnostics-exempt: <why>` in the catch.

### Surface B: the zod schema silently stripping fields

**A field the client sends must be declared in `trackingDiagnosticsSchema`
(`shared/schema.ts`).** A zod object strips what it does not declare, silently,
with no error anywhere.

**This has happened twice.** Once it cost three takes filmed specifically to read
the scale-source diagnostics. The second time, `scaleFree` was undeclared, so a
bench press that had found 31 reps was reported as "Logged 10 reps but tracking
only found 0" -- the exact wrong conclusion, on a set where the athlete was
simultaneously being told the app got 31.

`shared/tracking-diagnostics-roundtrip.test.ts` derives the field list from the
client type rather than restating it.

### Surface C: the admin tracking report dropping rows

**This is where I did my own work, and I found three separate silent drops in
one query (`getRecentTrackedSetsForAdmin` in `server/storage.ts`).** All three
are fixed on `main`; I am listing them because the *pattern* will recur.

1. **`programExercises.trackingLevel != 'none'`** was part of the membership
   test. That column is live and editable, and turning tracking off on an
   exercise is exactly what somebody does after a few takes come back unusable
   -- so that one click removed every past capture on it from the report. The
   takes worth reading about were the takes it hid.
2. **Membership was four columns** -- diagnostics, peak velocity, bar path
   deviation, jump height. Those describe bar-path and jump captures and nothing
   else. **Kettlebell swing, med ball, the golf/baseball swing, sprint and sled
   push write none of the four, so five capture modes never appeared on that
   page at all** -- and an absent row looks exactly like a mode nobody filmed.
3. **`exercises` was INNER-joined on a nullable `exerciseId`.** That does not
   produce a row with a missing name; it produces no row, for a capture that
   really happened.

Membership is now every camera-derived column from `CAMERA_DERIVED_SET_COLUMNS`
in `shared/schema.ts`, and `shared/camera-columns-are-classified.test.ts` fails
on any table column classified as neither camera nor not-camera -- so a new
capture mode cannot silently skip the report.

**`server/capture-diagnostics-round-trip.itest.ts`** submits a refused take
through the real parse and reads it back off the report.

### THE CRITICAL THING ABOUT SURFACE C

**The tracking report is server-side.** It is served from `storage.ts` through
`/api/admin/tracking-report/entries`, so a fix to it ships on a **Render
deploy**, not in a TestFlight build. Somebody testing report changes by
installing a build will see nothing change, conclude the fix failed, and go
looking in the wrong place.

### What I could NOT explain, and it is still open

On 2026-09-18 Scott filmed a bench set. The capture worked, the metrics rendered
on the set (0.92 m/s avg, 4.3in bar drift, 12 reps on a set prescribed at 10) --
**and the tracking report's newest entry was still 2026-09-14.**

That set writes `peakVelocityMps` and `barPathDeviationCm`, so it satisfied even
the OLD four-column membership test. **None of the three drops above explain it.**
Wednesday's session is missing too, so whatever this is affects a run of sets
starting on or before the 16th, not one set.

**The next diagnostic step, which was never taken:** the in-app debug console
(bug icon, bottom-left of the workout screen) logs every save outcome --
`logDebug("SAVE", ...)` fires on the POST succeeding, on it failing with the
status, on the classification, and on a queue. **Those lines separate "saved but
hidden" from "never saved", which are completely different bugs.** Get them
before theorising further.

### A related, already-fixed bug worth knowing

`fetch()` rejects with a bare TypeError for a transport failure. That was once
wrapped in an `ApiError` with status 0 -- and the autosave classifies with
`err instanceof ApiError && err.status !== 401 && err.status < 500`. Status 0
satisfies both halves, so **a save that failed because the phone briefly lost
signal was filed as a payload the server would keep refusing: thrown instead of
queued, never retried, and the offline rescue that exists for exactly that case
could not run.** The set was simply gone.

Fixed structurally -- `NetworkError extends Error`, so every `instanceof
ApiError` branch behaves as it did before the wrapper existed. Guarded by
`client/src/lib/transport-failure-is-retryable.test.ts`, which both scans the
source and stubs `fetch` into rejecting.

---

## 4. What has actually been validated

**Four movements, against real lifts:**
back squat (bar path, filmed from behind), Pendlay row, bench press (from
behind), box jump (jump mode).

**Everything else is unvalidated:** sprint, mechanics, med ball, kettlebell
swing, sled push, both rotation modes.

**Every trust-score threshold in the system is uncalibrated.** Trust scores are
structurally sound and numerically untuned -- treat a score as a relative signal
only.

Planned validation order: deadlift, then med ball throws, then Olympic lifts.

Current product state: **camera metrics are disclosed as inaccurate throughout
the app** (`shared/camera-accuracy-copy.ts`), and the $19.99 AI Coach + Video
tier was **withdrawn from sale** over it (commit `17b86426`).

---

## 5. Where to get evidence

- **`client/src/lib/capture-replay.ts` + `scripts/replay-captures.mjs`** -- replays
  stored bar-path traces and diffs against a previous run, so a threshold change
  that fixes one set and breaks four is visible. **No device, no camera, no
  database needed** -- feed it a JSON array of stored set rows. This is the
  single most useful tool in the repo for this work.
  It is deliberately **not** a replay of the tracking stage: turning frames into
  a trace needs Vision and CoreML, which do not run outside the app.
- **`AvObjectLockTelemetry` -> `TrackingDiagnostics.objectLock` -> the admin
  tracking report.** Read two numbers first: **re-classify corrections** above
  zero means the detector changed its mind mid-clip, so any scale derived from
  it was measured off more than one thing. **Wrist-gate breaks** is the body
  tracker catching the object tracker somewhere the athlete was not.
  `framesBodySuspect` distinguishes a body-tracking problem from an
  object-tracking one.
- **The in-app debug console** (bug icon) -- the only instrument on an iPhone.
- **`npm test`** (no database) and **`npm run test:integration`** (needs
  Postgres; see CLAUDE.md for the local setup).

---

## 6. Traps: things that look like fixes and are not

Every one of these has been tried or proposed.

1. **Do not add a calibration pose.** Rejected 2026-09-05. See §2.
2. **Do not switch bench to a plate-based scale.** Tried; made the fused signal
   noisy enough to invent readings; reverted.
3. **Do not widen `PLATE_TO_GRIP_RATIO`.** Widening is what made the check
   decorative the first time.
4. **Do not enable bar-path tracking for Olympic lifts.** `barPathDeviationCm`
   measures departure from a straight vertical line and peak velocity uses the
   vertical component only. A correct clean has a deliberate S-curve, so a
   technically perfect lift reports **large** deviation, a lift with no curve at
   all reports **clean**, and peak velocity understates the bar at exactly the
   moment that matters. These are **inverted there, not imprecise.** Olympic
   lifts need their own path model -- the same treatment `kb_swing` (an arc) and
   `horizontal_load` (straight-line horizontal) already got.
5. **Do not file "add cross-tracker fusion" against jump, sprint, mechanics or
   horizontal_load.** There is no implement in the scene. There is no second
   tracker to fuse with. Internal corroboration is the ceiling and it has been
   reached.
6. **Do not make overwatch blame one tracker.** Anything that only ever convicts
   the object is the original bug wearing a new name.
7. **Do not make an unjudgeable frame fail.** It passes. Inverting this
   reproduces the over-eagerness the arbiter exists to cure.
8. **Do not "simplify" the tracking report's membership test.** Three silent
   drops have been found in that one query. Treat any narrowing as guilty until
   tested.
9. **Do not add a field to the client diagnostics type without declaring it in
   `trackingDiagnosticsSchema`.** It will be stripped silently. Twice now.
10. **Do not test tracking-report changes by installing a TestFlight build.**
    Server-side. Render deploy.

---

## 7. Open questions nobody has answered

1. **Why did the 2026-09-18 bench set not reach the tracking report?** (§3.)
   Start with the debug console SAVE lines.
2. **Is `main` deployed on Render?** The three membership fixes only exist for a
   user once it is. This was never confirmed.
3. **The calibrated vs scale-free velocity-loss discrepancy** (~16% relative)
   has an uncalibrated tolerance in its test.
4. **Every trust-score threshold** is an admitted guess with no real footage
   behind it.
5. **Bar-path overlay on video** is not built. The trace is stored per set and
   drawn only as an abstract scatter plot; the skeleton-replay overlay it would
   sit alongside does exist. The pieces exist and are not connected.

---

## 8. One process note

Several sessions work this repo in parallel. **Split by FILE OWNERSHIP, never by
task.** `server/storage.ts` and `shared/schema.ts` take one owner and cannot be
shared. The natural disjoint camera slice is
`client/src/lib/*-tracking.ts`, the tracker dialogs, and `ios/`.

Also: this environment's git checkout has repeatedly reverted `main` to a stale
commit between tool calls. Run `git fetch origin main && git merge --ff-only
origin/main` at the **start** of any work, before reading files for research --
an audit was once run against a checkout 112 commits behind, producing a real
false report.
