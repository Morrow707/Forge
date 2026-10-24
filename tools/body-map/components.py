#!/usr/bin/env python3.13
import os
"""Number every coloured muscle blob in a tile so a person can assign each to a Forge group."""
import sys, json, pathlib, numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
ROOT = pathlib.Path(os.environ["BODYMAP_WORK"])
name = sys.argv[1]
a = np.asarray(Image.open(ROOT / f"tiles/{name}.png").convert("RGBA")).astype(np.float32) / 255
rgb, al = a[..., :3], a[..., 3] > 0.5
mx = rgb.max(2); mn = rgb.min(2); sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]; delta = np.maximum(mx - mn, 1e-6)
hue = (np.where(mx == r, ((g - b) / delta) % 6, np.where(mx == g, (b - r) / delta + 2, (r - g) / delta + 4)) / 6) * 360
muscle = al & ((sat > 0.22) | ((hue > 42) & (hue < 70) & (sat > 0.13))) & (mx > 0.25)
skin = (hue > 12) & (hue < 40) & (sat < 0.5) & (mx > 0.6)   # beige/tan skin and tendon
muscle &= ~skin
bins = (hue // 15).astype(int)
disc = lambda rr: (lambda y, x: (x - rr) ** 2 + (y - rr) ** 2 <= rr * rr)(*np.ogrid[:2 * rr + 1, :2 * rr + 1])
comp = np.zeros(al.shape, np.int32); rows = []; nid = 0
for bi in range(24):
    m = ndi.binary_opening(muscle & (bins == bi), structure=disc(1))
    lab, n = ndi.label(m)
    for k in range(1, n + 1):
        part = lab == k; area = int(part.sum())
        if area < 140: continue
        nid += 1; comp[part] = nid
        cy, cx = ndi.center_of_mass(part); ys, xs = np.nonzero(part)
        rows.append({"id": nid, "hue": int(hue[part].mean()), "sat": round(float(sat[part].mean()), 2), "val": round(float(mx[part].mean()), 2),
                     "area": area, "cx": int(cx), "cy": int(cy), "fy": round(float(cy / al.shape[0]), 2), "fx": round(float(cx / al.shape[1]), 2)})
np.save(ROOT / f"comp-{name}.npy", comp)
json.dump(rows, open(ROOT / f"comp-{name}.json", "w"))
base = Image.open(ROOT / f"tiles/{name}.png").convert("RGBA")
S = 2 if base.width < 400 else 1.5
big = base.resize((int(base.width * S), int(base.height * S)), Image.LANCZOS)
bg = Image.new("RGBA", big.size, (21, 21, 27, 255)); bg.paste(big, (0, 0), big); d = ImageDraw.Draw(bg)
try: font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 13)
except Exception: font = ImageFont.load_default()
for rrow in rows:
    x, y = rrow["cx"] * S, rrow["cy"] * S; t = str(rrow["id"])
    w = d.textlength(t, font=font)
    d.rectangle([x - w / 2 - 2, y - 8, x + w / 2 + 2, y + 8], fill=(0, 0, 0, 200))
    d.text((x - w / 2, y - 7), t, fill=(255, 255, 255, 255), font=font)
bg.save(ROOT / f"comp-{name}.png"); print(name, "components:", nid, bg.size)
