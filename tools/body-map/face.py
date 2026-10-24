#!/usr/bin/env python3.13
import os
"""The female front sheet has a real face and hair; the male front has a muscle face. Graft the
male muscle head onto the female figure so every figure shows muscles, not a person."""
import json, numpy as np, pathlib
from PIL import Image
from scipy import ndimage as ndi
R = pathlib.Path(os.environ["BODYMAP_WORK"]) / "tiles"
K = json.load(open(pathlib.Path(os.environ["BODYMAP_WORK"]) / "knobs.json"))
FACE_SCALE = float(K.get("face_scale", 0.96)); FACE_FADE = int(K.get("face_fade", 14))
def head_box(a):
    al = a[..., 3] > 128; widths = al.sum(1); ys = np.nonzero(widths)[0]; y0, y1 = ys.min(), ys.max()
    top = int(y0 + 0.16 * (y1 - y0)); band = widths[y0:top]
    neck = y0 + int(np.argmin(band[len(band) // 2:]) + len(band) // 2)
    xs = np.nonzero(al[y0:neck].any(0))[0]
    return y0, neck, xs.min(), xs.max()
f = np.asarray(Image.open(R / "female-front.png").convert("RGBA")).copy()
m = np.asarray(Image.open(R / "male-front.png").convert("RGBA"))
fy0, fneck, fx0, fx1 = head_box(f); my0, mneck, mx0, mx1 = head_box(m)
# the male head crop, with a few rows of neck so the join blends
mh = Image.fromarray(m[my0:mneck + 10, mx0:mx1 + 1]).convert("RGBA")
tw = int((fx1 - fx0 + 1) * FACE_SCALE); th = int((fneck - fy0 + 10) * 1.0)
mh = mh.resize((tw, th), Image.LANCZOS)
# clear the female head (hair included), keep the neck, then paste the graft centred
f[:fneck, :, 3] = 0
px = int((fx0 + fx1) / 2 - tw / 2); py = fneck + 10 - th
graft = np.asarray(mh).astype(np.float32)
# fade the graft's alpha over its last 14 rows so it blends into the female neck
fade = np.ones(th, np.float32); fade[-FACE_FADE:] = np.linspace(1, 0, FACE_FADE); graft[..., 3] *= fade[:, None]
y_s, x_s = max(0, py), max(0, px)
g = graft[y_s - py:, x_s - px:]
h, w = g.shape[:2]; h = min(h, f.shape[0] - y_s); w = min(w, f.shape[1] - x_s); g = g[:h, :w]
dst = f[y_s:y_s + h, x_s:x_s + w].astype(np.float32)
ga = (g[..., 3:4] / 255.0); da = dst[..., 3:4] / 255.0
out_a = ga + da * (1 - ga)
out_rgb = (g[..., :3] * ga + dst[..., :3] * da * (1 - ga)) / np.maximum(out_a, 1e-6)
f[y_s:y_s + h, x_s:x_s + w, :3] = np.clip(out_rgb, 0, 255).astype(np.uint8)
f[y_s:y_s + h, x_s:x_s + w, 3] = np.clip(out_a[..., 0] * 255, 0, 255).astype(np.uint8)
Image.fromarray(f, "RGBA").save(R / "female-front.png"); print("grafted", (tw, th), "at", (px, py))
