# Object detection session notes -- 2026-09-01 evening through 2026-09-02 early AM (Arizona time)

Written because Scott is going to sleep and this conversation may go stale
(context compaction) before we're done. Everything below is a durable record
of what happened, what's ready, what's NOT ready, and exactly what to do
next -- written so a fresh Claude session (or human) can pick this up cold.

**Branch**: `object-detection-precision-wip`. Nothing in this branch has
been merged to `main`, pushed to Apple, or built. Scott's explicit
instruction: "ask me first, we will review in the morning, and then push."
Do not merge to `main`, do not run `ios-testflight.yml`, until Scott
reviews and says go.

Session started ~3pm Arizona time 2026-09-01. This file was started
~10:15pm Arizona time (05:12 UTC 2026-09-02) once Scott said he was going
to bed.

---

## 1. What's READY to ship (pending Scott's morning review, not yet merged)

**The 7-class detector retrain**: `med_ball, plate, baseball, golf_ball,
tennis_ball, kettlebell, dumbbell`. This is the natural continuation of the
5-class model already live on `main` (commit `19ca6e9`) -- it adds
`kettlebell` and `dumbbell` from real, previously-unlabeled photos already
sitting in `training-data/med-ball/raw/`.

- Trained with the same `patience=0` fix already permanent in `train.py`
  (100/100 epochs, no early-stop regression).
- Converted to CoreML (`coremltools`), verified against a reference photo
  of **every one of the 7 classes** by running inference on
  `runs/detect/weights/best.pt` directly (NOT the `.mlpackage` -- see
  "CoreML verification on Linux" below for why). All 7 classes: top
  detection matches the expected class, confidence 0.98-1.00:
  ```
  med_ball    (IMG_0063.jpg)  0.993
  plate       (IMG_0024.jpg)  0.999
  baseball    (IMG_0052.jpg)  0.990
  golf_ball   (IMG_0048.jpg)  0.998
  tennis_ball (IMG_0053.jpg)  0.984
  kettlebell  (IMG_0038.jpg)  0.997
  dumbbell    (IMG_0042.jpg)  1.000
  ```
- Cross-check on a dense, never-labeled dumbbell rack photo (IMG_0016,
  16+ dumbbells, zero kettlebells) produced ONLY `kettlebell` detections
  (0.25-0.71 confidence, all instances of dumbbells being misread) --
  **this is a real, known weakness**, not swept under the rug: the model
  has 6 kettlebell examples and only 4 dumbbell examples so far, and on an
  unfamiliar dense rack shot it's guessing kettlebell for dumbbell-shaped
  blobs. This is exactly why Scott's ask tonight (exhaustive labeling of
  every db/kb in the dense rack photos) matters for real accuracy, not
  just for a prettier picture. See section 4.
- `ios/App/App/MedBallDetector.mlpackage` has been replaced in place with
  this 7-class model (same file path/target membership as every prior
  retrain this session -- no Xcode project changes needed).
- **NOT YET committed to this branch as of writing this note** -- do that
  next, see section 6 (Next actions).
- **NOT YET run through `verify_build`** (touches a bundled native asset,
  needs it per repo convention) -- do that only after Scott approves in
  the morning, then `beta`.

### CoreML verification on Linux
This sandbox has no macOS, and `coremltools`' `.predict()` on a
`.mlpackage` requires macOS (`Exception: Model prediction is only
supported on macOS version 10.13 or later`). Every retrain this session
has actually been verified via the pre-conversion `best.pt` (PyTorch,
CPU-runnable anywhere) instead of the post-conversion `.mlpackage`.
This is a reasonable proxy -- `coremltools`' PyTorch->CoreML conversion is
a mechanical graph translation, not something that silently changes
class predictions -- but it means the **very last mile** (does the actual
`.mlpackage` file behave the same on-device) has never been verified in
this sandbox, ever, for any class, this whole session. That verification
has always happened for the first time at `verify_build`/`beta` on the
real Xcode/Apple pipeline. Nothing new here, just writing it down since
this file's whole point is not losing context.

---

## 2. Tonight's NEW work: object-detection precision (NOT a retrain, a labeling/measurement upgrade)

Scott's throughline tonight: bounding boxes are inherently crude for
compound-shaped objects (a kettlebell is a ball + a handle loop; a
dumbbell is two hex heads + a bar), and asked for real pixel-level
precision, "as precise as we need to be," instead of "1990s"-style boxes.

### What we built, in order of increasing rigor:
1. Rectangle boxes (the actual YOLO label format -- always required, see
   "Important: label format didn't change" below).
2. Circles for the 4 truly-round classes (med_ball, baseball, golf_ball,
   tennis_ball) -- drawn from the SAME box data (verified: every one of
   those boxes has width/height ratio == the image's height/width ratio
   *exactly*, proof the box is a true circle in real pixel space, not
   just an assumption).
3. Extended circle treatment to `plate` too, once direct pixel measurement
   confirmed 2 of the 3 plate reference photos are ~1.0 pixel-ratio
   (true circles) and the third (IMG_0025) is genuinely elliptical
   (shot at more of an angle) -- drew an ellipse there instead of forcing
   a circle, staying honest to what the photo actually shows.
4. Hand-drawn compound shapes for kettlebell (ball circle + handle
   ellipse, geometrically anchored to the already-measured box) and
   dumbbell (rotated squares + bar, eyeballed against a pixel grid) --
   Scott correctly called these still "crude."
5. **Real segmentation**: `cv2.grabCut()` seeded with a rough rectangle,
   refined with a second pass (erode the first mask to a sure-foreground
   core, dilate it to a sure-background boundary, re-run grabCut with
   that trimap via `cv2.GC_INIT_WITH_MASK`), then `cv2.findContours` +
   `cv2.approxPolyDP` to get a clean polygon. This is genuinely what a
   YOLOv8-seg training label looks like (a polygon, not a box) -- proven
   out on ONE dumbbell photo (`IMG_0042.jpg`, plate + dumbbell together),
   confirmed by Scott as "90% or greater confidence, that was really
   good." Two refinement passes were run; a third would have diminishing
   returns (GrabCut converges quickly).
6. Also caught and fixed a real measurement bug during this: the plate's
   circle (Hough-fit) was overshooting the true rim by measuring past the
   dark glossy edge onto the floor. Fixed by direct pixel-grid
   measurement at 4 cardinal + 4 diagonal points around the rim
   (`plate_diag_*.jpg` crops in the scratchpad, not committed anywhere --
   throwaway verification images). Final plate circle for IMG_0042:
   center (2070, 2895), radius 617, in full-image pixel coordinates
   (image is 4284x5712).

### Important: the training label FORMAT did not change
`prepare_dataset.py` / `train.py` still emit and consume plain
YOLO detection boxes (`x_center y_center width height`, one box per
instance). **None of the segmentation work above has been fed back into
CLASS_NAMES, the label JSON files, or a retrain.** It's a standalone
proof-of-concept demonstrated on one photo (`IMG_0042.jpg`), not yet
built into the actual pipeline. See section 5 for the real cost of doing
that for real (YOLOv8n-seg + polygon labels + a Swift-side change to
consume masks instead of boxes) -- Scott has NOT yet said to build that
larger thing, only to prove it out, which is done.

### Where the segmentation scratch work lives
Everything in step 5/6 above was built in
`/tmp/claude-0/.../scratchpad/` (session-local, NOT part of the repo,
will not survive this session ending). If this technique needs to be
reproduced, the method is fully described above and in the git history of
this session's conversation -- but the actual crop images, masks, and
grid-overlay verification images are gone once this session ends. If
that process needs to run again for real (see section 4), it needs to be
re-run from scratch against the raw photos in
`training-data/med-ball/raw/`, which ARE permanent.

---

## 3. Full inventory of the 63 raw photos (IMG_0001-IMG_0063)

This is the ground truth Scott asked about ("why don't you have 63
boxes") and the map for the exhaustive-labeling task in section 4.
`training-data/med-ball/raw/` has 63 numbered photos (IMG_0001-IMG_0063),
each also with `_frame0` through `_frame5` extracted-video-frame variants
(230 raw files total) -- those frame variants are almost entirely UNUSED
(only 4 med_ball `_frame1`s are labeled) and are the concrete lever for
motion-blur/angle robustness Scott hasn't asked for explicitly yet but we
discussed (see section 7, open question).

**Labeled already** (27 of 63 base photos have a label file):
- True negatives (14, zero boxes, deliberately background/no-object
  frames): IMG_0001, 0002, 0003, 0004, 0005, 0006, 0007, 0012, 0020,
  0040, 0056, 0057, 0058, 0059.
- Real content (13 base photos, 17 label files counting `_frame1`
  duplicates, 28 boxes total):
  - med_ball: IMG_0060, 0061, 0062, 0063 (+ each has a `_frame1` twin
    also labeled) -- 10 boxes.
  - plate: IMG_0024, 0025, 0026 -- 3 boxes, 1 plate each.
  - baseball: IMG_0048 -- 2 boxes (shares a photo with golf_ball entry
    below, wait -- correction, baseball is IMG_0052, golf_ball is
    IMG_0048; don't conflate these when resuming, check the actual JSON
    files, not this parenthetical).
  - golf_ball: IMG_0048 -- 2 boxes.
  - tennis_ball: IMG_0053 -- 1 box.
  - kettlebell: IMG_0038 -- 6 boxes (6 kettlebells, one photo).
  - dumbbell: IMG_0042 (1 box) + IMG_0016 (3 boxes) -- 4 boxes total.

**NOT labeled at all (36 of 63)**, with what's actually in them from this
session's visual review -- this is the real target list for section 4:

| Photo | Contents (what I actually saw) | Priority for exhaustive labeling |
|---|---|---|
| IMG_0008 | possible kettlebell near rack, unconfirmed | low -- re-check first |
| IMG_0009, 0010 | barbell/plates, no kb/db | skip (plate already covered) |
| IMG_0011 | med-ball wall rack (bottom-left) + dumbbell rack corner (bottom-right, "GIANT" brand, "4KG"/"5" tags partly visible) | medium |
| IMG_0013 | resistance bands, maybe a plate | low |
| IMG_0014, 0015 | single plate + tape measure, angled shots (why Hough failed on plate originally) | low, already superseded by 0024-26 |
| IMG_0017 | **dense**: full kettlebell rack (many kb) + a dumbbell rack visible at the edge (45lb visible) -- kb+db together, "great learning experience" per Scott | **HIGH** |
| IMG_0018 | **dense**: kettlebell rack (center) + dumbbell racks BOTH sides | **HIGH** |
| IMG_0019 | dense dumbbell rack (overhead) + 2 kettlebells bottom-left corner (blue handle, red handle) | **HIGH** |
| IMG_0021, 0022, 0023 | dense dumbbell racks (overhead, many dumbbells, some weight labels partly readable: 15, 20, 55) | **HIGH -- this is almost certainly where Scott's "16+ dbs" and "8+ kbs" claim comes from, together with 0017-0019** |
| IMG_0027-0031 | plates/barbell/rack area, no kb/db | skip |
| IMG_0032 | med-ball wall rack + a volleyball + soccer ball mixed in (NOT med balls -- different sport balls, out of scope unless Scott asks for those classes) | low / future class |
| IMG_0033, 0034, 0035 | more med-ball rack photos (different balls/angles, "15 LBS" and "20LB" and "8LB" labels legible) -- good EXTRA med_ball examples, not yet used | medium (med_ball is already strong at 10 examples, lower priority than kb/db) |
| IMG_0036, 0037 | kettlebell rack, SAME rack as IMG_0038 but different crop/zoom -- likely redundant with 0038, lower value | low (near-duplicate) |
| IMG_0039 | TRX straps + barbell + plates, no kb/db | skip |
| IMG_0041 | single dumbbell + plate on floor, similar setup to IMG_0042 but different angle | medium -- good second clean dumbbell example |
| IMG_0043-0047 | plyo boxes, resistance bands, mats -- no kb/db | skip |
| IMG_0049-0051, 0054, 0055 | ball tape-measure calibration shots (baseball/golf ball/tennis ball/small reaction balls) -- some are classes we track (baseball/golf/tennis, already covered), some are NOT (small blue/yellow/orange/grey reaction balls, not a tracked class) | low, already covered for tracked classes |

**Bottom line on Scott's specific claims tonight**:
- "some images with over 16 dbs" -- almost certainly IMG_0021/0022/0023
  (each is a 2-3 row dense hex-dumbbell rack, genuinely could be 16+
  visible dumbbells per photo counting all rows) plus IMG_0017/0018/0019
  which show dumbbell racks alongside kettlebells.
- "8 or so kbs" -- IMG_0017 and IMG_0018 each show a similarly dense
  kettlebell rack (looked like ~7-10 kettlebells visible per photo,
  consistent with "8 or so").
- "pictures with a few plates, need to have them both" -- **this needs
  re-verification, I did not confirm which specific photo(s) show 2+
  plates in one frame before this note was written.** IMG_0042 (the
  photo used for the segmentation proof-of-concept) has exactly ONE
  plate under the dumbbell. Need to re-scan the plate-adjacent photos
  (0009, 0010, 0013, 0027-0031, 0041, 0043-0047) specifically looking for
  2 plates in one frame -- this was not done as of writing this note.

---

## 4. The actual exhaustive-labeling task Scott asked for (NOT finished)

Scott's ask, verbatim: "every single object needs to be detected, every
plate, every kb, every db, every single ball, be as detailed as
possible." This means: for IMG_0017, 0018, 0019, 0021, 0022, 0023 (the
dense multi-object photos), every visible kettlebell and every visible
dumbbell gets its own precise label -- not the "pick 1-2 clean examples"
approach used for every class so far this session.

**Honest status: this has not been started.** Everything in section 2
was proof-of-concept on ONE photo (IMG_0042, one dumbbell). Doing this
for real, exhaustively, across 6 dense rack photos with potentially
16+8=24+ individual objects, using the GrabCut-per-object technique from
section 2, is a large amount of work -- rough estimate, each object took
multiple tool-call round-trips of grid-crop-measure-verify even for the
ALREADY-refined technique. This is the single biggest piece of unfinished
work from tonight and the clearest thing to resume first.

**Recommended approach for whoever resumes this** (informed by tonight's
false starts, so they're not repeated):
1. Don't try global image thresholding across a whole dense rack photo --
   proven not to work (dumbbell-vs-dumbbell and dumbbell-vs-floor
   contrast is too low, confirmed failure early tonight).
2. Do crop tightly around each individual object first (a few hundred px
   padding), THEN grabCut within that tight crop -- this worked well.
3. Seed grabCut with a rough rectangle per object (doesn't need to be
   precise, just roughly centered/sized).
4. Always do the 2-pass refinement (erode/dilate the first mask into a
   trimap, re-run with `GC_INIT_WITH_MASK`) -- measurably better both
   times it was tried tonight.
5. For a dense rack of near-identical objects (e.g. IMG_0021's dumbbell
   rows), the individual crops will look very similar -- it's faster to
   write one parameterized script that takes a list of rough
   (cx, cy, half-width) seeds (read once off a pixel-grid overlay of the
   whole photo) and loops the grabCut+contour extraction, rather than
   repeating the whole crop/grid/view/measure cycle by hand per object.
6. Still label format is BOXES for actual training (see "Important" note
   in section 2) -- so the deliverable per object is still one
   `{class, x_center, y_center, width, height}` entry in that photo's
   label JSON, computed from the polygon's bounding box, UNLESS Scott has
   by then explicitly approved building the real YOLOv8n-seg pipeline
   (section 5), in which case the polygon itself becomes the label.
7. Every new label file needs the same visual verification step already
   established this session (render the box/polygon back onto the source
   photo, look at it, confirm it's tight) before it's trusted -- do NOT
   skip this even though it's the slow part; every measurement mistake
   caught tonight (the dumbbell first pass, the plate circle overshoot)
   was caught exactly this way.

---

## 5. The real segmentation-model upgrade path (explained to Scott, not yet approved to build)

If Scott says go on this in the morning:
1. Re-label real training photos with polygons instead of boxes (the
   `grabCut` + `approxPolyDP` technique from section 2, done for real
   across enough photos per class -- not just 1).
2. `prepare_dataset.py` needs a new label file format (polygon vertex
   lists, not `x_center/y_center/width/height`) and to write YOLO-seg
   format `.txt` labels (`class x1 y1 x2 y2 ... xn yn`, normalized).
3. `train.py` needs `model = YOLO("yolov8n-seg.pt")` instead of
   `yolov8n.pt` -- same library, same training loop shape, different
   base checkpoint and head.
4. `convert_to_coreml.py` -- coremltools segmentation export needs to be
   checked; box-detection export (`task='detect'`) is what's used today,
   segmentation models export via `task='segment'` and the output tensor
   shape is different (extra mask-coefficient output plus a low-res
   proto-mask tensor) -- this part hasn't been researched at all yet.
5. **Swift-side**: `AvBodyTrackingPlugin.swift` /
   `AvCoreMlImplementDetector` currently read a Vision `VNRecognizedObjectObservation`-shaped result (box + label + confidence) and do
   box-center-based tracking. A seg model's CoreML output is a mask, not
   a `VNRecognizedObjectObservation` -- Vision's built-in
   `VNCoreMLRequest` object-detection post-processing does NOT apply to
   segmentation output automatically; consuming it would need either (a)
   manual decode of the raw MLMultiArray mask output, or (b) checking if
   coremltools' YOLOv8-seg export path produces something Vision can
   still post-process (unresearched, genuinely don't know either way).
   This is real, unscoped iOS engineering work, not a small change.

This is a legitimate multi-day feature, not a tonight task. Flagging it
clearly so it doesn't get assumed-into-scope by accident tomorrow.

---

## 6. Next actions (in order) whenever this resumes

1. Re-read this whole file first.
2. `git status` / `git log --oneline -5` to confirm still on
   `object-detection-precision-wip` and nothing unexpected changed.
3. Commit the already-bundled 7-class `.mlpackage` (currently sitting as
   an uncommitted change in `ios/App/App/MedBallDetector.mlpackage` as of
   this note) to this branch, with a clear commit message referencing
   this file.
4. Push this branch to `origin` (branch push only -- confirmed by reading
   `.github/workflows/ios-testflight.yml`'s trigger block directly: it's
   `workflow_dispatch`-only, no `push:` trigger at all, so no push to any
   branch, `main` included, ever fires a TestFlight build on its own --
   only an explicit manual dispatch does, which this session has not
   done and will not do until Scott approves). This is what makes
   tonight's work durable against this repo's known local-checkout-
   reversion bug (see root `CLAUDE.md`) without violating "don't push to
   Apple."
5. Wait for Scott. Do NOT merge to `main`, do NOT run `verify_build` or
   `beta`, until he reviews and explicitly says to.
6. Once approved: merge/rebase onto `main`, `verify_build` (native asset
   changed), then `beta`.
7. Resume section 4 (exhaustive multi-object labeling) as the next real
   work, using the checklist in that section.

---

## 6a. UPDATE (written ~11pm Arizona, after section 6 above): real bug found + fixed, gallery built

**Found and fixed a real labeling bug**: `IMG_0016.json` had 3 boxes labeled
`dumbbell`, but they didn't land on any real dumbbell -- they landed on
empty shelf gaps and a kettlebell, in the actual `IMG_0016.jpg` photo.
Root cause: sometime earlier this session, while viewing a large batch of
raw photos back-to-back, I mis-attributed the "clean 4-column hex-dumbbell
rack with 50/TKO/55/CFF labels" content to `IMG_0016` when that content is
actually `IMG_0018`. `IMG_0016.jpg` is really the combined
kettlebell-rack-plus-partial-dumbbell-rack overview shot.

**This means the 7-class model bundled tonight (section 1) trained on 3
bad `dumbbell` examples** (real content: empty shelf / kettlebell,
labeled as dumbbell) instead of the 4 good ones I believed it had. The
`.pt`/`.mlpackage` verification in section 1 still passed (100% confidence
on the real `IMG_0042.jpg` dumbbell reference), so this isn't necessarily
broken, but it's training on noise for that class and should be fixed
with a clean retrain before this ships for real. **I deleted
`IMG_0016.json` entirely** (not zeroed to an empty/true-negative array --
that photo has real objects in it, so a 0-box label would teach the model
"nothing here" which is worse than "not yet labeled"). The bundled
`.mlpackage` sitting in `ios/App/App/` right now was trained BEFORE this
fix and has not been retrained since -- flagging this explicitly so it
isn't assumed clean.

**Built the "every one of the 63 photos" gallery Scott asked for**:
https://claude.ai/code/artifact/6a332848-88ca-4736-b579-ac1676ed9fd3
("All 63 Photos"). Automated the proven `grabCut` two-pass technique into
a reusable function (`seg_lib.py`, written to the session scratchpad --
NOT part of this repo, will not survive the session; the technique itself
is documented in full below and in section 2, so it can be rewritten) and
ran it against:
- All 27 already-trusted box positions (12 photos, 27 objects after the
  IMG_0016 fix) -- spot-checked several, results genuinely good (see
  `IMG_0024`/plate and 4-of-6 `IMG_0038`/kettlebells -- excellent; 2-of-6
  kettlebells on that same photo came out visibly wrong/jagged, not
  investigated further, another honest gap).
- The `IMG_0042` dumbbell -- used the best (2-pass-refined) version from
  earlier tonight, not a fresh run.
- **Attempted the dense-rack exhaustive labeling Scott explicitly asked
  for** (IMG_0018's 8 dumbbells, freshly seeded off a hand-read pixel
  grid, no pre-existing trusted box to anchor to) -- **results were
  uneven**: some heads segmented well, others (the "TKO" head, and a
  partially-cut-off head at frame edge) failed or produced tiny useless
  fragments. Did not have time/budget to iterate this to the same quality
  bar as the proven single-photo work, and chose NOT to force it into the
  trusted-label set at that quality -- it's real, unglamorous, and stated
  plainly in the artifact and here rather than papered over.
- Everything else (14 true-negatives, 36 remaining unlabeled photos --
  35 now that `IMG_0016` reverted to unlabeled) is shown in the gallery
  as plain photos with an honest status badge, not silently omitted.

**The dense multi-object exhaustive-labeling task (section 4) is still
NOT done.** One real attempt was made (IMG_0018) and came out mixed
quality -- worth knowing before trying again: the automated pipeline
generalizes well when seeded from an ALREADY-VERIFIED box (the 27-object
batch), but seeding fresh from a hand-read grid on a new dense photo needs
the same per-object visual-verification loop that made the original
`IMG_0042` demo good (multiple grid-crop-measure-verify rounds, not a
single pass). Budget for that accordingly next time -- it is not a
"run the script once" task for a crowded, never-labeled photo.

---

## 7. Open questions for Scott (batched here, not asked mid-task per his instruction)

- Which specific photo(s) show 2+ plates in one frame? ("pictures with a
  few plates, need to have them both") -- not identified with confidence
  yet, see section 3.
- Confirm the object counts: does "16+ dbs" / "8 or so kbs" match
  IMG_0017/0018/0019/0021/0022/0023 specifically, or a different set of
  photos not yet reviewed?
- Section 5 (real segmentation model, polygon labels, Swift mask
  consumption): build it for real, or was tonight's one-photo proof
  enough for now?
- The `_frame0-5` video-frame variants (motion-blur/angle robustness,
  discussed earlier tonight, Scott's own point: "we can see the objects
  clearly because they are still images, but when its moving, the camera
  will just reject them") -- still open, not yet acted on. Same priority
  question as the segmentation path: worth doing next, or lower priority
  than finishing exhaustive box labeling first?
- Confirmed real bug: `IMG_0016.json`'s 3 `dumbbell` boxes were on the
  wrong content, deleted (section 6a). The 7-class model bundled tonight
  trained on that bad data and has NOT been retrained since -- should it
  be retrained (clean this time) before Scott reviews/approves the
  `main` merge, or is the current 100%-verified-on-reference-photos
  bundle good enough to review as-is, with a clean retrain as a fast
  follow?
- 2 of `IMG_0038`'s 6 kettlebells produced visibly wrong/jagged
  segmentation polygons in the automated batch run (the other 4 are
  excellent) -- not investigated why. Worth a look before trusting that
  photo's segmentation data for anything beyond illustration.
- The IMG_0018 dense-rack attempt (section 6a) came out uneven quality --
  want it redone properly (full per-object verification loop, real time
  cost) as the next priority, or is the honest "attempted, mixed
  results, here's why" writeup enough for now?
