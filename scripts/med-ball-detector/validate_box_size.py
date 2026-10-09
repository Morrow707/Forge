"""Measures the trained detector's BOX SIZE against ground truth on the held-out val split.

WHY THIS AND NOT mAP. mAP answers "did it find the object", and the Forge scale pipeline does
not care very much: `plateScaleIfAdmitted` divides a plate's NOMINAL diameter by the detected
box's long edge in pixels, so a box that is 2x too large reports a scale 2x too small and the
set's range of motion halves. A detector can score a respectable mAP with boxes that are
systematically oversized, because a 0.5 IoU threshold tolerates a lot of slack.

So this script matches each prediction to its ground-truth box by IoU and reports the ratio of
LONG EDGES -- the one number the pipeline actually reads. 1.00 is the target; the model shipped
before 2026-10-09 measured 2.09x (plate), 2.81x (med_ball) and 6.73x (dumbbell) too large on
real takes, which is the whole reason the object witness was refused by every gate.

Run after train.py:  python3 validate_box_size.py
"""

from __future__ import annotations

import statistics
import sys
from collections import defaultdict
from pathlib import Path

DETECTOR_DIR = Path(__file__).resolve().parent
BEST_WEIGHTS = DETECTOR_DIR / "runs" / "detect" / "weights" / "best.pt"
VAL_IMAGES = DETECTOR_DIR / "dataset" / "images" / "val"
VAL_LABELS = DETECTOR_DIR / "dataset" / "labels" / "val"

#: Matching threshold. Deliberately loose: the question is not "is this detection good enough to
#: count" but "when it did find the object, how big did it draw the box", and a tight threshold
#: would silently drop exactly the oversized boxes this measures.
IOU_MATCH = 0.3

#: Confidence floor, matching `minDetectionConfidence` in the shipped pipeline (build 619).
CONF = 0.25


def iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    return inter / (area_a + area_b - inter)


def long_edge(box: tuple[float, float, float, float]) -> float:
    return max(box[2] - box[0], box[3] - box[1])


def main() -> int:
    if not BEST_WEIGHTS.exists():
        print(f"no trained weights at {BEST_WEIGHTS} -- run train.py first")
        return 1

    from ultralytics import YOLO  # imported late: heavy, and absent on a checkout that never trains

    model = YOLO(str(BEST_WEIGHTS))
    names = model.names

    gt_count: dict[str, int] = defaultdict(int)
    matched: dict[str, list[float]] = defaultdict(list)

    images = sorted(p for p in VAL_IMAGES.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    if not images:
        print(f"no val images under {VAL_IMAGES}")
        return 1

    for image_path in images:
        label_path = VAL_LABELS / f"{image_path.stem}.txt"
        if not label_path.exists():
            continue

        result = model.predict(str(image_path), conf=CONF, verbose=False)[0]
        h, w = result.orig_shape

        truth: list[tuple[int, tuple[float, float, float, float]]] = []
        for line in label_path.read_text().split("\n"):
            parts = line.split()
            if len(parts) != 5:
                continue
            cls, cx, cy, bw, bh = int(parts[0]), *(float(v) for v in parts[1:])
            truth.append((cls, (
                (cx - bw / 2) * w, (cy - bh / 2) * h, (cx + bw / 2) * w, (cy + bh / 2) * h,
            )))
            gt_count[names[cls]] += 1

        preds = [
            (int(c), tuple(float(v) for v in xyxy))
            for c, xyxy in zip(result.boxes.cls.tolist(), result.boxes.xyxy.tolist())
        ]

        # Greedy best-IoU match, each ground-truth box claimed at most once, same class only.
        taken: set[int] = set()
        for cls, gt_box in truth:
            best_i, best_iou = None, 0.0
            for i, (p_cls, p_box) in enumerate(preds):
                if i in taken or p_cls != cls:
                    continue
                score = iou(gt_box, p_box)
                if score > best_iou:
                    best_i, best_iou = i, score
            if best_i is not None and best_iou >= IOU_MATCH:
                taken.add(best_i)
                gt_edge = long_edge(gt_box)
                if gt_edge > 0:
                    matched[names[cls]].append(long_edge(preds[best_i][1]) / gt_edge)

    print(f"{len(images)} val images, conf>={CONF}, IoU>={IOU_MATCH}\n")
    header = f"{'class':14}{'gt':>6}{'match':>7}{'recall':>8}{'median':>9}{'relMAD':>9}{'p90':>7}{'max':>7}"
    print(header)
    for cls in sorted(gt_count, key=lambda c: -gt_count[c]):
        ratios = sorted(matched[cls])
        recall = len(ratios) / gt_count[cls] if gt_count[cls] else 0.0
        if not ratios:
            print(f"{cls:14}{gt_count[cls]:>6}{0:>7}{recall:>7.0%}{'-':>9}{'-':>9}{'-':>7}{'-':>7}")
            continue
        median = statistics.median(ratios)
        # relMAD is the number COREML_BOX_LONG_EDGE_UNCERTAINTY is set from (the widest of the
        # three classes with a real sample). MAD rather than stdev on purpose: a detector that
        # boxed one frame's rack upright instead of the plate is exactly the tail this must not
        # follow, which is the same argument plateScaleFromFrames makes for taking a median.
        mad = statistics.median([abs(r - median) for r in ratios])
        p90 = ratios[max(0, int(0.9 * len(ratios)) - 1)]
        print(f"{cls:14}{gt_count[cls]:>6}{len(ratios):>7}{recall:>7.0%}"
              f"{median:>9.3f}{mad / median:>9.3f}{p90:>7.2f}{ratios[-1]:>7.2f}")

    every = sorted(r for rs in matched.values() for r in rs)
    if every:
        med = statistics.median(every)
        mad = statistics.median([abs(r - med) for r in every])
        print(f"\nall classes: n={len(every)} median={med:.3f} relMAD={mad / med:.3f} "
              f"mean={statistics.fmean(every):.3f}")
    print("\nA class with fewer than ~20 matches has no usable spread -- do not set a constant "
          "from it.\nrelMAD here is what client/src/lib/pose-tracking.ts's "
          "COREML_BOX_LONG_EDGE_UNCERTAINTY states.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
