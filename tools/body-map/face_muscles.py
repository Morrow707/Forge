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
    # The forehead sheet, paired, fanning wider at the brow than at the crown. It reaches u 0.62
    # because the temple behind it is temporalis, not frontalis.
    ("frontalis", "poly", [(0.05, 0.500), (0.28, 0.492), (0.50, 0.455), (0.61, 0.380),
                           (0.60, 0.260), (0.46, 0.180), (0.26, 0.152), (0.07, 0.150)], 90, "both"),
    # THE TEMPLE, NOT THE EAR. The first version ran u 0.56-0.97 and the ear's front edge is at
    # u 0.71 on this render, so it was drawn over the ear and read as a pair of wings. The temple
    # is in FRONT of that: the fan sits u 0.42-0.76 and dives under the zygomatic arch at v 0.58.
    ("temporalis", "poly", [(0.430, 0.560), (0.560, 0.585), (0.700, 0.520), (0.762, 0.410),
                            (0.735, 0.285), (0.590, 0.225), (0.462, 0.290), (0.420, 0.420)], 74, "both"),
    ("corrugator", "strap", ((0.330, 0.478), (0.095, 0.497), 0.036), "along", "both"),
    ("orbicularis_oculi", "ring", (0.330, 0.531, 0.360, 0.125, 0.40), "ring", "both"),
    ("procerus", "poly", [(-0.090, 0.612), (0.090, 0.612), (0.072, 0.470), (-0.072, 0.470)], 90, "mid"),
    ("nasalis", "poly", [(-0.195, 0.722), (-0.080, 0.742), (0.080, 0.742), (0.195, 0.722),
                         (0.125, 0.612), (-0.125, 0.612)], 16, "mid"),
    ("levator_labii_alaeque_nasi", "strap", ((0.170, 0.562), (0.128, 0.735), 0.038), "along", "both"),
    ("levator_labii", "strap", ((0.310, 0.588), (0.182, 0.752), 0.054), "along", "both"),
    ("zygomaticus_minor", "strap", ((0.470, 0.608), (0.232, 0.772), 0.052), "along", "both"),
    ("zygomaticus_major", "strap", ((0.690, 0.612), (0.292, 0.788), 0.064), "along", "both"),
    # the jaw block, from under the arch down to the angle of the mandible
    ("masseter", "poly", [(0.430, 0.628), (0.600, 0.600), (0.775, 0.625), (0.800, 0.742),
                          (0.735, 0.838), (0.575, 0.872), (0.462, 0.812), (0.428, 0.718)], 84, "both"),
    ("buccinator", "poly", [(0.320, 0.730), (0.465, 0.718), (0.520, 0.790), (0.425, 0.840),
                            (0.310, 0.820)], 8, "both"),
    ("risorius", "strap", ((0.575, 0.780), (0.312, 0.792), 0.038), "along", "both"),
    ("orbicularis_oris", "ring", (0.0, 0.792, 0.330, 0.092, 0.42), "ring", "mid"),
    ("depressor_anguli_oris", "poly", [(0.340, 0.796), (0.228, 0.800), (0.128, 0.920),
                                       (0.248, 0.936), (0.342, 0.860)], 70, "both"),
    ("depressor_labii", "strap", ((0.178, 0.832), (0.086, 0.908), 0.048), "along", "both"),
    ("mentalis", "poly", [(-0.130, 0.972), (0.130, 0.972), (0.108, 0.858), (-0.108, 0.858)], 90, "mid"),
]

# The apertures: an eye socket and a mouth opening are HOLES, and leaving them at the head's own
# colour drew two red eyeballs and a red mouth. They are recessed instead -- the same shapes the
# rings are built on, at their inner radius.
APERTURES = [(0.330, 0.531, 0.360 * 0.40, 0.125 * 0.40, "both"),
             (0.0, 0.792, 0.330 * 0.42, 0.092 * 0.42, "mid")]

# The back of a head is mostly the galea aponeurotica -- a tendon sheet, not a muscle -- with the
# occipital belly low down and the temporalis showing at each side. Drawing bellies over the whole
# cranium would be inventing muscle where there is none, which is the thing this file is careful
# not to do even while it is drawing.
BACK = [
    ("occipitalis", "poly", [(-0.50, 0.870), (-0.26, 0.895), (0.26, 0.895), (0.50, 0.870),
                             (0.42, 0.700), (0.0, 0.660), (-0.42, 0.700)], 88, "mid"),
    ("temporalis", "poly", [(0.615, 0.690), (0.780, 0.700), (0.950, 0.600), (0.985, 0.440),
                            (0.900, 0.330), (0.720, 0.360), (0.635, 0.500)], 74, "both"),
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
    # THE ROUNDING IS TAKEN FROM EACH SHAPE'S MINOR AXIS, NEVER FROM ITS AREA, and that one line
    # is the difference between a muscle and a jelly bean. The second attempt used
    # sqrt(area) * 0.3, so a 200 x 20 strap -- a zygomaticus, a depressor -- got a sigma of 19 on
    # a shape 20 px wide and came back a sausage, while a sheet the same area was barely touched.
    # The minor axis is the width the blur has to respect: it rounds a sheet and leaves a strap a
    # strap. The level set is 0.5 for the same reason -- at any other level a blur also GROWS or
    # SHRINKS the shape, so the anatomy drifts with a knob that is meant to soften it.
    fields = []
    for nm, m, fibre in shapes:
        ys_, xs_ = np.nonzero(m)
        cov = np.cov(np.vstack([xs_ - xs_.mean(), ys_ - ys_.mean()]))
        minor = float(np.sqrt(max(np.linalg.eigvalsh(cov).min(), 1e-3)))
        sig = max(minor * kf("r_face_round", 0.55), 1.2)
        f = cv2.GaussianBlur(m.astype(np.float32), (0, 0), sig)
        f /= max(float(f.max()), 1e-5)
        fields.append((nm, f, fibre))
    claimed = np.zeros(head.shape, bool)
    level = kf("r_face_level", 0.50)
    for nm, f, fibre in fields:
        claimed |= (f > level) & head
    shapes = [(nm, (f > level) & head, fibre, f) for nm, f, fibre in fields]
    shapes = [t for t in shapes if t[1].sum() >= 40]

    paint = np.zeros((*head.shape, 3), np.float32)
    cover = np.zeros(head.shape, np.float32)
    # the aponeurosis: a pale tendon sheet, drawn under everything so a belly always wins
    # EVERY PIXEL THE BELLIES DO NOT CLAIM IS THE SHEET, on both views. Confining it to a polygon
    # left the crown and the gaps between bellies at the head's own colour, so they read as bare
    # SKIN on a face that has had its skin taken off -- which is the one thing this is for. The
    # galea and the periosteum are what is actually there between and above the facial muscles,
    # and they are tendon: paler than a belly and pulled toward neutral, because a tendon has
    # almost no blood in it and reading as a pale muscle is how it goes unnoticed.
    apo = head & ~claimed
    if apo.any():
        pale = target * kf("r_face_tendon", 1.30)
        grey = float(pale @ np.array([0.299, 0.587, 0.114], np.float32))
        pale = pale + (grey - pale) * kf("r_face_tendon_grey", 0.42)
        paint[apo] = pale
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
        # Fibre is what makes the lats and the quads read as muscle in this render rather than as
        # coloured regions, and at 0.13 it was invisible here. It fades out at the muscle's own
        # edge so a belly ends in a tendon rather than in a row of cut stripes.
        wave = np.cos(2 * np.pi * phase / max(kf("r_face_fibre_px", 4.2), 1e-3))
        lines = 1.0 - kf("r_face_fibre", 0.34) * (np.clip(wave, 0, 1) ** 1.6) * np.clip(t * 2.2, 0, 1)
        # a little tone per muscle so one belly is told from the next where they touch
        jitter = 1.0 + kf("r_face_variation", 0.07) * (((i * 7) % 5) - 2) / 2.0
        col = target[None, None, :] * (belly * lines * jitter)[..., None]
        paint[m] = np.clip(col, 0, 255)[m]
        cover[m] = 1.0

    # the apertures, after every belly, so a ring cannot paint over its own hole
    # FRONT ONLY. The apertures were view-independent and so were punched into the BACK of the
    # skull as well: two dark ovals where the eyes would be if you could see through the head.
    ap = kf("r_face_aperture", 0.42) if view == "front" else 0.0
    if ap > 0:
        hole = np.zeros(head.shape, np.uint8)
        for u, v, rx, ry, side in APERTURES:
            for sgn in ((1, -1) if side == "both" else (1,)):
                cv2.ellipse(hole, (int(round(mid + u * sgn * half)), int(round(top + v * height))),
                            (max(1, int(round(rx * half))), max(1, int(round(ry * height)))),
                            0, 0, 360, 1, -1)
        hm2 = hole.astype(bool) & head
        if hm2.any():
            paint[hm2] = target * ap
            cover[hm2] = 1.0

    if not cover.any():
        return
    # The mannequin's own light still models the drawing: without this term the face is a sticker.
    med = float(np.median(lum[head]))
    shade = np.clip(lum / max(med, 1e-3), kf("r_face_shade_floor", 0.55), kf("r_face_shade_ceil", 1.45))
    shade = 1.0 + (shade - 1.0) * kf("r_face_shade", 0.85)
    paint *= shade[..., None]

    w = cv2.GaussianBlur(cover * head.astype(np.float32), (0, 0), kf("r_face_soften", 0.8)) * strength
    rgb[:] = rgb * (1 - w[..., None]) + np.clip(paint, 0, 255) * w[..., None]
