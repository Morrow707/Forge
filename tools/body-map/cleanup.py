#!/usr/bin/env python3.13
import os
"""Drop the leader-line end dot the male front sheet leaves on the right hand: a pure yellow blob
out at the hand, nowhere near any yellow muscle."""
import numpy as np, pathlib
from PIL import Image
from scipy import ndimage as ndi
p = pathlib.Path(os.environ["BODYMAP_WORK"]) / "tiles/male-front.png"
a = np.asarray(Image.open(p).convert("RGBA")).copy()
rgb = a[..., :3].astype(np.float32) / 255; mx = rgb.max(2); mn = rgb.min(2); d = np.maximum(mx - mn, 1e-6)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
yellow = (a[..., 3] > 0) & (h > 48) & (h < 66) & ((mx - mn) / np.maximum(mx, 1e-6) > 0.55) & (mx > 0.6)
H, W = yellow.shape; fx = np.arange(W)[None, :] / W
lab, n = ndi.label(yellow & (np.abs(fx - 0.5) > 0.34))
removed = 0
for k in range(1, n + 1):
    part = lab == k
    if 30 < part.sum() < 2500:
        a[ndi.binary_dilation(part, iterations=2), 3] = 0; removed += 1
Image.fromarray(a, "RGBA").save(p); print("removed yellow dots:", removed)
