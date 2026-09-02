#!/usr/bin/env python3
"""Builds a YOLO-format dataset from training-data/med-ball/{raw,labels}.

See this directory's README.md for the label file format and the full
pipeline this script is one step of. Deliberately dependency-free (stdlib
only) -- this step just rearranges files and writes text, no reason to
require ultralytics/coremltools before that's actually needed (train.py).

See SESSION_NOTES_2026-09-01.md in this directory for the full account of
where kettlebell/dumbbell came from, the real labeling bug found and fixed
that night (IMG_0016.json had 3 dumbbell boxes on the wrong content --
deleted, don't resurrect it without re-verifying against the real photo
first), the segmentation (cv2.grabCut) precision work proven out on one
photo but not yet built into this pipeline, and the still-open exhaustive
multi-object labeling task for the dense kettlebell/dumbbell rack photos.
"""

import hashlib
import json
import shutil
import sys
from pathlib import Path

DETECTOR_DIR = Path(__file__).resolve().parent
REPO_ROOT = DETECTOR_DIR.parent.parent
RAW_DIR = REPO_ROOT / "training-data" / "med-ball" / "raw"
LABELS_DIR = REPO_ROOT / "training-data" / "med-ball" / "labels"
DATASET_DIR = DETECTOR_DIR / "dataset"

# med_ball validated first per the original explicit decision to prove out
# on one exercise before expanding; plate added as index 1 once the med-ball
# labeling technique (circle-fit precision) was proven out. baseball/
# golf_ball/tennis_ball added the same way, from real photos of each
# (training-data/med-ball/raw/IMG_0048/0052/0053.jpg) rather than invented --
# "how can it tell the difference between a tennis ball and baseball?
# similar shape, obviously different texture and different color" -- these
# are exactly the features a CNN backbone learns to split on, given real
# labeled examples of each, same as every class before them.
#
# kettlebell/dumbbell added from real gym photos already in raw/ that had
# never been labeled (IMG_0038.jpg -- 6 kettlebells on a shelf; IMG_0016.jpg
# and IMG_0042.jpg -- dumbbells on a rack and on the floor) -- "i have 5
# photos with kbs in them and 9 photos with dbs in them, now in a few photos
# both dbs and kbs are both seen, which is a great learning experience."
# Neither object is a true circle from any angle (bell + handle; hex-head
# barbell shape), so these boxes are manually measured against each photo's
# pixel dimensions rather than Hough-circle-fit, the same technique used for
# the plate class's angled/textured photos. Each future object type gets its
# own new index the same way.
#
# barbell added 2026-09-02 (Scott: "Should be db, kb, the barbells... plates,
# and the balls, all of the balls") from clean isolated rack photos
# (IMG_0009.jpg, IMG_0041.jpg -- straight bar with plates loaded, sleeve +
# collar clearly visible). Scott separately mentioned "one photo has a
# safety squat bar" -- searched the full 63-photo set for it (every rack/
# barbell overview shot, IMG_0001/2/3/4/6/7/8/9/10/11/12/13/37/39/40/41/43/44)
# and did not find an unambiguous SSB silhouette (camber yoke + two forward
# handles) -- what looked promising in IMG_0043/44 turned out to be a wall-
# mounted resistance-band anchor post next to a straight bar, and the
# apparent curve at the top of that same bar is consistent with wide-angle
# phone lens barrel distortion, not a physical bend. Flagged back to Scott
# rather than guessing and mislabeling a straight bar as an SSB.
CLASS_NAMES = ["med_ball", "plate", "baseball", "golf_ball", "tennis_ball", "kettlebell", "dumbbell", "barbell"]

VAL_FRACTION = 0.15
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic"}


def val_split_for(filename: str) -> bool:
    """Deterministic hash-based split -- adding more labeled photos later
    never reshuffles a photo that was already assigned to train into val
    or vice versa, since each filename's assignment depends only on itself."""
    digest = hashlib.sha256(filename.encode("utf-8")).hexdigest()
    return (int(digest[:8], 16) / 0xFFFFFFFF) < VAL_FRACTION


def main() -> None:
    if not RAW_DIR.exists() or not LABELS_DIR.exists():
        print(f"Missing {RAW_DIR} or {LABELS_DIR} -- nothing to prepare yet.")
        sys.exit(1)

    raw_files = {p.stem: p for p in RAW_DIR.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS}
    label_files = sorted(LABELS_DIR.glob("*.json"))

    if DATASET_DIR.exists():
        shutil.rmtree(DATASET_DIR)
    for split in ("train", "val"):
        (DATASET_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
        (DATASET_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)

    prepared = 0
    skipped_missing_image = []
    for label_path in label_files:
        with open(label_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        stem = label_path.stem
        image_path = raw_files.get(stem)
        if image_path is None:
            skipped_missing_image.append(label_path.name)
            continue

        split = "val" if val_split_for(image_path.name) else "train"
        dest_image = DATASET_DIR / "images" / split / image_path.name
        shutil.copy2(image_path, dest_image)

        lines = []
        for box in data.get("boxes", []):
            class_name = box.get("class")
            if class_name not in CLASS_NAMES:
                print(f"WARNING: {label_path.name} has unknown class '{class_name}', skipping that box")
                continue
            class_idx = CLASS_NAMES.index(class_name)
            lines.append(
                f"{class_idx} {box['x_center']:.6f} {box['y_center']:.6f} "
                f"{box['width']:.6f} {box['height']:.6f}"
            )
        # Empty file (no lines) is a valid YOLO label for a true-negative
        # image -- ultralytics treats a label file with zero boxes as
        # "no objects here," not as a missing/invalid label.
        label_dest = DATASET_DIR / "labels" / split / f"{image_path.stem}.txt"
        label_dest.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
        prepared += 1

    unlabeled = [name for name in raw_files if name not in {p.stem for p in label_files}]

    dataset_yaml = DATASET_DIR / "dataset.yaml"
    dataset_yaml.write_text(
        "path: " + str(DATASET_DIR) + "\n"
        "train: images/train\n"
        "val: images/val\n"
        "names:\n" + "".join(f"  {i}: {name}\n" for i, name in enumerate(CLASS_NAMES)),
        encoding="utf-8",
    )

    print(f"Prepared {prepared} labeled photo(s) into {DATASET_DIR}")
    if unlabeled:
        print(f"{len(unlabeled)} raw photo(s) still have no label file yet: {', '.join(sorted(unlabeled)[:10])}"
              + (" ..." if len(unlabeled) > 10 else ""))
    if skipped_missing_image:
        print(f"{len(skipped_missing_image)} label file(s) had no matching raw photo: "
              f"{', '.join(skipped_missing_image[:10])}")
    if prepared == 0:
        print("Nothing labeled yet -- nothing to train on. Label some photos first.")


if __name__ == "__main__":
    main()
