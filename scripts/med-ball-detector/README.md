# Med-ball detector pipeline

Trains a small, real, on-device CoreML object detector for medicine balls --
no Claude API call at runtime, nothing sent off-device once trained. Part of
the Master Blueprint's Section 2 (native object tracking), scoped to
med-ball throws first per the explicit decision to validate on one exercise
before expanding.

Claude does the *labeling* (one-time, offline, looking at each photo
directly and writing out where the ball is) -- never the shipped app, never
anything an athlete or coach's device calls live. See
`training-data/README.md` for why.

## Pipeline

```
training-data/med-ball/raw/*.jpg       (reference photos)
training-data/med-ball/labels/*.json   (Claude's labels, one per photo)
        |
        v  prepare_dataset.py
scripts/med-ball-detector/dataset/     (YOLO-format train/val split)
        |
        v  train.py
scripts/med-ball-detector/runs/.../weights/best.pt
        |
        v  validate_box_size.py  (box size vs ground truth -- read this
        |                         before shipping; mAP is not the headline)
        v  convert_to_coreml.py
scripts/med-ball-detector/MedBallDetector.mlpackage
        |
        v  cp -r (a plain in-place replace -- see step 6)
ios/App/App/MedBallDetector.mlpackage
```

### 1. Label format

One JSON file per raw photo, same basename (`raw/gym1.jpg` ->
`labels/gym1.json`):

```json
{
  "image": "gym1.jpg",
  "boxes": [
    { "class": "med_ball", "x_center": 0.53, "y_center": 0.61, "width": 0.18, "height": 0.24 }
  ]
}
```

`x_center`/`y_center`/`width`/`height` are all normalized 0-1 against the
image's own dimensions (standard YOLO convention) -- `x_center`/`y_center`
is the box's center point, not its corner. A photo with no med ball visible
(or where one genuinely can't be confidently located) gets `"boxes": []`
rather than being skipped -- it's a valid negative example that helps the
model learn what ISN'T a med ball just as much as a positive one does.

Every photo gets ONE label file, written by directly looking at the image
and estimating the box -- there is no auto-labeling script for this step by
design (see the project's own decision: Claude labels offline, never an
automated CV heuristic, never a live API call).

### 2. `prepare_dataset.py`

```
python3 prepare_dataset.py
```

Reads every `raw/*` + matching `labels/*.json` pair, builds a YOLO-format
dataset (`dataset/images/{train,val}/`, `dataset/labels/{train,val}/`,
`dataset/dataset.yaml`) with a deterministic 85/15 split (hashed by
filename, so re-running with more photos added doesn't reshuffle photos
that were already in train back into val or vice versa). Prints how many
raw photos still have no label file yet, so it's obvious how much labeling
work remains.

### 3. `train.py`

```
pip install -r requirements.txt
python3 train.py
```

Fine-tunes a YOLOv8-nano model (pretrained COCO weights as the starting
point, not trained from scratch -- far less data needed this way) on the
prepared dataset. CPU-trainable; slower than a GPU box but workable for a
dataset this size. Outputs to `runs/detect/train/weights/best.pt`.

**Honest expectation**: a first small batch of reference photos is a
starting point, not a finished detector -- real diversity (lighting, gyms,
angles, occlusion) matters more than raw count. This is meant to be re-run
as `training-data/med-ball/raw/` grows, not a one-time step.

**Trained 2026-10-09 on all 266 images / 1,611 boxes** (the previous model
had 43 boxes across 41 images). 100 epochs requested; the run was stopped
at epoch 84 by its time limit, and the best checkpoint is **epoch 59**
(mAP50 0.4755, mAP50-95 0.2387, P 0.516, R 0.549) -- the 25 epochs after it
never beat it, so `best.pt` is the right artifact and the extra 16 would
very likely have changed nothing. Validation numbers are in step 4.

### 4. `validate_box_size.py` -- the number that actually matters

```
python3 validate_box_size.py
```

**mAP is the wrong headline for this model and will mislead you.** The
scale pipeline divides a plate's nominal diameter by the detected box's
long edge in pixels, so a box 2x too large reports a scale 2x too small and
halves the set's range of motion. A detector can post a respectable mAP
with systematically oversized boxes, because a 0.5 IoU threshold tolerates
a lot of slack -- and that is exactly what the old model did: measured
against the OVR on 2026-10-07, `plateScaleIfAdmitted` was 3.9x / 4.7x /
1.9x too small on three paired takes, so every gate in the pipeline
correctly refused the object witness and the scale fell back to body rulers
alone.

So this script IoU-matches each prediction to its ground truth and reports
the ratio of LONG EDGES, which is the one quantity the pipeline reads. On
the 41 held-out val images, at the pipeline's own `minDetectionConfidence`
of 0.25:

| class       | gt boxes | matched | recall |      median |  relMAD |  p90 |  max |
|-------------|---------:|--------:|-------:|------------:|--------:|-----:|-----:|
| plate       |       96 |      77 |    80% | **1.011**   | **0.056** | 1.16 | 1.50 |
| dumbbell    |       53 |      23 |    43% |     1.005   |   0.051 | 1.08 | 1.33 |
| barbell     |       30 |      19 |    63% | **1.031**   | **0.049** | 1.25 | 1.43 |
| baseball    |       20 |      10 |    50% |     1.084   |   0.079 | 1.25 | 1.26 |
| golf_ball   |       11 |       4 |    36% |     1.103   |   0.029 | 1.13 | 1.14 |
| kettlebell  |        6 |       5 |    83% |     1.134   |   0.106 | 1.21 | 1.40 |
| tennis_ball |        6 |       5 |    83% |     1.121   |   0.019 | 1.14 | 1.16 |
| med_ball    |        5 |       2 |    40% |     1.184   |   0.011 | 1.17 | 1.20 |
| **all**     |      227 |     145 |    64% |     1.031   |   0.066 |      |      |

**`relMAD` on the plate row is where `COREML_BOX_LONG_EDGE_UNCERTAINTY` comes from.** Until
2026-10-09 the plate ruler stated the disc's casting tolerance (6mm on 450mm, **1.3%**) as the
whole of its uncertainty and treated the CoreML box as exact -- so it claimed to be four times
more precise than the detector it reads, and because the blend weights by 1/sigma^2 that bought
it ~18x the weight it had earned. **Re-measure and re-state that constant on every retrain**; it
describes one specific set of weights.

Read it with three caveats, none of them optional:

- **`med_ball` (n=2) and `golf_ball` (n=4) medians mean nothing**, and
  neither do their suspiciously tight relMADs -- two matched boxes is not a
  measurement and the script says so in its own output. The val split is 41
  images chosen before anybody knew which classes were thin; the three rows
  with a real sample are `plate`, `dumbbell` and `barbell`, and the first and
  last carry the barbell lifts.
- **The TAIL is not covered by anything yet and is the thing to watch.** 6% of
  plates box past 1.25x, and a plate 25% wrong still agrees with a body ruler
  inside the blend's tolerance, so it is not stepped out and carries ~92% of
  the vote. On the 2026-10-09 Pendlay Row that projects to -20% where the body
  rulers alone give -14%. The guards catch a GROSSLY wrong plate (2.4x+) and
  nothing in the 1.1-2.0x band. No gate was invented for it: that band has
  never been observed on a real take, `plateBoxToExpectedRatio` is already
  shipping and reports it directly, and a gate fitted to a projection is how
  the refusals this repo has had to unship got written.
- **Recall is modest and that is the acceptable half of the trade.** A box
  the pipeline refuses is worth nothing, and the old model's boxes were
  refused on every take, so 80% of plates at the right size beats 100% at
  2x. Rule #1 is unaffected either way: a take with no object still writes
  its numbers from the body rulers, with a caveat.
- **This measures `best.pt`, not the shipped `.mlpackage`.** `coremltools`
  can convert on Linux but cannot `predict()` -- that needs macOS. The
  export is the same graph at fp16, which is a real if small difference.
  **The shipped proof is `plateBoxToExpectedRatio` near 1.0** in the next
  filmed set's `trackingDiagnostics.objectGate`; that diagnostic has been
  in the export since build 652 and exists for exactly this question.

### 5. `convert_to_coreml.py`

```
python3 convert_to_coreml.py
```

Converts the trained `.pt` weights to `MedBallDetector.mlpackage` via
ultralytics' built-in CoreML export (uses `coremltools` internally). This
is the file that actually ships in the app.

### 6. Bundling into the app

```
rm -rf ../../ios/App/App/MedBallDetector.mlpackage
cp -r MedBallDetector.mlpackage ../../ios/App/App/
```

**That is the whole step now, and no Xcode is involved.** The one-time
Xcode work is done: `project.pbxproj` holds it as a PATH reference
(`path = MedBallDetector.mlpackage`, `sourceTree = "<group>"`) already in
the App target's Resources phase, so replacing the directory in place keeps
target membership and the next build picks the new weights up. All three
files inside it are tracked in git.

**A retrain is a NATIVE change**: run `verify_build`, then `beta`.

`shared/the-shipped-detector-knows-every-class-we-ask-for.test.ts` is the
ratchet over this step. It reads the trackingModes out of the Swift
allow-list and the class labels out of the shipped model's own protobuf,
and fails when a mode has no class behind it -- which is the failure this
step can produce silently, because Vision matching nothing looks exactly
like a mode that never asked for an object (Rule #4). It also pins the
class ORDER and the 640x640 input, so a retrain that moves either has to
say so.

## Runtime behavior (Swift side)

`AvBodyTrackingPlugin.swift`'s med-ball detection path checks whether
`MedBallDetector.mlpackage` is actually present in the bundle before doing
anything with it. No bundled model -- it silently falls through to the existing
`AvImplementTracker` motion-diff tracker, completely unchanged. A bundled
model never blocks, delays, or fails a recording or its analysis; it's a
strictly additive signal to seed `VNTrackObjectRequest` more reliably than
motion-diff can. See that file's own comments for the exact fallback logic.
