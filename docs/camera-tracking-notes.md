# Camera tracking: what is validated, what is assumed, what will break

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
   the head or foot of a bench. So every angle has a known-size object in frame -- the
   detector just is not wired to bench today (av-bar-tracker-dialog only sets
   coreMlTrackingMode to "plate" for modes that already traded corroboration for it).
   This is the single highest-value piece of work for "accurate from any angle."
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
