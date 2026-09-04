#!/usr/bin/env python3
"""Converts the trained YOLOv8 weights to ONNX, for the Android/web implement
detector (see client/src/lib/implement-detection.ts) -- the browser-side twin
of convert_to_coreml.py's own export, same trained weights, different runtime
(onnxruntime-web instead of CoreML, since the Android/web app is a browser/
WebView, not a native binary).

Same nms=True convention as the CoreML export: NMS is folded into the graph
itself, so the browser-side code reads pre-filtered boxes directly instead of
re-implementing NMS in JS. Verified empirically against this repo's own
training images (not assumed from documentation) -- output0 is [1, 300, 6],
each row [x1, y1, x2, y2, confidence, classId] in PIXEL coordinates relative
to the 640x640 input (NOT normalized 0-1), zero-padded past however many real
detections exist. classId indexes into dataset.yaml's own names list (0=
med_ball, 1=plate, 2=baseball, 3=golf_ball, 4=tennis_ball, 5=kettlebell,
6=dumbbell, 7=barbell) -- same order implement-detection.ts's own CLASS_NAMES
must match exactly.
"""

import shutil
import sys
from pathlib import Path

DETECTOR_DIR = Path(__file__).resolve().parent
BEST_WEIGHTS = DETECTOR_DIR / "runs" / "detect" / "weights" / "best.pt"
OUTPUT_NAME = "MedBallDetector.onnx"


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
    exported_path = model.export(format="onnx", nms=True, imgsz=640, simplify=True)

    final_path = DETECTOR_DIR / OUTPUT_NAME
    if Path(exported_path).resolve() != final_path.resolve():
        if final_path.exists():
            final_path.unlink()
        shutil.move(exported_path, final_path)

    print(f"\nExported: {final_path}")
    print("Next: copy this file into client/public/models/ so it's served as a static")
    print("asset (see implement-detection.ts's own MODEL_URL comment) -- this script")
    print("intentionally doesn't do that copy itself, same as convert_to_coreml.py")
    print("leaving the Xcode bundling step manual.")


if __name__ == "__main__":
    main()
