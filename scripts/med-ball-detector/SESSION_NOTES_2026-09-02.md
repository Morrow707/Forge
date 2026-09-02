# Session notes -- 2026-09-02

Continuation of 2026-09-01's work (see that file). This session: finished
hand-tracing every remaining kettlebell/plate/dumbbell instance, tightened
the real training-data boxes from those traces, retrained twice (v9, v10),
and -- the bulk of this file -- wired the trained object detector into the
live bar tracker's confidence math.

## 1. Hand-tracing wrap-up

All 10 kettlebells, all 11 plates, and the combined dumbbell+plate photo
(IMG_0042 -- deliberately saved for last, per Scott's own sequencing) are
now Scott's own hand-traced contours, drawn in a canvas tracing tool built
for this (`kb_tracer.html`, `plate_tracer.html`, `combo_tracer.html`),
published as Claude Artifacts, traced by Scott directly, and read back to
recompute the real YOLO box for every instance -- not just the gallery
illustration. IMG_0042 alone: 110 points on the dumbbell, 74 on the plate.
Commits: `25f6592` (kettlebells), `aba711a` (plates), `5315059` (IMG_0042).

Retrained twice on top of this: "v9" (kettlebell+plate boxes tightened,
`e043f7d`), then "v10" (adds the IMG_0042 tightening). See those commits'
own messages for per-class verification numbers.

## 2. "Does the camera AI boost bar-speed confidence?" -- and the fix

Scott asked directly whether the object detector (trained this whole
session) was actually wired into bar-speed tracking, or just sitting there
trained-but-unused. Answer at the time: **no** -- `AvCoreMlImplementDetector`
existed and worked, but was hardcoded to `trackingMode == "med_ball"` only;
none of the three bar-tracker dialogs (`bar-tracker-dialog.tsx`,
`ar-bar-tracker-dialog.tsx`, `av-bar-tracker-dialog.tsx`) referenced CoreML
at all. Even inside med-ball mode, the detector's own signal only fed a
diagnostics tally (`tracking-diagnostics.ts`), not the actual trust score --
there's a code comment calling that out explicitly ("wiring left for a
follow-up pass").

Scott's ask: fix that. Not a replacement for the body tracker -- a third
signal alongside it, the same "two independent reads agreeing is stronger
evidence" pattern med-ball mode already uses for its own two signals
(ball motion-diff + wrist proxy). And explicitly: **real-time, during
analysis, not a slower post-set pass** -- and **using the dedicated
CoreML model trained this session, not Claude/an LLM**. Scott was clear
that bringing an LLM into camera tracking at all was already considered
and rejected in an earlier session -- this app's camera confidence system
has no LLM in it anywhere, by design, not by oversight.

### What shipped (`1cdd731`)

- **`AvBodyTrackingPlugin.swift`**: `AvCoreMlImplementDetector.track()` now
  takes a `targetLabel` instead of hardcoding `"med_ball"`.
  `AvCoreMlImplementDetector.targetLabel(forTrackingMode:)` is an explicit
  allow-list of the model's 8 trained classes -- an unrecognized
  `trackingMode` still means "stay off," same as omitting it. The
  `VNTrackObjectRequest` lock now also remembers which label it was seeded
  for, so a call for a different class re-detects from scratch instead of
  reporting a stale lock under the wrong label.
- **`av-bar-tracker-dialog.tsx`**: maps `equipment` (Barbell/Dumbbell/
  Kettlebell -- the only three with a trained class; Trap Bar/EZ-Bar look
  different enough from a straight barbell that mapping them in would just
  seed the detector against the wrong shape) to that class name and passes
  it as `trackingMode`, so the object detector now runs during bar-path/
  full-mode analysis. Its per-frame box is cross-checked against that same
  frame's own wrist+motion-diff fused point in `applyCoreMlCorroboration`:
  agreement within 0.5m nudges confidence up to +15%, a confident-but-far
  reading nudges it down 15% -- same modest, capped, position-never-
  overridden idiom this file's own `appearanceMatch`/`gripConfirmed`
  nudges already use. For any other equipment, `trackingMode` stays unset
  and nothing changes.
- **`vision-body-landmarks.ts`**: `visionCoreMlBoxToPoint()` converts the
  detector's normalized box into the same pixel-space convention
  `visionImplementToPoint` already uses for the motion-diff tracker, so
  the two can be compared directly.

This runs entirely inside the existing per-frame analysis loop
(`runPoseAnalysis` on native, the frame-by-frame replay in
`finishWithRecording` on the client) -- no new pass, no extra wait between
Stop Set and the result showing up, nothing new persisted to storage. The
object detector's box/confidence is used once, in memory, to nudge that
frame's confidence number, then discarded.

Native change -- `verify_build` before `beta`, per standing policy.

### Still not done (out of scope for this pass)

Med-ball mode's own gap (the CoreML signal feeding diagnostics only, not
`medBallTrustScore`/`blendSpeedEstimates`) is still open -- Scott's ask
this round was specifically about the bar trackers reaching parity with
med-ball's existing pattern, not fixing med-ball's own remaining gap. That
would be the natural next follow-up if he wants full symmetry.

## 3. Three "AI" features, clarified

Scott's framing was "we have 3 AI learning models: coach, nutrition,
camera." Worth being precise for future reference: AI Coach and Nutrition
are the *same* model (Claude, via one shared `server/ai.ts` client) given
different prompts for different jobs -- not two separately trained
systems. The camera model is the only one that's actually a custom-trained
artifact built from Scott's own data. None of the three do online/
continuous learning -- Claude's weights are fixed and shared across every
Anthropic customer; the camera model only improves when retrained and
reshipped, same as every pass in this file.

## 4. Analysis frame rate -- 60fps capture, ~30fps analyzed, why that's not
   an easy 2x

Scott asked whether analysis could just run at the full 60fps capture rate
instead of `ANALYSIS_SAMPLE_STRIDE = 2` (every other frame). Two directions
he floated -- analyze concurrently with recording, and downscale frames to
make analysis cheaper -- have BOTH already been tried in this exact
codebase and reverted, for real, documented reasons already sitting in
`AvBodyTrackingPlugin.swift`'s own comments:

- Live/concurrent Vision inference during capture is the OLD architecture
  (ARKit-based) -- replaced specifically because of real, on-device-proven
  thermal throttling. Going back risks reintroducing that.
- A per-frame Vision-side downscale was tried first for the pose request
  specifically and made the "Cannot Complete Action" failures worse, not
  better (extra Core Image render pass on top of a still-full-res decode).
  The fix that stuck was configuring AVAssetReader's own decode to scale
  via VideoToolbox in one hardware-accelerated pass instead.

What shipped instead (`612ad78`): a genuinely untried lever --
`AvCoreMlImplementDetector`'s FRESH detection now searches only a region
around wherever the wrist(s) already are (`regionOfInterest`, Vision's own
mechanism, 0.35-frame margin), instead of scanning the whole frame. An
already-locked `VNTrackObjectRequest` is untouched (Vision's own tracker
already does a narrow local search). One real, honestly-flagged assumption
in that code: Vision's documented behavior is that `regionOfInterest`
narrows what's analyzed while `boundingBox` results stay in full-image
coordinates -- unverified against this specific model/request combo on
real hardware, since this sandbox has no device to confirm on. First place
to check if a real build ever shows the reported box visibly offset from
the actual implement.

Analysis stride itself (2 -> 1, full 60fps analysis) was NOT changed --
that's still an open, real product tradeoff (roughly doubles the
"Analyzing recording..." wait on every device, every set) that needs a
deliberate decision, not a silent change either way.

## 5. "v10" model shipped WITH a known regression on baseball/golf/tennis/
   barbell -- Scott's explicit call, not an oversight

The "v10" retrain (picks up IMG_0042's tightened dumbbell+plate boxes,
section 1) came back with a real, confirmed regression on four classes,
verified against Scott's own reference photos the same way every previous
retrain was (not a scoring artifact -- double-checked at a much lower
confidence threshold and confirmed the model is firing on the WRONG class
for these photos, not just being quiet):

- **Barbell**: IMG_0006/IMG_0009 dropped from 0.81-0.99 (v9) to ~0.02
- **Baseball**: IMG_0052 dropped from ~0.95-0.99 to ~0.15
- **Golf ball**: IMG_0048 dropped from ~0.99 to ~0.02 (essentially undetected)
- **Tennis ball**: IMG_0053 dropped from ~0.92 to ~0.28
- **Dumbbell**: IMG_0042 (the just-tightened box) dropped from 0.791 to ~0.14

Kettlebell and med-ball stayed solid; most plate photos too (IMG_0001 was
already a known zero-signal soft spot before this).

**Root cause**: `train.py` starts fresh from Ultralytics' COCO weights
(`yolov8n.pt`) on EVERY retrain -- no warm-start from the previous run's
weights -- combined with a forced 100 epochs (`patience=0`) and several
classes that only have 1-3 example photos in the whole dataset. Nothing
about the barbell/baseball/golf/tennis DATA changed between v9 and v10 --
this run just landed unluckily on a dataset this small and imbalanced.
This is a real, structural instability in the retrain pipeline, not a
one-off -- worth fixing (most likely by warm-starting from the previous
run's weights instead of COCO scratch each time) before the NEXT retrain,
not necessarily before this one shipped.

**Scott's call, given directly**: "I'm not working with baseballs today,
ship what you have." Practical impact of shipping anyway: the object-
detector/body-tracker confidence cohesion built this session (section 2)
requires the detector to clear `minDetectionConfidence = 0.4` in Swift
before it says anything at all -- at ~0.02-0.28, barbell/baseball/golf/
tennis essentially won't clear that bar today, so the new cohesion signal
will be mostly SILENT (not wrong, not harmful -- just quiet) for those
classes until a future retrain fixes this. Kettlebell's cohesion signal
works as intended. Nothing about the existing wrist+motion-diff tracker
changed or degraded -- a silent CoreML signal just means that tracker's
own number stands alone, same as before this whole feature existed.
Bundled as `ios/App/App/MedBallDetector.mlpackage`, commit follows this
note.
