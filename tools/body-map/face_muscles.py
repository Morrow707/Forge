#!/usr/bin/env python3.13
"""The facial muscles, DRAWN -- because they are not in the render and three attempts at
uncovering them failed for that reason.

Scott, 2026-11-08: "again the head is too smooth, redraw the man and womans head but make it the
face with only muscles, not smooth."

**THIS IS A DRAWING AND THE FILE SAYS SO IN ITS OWN NAME.** `source3d`'s head is one smooth
mannequin mesh -- eyes, nose, lips, ears and nothing else, no cranium and not one facial muscle --
so nothing here is recovered from the render the way the body's fibre and seams are. Every shape
below is placed from published facial anatomy onto landmarks measured off the render. It is an
anatomical illustration standing in for a layer the source does not have, and it is NOT evidence
about anybody's face. The honest fix remains a render of the same four views with the head's
muscle layer turned on; this makes the head read as muscle until there is one.

**THE SHAPES ARE PLACED IN A FRAME THE RENDER DEFINES, never in tile pixels.** `u` is signed
across the head (-1 at the left edge of its own bounding box, +1 at the right), `v` runs 0 at the
crown to 1 at the bottom of the head mask. The landmarks were read off a coordinate grid over
male-front: midline x 414, box rows 13-275 and cols 304-525, so the eye line at y 152 is v 0.531,
the mouth at y 218 is v 0.782, the jaw angle at (342, 215) is u -0.652 / v 0.771. The female head
is the same mesh at a different width (box cols 309-515 against 304-525), so the same fractions
land on it -- which is the whole reason for the frame, and it is checked by eye on both.

**THE DRAWING IS MULTIPLIED BY THE HEAD'S OWN LIGHT, not pasted over it.** Each muscle gets its
belly roundness from its own distance transform and its fibre from its own axis, and the result is
scaled by the mannequin's own luminance about its median -- so the brow ridge, the cheek and the
jaw still model the drawn muscle, and a flat sticker is what you get if you skip that term.

**THE FACE STAYS UNLABELED** (Scott: "just leave them unlabeled"). Nothing here writes the label
map: these muscles are not a Forge group, they are not tappable, and no strength score or set
count will ever be attached to a face.
"""
import numpy as np, cv2
from scipy import ndimage as ndi

# Each entry: (name, kind, geometry, fibre). `side` "both" mirrors the shape about the midline.
# kind "poly": a closed outline in (u, v). "strap": two endpoints and a half-width, which is how
# a fusiform muscle with an origin and an insertion is actually shaped. "ring": an annulus.
# fibre: "along" runs the lines down the shape's long axis, "ring" runs them round it, an angle
# in degrees runs them at that angle (0 = across the face, 90 = up it).
FRONT = [
    # the forehead sheet, paired with a midline gap, fibres running up into the galea
    ("frontalis",      "poly", [(0.06, 0.50), (0.60, 0.42), (0.62, 0.22), (0.08, 0.16)], 90, "both"),
    # the fan over the temple, in front of and above the ear, narrowing to the coronoid process
    ("temporalis",     "poly", [(0.54, 0.60), (0.95, 0.46), (0.90, 0.26), (0.58, 0.30)], 72, "both"),
    # the ring round the orbit; the aperture inside it is drawn as a recess, not as an eye
    ("orbicularis_oculi", "ring", (0.33, 0.531, 0.31, 0.105, 0.40), "ring", "both"),
    ("procerus",       "poly", [(-0.10, 0.60), (0.10, 0.60), (0.08, 0.46), (-0.08, 0.46)], 90, "mid"),
    ("nasalis",        "poly", [(-0.17, 0.71), (0.17, 0.71), (0.12, 0.60), (-0.12, 0.60)], 20, "mid"),
    ("levator_labii",  "strap", ((0.27, 0.57), (0.15, 0.755), 0.052), "along", "both"),
    ("zygomaticus_minor", "strap", ((0.43, 0.605), (0.20, 0.775), 0.050), "along", "both"),
    ("zygomaticus_major", "strap", ((0.63, 0.625), (0.27, 0.788), 0.062), "along", "both"),
    # the jaw block: the one that makes a face read as muscular rather than as a shape
    ("masseter",       "poly", [(0.46, 0.615), (0.80, 0.595), (0.76, 0.845), (0.50, 0.835)], 84, "both"),
    ("risorius",       "strap", ((0.52, 0.775), (0.30, 0.788), 0.038), "along", "both"),
    ("orbicularis_oris", "ring", (0.0, 0.790, 0.30, 0.080, 0.46), "ring", "mid"),
    ("depressor_anguli_oris", "strap", ((0.29, 0.800), (0.155, 0.915), 0.055), "along", "both"),
    ("depressor_labii", "strap", ((0.17, 0.820), (0.09, 0.900), 0.042), "along", "both"),
    ("mentalis",       "poly", [(-0.14, 0.955), (0.14, 0.955), (0.10, 0.855), (-0.10, 0.855)], 90, "mid"),
]

# The back of a head is mostly the galea aponeurotica -- a tendon sheet, not a muscle -- with the
# occipital belly low down and the temporalis showing at each side. Drawing bellies over the whole
# cranium would be inventing muscle where there is none, which is the thing this file is careful
# not to do even while it is drawing.
BACK = [
    ("occipitalis",  "poly", [(-0.52, 0.86), (0.52, 0.86), (0.44, 0.66), (-0.44, 0.66)], 88, "mid"),
    ("temporalis",   "poly", [(0.62, 0.68), (0.96, 0.56), (0.92, 0.34), (0.66, 0.38)], 72, "both"),
]

APONEUROSIS = [(-0.56, 0.70), (0.56, 0.70), (0.46, 0.18), (-0.46, 0.18)]


def _px(pts, mid, half, top, height):
    return np.array([[mid + u * half, top + v * height] for u, v in pts], np.float32)


def _strap(a, b, hw, mid, half, top, height):
    p0 = np.array([mid + a[0] * half, top + a[1] * height], np.float32)
    p1 = np.array([mid + b[0] * half, top + b[1] * height], np.float32)
    d = p1 - p0
    n = np.array([-d[1], d[0]], np.float32)
    n /= max(float(np.hypot(*n)), 1e-3)
    w = hw * half
    return np.stack([p0 + n * w, p1 + n * w, p1 - n * w, p0 - n * w])


def _shapes(spec, mid, half, top, height, shape):
    """Rasterise one entry into a mask, plus the fibre field it wants."""
    name, kind, geom, fibre, side = spec
    out = []
    signs = (1, -1) if side == "both" else (1,)
    for s in signs:
        m = np.zeros(shape, np.uint8)
        if kind == "poly":
            pts = [(u * s, v) for u, v in geom]
            cv2.fillPoly(m, [np.round(_px(pts, mid, half, top, height)).astype(np.int32)], 1)
        elif kind == "strap":
            a, b, hw = geom
            quad = _strap((a[0] * s, a[1]), (b[0] * s, b[1]), hw, mid, half, top, height)
            cv2.fillPoly(m, [np.round(quad).astype(np.int32)], 1)
        else:  # ring: (u, v, rx, ry, inner fraction)
            u, v, rx, ry, inner = geom
            cx, cy = mid + u * s * half, top + v * height
            ax, ay = rx * half, ry * height
            cv2.ellipse(m, (int(round(cx)), int(round(cy))), (int(round(ax)), int(round(ay))), 0, 0, 360, 1, -1)
            cv2.ellipse(m, (int(round(cx)), int(round(cy))),
                        (max(1, int(round(ax * inner))), max(1, int(round(ay * inner)))), 0, 0, 360, 0, -1)
        if m.any():
            out.append((name, m.astype(bool), fibre))
    return out


def draw(rgb, head, lum, view, target, K):
    """Paint the facial muscles into `rgb` over `head`. `target` is the colour the head follows."""
    kf = lambda k, d: float(K.get(k, d))
    strength = kf("r_face_muscles", 0.0)
    if strength <= 0 or not head.any():
        return
    ys, xs = np.nonzero(head)
    top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    height, half = float(bottom - top), float(right - left) / 2.0
    mid = float(left + right) / 2.0
    if height < 20 or half < 10:
        return

    specs = FRONT if view == "front" else BACK
    shapes, claimed = [], np.zeros(head.shape, bool)
    for spec in specs:
        for nm, m, fibre in _shapes(spec, mid, half, top, height, head.shape):
            m = m & head
            if m.sum() < 40:
                continue
            shapes.append((nm, m, fibre))
            claimed |= m

    # EVERY SHAPE IS A BLURRED FIELD, NEVER THE POLYGON ITSELF, and that one change is what
    # separates muscle from sticky tape. The first version filled the polygons directly and read
    # as hard-edged blocks pasted on a head: a belly has no straight edges and no flat interior.
    # Blurring the fill and taking a level set gives a rounded outline, and the SAME field is the
    # belly's own dome -- high in the middle, falling to nothing at the seam -- so the shape and
    # its shading come from one thing instead of a polygon plus a distance transform fighting it.
    fields = []
    for nm, m, fibre in shapes:
        sig = max(np.sqrt(float(m.sum())) * kf("r_face_round", 0.30), 2.0)
        f = cv2.GaussianBlur(m.astype(np.float32), (0, 0), sig)
        f /= max(float(f.max()), 1e-5)
        fields.append((nm, f, fibre))
    claimed = np.zeros(head.shape, bool)
    level = kf("r_face_level", 0.34)
    for nm, f, fibre in fields:
        claimed |= (f > level) & head
    shapes = [(nm, (f > level) & head, fibre, f) for nm, f, fibre in fields]
    shapes = [t for t in shapes if t[1].sum() >= 40]

    paint = np.zeros((*head.shape, 3), np.float32)
    cover = np.zeros(head.shape, np.float32)
    # the aponeurosis: a pale tendon sheet, drawn under everything so a belly always wins
    apo = np.zeros(head.shape, np.uint8)
    cv2.fillPoly(apo, [np.round(_px(APONEUROSIS, mid, half, top, height)).astype(np.int32)], 1)
    apo = (apo.astype(bool) & head & ~claimed)
    if view == "back":
        apo = head & ~claimed
    if apo.any():
        paint[apo] = target * kf("r_face_tendon", 1.26)
        cover[apo] = 1.0

    yy, xx = np.mgrid[0:head.shape[0], 0:head.shape[1]].astype(np.float32)
    for i, (nm, m, fibre, f) in enumerate(shapes):
        reach = max(float(ndi.distance_transform_edt(m).max()), 1e-3)
        # the field IS the dome: 0 at the seam where it falls to the level set, 1 at the belly
        t = np.clip((f - level) / max(1.0 - level, 1e-3), 0, 1) ** 0.5
        belly = kf("r_face_seam", 0.62) + (1.0 - kf("r_face_seam", 0.62)) * t
        if fibre == "ring":
            cy, cx = ndi.center_of_mass(m)
            phase = np.arctan2(yy - cy, xx - cx) * (reach * 2.6)
        else:
            if fibre == "along":
                ys_, xs_ = np.nonzero(m)
                cov = np.cov(np.vstack([xs_ - xs_.mean(), ys_ - ys_.mean()]))
                w_, v_ = np.linalg.eigh(cov)
                ax = v_[:, int(np.argmax(w_))]
            else:
                a = np.deg2rad(float(fibre))
                ax = np.array([np.cos(a), -np.sin(a)], np.float32)
            phase = -(xx - mid) * ax[1] + (yy - top) * ax[0]
        lines = 1.0 - kf("r_face_fibre", 0.17) * np.clip(np.cos(2 * np.pi * phase / max(kf("r_face_fibre_px", 7.0), 1e-3)), 0, 1) ** 2
        # a little tone per muscle so one belly is told from the next where they touch
        jitter = 1.0 + kf("r_face_variation", 0.07) * (((i * 7) % 5) - 2) / 2.0
        col = target[None, None, :] * (belly * lines * jitter)[..., None]
        paint[m] = np.clip(col, 0, 255)[m]
        cover[m] = 1.0

    if not cover.any():
        return
    # The mannequin's own light still models the drawing: without this term the face is a sticker.
    med = float(np.median(lum[head]))
    shade = np.clip(lum / max(med, 1e-3), kf("r_face_shade_floor", 0.55), kf("r_face_shade_ceil", 1.45))
    shade = 1.0 + (shade - 1.0) * kf("r_face_shade", 0.85)
    paint *= shade[..., None]

    w = cv2.GaussianBlur(cover * head.astype(np.float32), (0, 0), kf("r_face_soften", 0.8)) * strength
    rgb[:] = rgb * (1 - w[..., None]) + np.clip(paint, 0, 255) * w[..., None]
