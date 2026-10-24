#!/usr/bin/env python3.13
"""Tiles -> site assets: 2x upscale with denoise, sharpen, fibre striations and edge shading,
label maps to match, and a manifest with each group's pixel count, a label anchor per tile and
the silhouette's edges. Every number here is a knob in <work>/knobs.json (see pipeline.py)."""
import json, os, pathlib, numpy as np, cv2
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage as ndi
ROOT = pathlib.Path(os.environ["BODYMAP_WORK"])
K = json.load(open(ROOT / "knobs.json"))
SCALE = 2
(ROOT / "site/img").mkdir(parents=True, exist_ok=True); (ROOT / "site/lab").mkdir(parents=True, exist_ok=True)
man = json.load(open(ROOT / "manifest.json")); GROUPS = man["groups"]
out = {"groups": GROUPS, "tiles": {}}
for name in ("female-front", "female-back", "male-front", "male-back"):
    src = Image.open(ROOT / f"tiles/{name}.png").convert("RGBA")
    s_np = np.asarray(src).copy(); inside = s_np[..., 3] > 128
    _, (iy, ix) = ndi.distance_transform_edt(~inside, return_indices=True)
    s_np[..., :3] = s_np[iy, ix, :3]; src = Image.fromarray(s_np, "RGBA")
    W, H = src.width * SCALE, src.height * SCALE
    bgr = cv2.cvtColor(np.asarray(src.convert("RGB")), cv2.COLOR_RGB2BGR)
    if K["denoise"] > 0:
        d = float(K["denoise"]); bgr = cv2.fastNlMeansDenoisingColored(bgr, None, d, d, 7, 21)
    bgr = cv2.resize(bgr, (W, H), interpolation=cv2.INTER_LANCZOS4)
    if K["blur"] > 0: bgr = cv2.GaussianBlur(bgr, (0, 0), float(K["blur"]))
    if K["sharpen"] > 0:
        blur = cv2.GaussianBlur(bgr, (0, 0), float(K["sharpen_sigma"]))
        bgr = cv2.addWeighted(bgr, 1 + float(K["sharpen"]), blur, -float(K["sharpen"]), 0)
    rgb_np = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    rgb_np = rgb_np ** float(K["gamma"])
    rgb = ImageEnhance.Color(Image.fromarray(np.clip(rgb_np * 255, 0, 255).astype(np.uint8), "RGB")).enhance(float(K["color"]))
    comp = np.load(ROOT / f"comp-{name}.npy")
    comp2 = np.kron(comp, np.ones((SCALE, SCALE), comp.dtype))[:H, :W]
    if comp2.shape != (H, W):
        pad_ = np.zeros((H, W), comp.dtype); pad_[:comp2.shape[0], :comp2.shape[1]] = comp2; comp2 = pad_
    stri = np.zeros((H, W), np.float32)
    if K["striations"] > 0:
        yy, xx = np.mgrid[:H, :W]
        for cid in np.unique(comp2):
            if cid == 0: continue
            blob = comp2 == cid
            if int(blob.sum()) < int(K["stripe_min_area"]): continue
            ys_, xs_ = np.nonzero(blob); cx, cy = xs_.mean(), ys_.mean()
            cov = np.cov(np.vstack([xs_ - cx, ys_ - cy])); w_, v_ = np.linalg.eigh(cov); ax = v_[:, int(np.argmax(w_))]
            sl_ = ndi.find_objects(blob.astype(np.int8))[0]
            yb, xb = yy[sl_], xx[sl_]
            dd = -(xb - cx) * ax[1] + (yb - cy) * ax[0]
            wave = np.cos(2 * np.pi * dd / float(K["stripe_period"]))
            lines = np.clip(wave, 0, 1) ** 4
            edge = ndi.distance_transform_edt(blob[sl_]); fade = np.clip((edge - 4) / 8.0, 0, 1)
            stri[sl_] = np.where(blob[sl_], lines * fade, stri[sl_])
        stri = cv2.GaussianBlur(stri, (0, 0), 1.1)
    rgb_f = np.asarray(rgb).astype(np.float32) * (1.0 - float(K["striations"]) * stri)[..., None]
    rgb = Image.fromarray(np.clip(rgb_f, 0, 255).astype(np.uint8), "RGB")
    a = src.getchannel("A").resize((W, H), Image.LANCZOS)
    am = np.asarray(a) > 128; dist = ndi.distance_transform_edt(am)
    es = float(K["edge_shade"]); shade = (1 - es) + es * np.clip(dist / 8.0, 0, 1)
    arr = np.clip(np.asarray(rgb).astype(np.float32) * shade[..., None], 0, 255).astype(np.uint8)
    a_np = np.asarray(a.filter(ImageFilter.GaussianBlur(float(K["feather"])))).astype(np.float32) if K["feather"] > 0 else np.asarray(a).astype(np.float32)
    a_np = np.clip((a_np - 40) * 1.3, 0, 255).astype(np.uint8)
    Image.merge("RGBA", (*Image.fromarray(arr, "RGB").split(), Image.fromarray(a_np, "L"))).save(ROOT / f"site/img/{name}.webp", "WEBP", quality=90, method=6)
    lab = Image.open(ROOT / f"labels-{name}.png").convert("L"); labn = np.asarray(lab)
    lab.resize((W, H), Image.NEAREST).save(ROOT / f"site/lab/{name}.png", optimize=True)
    groups = {}
    for i in np.unique(labn):
        if not i: continue
        m = labn == i; cl, n = ndi.label(m)
        sizes = ndi.sum(m, cl, range(1, n + 1)); k = int(np.argmax(sizes)) + 1
        cy, cx = ndi.center_of_mass(cl == k)
        groups[GROUPS[i - 1]] = {"count": int(m.sum()), "ax": round(float(cx) * SCALE), "ay": round(float(cy) * SCALE)}
    am2 = np.asarray(Image.open(ROOT / f"tiles/{name}.png").convert("RGBA"))[..., 3] > 128
    edges = []
    for y in range(0, am2.shape[0], 8):
        band = am2[y:y + 8].any(0); xs = np.nonzero(band)[0]
        edges.append([int(xs.min()) * SCALE, int(xs.max()) * SCALE] if len(xs) else [W // 2, W // 2])
    out["tiles"][name] = {"w": W, "h": H, "groups": groups, "edgeStep": 8 * SCALE, "edges": edges}
    print(name, W, H, len(groups))
json.dump(out, open(ROOT / "site/manifest.json", "w"))
print("hd ok")
