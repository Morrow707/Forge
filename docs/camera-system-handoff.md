# Camera system: a deep briefing for a session with no prior context

Written 2026-09-19. Assumes no memory of what has been tried. Everything is
either checkable in the tree at the cited path or marked as a dated field
observation.

**Companion reading, in this order:** this file, then
`docs/camera-tracking-notes.md` (870 lines, the engineering record), then the
four camera sections of `CLAUDE.md`. Where any of them disagree with the code,
the code is right; where the notes disagree with this file, the notes are right.

---

## PART 0 — The file map

| Concern | Path | Size |
|---|---|---|
| Native analysis (Vision + CoreML + arbiter port) | `ios/App/App/AvBodyTrackingPlugin.swift` | ~3,600 |
| Pose, calibration, scale | `client/src/lib/pose-tracking.ts` | ~3,000 |
| Trace → reps → metrics | `client/src/lib/bar-tracking.ts` | ~2,700 |
| The referee | `shared/tracker-arbiter.ts` | 479 |
| Diagnostics assembly | `client/src/lib/tracking-diagnostics.ts` | 459 |
| Native bridge | `client/src/lib/use-av-body-tracking.ts` | 434 |
| Per-mode trackers | `client/src/lib/{jump,sprint,mechanics,implement,kb-swing,rotation}-tracking.ts` | 230–570 each |
| Capture UI | `client/src/components/*tracker-dialog.tsx` | 15 files |
| Video queue / reattach | `client/src/lib/video-offline-store.ts` | ~430 |
| Set persistence | `server/storage.ts` → `submitWorkoutLog`, `attachVideoToLoggedSet` | — |
| Admin report | `server/storage.ts` → `getRecentTrackedSetsForAdmin` | — |
| Offline replay harness | `client/src/lib/capture-replay.ts`, `scripts/replay-captures.mjs` | — |

---

## PART 1 — The three parts

### 1.1 The contract

| Part | Implementation | Knows | Does NOT know |
|---|---|---|---|
| Body tracker | `VNDetectHumanBodyPoseRequest` | Joint positions, grip span, posture | What equipment is |
| Object tracker | `AvCoreMlImplementDetector` | Where the equipment is | Where the athlete is |
| Overwatch | `shared/tracker-arbiter.ts` → `AvTrackerArbiter` (Swift, line ~2346) | Whether to believe either | Owns **no sensor at all**, deliberately |

**Before adding anything, say which of the three it is.** A change that fits none
is a fourth part. A fourth part is how this broke the first time: the object
tracker grew three guards of its own — an implausible-jump check, a physics
trajectory fit, a periodic re-classification — each individually reasonable, and
**none of which could see the athlete**. A lock that has slid onto a plate on the
rack behind the lifter passes all three, correctly, about the wrong object. It
jumps nowhere, flies nowhere, and it genuinely *is* a plate.

### 1.2 `arbitrate()` — the actual algorithm

`shared/tracker-arbiter.ts:441`. Four outcomes:

```
agree          → both look right, they agree about where the equipment is
object_suspect → body steady, object is where the athlete is not.  BREAK THE LOCK
body_suspect   → the body's own ruler changed length.  Judge nothing this frame
cannot_judge   → no anchor available.  Leave the lock alone
```

Returns `{ outcome, breakLock, distanceInYardsticks, bodyDeviationRatio }`.
`breakLock` is **true only for `object_suspect`**.

The order inside the function is the design:

1. If there is a yardstick, run `bodyReadIsStable()` **first**. Unstable →
   return `body_suspect` immediately, `breakLock: false`.
2. Only then `lockDistanceVerdict()`. `basis === "no_anchor"` → `cannot_judge`.
3. Otherwise `agree` or `object_suspect` on the distance.

**Why body-first:** every statement overwatch can make about the object is
measured with the body's ruler. A ruler that just changed length cannot convict
anyone. Checking the object first would mean a jumped wrist landmark had already
thrown away a good lock by the time the jump was noticed.

### 1.3 The constants, and where each number came from

| Constant | Value | Derivation |
|---|---|---|
| `MAX_LOCK_DISTANCE_IN_YARDSTICKS` | `2.5` | A loaded plate's centre sits ~1.2 grip widths from the wrist midpoint (hands ~0.55m apart on a bench grip, inner plate ~0.65m out). 2.5 is a little over double — margin for a gate that must never drop a good lock. A plate on a rack 2m behind a lifter is 3.6 yardsticks and fails. |
| `FALLBACK_LOCK_DISTANCE_FRAME_FRACTION` | `0.45` | Used when the body gave no yardstick. Deliberately loose — with no body measurement there is no way to convert screen distance to real distance, so this only degrades to "not in this half of the room". |
| `MIN_YARDSTICK_PX` | `24` | Below this, a wrist pair is usually two low-confidence joints that landed near each other. Dividing by it turns a modest screen distance into an enormous yardstick count and rejects every lock in the take. |
| `MAX_PLATE_ASPECT_RATIO` | `2.5` | A plate is a disc; face-on it boxes square. 2.5 ≈ 66° off square. What it really excludes is a box that is not a disc — **the read that prompted all of this boxed at 3.12, which is a rack upright.** |
| `MAX_YARDSTICK_DEVIATION_RATIO` | `2.0` | This frame's span over the recent typical, always ≥1 so one threshold covers a jump either way. |
| `MIN_YARDSTICK_SAMPLES_FOR_STABILITY` | `5` | Below this the arbiter says "stable" rather than electing the first reading it saw as truth — the same mistake the rep gate made (§3.3). |
| `PLATE_TO_GRIP_RATIO_LOW/HIGH` | `0.45`–`2.0` | Was `0.25`–`2.5`. Tightened because the ratio is **depth-independent when both objects are on the same bar**, so the honest window is much narrower than a factor of ten. |

`bodyReadIsStable()` uses a **median** over the recent window, not a mean —
the failure being looked for is a single wild value, and a mean walks toward the
very thing it is meant to notice.

### 1.4 The invariant that is NOT enforced inside the arbiter

**`arbitrate()` receives `recentYardstickPx` from its caller. It does not
maintain that history.** The rule "a rejected body reading never joins the
history it was judged against" is enforced at the **call site**, in Swift, at
`AvBodyTrackingPlugin.swift:2928`:

```swift
if stability.stable {
    recentYardstickPx.append(yardstick.px)
    if recentYardstickPx.count > yardstickHistoryWindow { recentYardstickPx.removeFirst() }
} else {
    bodySuspectThisFrame = true
    telemetry.framesBodySuspect += 1
}
if bodySuspectThisFrame { return nil }
```

Window is **8 frames** (`yardstickHistoryWindow`). If a rejected span were
allowed in, a run of bad landmark frames would teach the stability check to
accept them and **the guard dissolves exactly when it is needed most.**

Note also: `return nil` skips the **fresh-detection path** as well as the gate. A
jumped wrist drags `regionOfInterest` with it, so a detection seeded on that
frame searches the wrong part of the image.

### 1.5 The Swift port

Overwatch must act mid-clip and **there is no Swift test target**, so the
constants exist twice. `shared/tracker-arbiter.test.ts` reads the Swift source
and fails when: the constants diverge, the body check stops preceding the object
gate, or a rejected span could reach the history. **Change one, change both.**

### 1.6 The four modes with no second tracker

`jump`, `sprint`, `mechanics`, `horizontal_load` have **no implement in the
scene**. There is nothing for overwatch to hold the body against. Internal
corroboration is the ceiling and it has been reached — jump compares flight-time
height against peak-ankle-travel height (two estimates that existed separately
and were never compared); the checkpoint-timed modes derive a precision bound
from the frame gap straddling each crossing.

**Do not file "add cross-tracker fusion" against these four.**

---

## PART 2 — Calibration

Scale is metres per pixel. Metres, m/s and watts depend on it. Durations and
ratios do not.

### 2.1 Source A: the athlete's height

`calibrateFromFrames(frames, heightIn)` — `pose-tracking.ts:1644`.

Walks every tracked frame, tracks vertical sign per frame (falling back to the
last known-good sign rather than guessing), computes `computePixelToMeterScale`
per frame, and needs `MIN_CALIBRATION_SAMPLES = 5`.

**It does NOT take the median, and the reason is the most subtle thing in the
calibration path.**

```ts
const sorted = [...samples].sort((a, b) => a - b);
const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.1));
return sorted[idx];          // tenth percentile
```

The error is **one-sided**. A frame can only ever measure the athlete *shorter*
than they are — a squat at depth, the dip before a jump, a hinge — never taller.
Scale is height ÷ span, so every compressed frame produces a scale too **large**,
and the median of a set of one-sided errors sits *inside* the error rather than
at the truth.

It bites hardest on the movements that compress most. At the bottom of a back
squat, nose-to-ankle runs ~⅔ of standing height, and both upstream guards pass
it: the body is still vertical, and the height-to-shoulder ratio is still ~2.8
against a 2.5 floor. A whole set of those frames drags the median off, and every
distance, velocity and power number downstream carries the same factor.

The tenth percentile is the smallest few scales = the largest few spans = the
athlete at their most extended. **Not the minimum** — one bad landmark can
stretch a span and a pure minimum would take that outlier every time.

### 2.2 Supine detection is by NAME, not geometry

`SUPINE_MOVEMENT_PATTERNS` / `isKnownSupineMovement()` — `pose-tracking.ts:1629`.

Regexes for bench press, floor press, chest fly, skull crusher, `lying|supine`,
hip thrust, glute bridge.

**Two attempts to infer "is this athlete lying down" from the landmarks were
defeated by real footage, and a third was modelled and defeated before
shipping.** The exercise name is not ambiguous: a bench press is supine from
every camera angle, on every rep, for every athlete. Reading it off the name is
something no camera position can fool.

Deliberately narrow, defaulting to false — an unrecognised exercise keeps
today's behaviour. Deliberately **not** routed through `expectedPatternFromName`,
which groups presses with rows: a Pendlay row is performed standing and its
height calibration is fine.

### 2.3 Source B: a reference object

`referenceObjectVerdict()` — `tracker-arbiter.ts:300`. Decides once per take
whether a reference-object scale read may set the scale at all. Gates on
`MAX_PLATE_ASPECT_RATIO` and median position relative to the hands.

**A barbell lift tracks the PLATE** (`COREML_TRACKING_MODE_BY_EQUIPMENT` maps
`Barbell` → `plate`). Which is the whole mechanism of the worst scale bug: a
plate further from the camera measures fewer pixels across; scale is metres per
pixel; fewer pixels for the same 0.45m disc means a **larger** scale, means every
distance inflated, means settling wobble clearing the rep-amplitude gate. **The
re-classification pass, written to recover from drift, was itself capable of
causing it every thirty frames.**

### 2.4 Bench is the weak point, and the fix that was tried and reverted

Height calibration needs the full body in frame. An athlete lying flat with feet
out of frame cannot produce nose-to-ankle. **On bench, a wrong number is more
likely to be a calibration failure than a tracking failure, and the two look
identical from outside.**

A previous attempt switched horizontal press/row to a plate-based scale. **Field
data the same night showed it made the fused signal noisy enough to invent
readings, and it was reverted.** See `av-bar-tracker-dialog.tsx`'s own comment
before proposing it again.

### 2.5 The rule about calibration poses

**Do not propose one.** Rejected 2026-09-05. The athlete taps start and gets to
their lift. Nothing may be added to the capture flow that asks them to pose,
stand somewhere specific, or hold still first. Scale comes from the footage —
a plate, the bar, grip width — or not at all.

---

## PART 3 — Segmentation, and why it was blamed on scale

### 3.1 What survives with no scale

Rep count, per-rep duration, velocity loss %, time-to-peak, drift as a share of
its own travel. All times or ratios; metres cancel. **Deliberately no velocity
field of any kind** in the scale-free output — a number in trace-units-per-second
would look like a speed, sort like a speed, and get compared against last week's
speed by an athlete with no way to know the units changed.

### 3.2 The trace must be normalised first

`NOMINAL_SCALE_FREE_ROM_M` — `bar-tracking.ts:2279`.

The acceleration and velocity filters are stated in metres
(`MAX_PLAUSIBLE_ACCEL_G = 6`, `MAX_PLAUSIBLE_LIFT_VELOCITY_MPS = 3`). Handed a
trace in arbitrary units they do not merely stop helping: **one whose numbers
happen to be large reads as a single continuous physically-impossible event, so
every frame is rejected and the peak collapses to the ceiling.** The same five
reps segmented as four at one scale and eight at another until an invariance test
caught it. Normalising is safe because everything reported is a duration or a
ratio.

### 3.3 The defect that cost several builds

`segmentPhasesRelative()` — `bar-tracking.ts:2219`. Two passes: a permissive
exploratory pass at `span * 0.02` enumerates every reversal; the median of those
amplitudes becomes the take's sense of "a normal movement"; the second pass gates
at `RELATIVE_REP_AMPLITUDE_FRACTION = 0.4` of it.

**The median used to be taken over EVERY reversal.** That is only the size of a
rep if reps are the majority of what the exploratory pass returns, and they are
nowhere near it. A ten-rep bench trace with a sticking point came back as **five
separate amplitude populations** — pose noise, the dip itself, the remainder of
the press once the dip had split it, and two clusters of real reps — and **the
reps were the smallest of the five by count.** The median landed a third of the
way up a real rep, the gate came out below the dip, and the dip became a rep
boundary.

**Field evidence (OVR paired session, 2026-09-04):** ten presses reported as
fifteen. Per-rep peaks spanning **0.24–1.96 m/s** against the sensor's
**0.91–1.10**. The set **mean** stayed within **3.5%**, because splitting a rep
produces a fast half and a slow half that average out.

**The scale was never the problem, and several builds were spent looking at it.**
When debugging bad numbers, check segmentation before scale.

### 3.4 The two fixes, both load-bearing

**(a) The median is taken over large reversals only**, via a cascade:

```ts
const LARGE_REVERSAL_FRACTIONS_OF_MAX = [0.5, 0.35, 0.25];
```

Strictest cut first, dropping only when the cut left fewer than
`MIN_REVERSALS_FOR_RELATIVE_GATE = 3` values. A single cut does not work in both
directions: too low and the dip's fragments stay in the population and drag the
gate onto themselves; too high and one wild pose frame is the only thing clearing
the bar. Against a spike four times the lift height, 0.5 and 0.35 each select
only the spike; 0.25 admits the presses.

A set whose last reps shorten under fatigue must NOT be excluded, and is not: a
short rep dropping out only moves the estimate, and the gate is 40% of it.

**(b) The calibrated path passes a real-world floor**,
`MIN_REP_AMPLITUDE_FLOOR_CM = 8` (base `BASE_MIN_REP_AMPLITUDE_CM = 20`, scaled
by height between `MIN_HEIGHT_SCALE = 0.75` and `MAX_HEIGHT_SCALE = 1.25` off
`REFERENCE_HEIGHT_IN = 69`).

**This is the only thing that can tell a take of small reps from a take of no
reps.** A purely relative gate cannot: with nothing but noise, the noise IS the
large population, elects itself typical, and **400 frames of wobble segment into
166 reps.** The scale-free path still has no floor and still cannot answer that
question — correctly, since pixel space has no centimetres, but **anything
consuming the scale-free path must reject an empty take some other way.**

### 3.5 Known unresolved inconsistency

The calibrated and scale-free paths segment reps differently (absolute floor vs.
relative gate). Same rep count, different boundaries, so the per-rep means the
velocity-loss ratio is built from differ — **~1.7 points on a figure near 10,
roughly 16% relative**, on a synthetic five-rep squat. The tolerance in the test
is not calibrated and should be replaced with a measured bound once real captures
have been through the replay harness.

---

## PART 4 — Video and diagnostics: the full state machine

This is the area Scott reports as actively broken. **There are five independent
failure surfaces** and they produce similar-looking symptoms.

### 4.1 The happy path

```
tracker dialog
  → analysis result + TrackingDiagnostics (buildTrackingDiagnostics)
  → uploadOrQueueVideo(blob, filename, context)
  → onCapture(metrics, videoUrl?, setNumber?, skeletonFrames?)
  → workout.tsx folds into the day payload
  → POST /api/athlete/log
  → submitWorkoutLogSchema.parse  ← STRIPS UNDECLARED FIELDS
  → storage.submitWorkoutLog → workout_set_entries insert
  → getRecentTrackedSetsForAdmin → admin tracking report
```

### 4.2 Surface A — the dialog catch

**Invariant: every exit from a save path hands the metrics up.**

Sixteen dialogs once had a `catch` that toasted and stopped — no `onCapture`, no
close — so a failed *video upload* took the *diagnostics* with it and left a set
indistinguishable from one where record was never pressed. Six more did the same
under a comment reading "genuinely nothing left to salvage", which was backwards:
**the failure IS the thing to salvage.**

`client/src/lib/refused-capture-survives.test.ts` scans `*tracker-dialog.tsx` —
if a `try` calls `onCapture`, its `catch` must too. Escape hatch:
`diagnostics-exempt: <why>` in the catch.

In `av-bar-tracker-dialog.tsx` the two paths are `saveEmptyAndWarn` (~line 630)
and `finishWithRecording` (~line 745), and **both** call `onCapture` in their
catch.

### 4.3 Surface B — zod stripping

**A field the client sends must be declared in `trackingDiagnosticsSchema`
(`shared/schema.ts`).** A zod object strips what it does not declare, silently,
with no error anywhere.

**This has happened twice.** Once it cost three takes filmed specifically to read
the scale-source diagnostics. The second time `scaleFree` was undeclared, so **a
bench press that had found 31 reps was reported as "Logged 10 reps but tracking
only found 0"** — the exact wrong conclusion, on a set where the athlete was
simultaneously being told the app got 31.

`shared/tracking-diagnostics-roundtrip.test.ts` derives the field list from the
client type rather than restating it.

### 4.4 Surface C — the wifi gate and the queue

`uploadOrQueueVideo()` — `video-offline-store.ts:300`:

```ts
if (!(await isOnWifi())) {            // NOT on wifi → never even tries
  await persistVideoForUpload(...);
  return { status: "queued" };
}
try { ... return { status: "uploaded", url }; }
catch (err) {
  if (err instanceof ApiError) throw err;   // ← RETHROWS
  await persistVideoForUpload(...);
  return { status: "queued" };
}
```

Two things a new session should look hard at:

1. **A set filmed on cellular ALWAYS queues.** `onCapture` gets
   `videoUrl: undefined`, the set saves with no clip, and the video attaches
   later — or does not (§4.5).
2. **`ApiError` is rethrown rather than queued.** `uploadWithProgress` rejects
   with `ApiError` for *every* non-2xx — including **500, 502, 503, 429**. So a
   server cold start or a deploy mid-upload propagates to the dialog's catch
   instead of queueing. Compare `runVideoFlush()` a few lines below, which
   explicitly classifies and treats a 5xx as retryable, with a comment saying
   the opposite behaviour "erased every clip filmed that session, from disk,
   unrecoverably". **The two functions in the same file classify the same error
   differently. That asymmetry is worth a hard look and is my leading suspect
   for "videos not saving".**

### 4.5 Surface D — reattachment, with five silent failure conditions

A queued clip uploads later via `flushPendingVideos()` (guarded by
`videoFlushInFlight` — a wifi reconnect trips two triggers within milliseconds
and used to upload the same video twice against a paid storage cap). Then:

```ts
attached = await attachVideoToSet(entry.reattach, url);
if (!attached) recordUnattachedUpload({ url, label, uploadedAt });
```

The clip is addressed by a **(assignmentId, programDayId, date,
programExerciseId, setNumber) tuple, not a row id** — because the row may not
exist yet when the clip is queued.

`storage.attachVideoToLoggedSet()` (`server/storage.ts:20887`) returns `false` —
**silently, no error** — on any of:

1. `assertUploadedFileOwnedBy` throws (file not owned by this athlete)
2. no assignment matching `(assignmentId, athleteId)`
3. no workout log matching `(assignmentId, programDayId, date)`
4. no log entry matching `(workoutLogId, programExerciseId)`
5. **the UPDATE matches nothing because of `isNull(formCheckVideoUrl)`** — the
   set already has a video

Condition 3 is the interesting one: **the date.** If the clip was filmed near
midnight, or the day's log was never saved, or the program day was edited,
reattachment fails and the clip lands in the Video Bank's unattached list
(`UNATTACHED_KEY`, capped at `MAX_UNATTACHED = 20`) where nobody is looking.

### 4.6 The omission-vs-null contract on resubmission

Already fixed, and the reasoning matters because it is easy to reintroduce.

A set's video URL is written by `attachVideoToLoggedSet` *separately* from
whatever the client holds. A client that logs the NEXT set from state built
before that attach landed sends the earlier set back **with no video url at
all** — and the resubmission wrote `null` over the column and deleted the file
off disk as an orphan. **Set 1's clip disappeared the moment Set 2 was saved.**

Now (`server/storage.ts:20760`):

```ts
const effectiveVideoUrl = s.removeFormCheckVideo ? null : (s.formCheckVideoUrl ?? prior?.url ?? null);
```

Omission preserves; only an explicit `removeFormCheckVideo` or a different URL
replaces. The same reasoning was already applied to the capture columns via
`priorCaptureByKey` and simply never reached the video.

**`?? null` cannot express this** — it collapses `undefined` and `null` to the
same thing. The test that separates them is `in`.

### 4.7 Surface E — the admin report

Three silent drops were found in `getRecentTrackedSetsForAdmin` in two days. All
three are fixed; the **pattern** is what matters.

1. **`programExercises.trackingLevel != 'none'`** was part of membership. That
   column is live and editable, and turning tracking off is exactly what someone
   does after bad takes — **so that click removed every past capture on that
   exercise from the report. The takes worth reading about were the takes it
   hid.**
2. **Membership was four columns** (diagnostics, peak velocity, bar path
   deviation, jump height). Those describe bar-path and jump captures and nothing
   else. **KB swing, med ball, golf/baseball swing, sprint and sled push write
   none of the four — five modes never appeared on that page at all**, and an
   absent row looks exactly like a mode nobody filmed.
3. **`exercises` INNER-joined on a nullable `exerciseId`** — that does not give a
   row with a missing name, it gives no row.

Now every column in `CAMERA_DERIVED_SET_COLUMNS`;
`shared/camera-columns-are-classified.test.ts` fails on any table column
classified as neither camera nor not-camera.

**The report is SERVER-side.** `/api/admin/tracking-report/entries` from
`storage.ts`. A fix ships on a **Render deploy, not a TestFlight build.** Anyone
testing report changes by installing a build will see nothing change and go
looking in the wrong place.

---

## PART 5 — The unexplained case

**2026-09-18.** Scott filmed a bench set. The capture worked; the set screen
showed 0.92 m/s avg, 4.3 in bar drift, 12 reps on a set prescribed at 10, and a
"tracking was shaky" note. **The admin tracking report's newest entry was still
2026-09-14.**

That set writes `peakVelocityMps` and `barPathDeviationCm`, so it satisfied even
the OLD four-column membership test. **None of the three fixed drops explain it.**
Wednesday's session is missing too, so this affects a **run** of sets from on or
before the 16th.

Hypotheses, untested, in the order I would test them:

1. **The set never reached the server.** Screenshot 3 shows local state, not
   confirmation of a save. → debug console SAVE lines.
2. **`main` is not deployed on Render**, so the report query running in
   production is still the old one. → check the service's Events for the merge
   commit.
3. **The log entry has a null `exerciseId`**, which the INNER join dropped — now
   a LEFT join, so this resolves itself once deployed.
4. Something in the date/assignment chain, the same family as §4.5 condition 3.

**The diagnostic nobody has run:** the in-app debug console (bug icon, bottom
left of the workout screen). `logDebug("SAVE", ...)` fires on the POST
succeeding, on it failing with its status, on the permanent/retryable
classification, and on a queue. **Those lines separate "saved but hidden" from
"never saved", which are completely different bugs.** There is no console on an
iPhone; this is the only instrument.

---

## PART 6 — What is validated

**Four movements, against real lifts:** back squat (bar path, from behind),
Pendlay row, bench press (from behind), box jump (jump mode).

**Unvalidated:** sprint, mechanics, med ball, kettlebell swing, sled push, both
rotation modes.

**Every trust-score threshold is uncalibrated.** Structurally sound, numerically
untuned. Treat a score as a relative signal only.

Planned order: deadlift, then med ball throws, then Olympic lifts.

Product state: metrics are disclosed as inaccurate throughout the app
(`shared/camera-accuracy-copy.ts`). The $19.99 AI Coach + Video tier is **on
sale with a mandatory, non-dismissable purchase warning** — it was withdrawn on
the morning of 2026-09-19 and put back the same day on the reasoning that the
*video* works and the *numbers* do not, so sell it and say so.

---

## PART 7 — Where to get evidence

**`scripts/replay-captures.mjs` + `client/src/lib/capture-replay.ts`** — the most
useful tool in the repo for this work. Replays stored bar-path traces and diffs
against a previous run, so a threshold change that fixes one set and breaks four
is visible. **No device, no camera, no video, no database** — feed it a JSON
array of stored set rows.

It is deliberately **not** a replay of the tracking stage. Turning frames into a
trace needs Vision and CoreML, which do not run outside the app, and pretending
otherwise builds a harness that tests a reimplementation.

**`AvObjectLockTelemetry` → `TrackingDiagnostics.objectLock` → admin report.**
Read two numbers first:
- **re-classify corrections > 0** — the detector changed its mind mid-clip, so
  any scale derived from it was measured off more than one object.
- **wrist-gate breaks** — the body tracker catching the object tracker somewhere
  the athlete was not.
- **`framesBodySuspect`** — distinguishes a body-tracking problem from an
  object-tracking one. Without it, the two are indistinguishable.

Every unlock used to be **silent**: a take where the lock broke forty times and
one where it held all set produced byte-identical diagnostics. That, not the
missing check, is why this subsystem was audited three times without progress.
**A guard that cannot be shown to have fired is a guard nobody can tune.**

---

## PART 8 — Traps

Each has been tried or proposed.

1. **No calibration pose.** Rejected 2026-09-05. §2.5.
2. **No plate-based bench scale.** Tried; made the fused signal invent readings; reverted.
3. **Do not widen `PLATE_TO_GRIP_RATIO`.** Widening made the check decorative the first time.
4. **Do not enable bar-path tracking for Olympic lifts.** A correct clean has a deliberate S-curve. Under a straight-line model a technically perfect lift reports **large** deviation, a lift with no curve reports **clean**, and peak velocity understates the bar at exactly the moment that matters. **Inverted, not imprecise.** Needs its own path model, like `kb_swing` (an arc) and `horizontal_load` got.
5. **Do not file cross-tracker fusion against jump/sprint/mechanics/horizontal_load.** §1.6.
6. **Do not make overwatch blame one tracker.** Anything convicting only the object is the original bug renamed.
7. **Do not make an unjudgeable frame fail.** It passes. Inverting reproduces the over-eagerness the arbiter cures.
8. **Do not let a rejected body span into the stability history.** §1.4. Enforced at the call site, not in `arbitrate()`.
9. **Do not narrow the report's membership test.** Three silent drops in two days. Guilty until tested.
10. **Do not add a diagnostics field without declaring it in `trackingDiagnosticsSchema`.** Stripped silently. Twice.
11. **Do not use `?? null` where omission must be preserved.** §4.6.
12. **Do not test report changes via TestFlight.** Server-side. Render deploy.
13. **Do not infer supine posture from landmarks.** Three attempts, three defeats. §2.2.
14. **Do not restore the median in `calibrateFromFrames`.** The error is one-sided. §2.1.

---

## PART 9 — Open questions

1. **The 2026-09-18 bench set.** §5. Start with the debug console.
2. **Is `main` deployed on Render?** The membership fixes do not exist for a user until it is. Never confirmed.
3. **The `ApiError` asymmetry** between `uploadOrQueueVideo` and `runVideoFlush` (§4.4). My leading suspect, untested.
4. **Calibrated vs scale-free velocity loss**, ~16% relative, uncalibrated tolerance.
5. **Every trust threshold** is an admitted guess with no real footage behind it.
6. **Bar-path overlay on video** is not built. The trace is stored per set and drawn only as an abstract scatter plot; the skeleton-replay overlay it would sit beside exists. Pieces exist, not connected.
7. **Unattached Video Bank entries** — is anyone checking? Capped at 20, silently evicted after that.

---

## PART 10 — Process

**Several sessions work this repo in parallel. Split by FILE OWNERSHIP, never by
task.** `server/storage.ts` and `shared/schema.ts` take one owner. The natural
disjoint camera slice is `client/src/lib/*-tracking.ts`, the tracker dialogs, and
`ios/`.

**Run `git fetch origin main && git merge --ff-only origin/main` at the START of
any work**, before reading files for research. This checkout has repeatedly
reverted to a stale commit between tool calls; an audit was once run against a
checkout 112 commits behind and produced a real false report.

**Tests:** `npm test` (no database, must stay that way) and
`npm run test:integration` (needs Postgres; setup in CLAUDE.md).
