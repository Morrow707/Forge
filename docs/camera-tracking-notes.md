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
