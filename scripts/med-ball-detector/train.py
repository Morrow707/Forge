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
        patience=20,  # early-stop if validation stops improving, small dataset overfits fast
        project=str(DETECTOR_DIR / "runs"),
        name="detect",
        exist_ok=True,
    )
    best_weights = DETECTOR_DIR / "runs" / "detect" / "weights" / "best.pt"
    print(f"\nTraining done. Best weights: {best_weights}")
    print("Next: python3 convert_to_coreml.py")


if __name__ == "__main__":
    main()
