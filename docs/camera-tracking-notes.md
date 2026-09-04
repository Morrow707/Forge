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
