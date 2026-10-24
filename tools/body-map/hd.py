#!/usr/bin/env python3.13
"""Tiles -> site assets: 2x upscale with denoise, sharpen, fibre striations and edge shading,
label maps to match, and a manifest with each group's pixel count, a label anchor per tile and
the silhouette's edges. Every number here is a knob in <work>/knobs.json (see pipeline.py).

The smoothing pass (2026-10-24, Scott: "everything is just very chunky"):
  - the LABEL map is rebuilt at 2x from soft per-group masks (blurred, then argmax) with tiny
    islands folded into their neighbour, so a hover outline follows a curve, not a staircase;
  - each colour blob is FLATTENED toward its own median and the seams blurred, so a muscle
    reads as one shape rather than a patchwork of shades;
  - every body pixel that belongs to no group below the neck -- hands, feet, the tendon between
    bellies -- is repainted as smooth skin, which is what the stray purple on a hand was never;
  - the silhouette outline is smoothed before feathering, so finger and toe stubs stop tearing;
  - each tile's muscle saturation and brightness are matched to the male front's, so the
    female front stops reading pale beside it."""
import json, os, pathlib, numpy as np, cv2
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage as ndi
ROOT = pathlib.Path(os.environ["BODYMAP_WORK"])
K = json.load(open(ROOT / "knobs.json"))
SCALE = 2
(ROOT / "site/img").mkdir(parents=True, exist_ok=True); (ROOT / "site/lab").mkdir(parents=True, exist_ok=True)
man = json.load(open(ROOT / "manifest.json")); GROUPS = man["groups"]
out = {"groups": GROUPS, "tiles": {}}
disc = lambda r: (lambda y, x: (x - r) ** 2 + (y - r) ** 2 <= r * r)(*np.ogrid[:2 * r + 1, :2 * r + 1])
kf = lambda k, d: float(K.get(k, d))
REF = "male-front"          # the tile whose colour the others are matched to
HEAD_FRAC = 0.14            # rows above this fraction are the head: never repainted as skin
ref_stats = None

def smooth_labels(labn, am, sigma, min_island, close_r):
    """1x label map -> 2x map with smooth boundaries, confined to the body mask `am`. Each group's
    mask is closed and hole-filled first (a skin-toned belly read pixel by pixel is full of holes,
    and a hover outline that follows them is the staircase Scott saw on the lower back)."""
    H, W = am.shape
    ids = [int(i) for i in np.unique(labn)]
    best = np.full((H, W), -1e9, np.float32); lab2 = np.zeros((H, W), np.uint8)
    for i in ids:
        m1 = labn == i
        if i and close_r > 0:
            m1 = ndi.binary_closing(m1, structure=disc(close_r)) | m1
            m1 = ndi.binary_fill_holes(m1)
            cl, n = ndi.label(m1)
            if n > 1:
                sizes = ndi.sum(m1, cl, range(1, n + 1))
                m1 = np.isin(cl, [k + 1 for k, sz in enumerate(sizes) if sz >= min_island / (SCALE * SCALE)])
        m = cv2.resize(m1.astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
        if sigma > 0: m = cv2.GaussianBlur(m, (0, 0), sigma)
        if i == 0: m = m * 0.92   # a tie at a boundary goes to the group, not to bare skin
        take = m > best; best[take] = m[take]; lab2[take] = i
    lab2[~am] = 0
    # Islands: a speck of one group inside another takes the majority label around it.
    if min_island > 0:
        for i in [j for j in np.unique(lab2) if j]:
            cl, n = ndi.label(lab2 == i)
            if n <= 1: continue
            sizes = ndi.sum(np.ones_like(lab2, bool), cl, range(1, n + 1))
            for k, sz in enumerate(sizes, start=1):
                if sz >= min_island: continue
                part = cl == k
                ring = ndi.binary_dilation(part, structure=disc(3)) & ~part & am
                vals = lab2[ring]
                lab2[part] = np.bincount(vals, minlength=256).argmax() if vals.size else 0
    return lab2

for name in (REF, "female-front", "female-back", "male-back"):
    src = Image.open(ROOT / f"tiles/{name}.png").convert("RGBA")
    s_np = np.asarray(src).copy(); inside = s_np[..., 3] > 128
    _, (iy, ix) = ndi.distance_transform_edt(~inside, return_indices=True)
    s_np[..., :3] = s_np[iy, ix, :3]; src = Image.fromarray(s_np, "RGBA")
    W, H = src.width * SCALE, src.height * SCALE
    yy, xx = np.mgrid[:H, :W]; fy = yy / H
    # --- the silhouette, smoothed before anything reads it
    a0 = np.asarray(src.getchannel("A").resize((W, H), Image.LANCZOS)).astype(np.float32) / 255
    osm = kf("outline_smooth", 2.5)
    a_s = cv2.GaussianBlur(a0, (0, 0), osm) if osm > 0 else a0
    am = a_s > 0.5
    am = ndi.binary_opening(am, structure=disc(2)); am = ndi.binary_closing(am, structure=disc(2))
    am = ndi.binary_fill_holes(am) & (a_s > 0.08)
    # --- colour: denoise at 1x, upscale, soften, sharpen
    bgr = cv2.cvtColor(np.asarray(src.convert("RGB")), cv2.COLOR_RGB2BGR)
    if K["denoise"] > 0:
        d = float(K["denoise"]); bgr = cv2.fastNlMeansDenoisingColored(bgr, None, d, d, 7, 21)
    bgr = cv2.resize(bgr, (W, H), interpolation=cv2.INTER_LANCZOS4)
    if K["blur"] > 0: bgr = cv2.GaussianBlur(bgr, (0, 0), float(K["blur"]))
    if K["sharpen"] > 0:
        blur = cv2.GaussianBlur(bgr, (0, 0), float(K["sharpen_sigma"]))
        bgr = cv2.addWeighted(bgr, 1 + float(K["sharpen"]), blur, -float(K["sharpen"]), 0)
    rgb_np = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    # --- labels, smooth, at 2x
    labn = np.asarray(Image.open(ROOT / f"labels-{name}.png").convert("L"))
    lab2 = smooth_labels(labn, am, kf("label_smooth", 4.0), int(kf("label_min_island", 2500)), int(kf("label_close", 3)))
    # --- hands and feet: the distal end of each arm and the bottom of the figure are never a
    # group. The sheets paint tendon bits there in muscle colours and the hue rules read them as
    # forearm or calf; a hand is a hand.
    extrem = np.zeros((H, W), bool)
    hz, fz = kf("hand_zone", 0.08), kf("foot_zone", 0.075)
    rows = np.nonzero(am.any(1))[0]; figure_h = rows.max() - rows.min()
    if fz > 0:
        extrem |= am & (yy > rows.max() - fz * figure_h)
    if hz > 0:
        # each arm is a lateral blob that starts at the shoulder; the hand is the last
        # `hand_zone` of the FIGURE's height above its lowest point (a hand is the same size
        # whether the arm hangs or reaches out, so it is not a fraction of the arm's own span)
        lateral = am & (np.abs(xx / W - 0.5) > 0.2)
        cl, n = ndi.label(lateral)
        for k in range(1, n + 1):
            part = cl == k; ys_ = np.nonzero(part.any(1))[0]
            if ys_.min() / H > 0.35 or part.sum() < 400: continue      # a leg, or a crumb
            extrem |= part & (yy > ys_.max() - hz * figure_h)
    lab2[extrem] = 0
    muscle = lab2 > 0
    # --- colour match: this tile's muscle saturation and value brought to the reference's
    hsv = cv2.cvtColor(np.clip(rgb_np * 255, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    s_mean, v_mean = float(hsv[..., 1][muscle].mean()), float(hsv[..., 2][muscle].mean())
    if name == REF: ref_stats = (s_mean, v_mean)
    elif kf("match_color", 1) > 0 and ref_stats:
        mc = kf("match_color", 1)
        s_gain = 1 + mc * (np.clip(ref_stats[0] / max(s_mean, 1), 0.7, 2.2) - 1)
        v_gain = 1 + mc * (np.clip(ref_stats[1] / max(v_mean, 1), 0.85, 1.2) - 1)
        hsv[..., 1] = np.clip(hsv[..., 1] * s_gain, 0, 255); hsv[..., 2] = np.clip(hsv[..., 2] * v_gain, 0, 255)
        rgb_np = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32) / 255.0
        print(f"{name}: colour matched to {REF}, saturation x{s_gain:.2f}, value x{v_gain:.2f}")
    # --- flatten each blob toward its own median, blur the seams
    comp = np.load(ROOT / f"comp-{name}.npy")
    comp2 = np.kron(comp, np.ones((SCALE, SCALE), comp.dtype))[:H, :W]
    if comp2.shape != (H, W):
        pad_ = np.zeros((H, W), comp.dtype); pad_[:comp2.shape[0], :comp2.shape[1]] = comp2; comp2 = pad_
    fl = kf("flatten", 0.45)
    if fl > 0:
        flat = rgb_np.copy()
        for cid in np.unique(comp2):
            if cid == 0: continue
            blob = comp2 == cid
            flat[blob] = np.median(rgb_np[blob], axis=0)
        fb = kf("flatten_blur", 2.5)
        if fb > 0: flat = cv2.GaussianBlur(flat, (0, 0), fb)
        rgb_np = rgb_np * (1 - fl) + flat * fl
    # --- hands, feet and tendon: every body pixel in no group, below the head, becomes smooth skin
    sk = kf("skin_smooth", 0.85)
    skin_mask = am & ~muscle & (fy > HEAD_FRAC)
    if sk > 0 and skin_mask.sum() > 50:
        sig = kf("skin_sigma", 7.0)
        wmask = skin_mask.astype(np.float32)
        num = cv2.GaussianBlur(rgb_np * wmask[..., None], (0, 0), sig)
        den = cv2.GaussianBlur(wmask, (0, 0), sig)[..., None]
        local = num / np.maximum(den, 1e-4)
        tone = np.median(rgb_np[skin_mask], axis=0)               # the tile's own skin colour
        # keep the shading (value) of the local blur, take the hue from the tile's skin
        lv = local.mean(2, keepdims=True); tv = max(float(tone.mean()), 1e-3)
        target = np.clip(tone[None, None, :] * (lv / tv), 0, 1)
        pull = np.where(extrem, 0.8, 0.55)[..., None]
        target = pull * target + (1 - pull) * local
        w = cv2.GaussianBlur(wmask, (0, 0), 2.0) * sk
        rgb_np = rgb_np * (1 - w[..., None]) + target * w[..., None]
    # --- tone, striations, edge shade (as before)
    rgb_np = np.clip(rgb_np, 0, 1) ** float(K["gamma"])
    rgb = ImageEnhance.Color(Image.fromarray(np.clip(rgb_np * 255, 0, 255).astype(np.uint8), "RGB")).enhance(float(K["color"]))
    stri = np.zeros((H, W), np.float32)
    if K["striations"] > 0:
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
    dist = ndi.distance_transform_edt(am)
    es = float(K["edge_shade"]); shade = (1 - es) + es * np.clip(dist / 8.0, 0, 1)
    arr = np.clip(rgb_f * shade[..., None], 0, 255).astype(np.uint8)
    a_img = Image.fromarray((am * 255).astype(np.uint8), "L")
    a_np = np.asarray(a_img.filter(ImageFilter.GaussianBlur(float(K["feather"])))).astype(np.float32) if K["feather"] > 0 else np.asarray(a_img).astype(np.float32)
    a_np = np.clip((a_np - 40) * 1.3, 0, 255).astype(np.uint8)
    Image.merge("RGBA", (*Image.fromarray(arr, "RGB").split(), Image.fromarray(a_np, "L"))).save(ROOT / f"site/img/{name}.webp", "WEBP", quality=90, method=6)
    Image.fromarray(lab2, "L").save(ROOT / f"site/lab/{name}.png", optimize=True)
    groups = {}
    for i in np.unique(lab2):
        if not i: continue
        m = lab2 == i; cl, n = ndi.label(m)
        sizes = ndi.sum(m, cl, range(1, n + 1)); k = int(np.argmax(sizes)) + 1
        cy, cx = ndi.center_of_mass(cl == k)
        # count in 1x pixels, as the page has always read it
        groups[GROUPS[i - 1]] = {"count": int(m.sum()) // (SCALE * SCALE), "ax": round(float(cx)), "ay": round(float(cy))}
    step = 8 * SCALE; edges = []
    for y in range(0, H, step):
        band = am[y:y + step].any(0); xs = np.nonzero(band)[0]
        edges.append([int(xs.min()), int(xs.max())] if len(xs) else [W // 2, W // 2])
    out["tiles"][name] = {"w": W, "h": H, "groups": groups, "edgeStep": step, "edges": edges}
    print(name, W, H, len(groups))
json.dump(out, open(ROOT / "site/manifest.json", "w"))
print("hd ok")
