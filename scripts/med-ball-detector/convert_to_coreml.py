#!/usr/bin/env python3
"""Converts the trained YOLOv8 weights to a CoreML .mlpackage.

Uses ultralytics' own `model.export(format="coreml")`, which wraps
coremltools internally with the right YOLO-specific export settings
(NMS folded into the model graph, correct input/output naming) rather than
hand-rolling a coremltools conversion -- getting those export settings
wrong produces a .mlpackage that loads fine in Xcode but silently returns
garbage predictions, which is a much worse failure mode than this script
just not existing.
"""

import shutil
import sys
from pathlib import Path

DETECTOR_DIR = Path(__file__).resolve().parent
BEST_WEIGHTS = DETECTOR_DIR / "runs" / "detect" / "weights" / "best.pt"
OUTPUT_NAME = "MedBallDetector.mlpackage"


def main() -> None:
    if not BEST_WEIGHTS.exists():
        print(f"{BEST_WEIGHTS} doesn't exist -- run train.py first.")
        sys.exit(1)

    try:
        from ultralytics import YOLO
    except ImportError:
        print("ultralytics isn't installed -- run: pip install -r requirements.txt")
        sys.exit(1)

    model = YOLO(str(BEST_WEIGHTS))
    exported_path = model.export(format="coreml", nms=True, imgsz=640)

    final_path = DETECTOR_DIR / OUTPUT_NAME
    if Path(exported_path).resolve() != final_path.resolve():
        if final_path.exists():
            shutil.rmtree(final_path)
        shutil.move(exported_path, final_path)

    print(f"\nExported: {final_path}")
    print("Next (manual, needs a real Xcode install -- see this pipeline's README):")
    print(f"  1. Copy {OUTPUT_NAME} into ios/App/App/")
    print("  2. In Xcode, add it to the App target's \"Copy Bundle Resources\" build phase")
    print("  3. verify_build to confirm it compiles before shipping a beta")


if __name__ == "__main__":
    main()
