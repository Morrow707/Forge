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

import face_muscles

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

# Scott, 2026-11-08: "make it the same color as the hip flexors". A NAME, not a knob, because
# this is a rule about which group the head follows and the knobs are numbers somebody turns.
# Read off the FINISHED tile rather than written down as an RGB triple, so the head keeps
# following that group when any of the tone knobs move. The back views have no hip flexors in
# them, so each front tile leaves its answer here for the back of the same figure.
HEAD_TAKES_COLOUR_FROM = "Hip Flexors"
head_colour_cache: dict = {}

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


def extremity_tones(target, K):
    """The ONE bone tone and the ONE tendon tone the whole figure uses.

    The hands, the feet and the shin are not a gap in the render the way the face was: the dorsum
    of a hand and the dorsum of a foot really are extensor tendon over bone with almost no muscle
    on them, and that is what the render draws. What was wrong is that it draws them in a neutral
    grey while every other part of the figure is coloured, so four white claws read as a stock
    asset rather than as this body's own hands. They are pulled into the figure's palette here,
    and the SAME two tones are what the head's cranium sheet uses -- which is the whole reason
    these were done together: a figure with two different ivories and two different tendon greys
    reads as parts from two places.
    """
    kf = lambda k, d: float(K.get(k, d))
    w = np.array([0.299, 0.587, 0.114], np.float32)
    grey = float(target @ w)
    bone = np.clip(target + (np.float32(255.0) - target) * kf("r_bone_white", 0.80), 0, 255) * kf("r_bone_level", 0.96)
    tendon = (target + (grey - target) * kf("r_tendon_grey", 0.55)) * kf("r_tendon_level", 1.18)
    return np.clip(bone, 0, 255), np.clip(tendon, 0, 255)


def recolour_extremities(rgb, lum, body, lab, head, target, K):
    """Every ungrouped part that is not the head: hands, feet, the shin's bone, the clavicles.

    Bone and tendon are told apart by the part's OWN luminance, not by a fixed level: the bones
    are the bright things in a hand and the tendons are the strands between them, and both sit
    differently on a foot in shadow than on a hand in the light. Each pixel keeps its own value
    about the part's median, so every bit of the render's modelling survives -- this is a
    recolour, the same move the head's tint makes, and not a repaint.
    """
    kf = lambda k, d: float(K.get(k, d))
    strength = kf("r_extremity", 0.0)
    if strength <= 0:
        return
    bare = (lab == 0) & body & ~head
    if not bare.any():
        return
    bone, tendon = extremity_tones(target, K)
    comp, n = ndi.label(bare)
    w = np.array([0.299, 0.587, 0.114], np.float32)
    for i in range(1, n + 1):
        m = comp == i
        if m.sum() < 200:
            continue
        l = lum[m]
        med = float(np.median(l))
        if med < 1.0:
            continue
        # bone above the part's own upper quartile, tendon below it, over a ramp so a highlight
        # on a tendon does not flip to bone pixel by pixel
        hi, lo = float(np.percentile(l, kf("r_bone_pct", 72.0))), float(np.percentile(l, 30.0))
        t = np.clip((l - lo) / max(hi - lo, 1e-3), 0, 1) ** kf("r_bone_curve", 1.4)
        tone = tendon[None, :] * (1 - t)[:, None] + bone[None, :] * t[:, None]
        scale = np.clip(l / med, kf("r_extremity_floor", 0.45), kf("r_extremity_ceil", 1.55))
        px = np.clip(tone * scale[:, None], 0, 255)
        rgb[m] = rgb[m] * (1 - strength) + px * strength


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
            value = kf("r_head_value", 1.0)
            if ki("r_head_match", 0) and HEAD_TAKES_COLOUR_FROM in GROUPS:
                gm = (lab == GROUPS.index(HEAD_TAKES_COLOUR_FROM) + 1) & body
                if gm.sum() > 400:
                    head_colour_cache[name.split("-")[0]] = np.median(rgb[gm], axis=0).astype(np.float32)
                ref = head_colour_cache.get(name.split("-")[0])
                if ref is not None:
                    target = ref
                    # match the LEVEL as well as the hue: the head is pale and the hip flexors are
                    # not, and a chroma match alone would leave a light version of their colour
                    w = np.array([0.299, 0.587, 0.114], np.float32)
                    head_lum = float(np.median(rgb[hm] @ w))
                    value = float(target @ w) / head_lum if head_lum > 1e-3 else 1.0
            t_lum = float(target @ np.array([0.299, 0.587, 0.114], np.float32))
            if t_lum > 1e-3:
                px = rgb[hm]
                # r_head_value is a separate knob from the target colour because the recolour
                # PRESERVES luminance: the mannequin head is pale, so chroma alone can only ever
                # make it a light red. Darkening is a move on the head's own value, not a redder
                # target -- and it stays a multiplier on each pixel so the brow, nose and jaw
                # keep their relative shading instead of flattening into one slab.
                l = (px @ np.array([0.299, 0.587, 0.114], np.float32)) * value
                rgb[hm] = px * (1 - tint) + np.clip(l[:, None] * (target / t_lum)[None, :], 0, 255) * tint
            # Scott: "don't make it a face". The eyes, the nose and the lips are the only detail
            # the mannequin head carries, so smoothing INSIDE the head mask takes the doll face
            # off and leaves a blank cranium; the silhouette is the alpha channel and is not
            # touched, so the jaw and the ears still read as a head. This does not put a skull
            # there -- see the README: that geometry is not in the render.
            fs = kf("r_head_face", 0.0)
            if fs > 0:
                # A BLUR CANNOT DO THIS AND TRYING IT IS THE WRONG SHAPE. The eyes and the mouth
                # are deep dark features: at a sigma small enough to keep the brow, the cheek and
                # the jaw modelled they survive intact, and at a sigma large enough to erase them
                # the head is a featureless egg. In between -- measured at sigma 17 -- they come
                # back as ghosts, which is the worst of the three. So the features are FOUND and
                # FILLED instead: a pixel more than r_head_face_depth below the head's own local
                # level is a feature, and inpainting takes it out from its surroundings. What is
                # left keeps the cranial form (the brow ridge, the cheek, the jaw line) and has
                # no eyes, no nostrils and no lips -- which is as close to a skull as this source
                # can get, because the render has no skull and no facial muscles in it at all.
                lh = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
                wm = hm.astype(np.float32)
                sig = kf("r_head_face_sigma", 17.0)
                local = cv2.GaussianBlur(lh * wm, (0, 0), sig) / np.maximum(cv2.GaussianBlur(wm, (0, 0), sig), 1e-4)
                # The deviation is ABSOLUTE in both directions, which the first version got
                # wrong: an eye is an almond with a DARK rim and a LIGHTER interior, so a
                # darker-than-local test filled the rim and left the shape sitting there as a
                # pale almond. The mouth, which is dark throughout, came out on the first try --
                # a fix that works on one feature and not its neighbour is the tell.
                feat = (hm & (np.abs(local - lh) > kf("r_head_face_depth", 14.0))).astype(np.uint8)
                if feat.any():
                    feat = cv2.dilate(feat, np.ones((5, 5), np.uint8), iterations=1) * hm
                    filled = cv2.inpaint(np.clip(rgb, 0, 255).astype(np.uint8), feat,
                                         float(ki("r_head_face_radius", 9)), cv2.INPAINT_TELEA).astype(np.float32)
                    f = cv2.GaussianBlur(feat.astype(np.float32), (0, 0), 2.0) * fs
                    rgb = rgb * (1 - f[..., None]) + filled * f[..., None]
            # AND WHEN THAT IS NOT ENOUGH, PAINT THE CRANIUM RATHER THAN EDIT IT. Finding and
            # filling features took the mouth out and left the eyes, because an eye is an almond
            # whose rim and interior deviate in OPPOSITE directions and the inpaint fills each
            # from the other. Removing a face from a render of a face is reconstruction, not
            # filtering. So r_head_dome does what hd.py already does for the hands and the feet:
            # the head is PAINTED as a solid, shaded up from its own silhouette by the distance
            # transform, which gives a bald cranium with no features at all and keeps the ears
            # and the jaw, because those are the alpha channel and nothing here touches it.
            # AND THE FIBRE MUST NOT RUN OVER THE HEAD. `fibre` is a high-pass of the ORIGINAL
            # luminance, taken at step 1 and multiplied in at step 5 -- AFTER this -- so it was
            # re-printing the eyes and the mouth onto every head that had just had them removed.
            # Three attempts at taking the face off read as three failures of the removal; the
            # removal had worked each time and this was putting it back. The head carries no
            # muscle fibre to recover in the first place, so it is excluded outright.
            fibre[hm] = 0
            # Scott: "redraw the man and womans head but make it the face with only muscles,
            # not smooth". The render has no facial muscles in it, so they are DRAWN -- see
            # face_muscles.py, which says so at length. It runs after the recolour so it inherits
            # the head's colour, and before the key light and the rim so the face is lit with the
            # rest of the figure.
            face_muscles.draw(rgb, hm, lum, "front" if name.endswith("front") else "back", target, K)
            # the hands, the feet and the shin's bone, in the same two tones the cranium uses
            recolour_extremities(rgb, lum, body, lab, hm, target, K)
            dome = kf("r_head_dome", 0.0)
            if dome > 0:
                d = ndi.distance_transform_edt(hm)
                lit = 0.52 + 0.48 * np.clip(d / max(kf("r_head_dome_px", 56.0), 1e-3), 0, 1) ** 0.55
                paint = np.clip(target[None, None, :] * lit[..., None] * kf("r_head_dome_level", 1.0), 0, 255)
                w = cv2.GaussianBlur(hm.astype(np.float32), (0, 0), 1.5) * dome
                rgb = rgb * (1 - w[..., None]) + paint * w[..., None]

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
