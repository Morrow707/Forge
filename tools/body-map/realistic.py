#!/usr/bin/env python3.13
"""The finish pass for the REALISTIC figures. Reads source3d/ and writes site/img3d, site/lab3d
and site/manifest3d.json.

Until 2026-11-08 there was no such pass. `hd.py` finishes the DIAGRAM; the realistic tiles were
the Z-Anatomy render cut out of its background and published as-is, which is why they read flat
beside a diagram that had had four passes of work.

THE SHADING WAS ALWAYS THERE AND THE PAINT WAS BURYING IT. Measured on the source before any of
this was written: inside a single muscle the render's own value spans ~100 levels (Chest V 138 to
242, Quads 111 to 243), so the geometry is modelled -- while saturation sits at 110-186 of 255 and
the mean value at 170-215, i.e. poster paint pushed against white, where a hundred levels of form
read as "the same colour, slightly darker". So this pass does not ADD light; it uncovers the light
the render already carries:

  r_sat          pulls the candy chroma down, which is what lets value read as form at all
  r_shade_gain   a gamma about each group's own median: above goes brighter, below darker
  r_fibre        the render's OWN high-frequency texture, amplified -- real striations, not
                 drawn stripes. hd.py draws cosine stripes for the diagram because a flat vector
                 fill has no fibre in it to recover; this source does, and a drawn stripe over a
                 real one is the "reads as noise" that turned the diagram's striations off.
  r_seam         the crease where one muscle meets another, which is the insertion Scott asked
                 for: distance to the nearest IN-BODY pixel of a different group, so the
                 silhouette is not darkened twice (r_rim owns that).
  r_belly        the other half of a seam: each belly rounds UP away from its own creases, so a
                 boundary reads as two solids meeting rather than as a line drawn on one.

THE SILHOUETTE IS NOT SMOOTHED, deliberately, and this is the one place the diagram's recipe must
not be copied. `hd.py`'s `contour_smooth` is 9 boundary pixels; these figures have skeletal
fingers and toes narrower than that, so tracing and smoothing their contour would melt the hands
off. The alpha is the source's own, upscaled, with a touch of feather.
"""
import json, os, pathlib
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi

HERE = pathlib.Path(os.environ.get("BODYMAP_HERE", pathlib.Path(__file__).resolve().parent))
SRC = HERE / "source3d"
ROOT = pathlib.Path(os.environ["BODYMAP_WORK"])
K = json.load(open(ROOT / "knobs.json"))
kf = lambda k, d: float(K.get(k, d))
ki = lambda k, d: int(float(K.get(k, d)))

MAN_IN = json.load(open(SRC / "manifest3d.json"))
GROUPS = MAN_IN["groups"]
# The work happens at r_scale and the tile is WRITTEN at r_out_scale, which is not a detail of
# packaging: index.html caches a full-size ImageData overlay per muscle per tile, so a 2x tile
# costs four times the memory of a 1x one for twelve groups across four figures -- a phone's
# worth of it. The source is 829x2065, so a 2x tile carries no detail the source does not have;
# what 2x really buys is sub-pixel room for the seam distances, the fibre high-pass and the
# sharpen. Supersample, then write down.
SCALE = max(1, ki("r_scale", 2))
OUT_SCALE = max(1, ki("r_out_scale", 1))
NAMES = ("female-front", "female-back", "male-front", "male-back")

(ROOT / "site/img3d").mkdir(parents=True, exist_ok=True)
(ROOT / "site/lab3d").mkdir(parents=True, exist_ok=True)


def upscale_labels(lab1, body2, sigma):
    """Each group's mask blurred and resampled, then argmax at 2x: the boundary becomes a curve,
    which is both a better hover outline and a better seam to shade along. Same idea as hd.py's
    smooth_labels, without the island-folding -- these labels came out of a renderer, not a hue
    rule, so there are no specks to fold."""
    h, w = body2.shape
    best = np.zeros((h, w), np.float32)
    out = np.zeros((h, w), np.uint8)
    for gi in range(1, len(GROUPS) + 1):
        m = (lab1 == gi).astype(np.float32)
        if m.sum() < 16:
            continue
        soft = cv2.resize(m, (w, h), interpolation=cv2.INTER_LINEAR)
        if sigma > 0:
            soft = cv2.GaussianBlur(soft, (0, 0), sigma)
        take = (soft > best) & (soft > 0.35) & body2
        best[take] = soft[take]
        out[take] = gi
    return out


def amplified(rgb, lum, mask, gain, floor, sat, value, hold):
    """The group's own shading, amplified about its own median, with its chroma pulled down.
    Hue is untouched: the scale is applied to the pixel's own RGB, then the chroma is mixed
    toward that pixel's new grey. A group whose paint is already near-grey (the head, the hands)
    barely moves on `sat` and still gets the shading.

    THE GAIN IS RENORMALISED TO HOLD THE GROUP'S OWN HIGHLIGHT, and that is not a detail. The
    first version was the bare gamma and it WASHED THE POSTERIOR CHAIN OUT: a gamma about the
    median brightens everything above it, so a group whose source already carries a wide range
    (the glutes and hamstrings, V_std 67-80 against the chest's 35) pushes its bright side into
    clipping and comes back paler rather than rounder. Pinning the `hold` percentile to where
    the source had it means the gain can only ever spend itself DOWNWARD -- the shadow side
    deepens, the highlight stays put, which is what reads as form."""
    if not mask.any():
        return
    l = lum[mask]
    med = float(np.median(l))
    if med < 1.0:
        return
    ratio = np.clip(np.clip(l / med, 1e-3, None) ** gain, floor, 1.0 / max(floor, 1e-3))
    out_l = med * ratio
    p_src, p_out = float(np.percentile(l, hold)), float(np.percentile(out_l, hold))
    if p_out > 1e-3:
        out_l *= p_src / p_out
    out_l = np.clip(out_l * value, 0, 255)
    scale = out_l / np.maximum(l, 1e-3)
    px = rgb[mask] * scale[:, None]
    grey = (px @ np.array([0.299, 0.587, 0.114], np.float32))[:, None]
    rgb[mask] = grey + (px - grey) * sat


def head_mask(lab, body):
    """The head alone, out of everything the render left ungrouped. Label 0 is the head AND the
    hands AND the feet AND every bit of exposed bone, so a tint applied to label 0 would paint
    the skeleton's fingers too. The head is the ungrouped component that reaches the top row of
    the silhouette -- it is separated from the rest by the neck on the front and by the traps on
    the back, which run to the skull, so the component stops at the jaw either way. Found rather
    than fenced off by a fraction of the figure's height: a zone would move the moment a figure
    was rendered at another crop."""
    bare = (lab == 0) & body
    if not bare.any():
        return bare
    rows = np.nonzero(body.any(1))[0]
    if not len(rows):
        return np.zeros_like(bare)
    comp, n = ndi.label(bare)
    top = comp[rows[0]:rows[0] + 3][bare[rows[0]:rows[0] + 3]]
    if not len(top):
        return np.zeros_like(bare)
    ids = np.bincount(top)
    ids[0] = 0
    head = comp == int(np.argmax(ids))
    # ON THE FRONT THAT COMPONENT DOES NOT STOP AT THE HEAD. The sternum and the linea alba are
    # ungrouped bone too, and on a front view they are CONNECTED to the skull, so the component
    # runs from row 13 to row 1100 of a 2065-row tile -- the first render tinted the breastbone
    # pink. It is cut at the neck instead: the first row past the skull's widest where the
    # component narrows sharply (223 px at the ears, 91 at the jaw, 21 at the neck, then 7-31
    # all the way down the sternum). On a back view the traps reach the skull and the component
    # ends at the jaw by itself, so the cut finds nothing and changes nothing there.
    w = head.sum(1)
    widest = int(w.argmax())
    narrow = np.nonzero(w[widest:] < w[widest] * kf("r_head_neck", 0.25))[0]
    if len(narrow):
        head[widest + int(narrow[0]):] = False
    return head


def finish(name):
    src = Image.open(SRC / f"{name}.webp").convert("RGBA")
    lab1 = np.array(Image.open(SRC / f"lab/{name}.png"))
    if lab1.ndim == 3:
        lab1 = lab1[:, :, 0]
    w1, h1 = src.size
    W, H = w1 * SCALE, h1 * SCALE
    big = src.resize((W, H), Image.LANCZOS)
    arr = np.array(big).astype(np.float32)
    rgb, alpha = arr[:, :, :3], arr[:, :, 3]
    body = alpha > 110
    lab = upscale_labels(lab1, body, kf("r_label_smooth", 1.6))
    lab[~body] = 0
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)

    # --- 1. the fibre the render already has, kept before the tone move rescales it
    fibre = np.zeros((H, W), np.float32)
    fb = kf("r_fibre", 0.0)
    if fb > 0:
        hp = lum - cv2.GaussianBlur(lum, (0, 0), kf("r_fibre_sigma", 2.2))
        fibre = np.clip(hp, -kf("r_fibre_clip", 26.0), kf("r_fibre_clip", 26.0))
        fibre[~body] = 0

    # --- 2. tone: uncover the shading, drop the candy
    gain, floor = kf("r_shade_gain", 1.0), kf("r_shade_floor", 0.3)
    sat, value = kf("r_sat", 1.0), kf("r_value", 1.0)
    hold = kf("r_shade_hold", 90.0)
    for gi in range(1, len(GROUPS) + 1):
        amplified(rgb, lum, (lab == gi) & body, gain, floor, sat, value, hold)
    # the head, the hands, the feet and the exposed bone: the same shading move, their own sat
    amplified(rgb, lum, (lab == 0) & body, kf("r_bare_gain", 1.0), floor,
              kf("r_bare_sat", 1.0), kf("r_bare_value", 1.0), hold)

    # --- 3. the seams: where a muscle meets another muscle, and where it meets bone or skin
    seam = np.zeros((H, W), np.float32)
    belly = np.ones((H, W), np.float32)
    sv, bv = kf("r_seam", 0.0), kf("r_belly", 0.0)
    if sv > 0 or bv > 0:
        spx, bpx = max(kf("r_seam_px", 7.0), 1e-3), max(kf("r_belly_px", 46.0), 1e-3)
        for gi in range(0, len(GROUPS) + 1):
            m = (lab == gi) & body
            if m.sum() < 64:
                continue
            # distance to the nearest in-body pixel of a DIFFERENT group: the background is
            # folded into the mask so the silhouette is not counted as a seam (r_rim owns it)
            d = ndi.distance_transform_edt(m | ~body)
            seam[m] = (1.0 - np.clip(d[m] / spx, 0, 1)) ** kf("r_seam_falloff", 0.75)
            belly[m] = 1.0 + bv * np.clip(d[m] / bpx, 0, 1) ** 0.6
        if sv > 0:
            seam = cv2.GaussianBlur(seam, (0, 0), kf("r_seam_blur", 1.3))
        rgb = rgb * (1.0 - sv * seam)[..., None] * belly[..., None]

    # --- 3b. the head: Scott, 2026-11-08, "make it like a light red". Each pixel keeps its OWN
    # luminance -- the mannequin head is modelled and the shading is the only thing making it a
    # head rather than a shape -- and takes the target's chroma, so this is a recolour and never
    # a flat fill over the face.
    tint = kf("r_head_tint", 0.0)
    if tint > 0:
        hm = head_mask(lab, body)
        if hm.any():
            target = np.array([kf("r_head_r", 232.0), kf("r_head_g", 150.0), kf("r_head_b", 146.0)], np.float32)
            t_lum = float(target @ np.array([0.299, 0.587, 0.114], np.float32))
            if t_lum > 1e-3:
                px = rgb[hm]
                l = px @ np.array([0.299, 0.587, 0.114], np.float32)
                rgb[hm] = px * (1 - tint) + np.clip(l[:, None] * (target / t_lum)[None, :], 0, 255) * tint

    # --- 4. a key light, so the figure has a direction instead of sitting in a flat box
    kl = kf("r_light", 0.0)
    if kl > 0:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        ramp = 0.62 * (1.0 - xx / W) + 0.38 * (1.0 - yy / H)
        rgb = rgb * (1.0 - kl * 0.5 + kl * ramp)[..., None]

    # --- 5. the fibre back in, as a multiply so it darkens the grooves rather than painting lines
    if fb > 0:
        rgb = rgb * (1.0 + fb * fibre / 255.0)[..., None]

    # --- 6. roundness at the silhouette
    rim = kf("r_rim", 0.0)
    if rim > 0:
        d = ndi.distance_transform_edt(body)
        rgb = rgb * ((1 - rim) + rim * np.clip(d / max(kf("r_rim_px", 26.0), 1e-3), 0, 1) ** 0.8)[..., None]

    rgb = np.clip(rgb, 0, 255) ** 1.0
    g = kf("r_gamma", 1.0)
    if g != 1.0:
        rgb = 255.0 * np.clip(rgb / 255.0, 0, 1) ** g
    sh = kf("r_sharpen", 0.0)
    if sh > 0:
        rgb = rgb * (1 + sh) - cv2.GaussianBlur(rgb, (0, 0), kf("r_sharpen_sigma", 1.6)) * sh
    a_f = alpha
    if kf("r_feather", 0.0) > 0:
        a_f = cv2.GaussianBlur(a_f, (0, 0), kf("r_feather", 0.6))

    OW, OH = w1 * OUT_SCALE, h1 * OUT_SCALE
    if (OW, OH) != (W, H):
        # INTER_AREA is the right downsample here: it averages the supersampled block, which is
        # what makes the 2x fibre and seam work survive as tone rather than alias into speckle.
        rgb = cv2.resize(rgb, (OW, OH), interpolation=cv2.INTER_AREA)
        a_f = cv2.resize(a_f, (OW, OH), interpolation=cv2.INTER_AREA)
        body = cv2.resize(a_f, (OW, OH), interpolation=cv2.INTER_NEAREST) > 110
        lab = upscale_labels(lab1, body, kf("r_label_smooth", 1.6) * OUT_SCALE / SCALE)
        lab[~body] = 0
        W, H = OW, OH
    out_rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    a_np = np.clip(a_f, 0, 255).astype(np.uint8)
    Image.merge("RGBA", (*Image.fromarray(out_rgb, "RGB").split(), Image.fromarray(a_np, "L"))).save(
        ROOT / f"site/img3d/{name}.webp", "WEBP", quality=ki("r_quality", 86), method=6)
    Image.fromarray(lab, "L").save(ROOT / f"site/lab3d/{name}.png", optimize=True)

    groups = {}
    for i in np.unique(lab):
        if not i:
            continue
        m = lab == i
        cl, n = ndi.label(m)
        sizes = ndi.sum(m, cl, range(1, n + 1))
        k = int(np.argmax(sizes)) + 1
        cy, cx = ndi.center_of_mass(cl == k)
        # count in 1x pixels, the unit the page's own "> 400" threshold has always been in
        groups[GROUPS[i - 1]] = {"count": int(m.sum()) // (OUT_SCALE * OUT_SCALE), "ax": round(float(cx)), "ay": round(float(cy))}
    step = 8 * OUT_SCALE
    edges = []
    for y in range(0, H, step):
        band = body[y:y + step].any(0)
        xs = np.nonzero(band)[0]
        edges.append([int(xs.min()), int(xs.max())] if len(xs) else [W // 2, W // 2])
    print(name, W, H, len(groups), (ROOT / f"site/img3d/{name}.webp").stat().st_size)
    return {"w": W, "h": H, "groups": groups, "edgeStep": step, "edges": edges}


out = {"groups": GROUPS, "tiles": {}}
for n in NAMES:
    out["tiles"][n] = finish(n)
json.dump(out, open(ROOT / "site/manifest3d.json", "w"))
print("realistic ok")
