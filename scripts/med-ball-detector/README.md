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
        v  convert_to_coreml.py
scripts/med-ball-detector/MedBallDetector.mlpackage
        |
        v  (manual: drag into Xcode, add to AvBodyTrackingPlugin.swift's
        |   target's "Copy Bundle Resources" build phase -- can't be
        |   scripted without a real Xcode install)
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

### 4. `convert_to_coreml.py`

```
python3 convert_to_coreml.py
```

Converts the trained `.pt` weights to `MedBallDetector.mlpackage` via
ultralytics' built-in CoreML export (uses `coremltools` internally). This
is the file that actually ships in the app.

### 5. Bundling into the app

Copy `MedBallDetector.mlpackage` into `ios/App/App/`, then in Xcode add it
to the `App` target's "Copy Bundle Resources" build phase. This step needs
a real Xcode install and can't be scripted from here -- do it once, then
every future retrain just replaces the same file (same target membership
stays intact on an Xcode-side file replace).

## Runtime behavior (Swift side)

`AvBodyTrackingPlugin.swift`'s med-ball detection path checks whether
`MedBallDetector.mlpackage` is actually present in the bundle before doing
anything with it. No bundled model (the current state, until step 5 above
happens at least once) -- it silently falls through to the existing
`AvImplementTracker` motion-diff tracker, completely unchanged. A bundled
model never blocks, delays, or fails a recording or its analysis; it's a
strictly additive signal to seed `VNTrackObjectRequest` more reliably than
motion-diff can. See that file's own comments for the exact fallback logic.
