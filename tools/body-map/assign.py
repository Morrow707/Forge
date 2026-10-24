#!/usr/bin/env python3.13
import os
"""Map every colour blob of each figure to a Forge muscle group. Each sheet has its own palette,
so the rules are per figure: hue, saturation and where on the body the blob sits."""
import json, pathlib, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = pathlib.Path(os.environ["BODYMAP_WORK"])
GROUPS = ["Chest", "Shoulders", "Biceps", "Forearms", "Abs", "Core", "Quads", "Calves", "Lats", "Back",
          "Traps", "Triceps", "Lower Back", "Glutes", "Hamstrings", "Hip Flexors", "Adductors", "Neck"]
PALETTE = ["#f97316", "#a855f7", "#ef4444", "#ec4899", "#3b82f6", "#14b8a6", "#22c55e", "#7dd3fc", "#84cc16",
           "#06b6d4", "#8b5cf6", "#f43f5e", "#0ea5e9", "#fb923c", "#eab308", "#facc15", "#fde047", "#94a3b8"]

def inr(h, a, b):
    return (a <= h <= b) if a <= b else (h >= a or h <= b)

def female_front(h, s, v, fx, fy, lat):
    if fy < 0.12: return None
    if inr(h, 340, 15):
        if fy < 0.2 and lat < 0.12: return "Neck"
        if fy < 0.35: return "Chest" if lat < 0.18 else "Shoulders"
        if fy < 0.62: return "Hip Flexors"
        if fy < 0.74: return "Quads"
        return "Calves"
    if inr(h, 15, 50):
        if 0.24 < fy < 0.48 and lat < 0.12: return "Abs"
        return "Hip Flexors" if fy > 0.4 else None
    if inr(h, 50, 70): return "Abs" if fy < 0.47 else "Quads"
    if inr(h, 70, 125):
        if fy < 0.46: return "Forearms"
        if fy < 0.56: return "Hip Flexors"
        if fy < 0.75: return "Quads"
        return "Calves"
    if inr(h, 125, 170):
        if fy < 0.46: return "Forearms"
        if fy < 0.75: return "Quads"
        return "Calves"
    if inr(h, 170, 215): return "Neck" if fy < 0.22 else "Calves"
    if inr(h, 215, 260): return "Core" if fy < 0.5 else "Quads"
    if inr(h, 260, 300): return "Core" if fy < 0.5 else "Quads"
    if inr(h, 300, 318): return "Biceps" if fy < 0.45 else "Adductors"
    if inr(h, 318, 340): return "Shoulders" if fy < 0.3 else ("Biceps" if fy < 0.45 else "Adductors")
    return None

def female_back(h, s, v, fx, fy, lat):
    if fy < 0.12: return None
    if fy > 0.93: return None
    if inr(h, 12, 32) and s > 0.55: return "Glutes" if fy > 0.42 else "Back"
    if inr(h, 345, 12) and s > 0.55: return "Glutes" if 0.44 < fy < 0.62 else ("Forearms" if fy < 0.44 else "Hamstrings")
    if inr(h, 0, 40) and s <= 0.55:
        if fy < 0.46: return "Lats" if lat > 0.08 else "Lower Back"
        return None
    if inr(h, 40, 65): return "Forearms" if fy < 0.42 else "Hamstrings"
    if inr(h, 65, 155):
        if fy < 0.4: return "Triceps"
        if fy < 0.74: return "Hamstrings"
        return "Calves"
    if inr(h, 155, 212):
        if fy < 0.32: return "Back"
        if fy < 0.48: return "Forearms"
        if fy < 0.74: return "Hamstrings"
        return "Calves"
    if inr(h, 212, 245):
        if fy < 0.32: return "Shoulders"
        if fy < 0.48: return "Forearms"
        if fy < 0.74: return "Hamstrings"
        return "Calves"
    if inr(h, 245, 295): return "Traps" if fy < 0.4 else "Calves"
    if inr(h, 295, 345):
        if fy < 0.45: return "Lower Back" if lat < 0.1 and s < 0.4 else "Forearms"
        if fy < 0.72: return "Hamstrings"
        return "Calves"
    return None

def male_front(h, s, v, fx, fy, lat):
    if fy < 0.12: return None
    if inr(h, 350, 15):
        if fy < 0.45: return "Forearms"
        if fy < 0.62: return "Hip Flexors"
        return "Calves"
    if inr(h, 15, 45):
        if fy < 0.32: return "Chest"
        if fy < 0.5: return "Hip Flexors"
        return None
    if inr(h, 45, 65): return "Hip Flexors" if fy < 0.56 else "Quads"
    if inr(h, 65, 95):
        if fy < 0.42: return "Biceps"
        return "Quads"
    if inr(h, 95, 160): return "Quads" if fy < 0.76 else "Calves"
    if inr(h, 160, 212):
        if fy < 0.22: return "Neck"
        return "Forearms" if lat > 0.3 else ("Abs" if fy < 0.5 else "Calves")
    if inr(h, 212, 240):
        if fy < 0.26 and lat > 0.12: return "Shoulders"
        if fy < 0.5: return "Abs"
        return "Calves"
    if inr(h, 240, 290): return "Neck" if fy < 0.22 else "Calves"
    if inr(h, 290, 318): return "Core" if fy < 0.5 else "Calves"
    if inr(h, 318, 350):
        if fy < 0.5: return "Forearms"
        if fy < 0.7: return "Adductors"
        return "Calves"
    return None

def male_back(h, s, v, fx, fy, lat):
    if fy < 0.12: return None
    if inr(h, 15, 45):
        if s > 0.6: return "Glutes" if 0.38 < fy < 0.6 else ("Back" if fy < 0.38 else "Hamstrings")
        return "Lats" if fy < 0.46 else None
    if inr(h, 345, 15):
        if s < 0.6 and fy < 0.46: return "Lats"
        if fy < 0.46: return "Forearms"
        if fy < 0.62: return "Glutes" if s > 0.7 else "Hamstrings"
        if fy < 0.74: return "Hamstrings"
        return "Calves"
    if inr(h, 45, 80): return "Forearms" if fy < 0.46 else "Hamstrings"
    if inr(h, 80, 150): return "Triceps" if fy < 0.4 else ("Hamstrings" if fy < 0.74 else "Calves")
    if inr(h, 150, 178):
        if fy < 0.34: return "Back" if lat < 0.14 else "Triceps"
        if fy < 0.5: return "Forearms"
        return "Hamstrings" if fy < 0.74 else "Calves"
    if inr(h, 178, 212):
        if fy < 0.34: return "Back" if lat < 0.16 else "Triceps"
        if fy < 0.5: return "Forearms" if lat > 0.25 else "Lower Back"
        return "Hamstrings" if fy < 0.74 else "Calves"
    if inr(h, 212, 245):
        if fy < 0.3: return "Shoulders" if lat > 0.13 else "Back"
        if fy < 0.5: return "Forearms" if lat > 0.25 else "Lower Back"
        return "Hamstrings" if fy < 0.74 else "Calves"
    if inr(h, 245, 295): return "Traps" if fy < 0.4 else "Calves"
    if inr(h, 295, 345):
        if fy < 0.46: return "Forearms"
        if fy < 0.72: return "Hamstrings"
        return "Calves"
    return None

RULES = {"female-front": female_front, "female-back": female_back, "male-front": male_front, "male-back": male_back}
manifest = {}
for name, rule in RULES.items():
    comp = np.load(ROOT / f"comp-{name}.npy"); rows = json.load(open(ROOT / f"comp-{name}.json"))
    tile = Image.open(ROOT / f"tiles/{name}.png").convert("RGBA")
    al = np.asarray(tile)[..., 3] > 128
    H, W = al.shape
    label = np.zeros((H, W), np.uint8)
    for r in rows:
        g = rule(r["hue"], r["sat"], r["val"], r["fx"], r["fy"], abs(r["fx"] - 0.5))
        if g: label[comp == r["id"]] = GROUPS.index(g) + 1
    # Per-pixel splits where one colour covers two groups side by side.
    yy, xx = np.mgrid[:H, :W]; fx = xx / W
    fy = yy / H
    if name == "male-front":
        abs_i = GROUPS.index("Abs") + 1; core_i = GROUPS.index("Core") + 1
        label[(label == abs_i) & (np.abs(fx - 0.5) > 0.105)] = core_i
        label[(label == GROUPS.index("Hip Flexors") + 1) & (np.abs(fx - 0.5) > 0.3)] = 0
    if name.endswith("-back"):
        # The erector spinae and the lats' lower sheet are painted skin-tan on both sheets, the
        # one colour the blob pass has to skip. Read them by place: tan pixels on the central
        # back are the lower back, tan at the flanks is the lat.
        a = np.asarray(tile).astype(np.float32) / 255
        rgb = a[..., :3]; mx_ = rgb.max(2); mn_ = rgb.min(2); d = np.maximum(mx_ - mn_, 1e-6)
        r_, g_, b_ = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        h_ = np.where(mx_ == r_, ((g_ - b_) / d) % 6, np.where(mx_ == g_, (b_ - r_) / d + 2, (r_ - g_) / d + 4)) * 60
        tan = al & (label == 0) & (h_ > 8) & (h_ < 48) & ((mx_ - mn_) / np.maximum(mx_, 1e-6) < 0.5) & (mx_ > 0.45)
        lat = np.abs(fx - 0.5)
        lo, hi = (0.27, 0.47) if name == "female-back" else (0.26, 0.46)
        label[tan & (fy > lo) & (fy < hi) & (lat < 0.075)] = GROUPS.index("Lower Back") + 1
        label[tan & (fy > lo) & (fy < hi) & (lat >= 0.075) & (lat < 0.22)] = GROUPS.index("Lats") + 1
    # Grow into the seams so a tap between two bellies still lands.
    grown = label.copy()
    for _ in range(4):
        dil = ndi.grey_dilation(grown, size=(3, 3)); grown = np.where((grown == 0) & al, dil, grown)
    label = grown
    Image.fromarray(label, "L").save(ROOT / f"labels-{name}.png")
    counts = {GROUPS[i - 1]: int((label == i).sum()) for i in np.unique(label) if i}
    manifest[name] = {"w": W, "h": H, "groups": counts}
    print(name, counts)
    arr = np.zeros((H, W, 4), np.uint8)
    for i, col in enumerate(PALETTE, start=1):
        arr[label == i] = (*(int(col[j:j + 2], 16) for j in (1, 3, 5)), 150)
    ov = Image.alpha_composite(tile, Image.fromarray(arr, "RGBA"))
    bg = Image.new("RGBA", ov.size, (21, 21, 27, 255)); bg.paste(ov, (0, 0), ov)
    bg.save(ROOT / f"check-{name}.png")
json.dump({"groups": GROUPS, "palette": PALETTE, "tiles": manifest}, open(ROOT / "manifest.json", "w"), indent=1)
ims = [Image.open(ROOT / f"check-{n}.png") for n in RULES]
h = max(i.height for i in ims); w = sum(i.width for i in ims) + 100
cs = Image.new("RGBA", (w, h + 40), (21, 21, 27, 255)); x = 20
for im in ims: cs.paste(im, (x, 20)); x += im.width + 20
cs.save(ROOT / "check-assign.png"); print("ok", cs.size)
