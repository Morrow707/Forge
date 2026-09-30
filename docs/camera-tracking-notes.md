# Camera tracking: what is validated, what is assumed, what will break

## RULE #1, BEFORE ANYTHING ELSE IN THIS DOCUMENT: THE CAMERA NEVER REJECTS. EVER.

Scott, 2026-09-22: "Camera should never ever reject, I'd rather have bad data then it reject the
whole thing, we can calibrate bad data, we can't calibrate a rejection. Never ever, ever, ever,
should the camera ever, reject my filming angle or data. Make that rule number 1."

The filming angle is never a reason to refuse anything, and neither is a posture. A set that was
filmed gets a row, a number and an explanation -- always, however little the pipeline trusts it.
The caveat (`shared/camera-accuracy-copy.ts`) and the `trackingDiagnostics` blob are how a reader
is told not to trust a number; silence is not. Everything below is written under this rule, and a
check that withholds a number the pipeline already computed is wrong as written: make it a flag.

See the RULE #1 section at the top of CLAUDE.md for the full statement.

Written during the database audit, from reading the tracking code and from
Scott's account of what has actually been tested on real lifts. The point of
this file is that several of the constraints below are not visible from the
code alone and not discoverable by testing the wrong exercise, so a session
that reaches for the obvious answer will get a plausible number that is
wrong.

## What has actually been field-tested

Four exercises, as of this writing:

- **Back squat** — bar path / full, filmed from behind
- **Pendlay row** — bar path / full
- **Bench press** — bar path / full, filmed from behind
- **Box jump** — jump mode

Everything else in the tracking system is unvalidated against real footage.
That includes sprint, mechanics, med ball, kettlebell swing, sled push and
both rotation modes.

Planned order after these, per Scott: **deadlift**, then **med ball throws**
(the two together), then **Olympic lifts**.

## Trust scores are structurally sound and numerically untuned

Every capture mode now produces a confidence score, normalized into
`workout_set_entries.trust_score_pct` and `skill_session_logs.trust_score_pct`.
The structure is right and the inputs are real signals. **Every threshold in
it is a guess**, made without footage to calibrate against, and the modules
say so.

A trust score is therefore currently a relative signal, not an absolute one.
"This capture scored 40" does not yet mean anything in particular. Calibrating
means running real captures — some deliberately bad — and checking whether the
scores actually separate them.

Note also that a trust score is not accuracy. Adding one changed no reading.
A jump height or a 40 time comes back the same number it did before; what
changed is that it now arrives with a statement of how much to believe it.

## Camera angle changes which axis is measurable

`barPathDeviationCm` takes the median horizontal position across a rep and
reports the 90th percentile distance from it, across **both** horizontal axes
(side-to-side and front-to-back).

The two axes are not equally trustworthy:

- Side-to-side, filming from behind, is real image-plane motion. Measured well.
- Front-to-back, filming from behind, is **depth**, which the pose model
  estimates rather than observes. It is the least reliable number the tracker
  produces.

Squat and bench are currently filmed from behind, which means the axis being
measured best is the one that matters least, and the fault a lifter actually
cares about — the bar drifting forward over the toes, or travelling toward the
face on a press — is being inferred from estimated depth.

A **side view** swaps this: forward-back becomes ordinary image-plane motion.
It should give a materially more trustworthy deviation number for the sagittal
fault. The rear view stays better for left-right bar tilt and for leg-drive
asymmetry, which needs both sides visible.

These are two captures answering two different questions, not a replacement.

**This is reasoning from how the numbers are computed, not from footage.**
Nobody has measured how bad the depth estimate is on real equipment. The test
is to film one set from both angles and compare the deviation each reports.

## Bench press has a known calibration weakness

Calibration resolves a pixels-to-metres scale from a head-to-ankle read
(`calibrateFromFrames` in `pose-tracking.ts`). A lying-flat athlete with feet
out of frame cannot produce one.

A previous attempt worked around this by switching horizontal press/row
barbell sets to a plate-based scale, trading bar-path corroboration for
calibration. Field data the same night showed that made the fused signal noisy
enough to invent readings, and it was reverted — see
`av-bar-tracker-dialog.tsx`'s own comment.

So of the four validated exercises, **bench is where a wrong number is most
likely to be a calibration failure rather than a tracking failure**, and the
two look identical from outside.

## Olympic lifts need their own path model, not a library entry

This is the one that will silently produce wrong numbers if someone treats it
as a new exercise with bar-path tracking switched on.

`barPathDeviationCm` measures departure from a straight vertical line. Peak
velocity is computed on the **vertical component only**. Both are correct for
a squat, bench, row or deadlift, where horizontal bar movement is error.

A correct clean or snatch has a deliberate S-curve: the bar travels back
toward the lifter off the floor, forward under the second pull, then back
again. Under the current model:

- A technically perfect lift reports **large** deviation.
- A lift with no curve at all, which is wrong, reports **clean**.
- Peak velocity **understates** true bar speed, because the horizontal
  component of the second pull does not count — at exactly the moment that
  matters most.

This is the same situation that gave `kb_swing` (an arc) and `horizontal_load`
(straight-line horizontal travel) their own tracking modes rather than folding
them into bar path. An Olympic lift is a third shape again, and needs the same
treatment.

## Deadlift and med ball should be straightforward

Deadlift is bar path / full, the same mode as the three already validated, and
is the friendliest case for the metrics — the intended path really is vertical.
One thing to watch: the bar starts at rest on the floor, and rep segmentation
works from vertical reversals, so a dead-stop reset between reps may segment
differently from a squat's top-start.

Med ball is the mode with the most machinery behind it and the only one where
the object tracker, the body tracker and the physics trajectory check all
cross-check each other. It is the best real test of the three-system design.

## The two trackers now share one referee

Forge points two independent trackers at the same lift: the body tracker finds
the athlete's joints, the object tracker finds the equipment. They had never
compared notes. The object tracker's three guards -- an implausible-jump check,
a physics trajectory fit, and a periodic re-classification -- are all questions
the object tracker asks about the object tracker, and a lock that has slid onto
a plate on the rack behind the lifter answers every one of them correctly about
the wrong object. It jumps nowhere, flies nowhere, and it *is* a plate.

**2026-09-20: the referee now runs on BOTH paths.** Until today `arbitrate()` had
no TypeScript caller -- overwatch lived only in the Swift port, and the web/MediaPipe
path judged its lock with a frame fraction. `client/src/lib/overwatch-tracking.ts`
(`WebOverwatch`) is the web caller, wired into `bar-tracker-dialog.tsx` with the same
order (body first, then the object, then any fresh detection) and the same asymmetry;
`overwatch-tracking.test.ts` scans the dialog for that order. The same day the Swift
side gained per-source yardstick history, a motion-correlation check (the lock has to
move with the hands), a size/edge filter on candidates before the pick, frozen-frame
detection, and a `held` flag on dead-reckoned positions; the three new counters
(`breaksMotionDisagreement`, `candidatesRejectedBySize`, `framesFrozen`) reach the
admin report. `implement-tracker-swift-parity.test.ts` now polices the seven
implement-tracker constants the same way the arbiter's five are policed.

`shared/tracker-arbiter.ts` is the rule that was missing, and it is deliberately
one rule applied in three places rather than three fixes:

1. **Every tracked frame, natively.** A box the body tracker says is nowhere
   near the athlete's hands drops the lock that frame. This is what actually
   fixes drift onto background equipment -- a rack plate fails on every frame,
   while a re-classification boundary comes round only twice a second.
2. **At re-classification.** Candidates are filtered by the same rule *before*
   the most confident one is chosen. The order matters more than the filter:
   choosing first and checking afterwards throws away a good second-place
   detection of the real implement whenever a better-lit duplicate exists
   elsewhere in the room, which for the `plate` class in a gym is most takes.
3. **Once per take, on the client.** `referenceObjectVerdict` decides whether a
   reference-object scale read is allowed to set the scale at all.

**The threshold is expressed in the athlete's own grip widths**, and that is the
whole trick. Grip width is a real-world length the body tracker measures on
every frame, needs no calibration, and shrinks and grows with camera distance
and zoom exactly as the scene does -- so `2.5 grip widths` means the same
physical thing at three feet or thirty, in portrait or landscape, at 1x or 2x. A
threshold in pixels or frame fractions does not, which is why earlier attempts at
this needed per-setup tuning and never got it. It is also a measurement the
object tracker cannot influence, which is what makes it a referee.

**An unanswerable frame PASSES.** A frame with no body reading is ordinary -- the
lifter steps out of shot, a pose read fails -- and absence of a body reading is
not evidence the object is wrong. The gate only fires on a positive finding: the
athlete was measurably right there, and the object was not near them. Inverting
this would reproduce the over-eagerness the whole thing exists to cure.

### Why this was worth doing now, specifically

The mechanism ran all the way to the rep count. A barbell lift tracks the PLATE
(`COREML_TRACKING_MODE_BY_EQUIPMENT` maps `Barbell` to `plate`). A plate further
from the camera measures fewer pixels across; scale is metres per pixel; fewer
pixels for the same 0.45m disc means a larger scale, means every distance in the
take inflated, means settling wobble clearing the rep-amplitude gate. That is the
same inflation that turned eleven bench reps into eighteen. The re-classification
pass, written to *recover* from drift, was itself capable of causing it every
thirty frames.

Two things that were already being measured and then ignored now decide
something: the reference object's aspect ratio (a plate is a disc; the read that
prompted this boxed at 3.12, which is a rack upright) and its median position
relative to the hands. Both had been written into the diagnostics blob purely so
a human could work out after the fact why the numbers had been wrong.

### The part that makes the next change cheap

Every unlock path in the object tracker used to be silent. A take where the lock
broke forty times and a take where it held all set produced byte-identical
diagnostics -- so the one subsystem whose every threshold is an admitted guess
was also the only one producing no evidence about whether the guesses were any
good. That, not the missing check, is why this has been audited three times.

`AvObjectLockTelemetry` now ships with the analysis result, through
`TrackingDiagnostics.objectLock`, onto the admin tracking report. Read two
numbers first: **re-classify corrections** above zero means the detector changed
its mind about which object it was following mid-clip, so any scale derived from
it was measured off more than one thing; **wrist-gate breaks** is the body
tracker catching the object tracker somewhere the athlete was not.

`PLATE_TO_GRIP_RATIO_LOW/HIGH` went from `0.25`-`2.5` to `0.45`-`2.0` at the
same time, derived rather than guessed (the ratio is depth-independent when both
objects are on the same bar, so the honest window is much narrower than a
factor of ten). Do not widen it back without telemetry to justify it -- widening
is what made the check decorative the first time.

### The referee has to referee both teams

The first version of this only judged the object against the body, and that is
a hierarchy rather than cohesion. It also introduced its own bug: making the
body the ruler means a jumped wrist landmark can break a perfectly good object
lock. Vision reports such a landmark with ordinary confidence, because it is
confidently *somewhere* -- just not on a wrist -- and one such frame moves the
hand anchor metres, at which point every object in view is "nowhere near the
athlete".

What catches it is the ruler's own length. The distance between an athlete's
wrists is a physical constant for a set -- they are holding a bar -- so its
apparent length can only change as fast as they rotate relative to the lens,
which is slow. A bar turned well off square reads about half its true width, and
that is the largest honest change available, so a span that doubles between two
sampled frames is a landmark that went somewhere a wrist cannot. **The object
tracker plays no part in detecting that, which is exactly what makes it a
trustworthy check on the body** -- neither half of the arbitration borrows the
other's sensor.

`arbitrate()` returns one of four outcomes -- `agree`, `object_suspect`,
`body_suspect`, `cannot_judge` -- and **the response is deliberately
asymmetric**. A suspect object loses its lock, because a better answer exists:
re-detect. A suspect body gets an abstention: the frame is skipped, the lock is
left exactly as it was, nothing is reported. There is no better body available,
and convicting the object on a measurement just declared untrustworthy is the
worst of both.

The body is checked **first**, before the object gate and before any fresh
detection. Both orderings matter. Judging the object first means a jumped
landmark has already thrown the lock away by the time the jump is noticed; and a
jumped wrist also drags `regionOfInterest` with it, so a detection seeded on
that frame searches the wrong part of the image and locks onto whatever is
there.

One implementation detail that is load-bearing: **only stable spans join the
history**. A rejected reading must never enter the window it was rejected
against, or a run of bad landmark frames teaches the check to accept them and
the guard dissolves precisely when it is needed most.

`framesBodySuspect` rides along in the lock telemetry and onto the report, so a
body-tracking problem cannot be read as an object-tracking one -- which, before
this, is exactly how it would have appeared.

### If you change the rule, change it in both places

The gate has to run natively to correct a lock mid-clip, and there is no Swift
test target in this repo, so the constants exist twice: `shared/tracker-arbiter.ts`
is the source of truth and `AvTrackerArbiter` in `AvBodyTrackingPlugin.swift` is
a port. `shared/tracker-arbiter.test.ts` reads the Swift source and fails if they
drift apart, and also asserts that the gate is still applied per frame, that
candidate filtering still happens before the most-confident pick, that the body
check still precedes both, and that a rejected span cannot reach the history. It is a text
scan and cannot prove the two behave identically -- only that they were handed
the same numbers, which is the half that actually rots.

## Four modes cannot have cross-tracker corroboration at all

Jump, sprint, mechanics and horizontal_load have **no implement in the scene**,
so the object tracker has nothing to look at and body tracking is the only
sensor. Internal corroboration is the ceiling for them, and it has been
reached: jump compares its two independent height estimates (flight time vs.
peak ankle travel, which existed separately and were never compared), and the
checkpoint-timed modes derive a real precision bound from the frame gap
straddling each crossing.

Do not file "add cross-tracker fusion" work against these four. There is no
second tracker to fuse with.

## Not built yet

**Bar-path overlay on video.** The trace is stored per set
(`workout_set_entries.bar_path_trace`) and is drawn today only as an abstract
scatter plot on the coach analytics page. Drawing it over the actual video has
never been built, though the skeleton-replay overlay it would sit alongside
has. The pieces exist and are not connected.

## Bench press vs. a bar-mounted sensor (field report, 2026-09-04)

One bench set (135lb x 9) tracked simultaneously by Forge and by an OVR bar sensor,
which is the reference we are calibrating toward. Forge's numbers against OVR's:

| Metric | OVR | Forge | Ratio |
| --- | --- | --- | --- |
| Range of motion | 15.3 in (38.9 cm) | 154 cm | 4.0x |
| Peak velocity | 1.04 m/s | 3.0 m/s | 2.9x |
| Mean velocity | 0.76 m/s | 1.31 m/s | 1.7x |
| Peak power | 629 W | 3973 W | 6.3x |
| Mean power | 456 W | 1735 W | 3.8x |
| Reps | 9 | 18 | 2.0x |

Every one of those traces back to **one** root cause, now fixed: height calibration
read the vertical drop from head to ankles and called it the athlete's standing
height. On a bench that segment is horizontal, so the vertical component is just
bench incline plus camera tilt, and dividing a real 1.8m into it inflated the scale
about 4x. The rep count doubled as a consequence rather than independently --
BASE_MIN_REP_AMPLITUDE_CM rejects reversals under 20cm as noise, and at 4x the
athlete's ordinary wobble clears that floor. The power ratios also carry a separate
2.2x from the set being logged as 135 **kg** when 135 **lb** was lifted; the unit
toggle was on KG. That is a data-entry trap, not a tracking bug, but it feeds power
directly (power = mass x g x velocity) and 2.9 x 2.2 = 6.3 accounts for peak power
exactly.

**Consequence of the fix: a supine set now calibrates to nothing and reports no
numbers at all**, per this pipeline's standing "no number is better than a wrong
one" rule. That is the correct outcome for the footage above, and it is worse for
the athlete than it sounds -- bench is simply not measurable from where it was
filmed, and was never measurable there.

Two separate things have to be true before bench can be compared to OVR:

1. **Scale.** Height calibration cannot work on a lying athlete from any angle,
   because it needs an upright body. A side view makes head-to-ankle lie flat in
   the image plane, so a supine calibration branch using the segment's FULL length
   (not just its vertical component) would work there. Not built -- it would be
   guesswork without a device to validate against, which is exactly what the
   Olympic-lift note above warns about. The already-built alternative is the CoreML
   plate detector (computeReferenceObjectScale), which needs a bumper plate in shot
   and no upright body at all.
2. **Axis.** Filming from behind the head puts the bar's travel on the estimated
   depth axis, the least reliable number the tracker produces (see the camera-angle
   note above). Even with perfect scale, ROM and velocity from that angle are not
   trustworthy. **Bench has to be filmed from the side** for these numbers to mean
   anything.

Do not tune constants against the table above until bench is re-shot from the side
with a plate in frame. Fitting a fudge factor to depth-axis data would bake the
camera angle into the model.

### Which angle each lift needs, and why it is not the same answer for all of them

The pipeline has ONE camera and no depth on the 2D Vision path
(visionJointsToWorldLandmarks fills z with 0). Two independent things have to survive
whatever angle is chosen:

**Scale** -- how many centimetres a pixel-unit is worth. Today this comes from the
athlete's own body, so the body has to be visible at its true length. A body pointing
away from the lens is foreshortened and its length is unknowable from that frame; no
amount of maths recovers it. There are now three ways a frame can resolve:

| Frame shows | Method | Works for |
| --- | --- | --- |
| Upright body, head over ankles | Vertical head-to-ankle drop | Squat, deadlift, clean, snatch, row, press, jump |
| Upright body, no head | Shoulder-to-ankle / 0.818 | Same, when the head leaves frame |
| Lying body ACROSS the frame at full length | Full head-to-ankle segment length | Bench, floor press, hip thrust |
| Body pointing at or away from the lens | Rejected | -- |

**Axis** -- whether the movement being measured lies in the image plane. Vertical bar
travel is in-plane from ANY azimuth around the lift as long as the camera is LEVEL with
the movement. Filming down at 45 degrees is what breaks it: that mixes real vertical
travel with depth, and depth is the least reliable number the tracker produces. The
failing bench set was shot from a raised corner, which is why its numbers were wrong in
two ways at once.

So, per lift:

- **Squat, deadlift, clean, snatch, Pendlay row, overhead press** -- the athlete is
  upright, so scale resolves from any azimuth. Film from the SIDE, camera level with the
  athlete's mid-torso. Side view also puts the bar's fore-aft drift in plane, which is
  the drift that matters for all of them. Filming from behind still calibrates, but bar
  path becomes a depth measurement and should not be trusted.
- **Bench press, floor press, hip thrust** -- the athlete is horizontal, so scale
  resolves ONLY from the side. Camera square to the side of the bench, level with the
  bar's travel. From the head or foot of the bench the body points down the lens and
  calibration correctly refuses.
- **Box jump** -- upright, and the measured axis is vertical. Any azimuth, camera level.

The one case that genuinely cannot be solved by choosing an angle is measuring BOTH
horizontal bar-drift axes at once. One camera sees one of them. Fore-aft is the one worth
keeping for every lift here, and side-on is where it lives.

### Getting there from any angle (not yet built)

Two routes, both real, neither dependent on the athlete's body being measurable:

1. **Scale off the equipment instead of the athlete.** computeReferenceObjectScale and
   CALIBRATION_REFERENCES already exist. A bumper plate is 450mm and shows as a full
   circle from the side; a bar is ~2.13m sleeve-to-sleeve and shows unforeshortened from
   the head or foot of a bench. So every angle has a known-size object in frame.

   **This is now wired** (it was not when the paragraph above was first written):
   av-bar-tracker-dialog sets coreMlTrackingMode to "plate" for every lift where
   `heightCalibrationUnreliable` is true, which is exactly the lying/seated/supported
   postures -- bench press included -- and plateScaleFromFrames turns the detection into
   a scale. The shipped MedBallDetector model really does carry the plate class (its
   label map is med_ball, plate, baseball, golf_ball, tennis_ball, kettlebell, dumbbell,
   barbell), and the same retrain that kept the plate class usable regressed barbell to
   ~0.02 and dumbbell to ~0.14 confidence, both under the gate.

   What is still open is not the wiring but the evidence: the plate class's supporting
   data is eleven instances from three photos, so a plate-derived bench scale has never
   been checked against a bar sensor. Do that before treating a bench number as settled.
2. **Use the real 3D pose.** VNDetectHumanBodyPose3DRequest (iOS 17+) returns joints in
   actual metres, and visionBody3DToWorldLandmarks already bridges it -- the TRACKING
   path prefers it per frame. Calibration does not: av-bar-tracker-dialog builds
   calibrationInput from visionJointsToWorldLandmarks alone, the depthless 2D bridge.
   On a frame with 3D pose there is nothing to calibrate, the landmarks are already
   metric, and foreshortening stops mattering at any angle. Closing that gap is a
   separate change and needs a device to validate.

### Capture is pinned to 1080p60 (2026-09-04)

`applyHighestFrameRate` previously chose the highest-resolution format that could
clear 60fps, which on a modern iPhone is 3840x2160. That was a fix for preview blur,
not for accuracy, and it cost a great deal for pixels nothing downstream reads:

| Consumer | Resolution it actually uses |
| --- | --- |
| Vision body pose | 1280x720 (`decodeMaxDim` in the reader's outputSettings) |
| Motion-diff implement tracker | 160px long edge (`implementWorkingMaxDim`) |
| CoreML implement detector | 640x640 (the model's own input) |

Because the analysis reader already decodes through `kCVPixelBufferWidth/HeightKey`
at 1280, a 4K source and a 1080p source both arrive at Vision as the same 1280x720
buffer. Tracking accuracy is not merely similar between the two, it is **identical**.

What 4K did cost, all field-reported on 3840x2160@60 clips: 48.2s to analyse a 34.3s
set; `AVAssetReader` dying partway with -11819 `mediaServicesWereReset`, which
restarts the phone's media server and takes the athlete's own music down with it, so
the "analysis stopped early" bug and the "Spotify cuts out at the save step" bug are
the same event; and "Out of offline storage" from the clip sizes.

The frame rate is now pinned to exactly 60 rather than the format's top speed. The
old code set both min and max frame duration to the range's `minFrameDuration` (its
FASTEST rate), so a 1080p format advertising 1-240fps would have been locked to
240fps -- the slow-motion range with binned readout and non-converging autofocus that
the surrounding comments exist to warn against.

Preview softness is the one thing given up. It is a preview-layer problem
(`resizeAspectFill` upscaling a 1080p buffer ~25-30% to a modern iPhone's portrait
pixel count) and wants a preview-layer fix, not a 4x larger recording.

### Bench press: height calibration is refused, and why (2026-09-04)

A simulated sweep over 48 realistic prop positions (camera 0.4-2.0m behind the toes,
0.15-0.90m high, 0-20 degrees of pitch), driving the REAL `calibrateFromFrames` /
`calibrationMethodBreakdown` / `implausibleRangeOfMotion`, against a true bench range
of motion of 39.4cm measured by a bar sensor:

| Outcome | Count | Published range of motion |
| --- | --- | --- |
| Refused | 23 | -- |
| **Published silently** | **25** | **6.1 - 75.4 cm (-85% to +91%)** |

`implausibleRangeOfMotion` fired on **none** of the 25. The athlete's reported 154 /
180.5 / 299cm were the visible tail of a much larger silent band. The flip between
refusing and publishing sits at a camera height of about **0.47m -- the height of the
bench itself**, so moving the phone from the floor onto an adjacent bench turns a loud
refusal into a confident 72cm.

So athlete-height calibration is now refused BY EXERCISE NAME for supine movements
(`isKnownSupineMovement`). Not by inspecting the landmarks: two shipped attempts to infer
posture geometrically were defeated by real footage and a third was defeated in
simulation before shipping. A bench press is performed lying down from every camera
angle, on every rep, for every athlete -- the name is the one signal no prop position
can fool.

`implausibleRangeOfMotion` also gained a FLOOR. It only ever had a ceiling, which catches
a scale read too large; the sweep shows under-reads are just as common, and a 6cm bench
press is exactly as impossible as a 299cm one.

#### What would actually measure a bench, and what it would cost

Shoulder breadth is the best in-plane reference: across the identical 48-position sweep
it gave 36.0-49.5cm, a **1.38x prop-to-prop spread against the height path's 12.4x**.
That ~9x stability gain is the real argument for it -- not accuracy, but that the same
lift stops giving three different answers.

Three findings shape how it must be built, and all three kill the obvious design:

1. **Do not fit `SHOULDER_BREADTH_FRACTION` against bar-sensor data.** The net error is
   the difference of two large opposing terms: geometry (J-path 5-20cm, camera pitch)
   biases LOW by 30%, while 0.245 against a modelled Vision shoulder span biases HIGH by
   21%. They partly cancel, which is why 0.245 looks accidentally right here. That
   cancellation is prop-dependent and fatigue-dependent (the J-path widens as the lifter
   tires), so fitting it bakes in a coincidence that is wrong in the other direction at
   the next camera position.
2. **A dispersion (CV or IQR) refusal gate is backwards.** Measured directly: full
   rep-phase coverage gives CV 5.7% and +6.5% error; lockout-frames-only gives CV 0.9%
   and -0.6%; chest-frames-only gives CV 1.0% and +14.7%. Narrow phase selection of a
   biased landmark is MORE self-consistent than broad sampling of an honest one, so such
   a gate preferentially refuses the good takes.
3. **It must not be a branch inside `impliedStandingHeightPixels`.** That would pollute
   the shared median. It needs its own function and its own sample pool, selected between
   rather than averaged, and gated on `isKnownSupineMovement`.

A regression scenario to respect: a back squat filmed from the corner of the rack with
the feet out of frame currently refuses correctly (fewer than 5 frames have both ankles).
An ungated shoulder branch would resolve on nearly every frame and publish a yaw-corrupted
number. The gate is what keeps that refusing.

**Free validation available with no calibration at all:** time-to-peak-velocity is
scale-invariant. A bar sensor reported 0.26s on footage that already exists. If the
tracker's own time-to-peak does not match that, no amount of scale work will fix the
numbers, and that is worth checking before building any of the above.

## Auditing the pipeline against the execution manual (2026-09-05)

The execution manual describes all 109 camera-trackable exercises one physical action at a time,
from the athlete tapping Start to the athlete tapping Stop. Reading it as a specification and
diffing it against what the code actually computes for each of the 413 seeded library exercises
turned up four defects. All four are now fixed. The per-exercise knowledge lives in
`client/src/lib/exercise-camera-profile.ts`, which is a plain data module with no imports.

### Seated lifts were silently over-scaled by about 30%

This is the one worth remembering. `isKnownSupineMovement` asked whether a lift is done lying
down, which is the right question for a bench press and the wrong shape of question in general.
`uprightEnough` is a DIRECTION test: it compares the head-to-ankle segment's vertical component
against that segment's own length. A seated athlete passes it comfortably, because their head
really is above their ankles. But their head-to-ankle span is roughly 0.77 of their standing
height (sitting height is ~0.52 of stature, and a bench adds ~0.25), so dividing real height by
that span produces a scale factor about 30% too large.

Every centimetre, metre-per-second and watt from a seated cable row, lat pulldown, leg press,
leg extension, machine press, preacher curl or seated calf raise carried that bias, with nothing
flagged. It is small enough to sail through `implausibleRangeOfMotion`, and that is exactly what
made it dangerous: a 4x error announces itself, a 1.3x error looks like a number.

The gate now asks about posture rather than about lying down. `standing` and `hanging` allow
height calibration; `seated`, `lying` and `supported` refuse it and withhold the numbers with a
reason specific to the posture.

Treating a strict dead hang as valid is an ASSUMPTION, not a measurement. The manual specifies
straight arms and a straight body for both pull-up and chin-up, which does span true standing
height, but an athlete who bends their knees breaks it the same way sitting does. Nobody has
checked this against real footage. A dip taken with the ankles crossed and an assisted pull-up
taken kneeling on the platform are both classified `supported` for that reason.

### The whole bench-press family was missing from the refusal list

A board press, pin press, Spoto press, Larsen press, JM press and Tate press are all performed
lying on a bench, and not one of them contains the word "bench". All six fell through the old
`/bench\s*press/` pattern and got a confident number. So did the incline dumbbell press,
chest-supported row, inverted row, reverse hyper, pullovers and the incline and decline flyes.

### The native tracker passed no starting direction at all

`summarizeTrackedSet` takes a `firstPhaseHint` that tells the rep segmenter which phase is the
concentric. The legacy dialog supplied one from the movementType taxonomy. The native AV path --
the one that actually runs on the phone, and the one being calibrated against bar-sensor ground
truth -- passed `undefined`, so every rep's concentric was decided by phase speed alone.

The taxonomy could not have covered it anyway. It has no answer for anything typed Push or
Press, which is every bench press and every overhead press, and it gets three exercises
backwards: a hang clean and a hang snatch both dip to the hang before they pull, and a step-up
drives up before it steps down. The manual answers all 91 bar-path lifts definitively, and that
table is now consulted first in both paths.

### Two mode-routing bugs, and one exercise deliberately left alone

`Med Ball Chest Pass` and `Med Ball Overhead Throw` are both seeded as category `plyometric`, and
the category test ran before the med-ball name test -- so two thrown-object exercises were routed
to jump tracking, which measures ankle displacement. The med-ball check now runs first. `Wall
Ball` and `Suitcase Carry` matched no pattern at all and fell through to bar-path tracking; both
now route correctly.

`Russian Twist` is left routed to bar-path on purpose, against the manual's own suggestion. The
manual notes it should be med ball but also admits the up-down tracker sees almost nothing there,
and med-ball mode's trajectory logic is gated to genuinely thrown, free-flying objects -- a
Russian twist holds the ball throughout. Neither mode measures it. It is classified `seated` for
posture, so it saves the video and withholds numbers rather than inventing them, which is the
honest outcome until a rotational tracker exists.

### ROM buckets

`expectedPatternFromName` was feeding two consumers at once: the ROM ceiling and the
pattern-mismatch trust penalty. The mismatch check only means anything across the four patterns
`guessMovementPattern` can return, so the ROM buckets now come from a separate function. That
split made two fixes possible. An Arnold press and a landmine press are overhead presses whose
names end in "Press", so they were getting the horizontal 0.5x ceiling instead of 0.7x -- tight
enough to reject a real rep. And 48 of the 91 bar-path lifts had no bucket at all and fell to a
1.3x default that catches almost nothing: a calf raise travels about 0.05 of standing height, so
a scale several times too large still landed inside the ceiling and reported as ordinary.

Six new buckets were added, all set generously on purpose. These are anthropometric bounds, not
calibrated thresholds. The job is catching a grossly wrong scale, not judging rep quality: a
false rejection throws away a real set's numbers, which costs more than letting a mildly odd
number through.

## What no longer needs a scale, and what is now measurable (2026-09-05)

Four changes, in the order they matter.

### Numbers that never needed a scale are no longer thrown away

A lift with no real-world scale used to save its video and withhold everything. That discarded
more than it had to. Rep count, how long each rep took, how much the bar slowed across the set,
how long it took to reach top speed, and how far it drifted as a share of its own travel are all
times or ratios, and metres cancel out of every one of them. Velocity loss in particular is the
number a velocity-based-training athlete actually trains against, it is a percentage, and it was
going in the bin alongside the metres it does not need. Bench and every seated lift now return
that half. Only the metres, the metres per second and the watts are withheld.

Reps are segmented relative to the take's own typical rep instead of against the 20cm floor,
which means nothing without a scale and does real damage with a wrong one: at a 4x-inflated scale
an athlete's settling wobble cleared it and 11 real bench reps became 18.

**The trace has to be normalised to a nominal size first**, and finding out why was the useful
part. The acceleration and velocity filters are stated in metres. Handed a trace in arbitrary
units they do not merely stop helping: one whose numbers happen to be large reads as a single
continuous physically-impossible event, so every frame is rejected and the peak collapses to the
ceiling. The same five reps segmented as four at one scale and eight at another until an
invariance test caught it. Normalising is safe precisely because everything reported is a
duration or a ratio, and multiplying every position by a constant changes neither.

There is deliberately no velocity field of any kind in the scale-free output. A number in trace
units per second would look like a speed, sort like a speed, and get compared against last week's
speed by an athlete with no way to know the units changed.

#### "The take's own typical rep" was being measured wrong, and a sticking point paid for it

The relative gate is 40% of a typical reversal, and the typical reversal was the MEDIAN of every
reversal an exploratory pass could find. That is only the size of a rep if reps are the majority
of what the pass returns, and they are nowhere near it. A ten-rep bench trace with a sticking
point came back as five separate amplitude populations -- pose noise, the dip itself, the
remainder of the press once the dip had split it, and two clusters of real reps -- and the reps
were the smallest of the five by count. The median landed a third of the way up a real rep, so
the gate came out below the dip, and the dip became a rep boundary.

That is the defect the OVR paired session found: ten presses reported as fifteen, per-rep peaks
spanning 0.24 to 1.96 m/s against the sensor's 0.91 to 1.10, while the set MEAN stayed within
3.5% because splitting a rep produces a fast half and a slow half that average out. The scale was
never the problem, and several builds were spent looking at it.

Two changes, and both are load-bearing:

**The median is taken over the large reversals only** -- strictest cut first (half the biggest
reversal in the take), dropping to a looser one only when the cut left too few values to take a
median of. A single cut does not work in both directions: too low and the fragments the dip
created stay in the population and drag the gate down onto themselves, too high and one wild pose
frame is the only thing that clears the bar.

**The calibrated path passes a real-world floor** of `MIN_REP_AMPLITUDE_FLOOR_CM`, and it is the
only thing that can tell a take of small reps from a take of no reps. A purely relative gate
cannot: with nothing but noise in the trace, the noise IS the large population, elects itself
typical, and 400 frames of wobble segment into 166 reps. The scale-free path still has no floor
and still cannot answer that question -- correctly, since pixel-space has no centimetres, but
anything consuming it needs to reject an empty take some other way.

A side effect worth knowing about: the better gate absorbs the lone-hand dropout bug outright up
to 30 degrees of camera tilt. `barPointFromSides` is still the actual fix and still the only
thing that holds at 45, but `lone-hand-trace.test.ts` had to narrow its reproduction to that
angle, and the comment there explains why that is the second time it has narrowed.

### The correct camera angle was being scored as a problem

`assessCameraAlignment` asks whether the athlete is squared up to the lens. That is the right
question for a front-view lift and the wrong one for a side-view lift, which is nearly all of
them. A correct side view puts one shoulder behind the other, so the shoulders stop being spread
across the frame, the check returned "unknown", and the take lost 10 trust points to the note
"Camera framing couldn't be confirmed". The one camera position almost every barbell lift
requires was scoring worse than a front view that cannot see bar drift at all.

Footage is now read for which way the athlete is actually facing and judged against the view the
lift needs. A genuine mismatch warns rather than refuses, because everything vertical is still
measured correctly from the wrong side; it is the forward-and-back drift that vanishes.

### Bar-path deviation and peak velocity are withheld on Olympic lifts

The bar deliberately loops back around the knees and in under the athlete. A technically correct
clean scores WORSE on straight-line deviation than a bad one hauled up in a straight line. Those
two numbers are inverted there, not imprecise, so they are withheld rather than shown with a
caveat. Range of motion, timing, velocity loss and rep count are unaffected.

### Thresholds can now be measured instead of argued about

Every threshold in this pipeline is a number somebody picked, because measuring one meant
re-running analysis over real captures and analysis only ever ran once, live, on a phone.

Sets already store their own bar-path trace, and that trace is the input to everything downstream
of tracking. `client/src/lib/capture-replay.ts` replays it, and `scripts/replay-captures.mjs`
runs a batch and diffs against a previous run, so a threshold change that fixes one set and
breaks four is visible instead of invisible. It needs no device, no camera, no video and no
database -- feed it a JSON array of stored set rows.

It is deliberately not a replay of the TRACKING stage. Turning frames into a trace needs the
implement trackers, the CoreML detector and Vision, none of which run outside the app, and
pretending otherwise builds a harness that tests a reimplementation.

**It has already found one thing.** Velocity loss is a ratio and survives losing the scale, but
the calibrated and scale-free paths segment reps differently -- an absolute centimetre floor
versus each reversal's size relative to the take's own typical rep. Same rep count, slightly
different rep boundaries, so the per-rep means the ratio is built from differ. On a synthetic
five-rep squat that is about 1.7 points on a figure near 10, roughly 16% relative. Worth knowing
before anyone compares a bench velocity-loss number against a squat one. The tolerance in the
test is not calibrated; it should be replaced with a measured bound once real captures have been
through the harness.

## A standing calibration pose is off the table

Do not propose one. Taking a standing reference at the start of a supine set would give real
centimetres and watts on bench with code that already exists, and it was considered and rejected
on 2026-09-05: the athlete taps start and gets to their lift. Nothing may be added to the capture
flow that asks them to pose, stand somewhere specific, or hold still for the camera first. The
scale reference has to come from the footage itself -- a plate, the bar, grip width -- or not at
all.

## Full camera-system audit (2026-09-05)

Roughly 13,000 lines across the native capture layer, the six tracker modes, the object
detector, the skill metrics, the trust scores and the video pipeline. Six confirmed defects
fixed. Several reported findings did NOT survive verification and are recorded at the bottom,
because a finding that looks right and is wrong costs more than one nobody raised.

### A transient server error was deleting the athlete's recordings

The worst of them. `flushPendingVideos` treated every `ApiError` as a permanent rejection and
called `clearPersistedVideo`, which deletes the file from disk and the manifest entry. Upload
rejects with `ApiError` for every non-2xx, so a 500, 502, 503, 429 or an expired session all
counted. Film five sets at a gym with no signal, reconnect on the drive home while the server is
cold-starting, and all five clips are erased with a message telling the athlete to re-record
footage that no longer exists.

The workout-log queue had the correct classification all along. The video path never got it. Both
now import one shared `isPermanentUploadRejection`, so they cannot drift apart again: only a 4xx
is permanent, and 401, 408 and 429 are excluded because all three succeed on a later attempt.

### The analysis loop had no autorelease pool

Not one `autoreleasepool` anywhere in the 2,700-line native plugin, and the per-frame loop runs
Vision pose estimation, optional hand pose, a CoreML detection and a camera-drift estimate.
Every autoreleased temporary from all four accumulated until the whole analysis finished --
thousands of frames' worth held at once on a minute of 1080p60.

That is the same memory pressure behind the "Cannot Complete Action" media-services reset that
cut the athlete's music mid-session. Dropping 4K to 1080p addressed one contributor; this was the
other, and it was still there. Wrapped after the sampling guards, since `break` and `continue`
cannot cross a closure boundary in Swift.

### Hip-shoulder separation could report 354 degrees as elite

The headline X-factor number for a swing. The hip and shoulder angle series are unwrapped
independently, each anchored to its own first frame, then differenced with `Math.abs` and no wrap
normalisation. An athlete whose hips read +176 and shoulders -178 has a true separation of four
degrees, near none at all, and was reported at 354 -- which clears every "not enough separation"
threshold and reads as world class. The number is the 95th percentile of that series, so a
wrapped frame is exactly the frame it selects.

### Kettlebell swings were counted twice

`segmentPhases` splits at every direction reversal, so one swing is two phases: the bell falling
back through the legs and the bell driving up. Bar tracking has always classified phases and
counted only the concentric ones; the kettlebell module pushed one rep per phase. A clean
ten-swing set logged about twenty.

### An unfinished drill was reported as a finished one

`detectSprintCrossings` returns a result whenever at least two checkpoints were crossed. A
5-10-5 whose two return legs never registered came back as a completed drill carrying a single
split. The arithmetic was self-consistent -- distance only summed the legs actually detected, so
the speed was right for the ground covered -- but nothing said it was a fraction of the drill.
It now reports how many checkpoints were crossed against how many the drill defines.

### The scale-free path was saving zeros

Found by re-reading the previous change rather than reported. The scale-free save inherited the
empty-metrics zeros for velocity, range of motion and drift, so a bench set showed 0 m/s and 0cm
rather than a blank. Zero is a different lie from absent: a chart plots it and a coach reads it.
Those fields are now explicitly null, which meant widening four types and teaching the
range-of-motion check that "no scale" means "no judgment" rather than "impossible".

### Reported but not confirmed

Worth recording so nobody re-investigates them from scratch:

- **A sprint drill terminating after its first leg.** The claim was that the dialog runs crossing
  detection per frame and finishes on the first non-null result. It does not: detection runs once,
  after recording stops, over the complete point array. The related real problem was the missing
  completeness check, fixed above.
- **Kettlebell speed clamped to the ceiling on garbage input.** Real, but not a kettlebell bug:
  bar tracking's own `robustPeakSpeed` does the same thing deliberately, and the two agree. It is
  a shared design decision worth revisiting on its own terms -- reporting the ceiling as though it
  were a measurement is still questionable -- not a defect in one module.

### Still open, ranked

Not fixed here, in the order they are worth taking:

1. **Mixed coordinate systems between the 2D and 3D pose bridges.** The 2D bridge is image-space
   with a negated y and a scale factor applied; the 3D bridge is metres in a hip-relative frame
   with Vision's own y sign. The native plugin runs the 3D request on a stride of 3, so on iOS 17
   every third frame may be in a different origin from its neighbours. If that is real it would
   corrupt jump height, kettlebell speed and swing tempo. It needs verifying against a real
   device capture before anything is changed, because the fix is large and the failure is silent.
2. **Anisotropic pixels-per-metre in the implement tracker.** Shoulder span is measured with x and
   y scaled by different frame dimensions, then used to convert vertical offsets. If correct, bar
   range of motion is off by the frame aspect ratio whenever the object tracker contributes.
3. **The trust score can report 100 on a capture of someone standing still.** Nothing in it asks
   whether any rotation actually occurred.
4. **`armSlot` ignores depth**, so a genuine sidearm filmed from front or behind reads as 86
   degrees, "overhand", with no angle gate.
5. **The plate detector class is unreachable.** No call site can request it, though the training
   notes suggest it is one of the healthier classes in the shipped model -- healthier than the
   barbell and dumbbell classes the app does wire up.

## Three fixes from the audit's open list (2026-09-05)

### The two pose bridges really were in different coordinate spaces

I hedged on this in the notes above, saying it needed a device capture before anyone touched it.
That was half right and I should have gone and read it. Whether the spaces differ is settled by
reading; only how OFTEN the 3D path fires needs a device, and if the spaces differ the fix is
needed either way.

They differ, and the code says so itself. `visionJointsToWorldLandmarks` returns absolute
image-space pixels with the vertical axis negated. `visionBody3DToWorldLandmarks` returns metres
relative to the skeleton's root joint, the centre of the hip, per Apple's own convention -- the
native plugin's comment on `.position` states it outright. Every trace-building dialog picked
between them per frame with `body3D ?? 2D`, and the plugin runs the 3D request on a stride of 3.

A squat is close to the worst case: the bar rides the shoulders, which ride the hips, so in a
hip-anchored frame the wrist barely moves while its absolute height changes by half a metre. The
trace picked up a sawtooth at a third of the frame rate with an amplitude near the athlete's own
hip height. The implausible-velocity filter would then have discarded those frames and counted
each one as a tracking glitch.

The original comment at those call sites addressed the units and was right about them. The origin
is what was missed, and no sign correction fixes it. Six trace-building dialogs now use the
absolute 2D path consistently. Two single-frame posture captures still prefer 3D, correctly: a
hip-relative frame is fine for an angle or a ratio measured within one frame, and invalid only
for anything compared across frames. That rule now lives in the bridge's own comment.

Recovering the depth properly means re-basing the 3D landmarks onto the hip's absolute position
from the 2D bridge on the same frame. Worth doing, not done here: Vision's 3D vertical sign has
to be confirmed against a real capture first, and guessing it would replace a visible sawtooth
with a quiet inversion.

### Pixels per metre, and a correction to the audit

The reported finding was that `shoulderPixelsPerMeter` mixes axes and corrupts every vertical
distance the implement tracker contributes. That is wrong, and worth writing down so nobody
"fixes" working code. Normalized landmarks are normalized per axis, so multiplying x by width and
y by height recovers true pixels; the internal call site passes the real working dimensions and
is correct.

One caller was not. The web-detector seeding passed 1x1, asking for normalized-units-per-metre,
and its comment argued the scale works out the same either way. It does not: one x-unit spans the
frame's width and one y-unit its height. Shoulders are near-horizontal in every lift, so the
measured scale was effectively x-units-per-metre, and using it on the detection box's VERTICAL
offset understated that offset by the aspect ratio -- about 44% short on portrait video, on the
axis the bar actually travels. It now asks for true pixels per metre and converts both offsets in
true pixels.

### The plate detector is switched on for the lifts that have no scale

`plateScaleFromFrames` was fully built and had never once run, because nothing ever set the
tracking mode to "plate". The reference plate's measured diameter, the larger-axis rule for a
foreshortened plate, the averaging against a height-derived scale -- all of it was already there
waiting for a caller.

Any lift whose posture rules out height calibration now asks for the plate class. Those are
exactly the lifts with no scale at all, a barbell lift done lying down has loaded plates square
in frame, and the equipment classes cost nothing to give up: the shipped model regressed barbell
to about 0.02 and dumbbell to about 0.14 confidence, both far under the gate, while the plate
class came through that same retrain intact.

A plate box is a scale reference, not a second opinion on where the grip is, so it is deliberately
excluded from the position corroboration. That path rewards a detection near the fused point and
penalises a confident one further than half a metre away, and on a bench press the inner plate
legitimately sits about that far from the hands -- it would have docked confidence on every frame
for the plate being exactly where a plate belongs.

Held loosely, and instrumented to stay that way. The scale's source -- height, plate, or both
averaged -- is now recorded in the capture diagnostics, so the first numbers a plate produces are
attributable rather than blended anonymously into everything else. The plate class's supporting
data is eleven instances from three photos and the training script rebuilds from scratch each
time, so this needs measuring through the replay harness before a plate-derived scale is treated
as settled. It is a candidate for real bench numbers, not a promise of them.

## The squat's agreement with a bar sensor was two errors cancelling (2026-09-21)

Twenty captures exported from the admin report, eight of them back squats at 135 lb x 5,
filmed alongside an OVR bar sensor reading **75.7 cm ROM**. Set-level ROM averaged 75.4 cm.
That looks like a calibrated tracker. It is not, and the way it is wrong matters more than
the number.

**A terminal phantom rep -- the re-rack -- is being counted, and it is large.**

Six of the eight sets counted 6 or 7 reps on a set of 5. In every case the extra rep is the
LAST one, and it is the bar going back into the hooks:

| set | last rep ROM | last rep concentric | the set's real reps |
|---|---|---|---|
| seq10 | 122.6 cm | 7.23 s | ~1.3 s |
| seq11 | 134.2 cm | 2.50 s | ~1.2 s |
| seq15 | 141.2 cm | 6.30 s | ~1.0 s |
| seq12 | 77.8 cm | 5.00 s | ~1.1 s |
| seq16 | 56.8 cm | 3.93 s | ~1.0 s |
| seq4 | 87.3 cm | 1.90 s | ~0.8 s |

**The discriminator is concentric DURATION, not velocity.** An earlier attempt at this gate
used mean-velocity ratios and was reverted, correctly -- instrumented against the miscounting
sets, the edge phases came back at 0.99, 2.02, 1.21, 0.74 with no usable separation. Duration
separates cleanly: every artifact is 2.4x to 6.3x the set's median, and every real rep sits
within +-30% of it. A rule of "the last rep, when its concentric is >=2.5x the median of the
preceding reps OR its ROM is >=1.5x that median" fires on all six artifacts, on no real rep,
and lands five of the six sets on exactly the logged five.

**Then the ROM story inverts.** Drop the phantom and the remaining reps average **69.2 cm,
which is 8.6% UNDER the sensor** (sd 5.3, so the spread is real but not wild). The phantom's
enormous excursion had been dragging the set average UP onto the sensor's number. The tracker
under-reads real ROM by roughly 9% and the miscount was hiding it. Anyone comparing set
averages to a sensor and stopping there will conclude the squat is calibrated; it is the
per-rep numbers that show it is not.

Two sets in the same export are a different failure and should not be pooled with these:
- **seq5** reads 35-41 cm on every rep, about half of everything else -- a scale failure, the
  same class as the bench-press weakness above, not a segmentation one.
- **seq4** (the newest) counts 7, with a LEADING artifact too: rep 1 at 32.3 cm against a
  54 cm median. One instance is not a pattern, and no rule should be written from it yet.

**Bench is worse and has had no attention.** The same export has bench sets of 10 reps
segmenting to 1, 2, 2 and 4. The squat's +1 is a rounding error next to that.


## Bench press, 2026-09-22: segmentation and the shoulder-width ruler

One bench set (135lb x 10) filmed alongside an OVR bar sensor, plus the 19 other stored
captures replayed through `scripts/replay-captures.mjs`. Two separate defects, found because
the sensor gave a number to disagree with.

**Sensor:** 10 reps, mean 0.75 m/s, peak 1.08 m/s, ROM 14.7 in (37.2 cm).
**Forge, before:** 11 reps (device reported 9), ROM 18.9 in, mean 1.09 m/s, peak 1.86 m/s.

1. **A phase several times longer than the set's own reps was counted as a rep.** The un-rack
   and settle ran 6.4 s against a set median concentric of 1.03 s; every genuine rep sat
   between 0.83 s and 1.97 s. The long-duration test already existed but only ran on the FIRST
   and LAST concentric of a set, on the reasoning that a rack artifact can only sit at an edge.
   True of a rack artifact, false of the phenomenon. `isOverlongPhantom` now applies the same
   2.5x ratio mid-set. Across every calibration set no genuine rep exceeded ~1.3x its set's own
   median and the artifacts started at 2.4x, with nothing in between -- which is what makes a
   ratio test safe rather than a judgement call. Replay: bench 11 -> 10, two back squat sets
   6 -> 5, and the known residual phantom on set 11945 (recorded in `walkout-phantom-rep.test.ts`
   as a separate defect) went with it. No set moved the wrong way.

2. **Bench calibrated off SHOULDER WIDTH, and a supine athlete's shoulders point at the lens.**
   The take's only scale candidate was `shoulder_width` at 0.004981 m/unit; the same phone's
   squats, which calibrate off standing height, sat at 0.0035-0.0042. Dividing a real breadth
   by a foreshortened pixel span inflates metres-per-pixel and with it every distance and
   velocity in the take -- the 41% ROM error, and a velocity error LARGER than the ROM error
   because peak is additionally picked off single-frame jumps (see below). The existing guard
   leans on Vision's z, the least trustworthy axis it produces, and did not separate a supine
   torso at all. The torso's ORIENTATION needs no z: standing, shoulders-to-hips is near
   vertical in the image; lying down it is near horizontal. A torso nearer horizontal than
   vertical now refuses the frame.

**Still open, deliberately not guessed at:**

- **Peak velocity is picked off unsmoothed frame-to-frame jumps.** Even after the scale fix the
  peak error exceeds the ROM error (1.73x vs 1.29x on this set), and rep 1's curve carries a
  lone 3.00 m/s sample between neighbours of 2.36 and 2.61. That is a separate fix and needs
  its own evidence.
- **There is no bench ruler yet.** With shoulder width refused, a side-on bench has no scale
  source at all and takes the scale-free path. The plate candidate is the obvious ruler for it
  and is currently only produced on squats. Until then bench reports shape, not distance.
- **The Sept 8 bench sets had NO scale candidate** (`scaleSource: null`, fallback 0.00068 to
  0.0012 m/unit, ~4x too small) which is what produced the 7-9 cm ROMs and 19-second
  "concentrics" recorded earlier in this file. Same root area, not the same bug.
- **Box jump rep counts were untouched** by either fix and remain 4-9 against a logged 5.
  Different tracker (`jump-tracking.ts`), different work.

## Bench calibration, build 515: what the second set settled

Two bench sets of 10 at 135lb, same session, same camera position, both against an OVR bar
sensor. Set 1 was filmed on build 512, set 2 on 515.

**The segmentation fix works.** Set 2 found 10 reps against 10 logged. Set 1, replayed, went
11 -> 10. Nothing else moved.

**The shoulder-width ruler is not a ruler, and now there is proof rather than geometry.** The
same athlete's shoulders measured 88.0px on set 1 and 115.3px on set 2, minutes apart, with the
camera untouched: a 31% spread. The scales that came out were 0.004981 and 0.003799 m/unit,
against 0.0035-0.0042 for the same phone's squats. Set 2's ROM landed 10% over the sensor and
set 1's 41% over -- the closeness of set 2 is the ruler being wrong by less, not being right.

**The geometric refusal shipped in 515 and refused nothing.** It read the torso's orientation
out of `worldLandmarks`, which are body-centred, so a supine athlete's torso is "vertical" in
them exactly like a standing one's. Replaced with a refusal by POSTURE: `postureForExercise`
already says a bench press is filmed lying, it is known before a frame is read, and it cannot
be defeated by which landmark space the caller passes.

**The plate window is NOT too tight -- the bench plate read is junk.** This was the open
question the instrumentation was added for, and the number settles it: the detector boxed
582.8 x 567.4px at aspect 1.03, centred at (0.43, 0.46), against a grip span of 129.5px --
a ratio of 4.51 where a real plate on the same bar lands between 0.56 and 1.6. Taken as a
45cm plate it implies 0.00077 m/unit, five times smaller than any other source, which would
have put this set's ROM at about 8cm. `plateReadIsPlausibleAgainstGrip` rejected it correctly.
Do not widen that window; the work is in the detector.

**The per-rep numbers are noise even when the set mean is not.** Set 2's per-rep excursions ran
22.0, 31.3, 22.6, 50.1, 59.4, 56.1, 94.5, 29.2, 25.7cm against the sensor's 14.6-17.3in
(37-44cm) -- one rep at 94.5cm is more than double the next. The mean of 42.9cm sitting 10%
off the sensor's 39.0cm is two large errors cancelling, not a measurement. Peak velocity runs
0.33 to 2.93 m/s within one set where the sensor reads 0.92 to 1.12. **Any future scale work is
worthless until the trace itself is stable**: a correct metres-per-pixel applied to this trace
produces correctly-scaled noise.

That is the next piece of work, and it is a trace problem rather than a calibration one.

## Back squat against OVR, 2026-09-28: three separate errors, each with its own piece of code

Scott filmed a 135lb x 5 back squat beside an OVR bar sensor and exported the last twenty
captures (`/api/admin/tracking-report/captures/recent`). Sensor: 0.79 m/s mean, 1.22 m/s peak,
29.2in (74cm) range, five reps. Forge: 0.34 mean, 1.07 peak, 60cm, four reps. Those are THREE
errors, not one, and the export separates them. Recorded here so the next person knows which
file to open for which symptom.

**Mean velocity (0.34 vs 0.79) -- `trimPhaseToTravel` in `client/src/lib/bar-tracking.ts`.**
The concentric window used to start on speed: the first sample above a tenth of the phase's
peak. Every rep's stored curve shows the same shape at the bottom -- the bar wobbles up 1.7cm at
0.13-0.16 m/s, sinks back to 1cm, sits for half a second, then drives. The speed trim started
the clock on the wobble and counted the sit as lifting (1.4s of "concentric" for a 0.9s lift).
The window is now anchored on the peak and walks back to the last sample within 1cm of the
bottom, forward to the first within 1cm of the top. On rep 1 that lands on the same 0.9s the
sensor used. The centimetre was fitted to two sensor sets at once -- the squat above and the
bench fixture in `overlong-phantom-rep.test.ts` (sensor 0.75) -- and a share of range (1.8cm)
misses both. `concentric-window-matches-sensor.test.ts` walks that real rep through it.
Mean is now RANGE OVER THAT WINDOW, a sensor's definition, instead of the sample mean of
smoothed speeds; the two agree only when nothing in the window is slow.

**Peak (1.07 vs 1.22) and range (60 vs 74cm) -- the SCALE, `client/src/lib/pose-tracking.ts`.**
Both are 19% low, which is one number: the metres-per-pixel for this take. The scale came from
the height ruler (shoulder-to-ankle span against a fraction of the athlete's height) and was
correct on 2026-09-14 (73.6 vs 74.2cm, same athlete, same load) and 19% short today. The plate
was rejected correctly (it measured 494px against a 263px grip -- the detector locked onto
something 1.9 grips wide, not a plate). The shoulder-width ruler read 1.36x the height ruler;
on 09-14 it read 1.25-1.42x and the height ruler was right, so a blend is not the answer either.
What is different today is the camera geometry ("camera was angled" on every rep's trust note).
NOT FIXED. The candidate fix is a ruler at the bar's own height that assumes nothing about the
athlete: a plate the detector actually locks, or a measured shoulder width stored on the athlete
once. Do not "calibrate" this with a constant from one set.

**Rep count (4 vs 5) -- the edge filters in `summarizeTrackedSet`, same file.** The last
concentric of a set is tested for being a re-rack: too short, too slow, or too LONG (over 2.5x
the median moving duration). With the speed trim, a final rep followed by walking the bar into
the hooks could stay "moving" through the walk (a walk is faster than a tenth of a squat's
peak), read as one long phase and be dropped. The travel window ends when the bar reaches the
top, so the walk is outside it. Unverified on the export (the trace is not stored), so if the
next five-rep set still reports four, the rep-level `jumpEvents`-style log is the next thing to
add for lifts.

**Box jump (2 of 5) -- `summarizeJumpSet` in `client/src/lib/jump-tracking.ts`.** The state
machine has four ways to decline a candidate jump (dismount, a settle point floating above the
box, the recovery valve, a flight over 1.2s) and every one of them was a silent `continue`.
Every decision is now logged into `trackingDiagnostics.jumpEvents` with its time and the number
that decided it, on the no-rep path too. The next set answers this itself.

**The bench fixture was right by accident.** `overlong-phantom-rep.test.ts` pinned ten reps to
match the sensor. Rep by rep the ten were the un-rack (a 0.13s "concentric" at 2.1-4.0s, seven
seconds before the set) plus nine real reps, with the tenth real rep inside a 1.1s hole in the
trace at 18.4-19.5s where the tracker lost the bar. The travel window drops the un-rack; the
count is nine; the test now says so and why.

**What the diagnostics export now carries, and which code writes each field.**
- `recording.liveAttempted / liveFallbackReason / liveCoverage / liveDropRate` --
  `AvBodyTrackingPlugin.swift`, `liveAnalysisResult` and the file path's result. Why a take was
  analysed after the fact instead of during it. All twenty captures in the 09-28 export were
  "file"; none said why.
- `recording.analysisPath` -- which feeder produced the trace ("live" or "file").
- `jumpEvents[]` -- `jump-tracking.ts`, the state machine's decisions in take order.
- `repBreakdown[].concentricSeconds / meanVelocityMps` -- now the travel window and range over
  it (`bar-tracking.ts`, `trimPhaseToTravel` and the `phaseStats` block).
- The upload copy's presence is in the native diagnostic log ("upload copy: ... MB"), not the
  export: it is about the save, not the measurement.

### Same day, two additions queued for the next calibration build

Scott, after the OVR set: "For the barbell back squat let's track the bar too and the plates,
will only help boost accuracy on faulty body detectors", and "can the floor be detected? Would
that matter? Would it boost confidence?" Both held from shipping on his instruction: "queue them
so we can upload them with next camera calibration."

**The equipment votes on bar position -- `client/src/lib/equipment-bar-point.ts`, wired into
the per-frame loop of `av-bar-tracker-dialog.tsx`.** A barbell lift already asked the detector
for the plate (bar as the second class), but the boxes only ever set scale; the bar's position
came from the wrists and the motion-diff tracker alone, so a frame where the body tracker lost
a wrist produced no point. Now the bar box (preferred) or the plate box (fallback -- a plate on
the bar sits at bar height) fills exactly those frames, and only those. It earns the vote by
agreeing with the hands: the box-to-hands offset is learned on every frame that has both, and
the box may substitute only after `MIN_EQUIPMENT_AGREEMENT_FRAMES` of them whose spread
(median absolute deviation) is under `MAX_EQUIPMENT_OFFSET_SPREAD_GRIPS` of the athlete's grip
width. A lock on a rack plate never agrees with the hands for long and never votes. The
substituted point goes through the same `isPlausibleVelocity` gate as a hand-built one. On the
09-28 squat the plate lock was on the wrong object (494px against a 263px grip), so this would
not have fired there; the diagnostics say when it does:
- `trace.barPointFromEquipment` / `barPointFromEquipmentRejected` -- frames filled, and offered
  but refused by the speed gate.
- `trace.equipmentVoteLabel`, `equipmentAgreementFrames`, `equipmentOffsetSpreadGrips` -- which
  class earned the vote, on how many frames, and how far the agreement wandered. The spread is
  the number to revise the 0.25-grip threshold from.
Both thresholds are admitted guesses. Blending the equipment into frames the hands answered
was considered and not done: it would change the number on every calibrated take to fix the
frames on a few.

**Camera tilt, not floor detection -- `startGravitySampling` in `AvBodyTrackingPlugin.swift`.**
Vision has no floor detector and a floor line carries no scale, so it could not have fixed the
19%. What the floor would have said -- how the phone was pointed -- the accelerometer says
directly. CoreMotion's gravity vector is sampled five times a second for the length of the
recording and the median lands in `recording.cameraPitchDeg` (positive when the lens tilts
down toward the floor), `cameraRollDeg` (sideways lean) and `cameraTiltSamples`. Nothing is
corrected yet. Every rep of the 09-28 squat said "camera was angled" and no number said how
much; the next set will, and if the height ruler's error tracks the pitch, the correction is
`cos(pitch)` on the vertical span and belongs in `pose-tracking.ts` beside the height ruler.

## Build 553 on the phone, 2026-09-28 afternoon: what the second session found

Scott filmed set 2 of the same 135lb x 5 squat and a box jump on build 553 (the concentric
window fix), beside OVR. Sensor set 2: 0.91 m/s mean (0.87 / 0.93 / 0.94 / 0.91 / 0.94), 1.42
peak, 29.3in range. Forge on screen: 0.74 avg, five reps found (the edge-filter fix worked).
The capture never reached the server (see the save chain below), so the comparison is from the
screen only. Everything here shipped together on the next `beta`, with the two items queued
above (the equipment vote, the camera tilt).

**Every save after the first was refused, and the day was then deleted from the queue --
`workout.tsx` (the save's catch block) and `offline-queue.ts` (`runFlush`).** The debug
console: 57:09 save ok; 57:16 save fails "Load failed" (a transport error -- the request had
landed, the response had not); every save from then on gets 409 "updated somewhere else",
because the page still claimed the revision from before the lost one. Each 409 was queued;
Scott signed in as admin; the flush replayed the athlete's day under the admin session, got
403, and DROPPED it with "open that day and re-enter it". Two camera sets exist on the phone's
screen only. Fixes: (1) a 409 after a lost response re-reads the day, and when the stored
revision is exactly one ahead, adopts it and re-sends -- the day moved because of us; anything
else still reloads. (2) A 403 in the flush never deletes an entry; it waits for the account
that owns it. The owner stamp is null on an entry queued before the session resolved, which is
how it flushed under the wrong account at all.

**"Finishing" took twenty seconds -- `liveAnalysisResult` and the file re-read.** The live
trace was attempted on both takes and thrown out: coverage 0.37 and 0.46, drop rate 2.5 and
2.2 (the camera hands Vision two and a half frames for every one it finishes). So the whole
clip was re-read after Stop, which is the wait. On the 30s squat the file read was 33.6s, of
which the 3D body pose was 5.6s and hand pose 8.5s. The 3D pass is now OFF for the bar and
jump trackers (`body3D: false` at Record and at Stop, both feeders, same measurement), which
takes a sixth off the file read and helps live coverage by about the same. NOT ENOUGH ON ITS
OWN: the live path still hands Vision full 1920x1080 buffers where the file path decodes at
1280, and that is the next thing to change (`captureOutput` -> a scaled pixel buffer before
`processFrame`). The coverage numbers above are the target to beat: 0.9 keeps the trace.

**"Couldn't get a clean read" on the box jump -- `summarizeJumpSet`, `bestEffortJump`.** Rule
#1, and it fired anyway: the state machine declined every candidate (now logged in
`jumpEvents`) and the dialog reported nothing. There is now no null return for a trace with
samples in it: the best-effort read is the highest the ankle rose above standing, with the
flight around that peak if the trace shows one, flagged `bestEffort` on the rep and the set and
said so in the toast. `likelyTrackingGlitch` is set so it never becomes a PR.

**The torso-stillness check was deleting the bottom of the squat -- `torsoWasAtRest`.** The
export said the squat's torso was "still" (spread 0.093 grips) and 94 frames were rejected as
jumped pose. A squat set is mostly standing, so the median frame IS standing and the MAD is
small; the frames furthest from it are the bottom of every rep. Two rules now, either
disqualifies: a run of `TORSO_EXCURSION_MIN_FRAMES` (15) consecutive anchors more than half a
grip from the median is a lift, not a glitch; and a movement type that squats, hinges, lunges,
jumps or carries never gets the check. `torsoLongestExcursionFrames` is in the trace
diagnostics. This is a candidate for some of the "19% low" range, on top of the scale.

**The plate lock was on something 1.9 grips wide -- `candidateBoxIsUsable`
(`maxPlateSizeInYardsticks`) and `referenceObjectVerdict` (`MAX_PLATE_SIZE_IN_YARDSTICKS`).**
A plate is a 45cm disc and every barbell grip is wider, so a "plate" wider than a grip and a
quarter is filtered BEFORE the pick natively and refused as a scale ruler on the client. Both
1.25, pinned by `tracker-arbiter.test.ts`.

**The jump's own gravity ruler now corrects the jump -- `applyGravityCorrection`.** The box
jump reported 50.8cm from the height ruler while its own flight-time check said the scale was
45% out (uncertainty 0.125). When the verdict is under `GRAVITY_CORRECTION_MAX_UNCERTAINTY`
(0.2) and more than 5% from 1.0, every scaled number on the set is divided by the ratio and the
heights rebuilt from flight time; `uncorrectedJumpHeightCm` stays on the rep and
`gravity.applied` in the diagnostics says it happened.

**Box-jump contact is a reset -- `groundContactIsBoxReset`.** 2.7s of "ground contact" was
the step-down. The set-level average and the RSI are withheld as not applicable on a box jump;
per-rep times stay on `repBreakdown`.

### Build 554 beside OVR, same afternoon: the range gap closed, the jump gate found

Squat set 3, OVR: 0.95 mean (0.95 / 0.99 / 0.99 / 0.94 / 0.91), 1.47 peak (1.53 / 1.58 / 1.49 /
1.43 / 1.32), 29.2in. Forge 554: 0.75 mean, 1.66 peak, 28.2in (71.7cm), five reps, the first
flagged "tracking briefly lost" (a 2.07s hole; rep 1 runs 1.07s to 7.47s and includes the
walk-out). Reps 2-5: means 0.83 / 0.81 / 0.87 / 0.81, peaks 1.66 / 1.65 / 1.66 / 1.63.

- **Range is within 3.4% now** (was 19% low). `torsoJumpRejections` 0, `torsoStillThisTake`
  false, `torsoLongestExcursionFrames` 92 -- the torso fix did it. BUT the scale was "both":
  the height ruler alone (0.00325) would have read 64.6cm (13% low) and the shoulder ruler
  alone (0.00397) 78.9cm (6% high); the average landed near the sensor. Two rulers 22% apart
  agreeing by averaging is not a calibrated scale. Camera pitch was 14.6 degrees down on both
  takes (`recording.cameraPitchDeg`, first time recorded); it does NOT explain the height
  ruler's shortfall by simple foreshortening, because the bar travels in the same plane as the
  athlete and the ratio cancels. Still open.
- **Peak is now 13% HIGH** (1.66 vs 1.47) with range 3% low, so it is not scale: it is the
  derivative. With the bottom of the rep no longer deleted the smoothed speed overshoots at the
  drive. Sensor peaks fall across the set (1.58 -> 1.32); Forge's are flat. Next: compare
  `robustPeakSpeed` and the 165ms smoothing against the sensor's rep-by-rep peaks
  (`bar-tracking.ts`).
- **Mean is 13% low on the clean reps** (0.83 vs 0.96): Forge's concentric window is 0.87-0.93s
  for 70cm where the sensor's implied window is about 0.76s. The 1cm travel margin
  (`TRAVEL_ONSET_MARGIN_M`) is wider than the sensor's; a share of a centimetre less is the next
  thing to fit, on this take plus the 09-28 morning one.
- **The plate size gate worked**: the lock at (0.82, 0.16) -- top-right, the rack -- measured
  1.28 grips and was refused as `too_large_for_a_plate`; scale never touched it.
- **"Finishing" of 31s is the file re-read**: analysis 39.4s for a 27.5s clip, live coverage
  0.34 (worse than the morning's 0.37). Hand pose was 11.3s of the 39.4. body3D was 0 (off).
  The jump's hand pose was 7.2 of 16.5s and a jump never reads a hand: hand pose is now
  opt-out per take like body3D, and the jump turns it off on both feeders. The bar tracker
  keeps it. The live path still hands Vision full-size buffers; scaling them is the next
  change for live coverage.
- **The jump gate that declined every landing -- `boxTopWorldY` in `av-jump-tracker-dialog.tsx`.**
  Set 2's `jumpEvents`: takeoff, then `floating_above_box` on every settle, recovery valve,
  again, `flight_too_long`, dismount. The box top the gate used was the TYPED height (24in)
  at the take's scale, 187px above the floor; the detector's box implied a 23-inch athlete,
  i.e. a rectangle three times the size. Nobody checked they agreed, and every real landing on
  the box sat well above the typed line. The gate and the clearance now get a box top only
  when the two reads agree within `BOX_TOP_AGREEMENT_FRACTION` (25%) of the box height; both
  reads and the verdict are in `calibration.boxTopFromHeightM / boxTopFromDetectorM /
  boxTopCorroborated`. The 3.5cm best-effort read that came back is Rule #1 working: a wrong
  number that carried the events that found this.
- `baseline_reanchored -127cm` at 3.07s on the jump is unexplained: the standing ankle height
  moved 1.27m at the take's scale. Watch for it on the next set.
- The debug console now survives a force close (`client/src/lib/debug-console.ts`,
  localStorage, 400 lines, marked "app relaunched").

### Build 555 beside OVR: the head-on squat, and the box as a ruler

Squat (Scott's set 1 on 555, OVR set 4): sensor 0.84 mean, 1.24 peak, 29.6in. Forge 0.27 mean,
0.71 peak, 9.1in (23cm), five reps. Camera pitch 5.3 degrees -- a different placement from the
earlier 14.6, and the on-screen note said "filmed head-on or from behind".

**The bar point was not on the bar -- `bar-on-back.ts`, wired into `av-bar-tracker-dialog.tsx`.**
The stored trace moves about 20cm per rep (per-second y ranges -38 to -17cm) where set 3's
moves 73. Every frame had a body and both wrists at 0.8 confidence, no torso rejections, no
velocity rejections: the tracker was confident and wrong. On a back squat filmed from the
front the wrists are BEHIND THE HEAD, Vision places them near the shoulders, and they barely
move. The plate was edge-on (941 candidates, 404 refused by size, 537 by confidence, no lock),
so the equipment vote had nothing to vote with. The shoulders never lost the bar, because the
bar sits on them. On lifts named as bar-on-back (back squat, high/low bar, box, pause, tempo
squat, good morning, split squat, lunge, step-up; never front, overhead, zercher, press,
thruster, SSB, goblet, landmine) the combined bar point is now the shoulder midpoint, in the
same world space, before the speed gate. The hands still supply grip width (overwatch's
yardstick), tilt and the half-span. `trace.barWitness` says which ran and
`barPointFromShoulders` how often. This is the body tracker doing its own job; the change is
which joint is asked.

**The box is a ruler -- `applyBoxRiseCorrection` in `jump-tracking.ts`.** Scott: "Be mindful, I
am jumping to a 24 inch box." Jump set 3's box reps rose 73-77cm onto a 61cm box: the take's
scale was 1.26x. Gravity cannot rule a box set (no flat rep), but the typed box height is a
distance the ankle MUST rise by on every box rep, and the median rise over the box reps
divided by it is the scale error. Applied when at least two reps rose past half the box and
the ratio is more than 5% from 1.0; `boxRise` in the diagnostics carries ratio, reps and
whether it applied. The four box reps corrected to 61cm; the two 4-6cm "reps" between them
are the step-downs read as tiny hops (the yellow 14.6in and 18.6in chips), and are the next
thing to name in the events.

**Takeoff velocity is on the rep -- `JumpRep.takeoffVelocityMps`, chips in `workout.tsx`.**
Scott: "I'm looking for velocity and velocity stops when I land." It was computed and thrown
away after becoming a height. Re-derived after any scale correction.

**The gate fix worked.** Set 3's events: takeoff / rep on every box rep, no `floating_above_box`
(the detector's box top read 1.54m above the floor against the typed 0.61; `boxTopCorroborated`
false, gate off). `flight_too_long` twice at 1.6-1.8s are the step-down-and-reset stretches.

**Saves: every one landed first time** (3.5-4.2s for 4-5MB, no 409). The "ran out of offline
storage" toast came from the page's UNMOUNT re-queue, which queued the whole 5MB day on
navigating to /login although every save had synced; it then replayed under the admin session
(403, kept now, not dropped). `dirtySinceSyncRef` in `workout.tsx`: the unmount queues only
when something changed since a save reached the server. The 5MB localStorage ceiling for a
genuinely offline tracked day is still real and the queue should move to the Filesystem store
the video queue uses; not done here.

**Live coverage with hand pose off: 0.68 on the jump** (was 0.46), still 0.33 on the squat with
hand pose on. Scaling the live buffers remains the next native change.

### Build 556, same evening: the replay harness could not reproduce the device

Trying to fit the squat's peak overshoot and window margin offline, the harness ran set 3's
own stored trace and got means of 1.07-1.16 and peaks of 1.9 where the device had reported
0.83 and 1.66. Two causes, both closed: stored trace points carried no confidence (the device
filters samples under `MIN_TRACKING_CONFIDENCE` in `robustPeakSpeed`; the harness read every
point at 1), and the harness measured along the vertical where the device measured along the
grip axis and applied the movement profile's position scale correction. `PathTracePoint.c`,
`calibration.movementAxis` and `calibration.positionScaleCorrection` now travel with every
capture and `capture-replay.ts` reads them. Traces from before this build stay unreplayable
for calibration purposes; the fit waits for the first export after it. No constant was moved.

Hand pose is off for the bar tracker too (see the comment at the Stop call): the jump with it
off finished in 4 seconds on 556, the squat with it on took 30.

### The squat fit, 2026-09-28 evening: what moved, what did not, and why

Three OVR-paired back squats now exist with per-rep sensor numbers (morning set 1; 555 set 3;
556 set 2 = OVR set 5, shoulders as witness). Scott: "The goal is to get to 0% difference and
90+% confidence." What the fit found, so nobody re-derives it:

**Scale -- `reconcileScaleEstimates`, the body-pair blend. MOVED.** Height alone read 6%, 13%
and 19% low on the three sets; shoulder breadth alone 6-17% high; the mean of the two within 5%
on all three. The old rule averaged them only inside an agreement tolerance, so on two of three
it kept height alone. Now: when height and shoulder breadth are the ONLY rulers, they are
averaged whatever their disagreement, reported as `blended`, never as corroborated. A plate, a
measured grip or a learned bone still wins the cluster. Both rulers are population guesses;
the way to 0% on range and mean is a real ruler (a tape-measured grip typed once), not a
better blend.

**Peak -- NOT MOVED, and the reason is the finding.** Eight clean reps: Forge reads 11% high with
8% scatter. Extra smoothing lowers the mean ratio without touching the scatter (k=9 samples,
half a second, to reach 1.0) and a plateau rule (mean of k consecutive samples) does the same
-- so the overshoot is not the derivative and no constant fits it. The ratios CLIMB within each
set: 1.01 / 1.04 / 1.06 / 1.24 and 1.06 / 1.11 / 1.16 / 1.25. The sensor's peaks fall about 15%
from rep 2 to rep 5 (fatigue at RPE 8); Forge's stay flat. The means show the same. Raw secant
speeds over the stored SHOULDER trace (set 5) peak 1.34 / 1.41 / 1.32 / 1.31 against the
sensor's 1.51 / 1.47 / 1.42 / 1.27: flat in the trace itself, so it is Vision's joint
positions, not our maths. Range per rep is flat on both sides, so it is not scale drift. Next
test: sensor on the bar, Forge from the side, and a rep-by-rep look at the clip; candidates are
bar tilt ("~9 degrees toward the right arm", so the sensor's end of the bar moves differently
from the middle), or the shoulder joint sliding on the bar as the athlete tires.

**Window -- right on the shoulder set.** Set 5 concentrics 0.80-0.83s against the sensor's
implied 0.74-0.86s; the earlier 13% mean shortfall on the hands sets was the window, on the
shoulders set it is scale. Not moved.

**90% confidence** is a dataset problem: every trust threshold is an admitted guess and needs
about twenty sensor-paired sets across angles to calibrate. A week of sessions, not a change.

## Bench at an angle, 2026-09-29: three reps out of ten, and it was never the scale

Build 560, 135lb x 10, OVR beside it, phone on a rack post about 45 degrees off the foot of
the bench. The device reported THREE reps, a 116cm range of motion, a 0.87 mean and a 1.95
peak, and raised the scale-suspect banner telling Scott to film square to the side. The
sensor read ten reps, 0.70 mean, 1.01 peak, 14.4in (36.6cm). The stored trace is
`client/src/lib/__fixtures__/bench-oblique-2026-09-29.json` and the sensor rows are
`OVR_BENCH_OBLIQUE_2026_09_29` in `tracker-ground-truth.ts`.

**What went wrong, by piece of code:**

- **`segmentPhasesRelative` picked the setup as the typical rep.** The wrists were tracked
  from the walk-in, so the take's largest reversals were lying down onto the bench (153cm),
  the un-rack (120, 112, 192cm) and the re-rack (67, 80cm). Four of those cleared the 0.5 cut
  of `LARGE_REVERSAL_FRACTIONS_OF_MAX`, which is at least `MIN_REVERSALS_FOR_RELATIVE_GATE`,
  so "typical" came out at 136cm and the gate at 54cm. Twenty-three real presses at 26 to
  49cm fell under it. The three "reps" reported were lying down, a merge of the whole set,
  and standing up. The 116cm range of motion was the athlete's torso, not the bar.
- **`implausibleRangeOfMotion` then blamed the scale, and the banner blamed the angle.** The
  scale was within 10% (below). A rep-splitting fault produced a number the plausibility
  check could only read as a scale fault, and the copy on it told the athlete where to stand.
  That copy is gone (Rule #1 in CLAUDE.md now says so); the outcome still lands in the
  diagnostics as `scale_suspect` for this report.

**What changed, both in `bar-tracking.ts`:**

- **The athlete's rep count chooses among the gates the trace proposes.** `summarizeTrackedSet`
  takes `expectedReps` (the set's prescribed reps from the dialog, `loggedReps` in the replay
  harness). `relativeGateCandidates` lists every cut on the ladder plus a 0.2 and a 0.15 cut,
  the WHOLE extraction runs at each, and the gate whose final rep count lands nearest the
  athlete's number wins, ties to the strictest. The count is compared after the phantom
  filters, because a gate's raw phase count is not its rep count once the walk-in is split
  off. The athlete's number cannot invent a rep; it picks between answers the trace already
  gave. On this take the 0.2 cut (gate 20.8cm) found the ten presses at 9.7 to 21.0s.
- **A run of reps standing apart from the set is a rack move** (`isolatedRackMoves`). At that
  gate three phases survived every shape test: lying down (50cm, fast), the un-rack (21cm) and
  the re-rack (52cm, fast). Not short, not slow, not twice the median, and only two of them at
  an edge. What they share is isolation: a phase the shape tests threw out sits between each
  of them and the set. The surviving concentrics are grouped into runs; the largest run is
  the set; a run a quarter of its size or smaller goes. Two equal runs (a grip adjustment
  mid-set) are both kept.

**Replayed after the change** (`bench-oblique-rack-moves.test.ts` pins it):

| | sensor | device, build 560 | replayed |
|---|---|---|---|
| reps | 10 | 3 | 10 |
| range of motion | 36.6cm | 116.3 | 32.9 (per rep 22 to 52) |
| mean velocity | 0.70 | 0.87 | 0.58 |
| peak velocity | 1.01 | 1.95 | 1.63 (per rep 0.15 to 1.63) |

**What is still wrong, and whose it is:**

- **The per-rep spread is the tracker's, not the ruler's.** Range of motion per rep ran 22 to
  52cm against the sensor's 34 to 42, and per-rep peaks ran 0.15 to 1.63 against 0.94 to 1.12.
  The set median (32.9cm, 0.58 m/s) is within 10 to 17% of the sensor, so the shoulder-width
  scale (`shoulderWidthScaleFromFrames`, 98.9px, 0.00443 m/px) is roughly right at this angle.
  The noise is in the bar point: 252 of 548 usable frames carried a lone hand
  (`barPointFromLoneHandCarried`) and the point flipped sides 92 times
  (`barPointSideFlipped`). No constant was moved on the strength of this take; a scale fit
  from a trace this noisy would fit the noise.
- **The plate detector saw nothing.** `framesWithCoreMlImplement` 0, best candidate confidence
  0.34 against the gate, on a take where two bumper plates are in plain view. That is the
  ruler this lift wants (the shoulder one carries a tenth of uncertainty by construction) and
  it never voted. Open.
- **The 16:9 frame.** `activeFormat` read "16:9 fallback" because the format choice ranked
  120fps above the 4:3 shape; fixed in the same change (shape before rate,
  `applyHighestFrameRate`), so the next take has a third more picture down each side.
- **The two 09-28 bench sets** (seq 8 and 9 in the same export) replay to ten reps each now,
  but set 2's ten include fragments under 11cm; that trace has a 1.1s hole and the same lone-
  hand problem. Not fitted.
- **Peak velocity on the squats** is unchanged from the 09-28 evening fit: 11% high with the
  within-set drift, still Vision's positions, still open.

**Next filmed session:** three sets of five, one triple, one single, all with the sensor, any
angle. The single and the triple are the cases the rep count cannot help with (two runs of
one look identical), so they test the shape filters on their own.

## Rulers the camera finds by itself, 2026-09-29 afternoon

Scott: "I'm not measuring anything the camera should know. Everything should be remote." And:
"The camera has a 3d scanner and should be able to measure real world accurately based off of
the data I've uploaded, and the known height of the athlete." Then, on the plate: "the plate is
in there but it's distorted, again camera system should register that. Plate doesn't magically
change size at a different angle."

**The 3D skeleton is a ruler now** (`client/src/lib/body-3d-ruler.ts`, source `body_3d`).
Vision's 3D body pose reports every joint in metres relative to the hip, and a bone's length in
that space is the same whichever way the athlete is turned. The ruler is that length over the
same bone's longest 2D projection in the tracker's units (`measureLimbSpansInUnits`, the same
measurement the learned limb model divides by, read once and shared). Two kinds of metre:
`heightEstimation == .measured` (a depth sensor) is taken as is; `.reference` means Vision
scaled the skeleton to a reference stature, which it reports in `bodyHeight`, and the client
corrects every 3D length by (athlete's height on file / reference height). The native plugin
emits `body3DHeightM` and `body3DHeightSource` on each 3D frame for this. No height on file:
the reference skeleton is still offered, at 12% stated uncertainty (Rule #1). A correction
outside 1.35x either way is refused as a correction, not as a ruler. Trust order in
`reconcileScaleEstimates`: plate, measured grip, **body_3d**, learned bone, height, shoulders.
It is one candidate among the others and decides nothing alone (Rule #2). Recorded in
`scaleCandidates` as `body_3d:<bone>:<measured|reference_corrected|reference_uncorrected>`
with the bone length in metres and the 3D frame count.

**The plate at an angle.** Two facts, one fix, one open item:
- `plateScaleFromFrames` already reads the LARGER box axis as the diameter, and an oblique
  plate is an ellipse squashed sideways only, so the height it reads is the true 450mm at any
  yaw. The shape gate (`MAX_PLATE_ASPECT_RATIO` 2.5) accepts a plate up to about 66 degrees
  off square. The distance gate is in grip widths, and the grip and the plate's offset lie
  along the same bar, so they foreshorten together and the ratio holds at any angle. None of
  the gates was what refused the bench's plates.
- What refused them was that the model was never shown them: 902 frames, about 300 searches,
  FOUR plate candidates in the whole take (`candidatesSeenOfClass`). The search region was
  drawn around the wrists (or the last box), and from the foot of the bench the plates sit
  outside it. `AvCoreMlImplementDetector` now drops the region on every other unlocked search
  (`fullFrameSearchEveryNSearches`, telemetry `fullFrameSearches`), so a plate anywhere in
  shot is offered to the model; every candidate still clears the same gates afterwards.
- OPEN: the plate model itself. Its training set is a handful of instances from three photos,
  face-on. A squashed plate at 45 degrees may simply not score for it. If the next angled take
  still shows single-digit candidates with the full-frame searches counted, the fix is training
  data cut from Scott's own takes, not another gate.

**Parked: the bar's own length as a ruler.** Men's and women's Olympic bars share the same
1.31m between collars, which would make a ruler that needs no typing. Two reasons it is not
built yet: the shipped detector's barbell class is the one that regressed (see the dialog's
COREML notes), and unlike a plate the bar has no angle-invariant axis -- its projected length
shrinks with yaw and nothing in one frame says by how much. The 3D skeleton answers that
question (it gives the bar's direction from the two wrists, in metres), so the bar ruler is the
step after this one, built on it.

**Next: the box measures itself.** With the 3D skeleton the ankle height at rest on the floor
and at rest on the box is a height difference in metres, no typing. Not in this change.

## The camera audit, 2026-09-29 evening: every other tracker held to Rule #1

Scott: "Audit the rest of the cameras to make sure they work the same way, remember nothing
should reject video. Rule number 1." A sweep of all fifteen tracker dialogs found the bench
banner's sentence in eleven spellings, each attached to an empty save. What changed, on the
branch (held while 564 is tested):

- **Every post-take message is neutral.** "make sure your feet leave the ground clearly in
  frame", "try again with your whole body in frame", "make sure both hands and the kettlebell
  stay in frame", "Numbers are withheld rather than guessed" and the rest are gone. The athlete
  is told what happened and that the clip is saved, never where to stand.
  `no-framing-advice-after-a-take.test.ts` scans every dialog's string literals for the
  phrases and fails on the next one.
- **The jump, kettlebell and med ball trackers get the same rulers as the bar.** Each had one
  (standing height) and saved an empty set when it failed. `body-scale-fallback.ts` hands
  every dialog the 3D skeleton and the shoulder breadth as candidates, reconciled with height
  through `reconcileScaleEstimates`; the empty path is reached only when no body was seen at
  all. `scaleSource`, `scaleCandidates` and `scaleCorroborated` are now written by those
  dialogs too, so the report can say which ruler a jump or a swing used.
- **The web bar dialog keeps a take that measured nothing.** `bar-tracker-dialog.tsx` used to
  toast and send the athlete back to setup with no save; it saves an empty set to review now,
  same as the native dialogs.
- **A short mechanics capture is kept.** Both mechanics dialogs sent the athlete back to the
  camera under six frames; they analyse what there is and say it was short.

Still open from the audit: the med ball dialog empties the whole set when only the best rep's
peak is null (keep the other reps); the mechanics dialog nulls speed and distance without a
scale where the fallback rulers now apply (wire `bodyScaleFallbacks` there next); the
kettlebell and swing dialogs have no scale-free fallback of the bar tracker's shape when even
the fallbacks fail. None of those three prescribes an angle any more.

## Build 564 beside OVR, 2026-09-29 evening: the 3D ruler's first take, the re-rack, the plate

Set 2, 135lb x 10, phone at the foot of the bench. Sensor: 10 reps, 0.70 mean, 1.01 peak,
14.1in (35.8cm). Device: 11 reps, 0.35 mean, 0.59 peak, 19.3cm. Export seq 1; fixture
`bench-rerack-2026-09-29.json`. Three findings, each with its code:

- **The 3D ruler scaled the set 1.8x too small, off one bone** (`body3DScaleFromFrames`).
  `scaleCandidates`: `body_3d:torso:reference_corrected` 0.00207 m/unit (torso 0.563m over a
  272-unit 2D span) against `shoulder_width` 0.00368 (119 units). The shoulder ruler was
  within 5% of the sensor this time; the 3D ruler outranked it and lost the cluster. The 2D
  torso span was the fault: 272 units on a supine athlete whose shoulders span 119 is a hip
  landmark that was not on the hip, and the longest-bone rule took exactly that bone. The
  ruler now takes the MEDIAN scale across every bone measured both ways and records each
  (`calibration.body3DRuler`), so the next take says which bone disagreed. The correction
  itself (reference stature to the athlete's height) is not implicated; the torso came out at
  0.56m, which is a real torso.
- **The eleventh rep was the re-rack** (`isEdgeRackArtifact`): 20.1 to 21.6s, 12.4cm, 1.9x
  slower than the median rep -- under the 2.5x duration ratio and above the 0.5 amplitude
  ratio, so both shape tests passed it. Scott: "doesn't the camera know a bench press will
  move a certain amount of inches per rep?" It does, in `MIN_ROM_FRACTION_OF_HEIGHT` (bench
  0.08 of stature, 15.2cm for him). An EDGE phase under that floor is a rack move now. The
  segmenter itself still does not gate on the floor (an arched bench can be short and a wrong
  scale shrinks every rep together), and a scale-free trace never sees it. Replays to ten.
- **The plate was found 495 times and refused every time by the size cap**
  (`maxPlateSizeInYardsticks`, `MAX_PLATE_SIZE_IN_YARDSTICKS`). The full-frame search from
  build 563 did its job: `candidatesSeenOfClass` 4 became 495, best confidence 0.48. Eighteen
  cleared the confidence floor and all eighteen died at `candidatesRejectedBySize`. From the
  foot of the bench the near plate is much closer to the lens than the hands and reads far
  larger than the grip: perspective, not a rack. The cap moves from 1.25 grips to 2.0, the
  upper edge of the client's own plate-to-grip window, so the two gates agree; the distance
  gate still refuses the rack across the room. Both sides, pin test holds them equal.

**The frame.** 564 ran 1920x1440 at 60fps, 4:3, fov 72.0 of 74.6. Scott: "keeping the fps
higher is better ... Isn't the camera more accurate at 120fps? We should go back." Rate ranks
first again in `applyHighestFrameRate`: clean 4:3 at 120, then a BINNED 4:3 at 120 (a softer
readout is thinning, not cutting; `isAcceptableHighRate` used to refuse it outright), then the
16:9 crop at 120, then 4:3 at 60. Which of those this phone lands on is in the next console
line; "BINNED" is printed when it is that one.

**Not yet explained:** even with the scale corrected, per-rep peaks on this take ran 0.09 to
0.59 at a scale where the sensor's 1.01 would read about 0.55 -- so several reps' peaks are
still a third of the others'. Per-rep peak is the noisiest number the pipeline produces on a
lone-hand trace (`barPointFromLoneHandCarried` 121 of 556 here); the next take with the plate
locked is the one that separates ruler error from tracker error.

## Build 566 beside OVR, 2026-09-29 night: the 3D ruler wrong the same way twice, and the settle after the un-rack

Set 3, bench, 135lb x 10, phone at the foot of the bench, 1920x1080 @ 120fps (this lens has
no 4:3 format at 120, clean or binned; the log says so). Device: 12 reps, 0.48 mean, 19.3cm.
Sensor: 10 reps, 0.70 mean, 36.3cm (14.3in). Export `forge-captures-recent.json`, capture 1;
fixture `bench-settle-2026-09-29.json`.

**The scale, `body-3d-ruler.ts`.** Chosen source `body_3d` at 0.00246 m/unit (the shin,
reference-corrected); the shoulder ruler said 0.00413 and was called the outlier at 1.68x. The
sensor's ROM puts the truth near 0.0046. Replayed at the shoulder ruler's scale the set reads
32.4cm and 0.66 mean against 36.3 and 0.70 -- within a tenth, and the same story on sets 1 and
2 (shoulder within 10% on all three benches). So the 3D ruler was 1.9x small on set 3 after
being 1.8x small on set 2, and the fix on set 2 (median across bones) did not touch it, because
on set 3 EVERY bone read the same way: upper arm 176 units, forearm 159, femur 188, shin 209,
torso 273, shoulders 134, against a grip of 173 units. At the sensor's scale that is an 0.8m
upper arm and a 1m shin. The 95th-percentile "longest projection" is not the bone's square-on
view on this take -- with 82 body-suspect frames in 914 it is one of the jumped ones -- and the
legs are nearer the lens than the bar from the foot of a bench besides. The method is wrong,
not a bone.

- The plugin now emits every 3D joint in the CAMERA's frame as well (`cx`, `cy`, `cz`: the
  observation's `cameraOriginMatrix` inverted), beside the scene coordinates. A bone's visible
  length is then known per frame -- hypot of the camera-space x and y -- and divided by the same
  bone's 2D span on the same frame gives a scale sample with no maximum and no percentile to be
  captured by a bad frame. Median over (frame, bone, side), then across bones. A bone pointing
  at the lens (in-plane part under `MIN_IN_PLANE_FRACTION`) is skipped for that frame.
  `calibration.body3DRuler.method` says `in_plane` when this ran.
- Frames with no camera-space joints fall back to the longest-projection method, flagged
  `longest_projection`, at the widest uncertainty and DEMOTED below the shoulder ruler in
  `reconcileScaleEstimates` (`ScaleEstimate.demoted`). Still computed, still recorded, still
  joins an agreeing cluster; it no longer anchors one.
- `rejectImplausibleScales` gets the grip as a second yardstick (`gripWidthPx`, measured on 818
  frames here) because the body-height check had nothing to read: a lying athlete resolved a
  body length on 0 of 914 frames, so the check that saved the squats was silent on exactly the
  take that needed it. A candidate implying a grip under 0.2m or over 1.4m goes, with the grip
  it implied in `scalesRejectedAsImplausible`. Deliberately loose: set 3's bad candidate implies
  a 0.42m grip and survives it; the demotion is what handles that one.
- `body3DRuler.medianWristDepthM` is recorded (camera-space z of the wrists). With the lens's
  field of view (74.6 degrees, in `captureDeviceInfo.activeFormat`) that is a third ruler --
  metres per unit at the bar's own depth = depth x 2 tan(fov/2) / frame width -- and the next
  comparison can say whether it is any good before it becomes a candidate.
- The plate candidate (0.00141, "height" 319px) was rightly refused: a 45cm plate at 319px is a
  1.5m athlete. The box was the rack upright or the bench end, not the plate; the detector's
  training data (three photos) is still the open item.

**The count, `bar-tracking.ts`, the count-trim rule.** Twelve at every candidate gate: the ten
presses (12.1s to 23.0s, one a second) and before them 7.5-9.9s and 9.9-12.1s, the bar settling
over the chest after the un-rack. Concentrics of 14 and 17cm against a median of 19, 0.77s and
0.23s against 0.47, peaks at 0.6x the median: not short, not slow, not overlong, and contiguous
with the set so `isolatedRackMoves` cannot see them. Their descents are the tell (15cm in 1.5s,
12cm in 1.2s, a quarter of the set's descent speed), and a rule on that was written and
withdrawn in the same hour: set 11945 in `walkout-captures.json` is a real back squat whose
first descent is 59cm over 3.4s after a pause at the top, and it reads identically on the
clock. So the athlete's count decides how many, and the set's own medians decide which: when
every gate lands above `expectedReps`, the edge rep that sits furthest from the set's medians
(whole window, amplitude, descent speed, as summed log ratios) goes, one at a time, until the
count is the athlete's. Set 3's settles score 2.3 and 2.1, its real last rep 0.35, a real first
squat rep after a pause about 1.3. Bounded: never below the athlete's count, never more than two
from either end, never a rep scoring under 1.0. Replayed: 10 reps, 12.1s to 23.0s.

**Per rep at the shoulder ruler's scale**, reps 2-10 device vs sensor mean: 0.87/0.79,
0.79/0.74, 0.79/0.73, 0.47/0.68, 0.84/0.70, 0.55/0.71, 0.72/0.67, 0.86/0.71, 0.77/0.56 --
average 0.74 against 0.70, individual reps up to a third off either way. That spread is the
lone-hand bar point (92 carried, 16 side flips) and is the next thing after the scale.

**Still open from this take:** the lens has no 4:3 120fps format, so 16:9 at 120 is what a
rate-first chain gets on this phone; the per-rep spread above; the plate model.

### Queued after 569: the lone-hand carry and what the plate needs

**The lone-hand carry, `barPointFromSides` / `carryHalfSpan`.** Set 3's per-rep means ran up
to a third off the sensor either way with the set average within a twentieth, and 92 of its 914
bar points were a lone hand carried to the middle by the SET's median half-span, in short runs
mid-rep. The bar was tilted 26 degrees toward one arm, so half a grip's along-axis component is
17cm true; whenever the tilt at that moment differed from the set's typical tilt, the trace
stepped by the difference at the transition in and out, and a step is velocity as far as the
segmenter can tell. `carryHalfSpan` carries by the median of the measurements within the last
`RECENT_HALF_SPAN_FRAMES` (12) when at least `MIN_RECENT_HALF_SPANS` (3) exist -- a bar does
not change its tilt in a tenth of a second -- and by the set's median otherwise, which keeps
the stale-last-reading fix intact. Unverified against the sensor until the next take; what
makes it verifiable is the other half: every stored trace point now carries `s`, which witness
built it (`BarPointSource`: both hands, carried, carried-and-flipped, bare hand, equipment,
shoulders, interpolated), and `replayCapture` reports `repSources` per rep -- the inferred
fraction and the side flips -- so the per-rep spread can finally be read beside the number
that is suspected of causing it. The `s` tag is declared in `barPathPointSchema`.

**The plate detector.** Set 3's telemetry: 178 full-frame searches, 32 plate-class candidates
seen in the whole take, 28 under the 0.4 floor, best 0.48, one low-confidence accept (the rack
upright, 134x319px, rightly refused by the implied-height check). The low-confidence fallback
with the body as referee already exists in the plugin (`lowConfidenceAccepts`); lowering a
floor cannot help a model that fires on 32 of some 900 frames with the plate face-on in shot.
The model's plate class is eleven instances from three photos. What it needs is labelled
frames of Scott's own plates from his own gym, at the angles he films from, and a Create ML
retrain; nothing in this repo can do that without the photos. Not built.

### Build 569: the set that was counted right and never saved

Set 4, bench, the first take this pipeline ever counted correctly (10 of 10, device 0.71 mean
against the sensor's 0.77). The save answered `400 String must contain at most 40
character(s)`: `scaleCandidates[].source` was capped at 40 in `trackingDiagnosticsSchema` and
the 3D ruler's label had just grown to `body_3d:<bone>:<heightSource>:<method>` (up to 62). The
client classified the 400 as permanent and did not queue it. The set is not in the export.

- `shared/schema.ts`: the three `source` caps are 120. `shared/diagnostics-labels-fit-the-schema
  .test.ts` parses the longest label every ruler can produce through the real schema.
- `workout.tsx`: a 400 is queued like a 409. `offline-queue.ts`: a 400 on replay HOLDS the entry
  (`heldSince`, `lastHeldAttemptAt`) -- retried every ten minutes on the first day, hourly for
  a week, daily after that, and NEVER dropped (Scott: "It shouldn't be on the athlete to
  remember that for our server error"); after a week the athlete is told once that it is
  still trying, not asked to re-enter. `a-400-does-not-delete-a-set.test.ts`. The rule: our own validator refusing
  our own client's payload is a bug in the validator until proven otherwise, and the payload is
  the only copy of the set.

## Build 571 beside OVR, set 5: the rulers agreed, the count did not

Set 5, bench, 135lb x 10, phone at the foot of the bench, 1920x1080 @ 120fps. Device: 8 reps,
1.11 mean, 37.9cm. Sensor: 10, 0.77, 36.1cm (14.2in). Fixture `bench-dropout-2026-09-29.json`.

**The scale is right, and two rulers said so.** `body_3d:forearm:reference_corrected:in_plane`
at 0.00342 and `shoulder_width` at 0.00424 clustered (`scaleSource: both`, corroborated) --
the first take on which the in-plane method ran, and the first on which any two rulers agreed
on a bench. ROM 37.9 against 36.1 is 5%. `medianWristDepthM` 2.80m is recorded for the depth
ruler. The plate class fired 13 times in 122 full-frame searches; still the model.

**The count was the trace.** 270 of 629 bar points were a lone hand carried (43%), 79 side
flips, and a frozen carried stretch at 19.7-21.0s. Three things followed, each fixed in
`bar-tracking.ts`:

- The un-rack was a 70cm wrist jump in 0.23s -- 3 m/s -- and passed every ratio test. A phase
  whose travel over its moving time exceeds `MAX_PLAUSIBLE_LIFT_VELOCITY_MPS` is a phantom
  (`isImplausiblyFast`). A phase, never a take; never on a scale-free trace.
- Three pairs of real presses had a dip of 24-27cm between them, under the 28cm gate the count
  had chosen, so each pair was one 1.4-2.2s "concentric" and the overlong test deleted it.
  `splitMergedPhases`: a phase over 1.5x the median span with a reversal of at least half the
  median amplitude inside it is three phases (up, the dip, up). The finer gate had split them
  correctly and over-counted elsewhere, which is why a finer gate everywhere is not the fix.
- Three "reps" of lying down and settling (1.1-4.5s) stood apart from the set behind the
  un-rack phantom, and at 3 of 11 sat just over the quarter the isolation rule allows. With the
  total across runs above the athlete's count, a run standing apart from the largest goes
  first, smallest first (`isolatedRackMoves`, count-informed). At or under the count nothing
  changes: two runs of five on a ten are still a grip adjustment.

Replayed: 11 reps at 8.7-19.3s, 0.73 mean against 0.77, 31.3cm against 36.1. The eleventh is
one press split by jitter (21.9 and 23.1cm reps against a 30cm median), and two real presses
after 19.3s are gone with the frozen carried point. Both are the lone-hand carry; build 571's
witness tags (`repSources` in the harness) are what say so per rep from here on.

**From a tenth to a twentieth.** On this take the set mean is 5% off once the count is right;
the ROM is 13% off because the jitter-split reps are short. What is left is the trace, not the
maths: the carried lone hand is the whole residual, and the equipment (the bar or plate box)
is the witness that should carry those frames -- `barPointFromEquipment` was 1 of 629 here
because the plate lock held 135 frames. That is the plate model again.

## Build 572 beside OVR, set 6: within 5% for the wrong reason, and what 3% takes

Set 6 (logged as set 1 of a fresh day), bench, 135lb x 10, wrists 3.18m from the lens. Device:
10 reps, 0.81 mean, 26cm. Sensor: 10, 0.84, 35cm (13.8in). Ground truth
`OVR_BENCH_SET6_2026_09_29`. The count is right (the set 5 rules held: 564 of 646 bar points
from both hands this time, 6 flips). The mean is 4% off and it is a cancellation:

- **The scale is 26% low.** `body_3d:femur:in_plane` at 0.00303 won alone; the shoulder ruler
  at 0.00408 was called the outlier (1.34x) and would have given 35cm exactly. Set 5 was the
  other way round (in-plane 6% low, shoulders 16% high, their average 5% high). Neither body
  ruler is a 5% instrument: one is Vision's canonical skeleton scaled to a stated height, the
  other a population fraction of it, and each wanders by 10-25% per take.
- **The concentric window is 24% short.** Device 0.32s over the set (0.27-0.43 per rep); the
  sensor's ROM over its mean is 0.42s. ROM low and time short in the same ratio gave a mean
  within 4%. Set 5's window was right (0.49s against 0.47); set 3's 10% short. Fittable, now
  that three sensor-paired sets carry per-rep numbers, and not yet fitted.
- **The depth ruler read 8% low on BOTH sets 5 and 6**, at 2.80m and 3.18m: wrist depth from
  the camera-space 3D joints x 2 tan(fov/2) / the frame's long axis in units
  (`depthRulerScale`, `body3DRuler.depthRulerScale`, with `frameWidth`/`frameHeight` recorded so
  the harness can recompute it). A constant bias at two distances is the shape of a ruler that
  can be zeroed; the in-plane and shoulder rulers' errors are not constant. Recorded, not yet a
  candidate: the next sensor-paired take says whether 8% holds.

**From 5% to 3%, then 1%, in order:** a ruler that is not a body proportion (the depth ruler if
its bias holds, the plate when the model can find one); the concentric window fitted to the
sensor's per-rep windows; the equipment box carrying the frames the hands miss; and last, a
per-athlete zero from a sensor-paired session, the way any instrument is zeroed.

## Build 573 beside OVR, set 7: the count held, the rulers agreed, and the window is the residual

Set 7, bench, 135lb x 10, wrists 2.67m from the lens, bar tilted 29 degrees in frame. Device:
10 reps, 0.93 mean, 38.3cm, `scaleSource: both` at 0.003815. Sensor: 10, 0.77 mean, 36.6cm
(14.4in). Ground truth `OVR_BENCH_SET7_2026_09_29`; fixture `bench-set7-2026-09-29.json`,
pinned by `bench-set7-count.test.ts` (ten reps, the un-rack settle folded into rep 1's window).

- **The count is right for the third set running.** The set 5 rules (`isImplausiblyFast`,
  `splitMergedPhases`, count-informed isolation) have now held on sets 5, 6 and 7.
- **The scale is 4.5% high, and both body rulers said the same thing.** In-plane 0.0038,
  shoulders 0.00383, sensor-implied 0.00365. Their average (`both`) is what shipped. After
  set 5 (in-plane 6% low, shoulders 16% high) and set 6 (26% low, 0.5% low) this is the first
  take where the two agreed, and they agreed on a number 4.5% off, which is the shape of a
  shared bias rather than two wanderers cancelling.
- **The depth ruler read 13% low** (0.003176 against 0.00365), after 8% and 8% on sets 5 and
  6. Not the constant it looked like at two distances. Three readings, 0.92 / 0.92 / 0.87:
  `DEPTH_RULER_BIAS` is their mean, 0.9, and `depth-ruler.test.ts` pins the mean to the
  constant so the next sensor-paired set moves it in one place. With the three rulers blended
  (`BODY_RULERS`) set 7 replays to within 5% of the sensor; sets 5 and 6 within 3%.
- **The velocity residual is the concentric window, not the scale.** With the scale 4.5%
  high, mean velocity is 21% high (0.93 against 0.77): the device's windows ran 0.33-0.47s
  against the sensor's 0.475 (range over mean). The trace is the reason: 230 of 720 points
  carried by one hand (`PathTracePoint.s`) and 80 side flips, so the arrival at the top
  flickers and the window closes early. A cleaner trace (the plate model, once Scott's photos
  train it; the equipment box carrying the frames the hands miss) is the fix; a rule fitted
  to the jitter is not, and two such rules were tried and discarded this build (a rise-time
  window broke every fixture; an end-mirror in `trimPhaseToTravel` moved nothing).
- **The head-on toast is gone from the athlete's screen.** `cameraViewMismatch`'s note
  ("Filmed head-on or from behind ...") was still toasted after a take. It is
  `trackingDiagnostics.cameraView` now, with the facing and the expected view beside it;
  `no-framing-advice-after-a-take.test.ts` refuses the toast. Rule #1, 2026-09-29 clause.

## Build 578 beside OVR, set 12 and the two rows

Bench set 12 (Sep 30, set 4), the first take through the weighted blend on the phone. Ground
truth `OVR_BENCH_SET12_2026_09_30`.

| | Device | Sensor |
|---|---|---|
| Reps | 10 | 10 |
| Mean velocity | 0.71 m/s | 0.68 |
| Peak velocity (average of reps) | 1.01 | 1.03 |
| Mean power | 426W | 409W |
| Range of motion (median rep) | 40.3cm | 35.3cm |

- **Count, mean, peak and power within 5%; range of motion 14% high.** The shoulder ruler
  read 1.23 of the sensor on this take (its worst of eight) and carried the weight, so the
  scale came out 0.0040 against an implied 0.0035. The mean still landed because the
  concentric window ran long (0.59s against the sensor's 0.52), which is the cancellation
  the set 6 notes describe. Two right-looking numbers built on two wrong ones; the
  diagnostics show it, the athlete's screen does not.
- **The shoulder ruler's ratios across the eight sensor-paired benches** are now 1.16, 1.00,
  1.05, 1.00, 1.07, 1.00, 1.00, 1.23. Its 0.1 uncertainty is honest as a spread but it is
  the only ruler with weight, and one bad read moves the take. The way past this is not a
  fourth body ruler; it is the plate.
- **The two Pendlay rows** (`OVR_ROW_SETS_2026_09_30`) were filmed from behind with one arm
  visible and are count comparisons only: 9 against 9, 11 against 11. Both scaled 17-21%
  low. The plate detector saw the plate on both and read a scale 0.47 of the sensor, refused
  correctly as the outlier. From behind, the plate is the one thing square to the lens and
  the body rulers are all foreshortened (the height ruler on a bent-over athlete read 0.70).
  The row is the plate detector's clearest case.

## Build 577 beside OVR, set 11: two rulers from one sensor were two votes

Set 11 (Sep 30, set 3), bench, 135lb x 10, same framing as sets 9 and 10, both hands seen on
628 of 764 frames. Device: 11 reps, 0.49 m/s, 21.5cm median rep. Sensor: 10, 0.73, 35.8cm.
Ground truth `OVR_BENCH_SET11_2026_09_30`. A Pendlay row in the same export was filmed from
behind with one arm visible (410 of 660 points carried) and is not a scale comparison; its
count of nine matched the sensor's nine.

- **The scale was 27% low, and the vote was the fault.** Three rulers: the in-plane 3D ruler
  0.00294, the depth ruler 0.00275, the shoulder ruler 0.00391. The first two agreed and
  outvoted the third; the third was right (set 10 minutes earlier, and the grip in pixels
  between the two takes, both say 0.0039). The in-plane and depth rulers are both read off
  Vision's 3D body pose. When it scales the skeleton wrong they go wrong together, and they
  were counted as two independent witnesses. Rule #2: two readings from one sensor are one
  vote. `reconcileScaleEstimates` now collapses the pair into one witness before clustering
  (both sources still reported).
- **The blend is weighted by evidence.** Across seven sensor-paired benches the shoulder
  ruler read 1.16, 1.00, 1.05, 1.00, 1.07, 1.00 of the sensor; the in-plane ruler 0.94, 0.74,
  1.04, 0.85, 1.23, 0.98, 0.75; the zeroed depth ruler 1.02, 1.03, 0.97, 0.95, 1.16, 0.64,
  0.78 (its wrist depth shortened from 2.8m to 1.7m over one afternoon at one framing). So
  `BODY_3D_CORRECTED_UNCERTAINTY` and `DEPTH_RULER_UNCERTAINTY` are 0.2 now, not 0.08, and a
  blend is an inverse-variance mean rather than a plain one. No ruler is appointed by name;
  the weights follow the constants, and the constants follow the sensor.
- **Replayed through the weighted blend**, ratio to the sensor: set 5 1.12, set 6 0.97, set 7
  1.04, set 8 0.98, set 10 1.02, set 11 0.95. Set 5 is the price: its shoulder ruler read
  1.16 and now carries the weight; it was 1.07 under the plain mean. `depth-ruler.test.ts`
  pins all of it, set 5's 1.12 included.
- **The grip ruler is the way out of body proportions altogether.** `users.gripWidthIn` has
  existed since the grip ruler was written and nothing has ever been entered in it. The
  sensor-paired benches put Scott's wrist-to-wrist span at 0.70-0.73m: 28 inches. With that
  on the profile every bench gets a ruler that owes nothing to the pose scale and is visible
  on every frame, ranked under only a plate. A per-exercise grip is open work.
- **The eleventh rep is the un-rack** (6.1-10.4s, 11.7cm). The count-trim rule did not take
  it; open.

## Build 577: a rep's peak is bounded by its mean, and the set's peak is the reps' average

From set 10's one number still out (peak 1.34 against the sensor's 1.09 with everything
else within 3%). Two changes in `summarizeTrackedSet`:

- **Per rep, the peak is floored at the rep's mean and capped at `MAX_PEAK_TO_MEAN_RATIO`
  (2.0) times it.** A peak below the mean of its own window is impossible; set 10's rep 2 read
  0.15 against 0.52 because a hand dropout froze the trace and the 95th percentile of
  near-zero instantaneous speeds was near zero. The sensor's own peak/mean ratio is 1.35-1.5
  on all sixty bench reps it has reported; past two is a spike. Bounded, never dropped (Rule
  #1), and counted (`trace.repPeaksFlooredToMean`, `trace.repPeaksCappedToMeanRatio`).
- **The set's peak is the average of the reps' peaks**, which is the sensor's own definition
  (its per-set "Peak" row is the average of the rep rows on every screenshot). It was the max,
  so one jumpy rep set the number. Peak power follows.

Replayed: set 10 1.00 against 1.09 (two reps floored, two capped: the trace, not the rule);
set 7 1.12 against 1.11; set 5 0.96 against 1.10. `bench-set10-on-the-sensor.test.ts` pins
the bound and the average.

## Build 576 beside OVR, set 10: on the sensor

Set 10 (Sep 30, set 2), bench, 135lb x 10, same oblique framing as set 9, phone roll -3.9.
The first take segmented along gravity (`axisSource: "gravity"`, the grip's own axis 9.5
degrees off it). Ground truth `OVR_BENCH_SET10_2026_09_30`; fixture
`bench-set10-2026-09-30.json`, pinned by `bench-set10-on-the-sensor.test.ts`.

| | Device | Sensor |
|---|---|---|
| Reps | 10 | 10 |
| Mean velocity | 0.80 m/s | 0.78 |
| Range of motion (median rep) | 38.6cm | 37.6cm (14.8in) |
| Mean power | 481W | 472W |
| Peak velocity | 1.34 m/s | 1.09 |

- **Count, mean velocity, range of motion and mean power all within 3%.** Eight sensor-paired
  benches to get here, and the last three errors were all the same thing: the axis. The scale
  (`both`: in-plane upper arm 0.00342 and shoulders 0.00376, blended to 0.00359 against a
  sensor-implied 0.0035) is 3% high, which is where the 3% on the range of motion comes from.
- **Peak velocity is 23% high**, the one number still out. The per-rep peaks (1.05, 0.15,
  1.26, 0.79 ...) scatter far more than the sensor's (1.03-1.17), and a peak of 0.15 on a rep
  whose mean is 0.52 is impossible: a peak is read off a smoothed trace in a window that can
  miss the rep's fastest sample when a hand drops out (178 frames with no wrist on this take,
  largest gap 2.0s). The set's peak is the max of those, so one jumpy rep sets it. Next.
- **The depth ruler was wrong by more than its zero for the first time**: a wrist depth of
  1.7m against 2.5-3.2m on every other bench at this framing, a ruler 42% low. Reconciliation
  called it the outlier and dropped it, which is the right answer and the reason the blend is
  there. Its five readings are now 0.92, 0.92, 0.87, 0.85, 0.58: not a constant, and
  `DEPTH_RULER_BIAS` stays a zero for the good takes rather than a trust in the ruler.
- **The harness reproduces the device's ten presses rep for rep** and adds the un-rack settle
  as an eleventh phase, because the device dropped that phase on the velocity-rejection
  events of the un-rack second and a stored trace does not carry them (`capture-replay.ts`).
  The test filters to the presses; carrying the rejection timestamps in the export is the
  fix, and it is a diagnostics field away.

## Build 575 beside OVR, set 9: the bar travels along gravity, and the grip line never said so

Set 9 (Sep 30, set 1), bench, 135lb x 10, wrists 2.48m from the lens, oblique from the foot of
the bench. Device: 7 reps, 1.04 m/s, 43cm. Sensor: 10, 0.80, 36cm (14.1in). Ground truth
`OVR_BENCH_SET9_2026_09_30`; fixture `bench-set9-2026-09-30.json`, pinned by
`bench-set9-gravity-axis.test.ts`. Four frames of the clip were in hand for this one.

- **The grip axis was 28 degrees from vertical and passed the 45-degree check**, so the take
  was rotated 28 degrees off the lift and lost three reps. The frames show why: the phone is
  upright and the bar goes straight up and down in the image, but the wrist-to-wrist line is
  tilted because the near plate sits lower and larger than the far one. Perspective. The
  perpendicular to the grip is the travel direction only for a level bar seen square-on,
  which is the one framing Rule #1 says never to require.
- **Gravity is the axis** (`reconcileMovementAxis`, `axisSource: "gravity"`). CoreMotion
  records the phone's roll on every take (`cameraRollDeg`: -3.1, -2.7, -3.0, -4.2 on the
  sensor-paired benches), and under `MAX_ROLL_FOR_IMAGE_VERTICAL_DEG` (15) the image vertical
  is gravity to within a percent. The grip's axis is still measured and recorded beside it
  (`gripAxisFromVerticalDeg`), and governs only when the roll cannot be read or exceeds the
  limit. Every bench fixture segmented both ways: the vertical finds the sensor's ten on sets
  5, 7, 8, 9, the oblique take, the settle take and the 564 re-rack take (which the grip axis
  gave eleven); set 6 reads eleven under the vertical against ten under the grip, one press
  split. Seven of eight, and the eighth is a segmentation edge, not an axis error.
- **What is left on this take is the trace.** 78 frames with no wrist, 139 carried by one
  hand, 48 side flips, 76 interpolated, and both-hands points wandering 100 units sideways
  mid-set. Along gravity the count is right and the mean is 1.03 against 0.80: the same
  concentric-window residual, larger here because the trace is worse. Only one 3D bone had
  enough samples to be a ruler (shoulderWidth) and the shoulder ruler itself was absent.
- **The depth ruler read 0.96 of the sensor-implied scale**, after 0.92, 0.92, 0.87, 0.85 --
  but the sensor-implied scale on this take is soft (the replay's ROM is inflated by jitter),
  so `DEPTH_RULER_BIAS` stays at 0.9 and set 9 is not in the bias test.

## Build 574 beside OVR, set 8: the grip axis was 78 degrees wrong and nothing checked it

Set 8 (logged over set 3), bench, 135lb x 10, wrists 2.61m from the lens. Device: 9 reps,
2.03 m/s, 60cm. Sensor: 10, 0.76, 36cm (14.3in). Ground truth `OVR_BENCH_SET8_2026_09_29`;
fixture `bench-set8-2026-09-29.json`, pinned by `bench-set8-axis-witness.test.ts`.

- **The scale was fine.** In-plane 0.0031, depth 0.00345 (zeroed), shoulders 0.00364, blended
  to 0.0034 against a sensor-implied 0.00364: 7% low. The depth ruler fired for the first time
  on the device (set 7's reading was computed in the harness; the frame dimensions the ruler
  needs were absent on that take and present on this one). Raw it read 0.85 of the sensor,
  after 0.92, 0.92, 0.87: `DEPTH_RULER_BIAS` stays at 0.9, the mean of four.
- **The axis was the whole error.** `movementAxisFromGrip` returned (0.978, 0.209), an axis 78
  degrees from the image vertical, and `summarizeTrackedSet` rotated the trace onto it, so the
  segmenter measured the hands' side jitter as the press: nine "reps" of 44 to 119cm. The same
  trace segmented along the image vertical gives ten reps of 34cm at 0.87 m/s. The trace's own
  covariance axis was no better (five reps at 2.15): a take whose grip pairs are wrong is a
  take whose jitter is large, and the covariance follows the jitter.
- **The fix is the Rule #2 shape**, `reconcileMovementAxis`: the grip axis is a witness held
  against the image vertical, and further than `MAX_GRIP_AXIS_FROM_VERTICAL_DEG` (45) from it
  the vertical governs (`axisSource: "vertical_over_grip"`, `gripAxisFromVerticalDeg` recorded
  whichever won). A barbell lift filmed by an upright phone moves within a few tens of degrees
  of the image vertical; a grip axis that says otherwise is the pair being wrong. The no-grip
  fallback stays the covariance. The 45 is a guess with one take behind it; the field is there
  to revise it.
- **The harness was rotating stored traces twice.** `buildPathTrace` writes the points AFTER
  `dominantAxisFrame` rotated them, so a stored trace is already in the movement frame, and
  `capture-replay.ts` was applying the stored axis to it again. On the near-vertical axes of
  sets 5 to 7 (8 to 17 degrees) the second rotation moved the numbers a little; on set 8 it
  happened to undo the device's wrong rotation, and the harness reported ten good reps for a
  take the phone scored at 2.03 m/s. Fixed (`STORED_TRACE_ALONG_AXIS`). Consequences, because
  every segmentation rule since 09-28 was fitted through the double rotation:
  `bench-dropout` now replays at ten (was eleven; the sensor said ten), set 7 at 37.4cm and
  0.90 (was 38.3 and 0.93; sensor 36.6 and 0.77), the oblique take's shortest rep at 21.6cm
  against a 44cm median (a real short press with a dip in it), and **the 564-era re-rack take
  keeps its eleventh rep** on its true trace: `bench-rerack-is-not-a-rep` is `it.fails` until
  the edge rule is right on it. That take's scale is 1.8x too small, so the centimetre floor
  the rule leans on reads through the wrong ruler.
- **Set 5 reappeared in the export as seq 1** because the whole log is re-POSTed on every
  save; it is the 571 take, not a new one.

## Build 574: the depth ruler zeroed and in the room, the margin keyed by lift, body rulers blended

Planned against the three sensor-paired benches of 2026-09-29 while 573 processed. Scott:
"how do we bring it down to 1% or even 0%". The honest ceiling is a few percent: the sensor
is quoted at a few percent itself, and two instruments differ by where each says a rep starts
and ends. Three changes, each fitted on the evidence in hand and none proven past it:

- **The depth ruler is a candidate** (`source: "depth"`, `DEPTH_RULER_BIAS` 0.9,
  `DEPTH_RULER_UNCERTAINTY` 0.08), ranked below a plate and a measured grip, above every
  proportion ruler. Zeroed by what sets 5 and 6 measured, so on those two takes it lands
  within a percent by construction; `depth-ruler.test.ts` replays both through reconciliation
  and gets within 3% and 5% of the sensor. The next sensor-paired set is its first real test.
- **Body rulers blend when nothing anchored is present** (`BODY_RULERS` in
  `reconcileScaleEstimates`): height, shoulders, the 3D skeleton and the depth ruler. Set 6
  chose the in-plane ruler alone at 26% low over an exact shoulder ruler; two body guesses
  pull opposite ways more often than not, as the squats and set 5 showed.
- **The travel margin is keyed by lift** (`TRAVEL_ONSET_MARGIN_BY_ROM_KIND_M`,
  `travelOnsetMarginFor`): a press trims at 0.75cm, everything else keeps the squat's
  centimetre. Against the sensor's per-rep windows (range over mean) on the three benches, a
  centimetre ran 6%, 0% and 9% short and half a centimetre 4%, 12% and 2% long; on the squat
  fixture 0.75cm moved the onset two samples into the sit. Scott: "Squat and bench are
  technically different no? The camera knows that it's filming before so we could
  differentiate." The concentric window is a 5% effect; the scale was the 25% one.

**Not done, and why:** the concentric window could also be defined the sensor's way outright
(range over the window from leaving the bottom to reaching the top); with three sets the
per-movement margin reaches the same place with fewer moving parts. Zero is not on the table.
