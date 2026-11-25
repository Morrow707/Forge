#!/usr/bin/env python3
"""Shows the detector what a cheaper phone sees (2026-11-24).

Scott: the camera has to be "95% first try" for anyone, on any iPhone, "point and shoot". Every
training photo so far came from one Pro phone. A non-Pro phone's 0.5x lens in a gym hands the
detector a softer, noisier, more compressed frame, and a detector that has never seen one draws
its boxes on a picture it does not recognise -- which reads as a scale error, not a missed object.

Run after prepare_dataset.py and before train.py:
  * every TRAIN image gets one degraded copy beside it (same labels: nothing here moves an
    object, so the box is still exactly where the outline says), and
  * the 41 VAL images are copied, degraded, into images/val_phone and labels/val_phone, so
    `validate_box_size.py --val-dir val_phone` judges the model on held-out cheap-phone frames.
The real val split is untouched, so the clean numbers stay comparable with every earlier run.

What a degraded frame is, each step drawn per image from a fixed seed:
  * resolution: down to 45-70% and back up (a 12MP ultra-wide binned to video, then scaled to
    the 640px the detector reads);
  * sensor noise: Gaussian, sigma 3-9 grey levels (gym light at a higher ISO);
  * motion: a short horizontal or vertical blur of 1-5 pixels (a moving bar at 1/60s);
  * compression: JPEG at quality 35-65.
No geometric warp: the app asks iOS to correct the ultra-wide's lens distortion (see
AvBodyTrackingPlugin.swift, isGeometricDistortionCorrectionEnabled), so the detector never sees it.
"""

import random
import shutil
from pathlib import Path

import cv2
import numpy as np

DETECTOR_DIR = Path(__file__).resolve().parent
DATASET = DETECTOR_DIR / "dataset"
SEED = 20261124
SUFFIX = "_phone"


def degrade(image: np.ndarray, rng: random.Random) -> np.ndarray:
    h, w = image.shape[:2]
    factor = rng.uniform(0.45, 0.70)
    small = cv2.resize(image, (max(1, int(w * factor)), max(1, int(h * factor))), interpolation=cv2.INTER_AREA)
    out = cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32)
    sigma = rng.uniform(3, 9)
    noise = np.random.default_rng(rng.randrange(1 << 30)).normal(0, sigma, out.shape).astype(np.float32)
    out = np.clip(out + noise, 0, 255).astype(np.uint8)
    length = rng.randint(1, 5)
    if length > 1:
        kernel = np.zeros((length, length), np.float32)
        if rng.random() < 0.5:
            kernel[length // 2, :] = 1.0 / length
        else:
            kernel[:, length // 2] = 1.0 / length
        out = cv2.filter2D(out, -1, kernel)
    quality = rng.randint(35, 65)
    ok, encoded = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR) if ok else out


def images_in(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})


def main() -> None:
    rng = random.Random(SEED)
    train_images, train_labels = DATASET / "images" / "train", DATASET / "labels" / "train"
    made = 0
    for path in images_in(train_images):
        if path.stem.endswith(SUFFIX):
            continue
        image = cv2.imread(str(path))
        if image is None:
            continue
        cv2.imwrite(str(train_images / f"{path.stem}{SUFFIX}.jpg"), degrade(image, rng))
        label = train_labels / f"{path.stem}.txt"
        if label.exists():
            shutil.copy(label, train_labels / f"{path.stem}{SUFFIX}.txt")
        made += 1
    val_images, val_labels = DATASET / "images" / "val", DATASET / "labels" / "val"
    out_images, out_labels = DATASET / "images" / "val_phone", DATASET / "labels" / "val_phone"
    out_images.mkdir(parents=True, exist_ok=True)
    out_labels.mkdir(parents=True, exist_ok=True)
    val = 0
    for path in images_in(val_images):
        image = cv2.imread(str(path))
        if image is None:
            continue
        cv2.imwrite(str(out_images / f"{path.stem}.jpg"), degrade(image, rng))
        label = val_labels / f"{path.stem}.txt"
        if label.exists():
            shutil.copy(label, out_labels / f"{path.stem}.txt")
        val += 1
    print(f"degraded {made} train copies, {val} held-out val_phone images")


if __name__ == "__main__":
    main()
