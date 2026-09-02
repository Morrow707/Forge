#!/usr/bin/env python3
"""Fine-tunes a YOLOv8-nano detector on the dataset prepare_dataset.py built.

Starts from Ultralytics' pretrained COCO weights (yolov8n.pt) rather than
training from scratch -- transfer learning from a model that already knows
general visual features (edges, shapes, textures) needs far less
task-specific data than starting from random weights, which matters a lot
for a first small reference-photo batch. See this pipeline's README for
the realistic expectations on a small dataset.

CPU-trainable by design (imgsz/epochs/batch kept modest) -- this sandbox
has no GPU. Slower than a GPU box, workable for a dataset this size.

Verifying the result: coremltools' .predict() on the exported .mlpackage
requires macOS ("Model prediction is only supported on macOS version
10.13 or later") and this sandbox has none, so every retrain this session
has been verified via direct inference on runs/detect/weights/best.pt
(pre-CoreML-conversion, plain PyTorch, CPU-runnable anywhere) against a
real reference photo of every class, not the .mlpackage itself. See
SESSION_NOTES_2026-09-01.md for the exact verification numbers from the
7-class (kettlebell/dumbbell added) retrain, and for a real labeling bug
(IMG_0016.json) found and fixed after that model had already trained on
the bad data -- a clean retrain is recommended before that model ships.
"""

import sys
from pathlib import Path

DETECTOR_DIR = Path(__file__).resolve().parent
DATASET_YAML = DETECTOR_DIR / "dataset" / "dataset.yaml"

EPOCHS = 100
IMAGE_SIZE = 640
BATCH_SIZE = 8


def main() -> None:
    if not DATASET_YAML.exists():
        print(f"{DATASET_YAML} doesn't exist -- run prepare_dataset.py first.")
        sys.exit(1)

    try:
        from ultralytics import YOLO
    except ImportError:
        print("ultralytics isn't installed -- run: pip install -r requirements.txt")
        sys.exit(1)

    model = YOLO("yolov8n.pt")
    model.train(
        data=str(DATASET_YAML),
        epochs=EPOCHS,
        imgsz=IMAGE_SIZE,
        batch=BATCH_SIZE,
        device="cpu",
        # No early stopping. patience=20 seemed reasonable for the single-class
        # med_ball case (which converged to 99% confidence well inside that
        # window), but adding a second class exposed why it isn't a safe
        # default here: with only a handful of examples per class, the
        # classification head needs far longer to separate them than the
        # box/objectness heads need to find "something round" at all -- a
        # multi-class run val-plateaued for 20+ straight epochs while
        # cls_loss was still visibly falling, early-stopped at epoch 4, and
        # produced a model that couldn't confidently detect even its own
        # training images (any class). Running the full EPOCHS with patience
        # disabled let that same run break through by epoch ~80 to 99%+
        # precision/recall. The cost is always paying for all EPOCHS instead
        # of stopping early on an easy run -- cheap at this dataset's size.
        patience=0,
        project=str(DETECTOR_DIR / "runs"),
        name="detect",
        exist_ok=True,
    )
    best_weights = DETECTOR_DIR / "runs" / "detect" / "weights" / "best.pt"
    print(f"\nTraining done. Best weights: {best_weights}")
    print("Next: python3 convert_to_coreml.py")


if __name__ == "__main__":
    main()
