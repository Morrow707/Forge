#!/usr/bin/env python3.13
"""The head, from the real 3D model rather than drawn on.

Scott, 2026-11-10, on the drawn face: "the face doesn't match the body, nor the same style, the
muscles in your face don't just sit on the front, they wrap all the way around your head."
He was right on both counts and they are one fault: face_muscles.py painted flat shapes onto the
front of a smooth mannequin head, so nothing wrapped round the skull and nothing was lit or
textured the way the body is, because the body is a 3D render and the face was a drawing.

This replaces the drawing with a RENDER of the same source the body comes from. Z-Anatomy
(CC BY-SA 4.0, from BodyParts3D, DBCLS) carries every muscle of the head as a mesh -- frontalis,
the epicranial aponeurosis, occipitalis, temporalis and temporoparietalis wrapping the side of
the skull, both parts of masseter, orbicularis oculi and oris, the zygomatics, levators,
depressors, buccinator, nasalis, procerus, corrugator, risorius, mentalis -- plus the cranium,
the mandible, the eyes and the outer ear. `render_head.py` renders those front and back,
orthographic, with Z-Anatomy's own muscle and tendon shaders, and a second CLASS pass of flat
colours (muscle / tendon / bone / eye / ear) so each material can be put into the figure's
palette separately. The renders are checked in under source3d/head/ for the same reason
source3d/ is: so the figure can be re-finished without the 300 MB model.

Two steps, called from realistic.py:
  place()     -- at the start of the finish, before the fibre is read, so the head's own surface
                 texture is recovered by the same pass the body's is. The render is fitted to the
                 mannequin head the body tile already has (crown to chin, ear to ear, measured off
                 the FRONT tile of the same figure so front and back share one fit), replaces it,
                 and stays UNDER every labelled muscle (the neck and the traps keep drawing over
                 the skull base, which is what they do on a body).
  recolour()  -- where the head used to be tinted: muscle takes the head colour (the hip flexors'
                 colour, HEAD_TAKES_COLOUR_FROM in realistic.py), tendon and bone take the ONE
                 tendon tone and the ONE bone tone the hands and feet use (extremity_tones), the
                 ear takes the tendon tone, the eye is muted. Every pixel keeps its own luminance
                 about its class's median, so the render's modelling all survives.

The face stays UNLABELED: nothing here writes the label map, so no group, tap, score or set
count ever attaches to a face.
"""
import json, pathlib
import numpy as np
import cv2
from PIL import Image

CLASSES = {"muscle": 1, "tendon": 2, "bone": 3, "eye": 4, "ear": 5}


def available(src_dir):
    d = pathlib.Path(src_dir) / "head"
    return all((d / f).exists() for f in ("front.png", "back.png", "front-class.png", "back-class.png"))


def _load(src_dir, view):
    d = pathlib.Path(src_dir) / "head"
    rgba = np.array(Image.open(d / f"{view}.png").convert("RGBA")).astype(np.float32)
    cl = np.array(Image.open(d / f"{view}-class.png").convert("RGBA"))
    r, g, b, a = [cl[..., i].astype(np.int16) for i in range(4)]
    hi, lo = 170, 90
    cls = np.zeros(cl.shape[:2], np.uint8)
    cls[(r > hi) & (g < lo) & (b < lo)] = CLASSES["muscle"]
    cls[(r < lo) & (g > hi) & (b < lo)] = CLASSES["tendon"]
    cls[(r < lo) & (g < lo) & (b > hi)] = CLASSES["bone"]
    cls[(r > hi) & (g > hi) & (b < lo)] = CLASSES["eye"]
    cls[(r > hi) & (g < lo) & (b > hi)] = CLASSES["ear"]
    cls[a < 128] = 0
    return rgba, cls


def _box(mask):
    rows = np.nonzero(mask.any(1))[0]
    w = mask.sum(1)
    return int(rows[0]), int(rows[-1]), int(w.max())


def fit_for(front_head_mask):
    """The mannequin head on the FRONT tile: crown row, chin row, ear-to-ear width, centre column.
    The back view has the traps over its lower half, so its own mask is not a head's height."""
    top, bottom, width = _box(front_head_mask)
    row = front_head_mask[top + int(0.3 * (bottom - top))]
    xs = np.nonzero(row)[0]
    return {"top": top, "bottom": bottom, "width": width, "cx": float(xs[0] + xs[-1]) / 2.0}


def place(rgb, alpha, lab, head_mask, view, fit, src_dir, K):
    """Composite the rendered head in place of the mannequin's. Mutates rgb and alpha; returns the
    class map (0 = not head render) at the tile's resolution."""
    kf = lambda k, d: float(K.get(k, d))
    H, W = alpha.shape
    rgba, cls = _load(src_dir, view)
    # the head's own box, written by render_head.py from the 3D bounds: the render also carries the
    # neck muscles that attach to the skull, which run off the bottom of the frame, so the alpha's
    # box is not the head's
    hb = json.load(open(pathlib.Path(src_dir) / "head" / "render.json"))["headBox"]
    rtop, rbottom, rwidth, rcx = hb["top"], hb["bottom"], hb["width"], hb["cx"]
    # separate x and y scales: the female mannequin head is the male mesh at another width, so a
    # single scale fits one axis and misses the other by ~10%
    sy = (fit["bottom"] - fit["top"]) / max(rbottom - rtop, 1) * kf("r_headr_scale", 1.0)
    sx = fit["width"] / max(rwidth, 1) * kf("r_headr_scale", 1.0) * kf("r_headr_width", 1.0)
    # back view is the same head from behind; the tile's own centre is used (a back tile is the
    # front mirrored by the camera, not by the image, so its midline is measured, not assumed)
    cx = fit["cx"]
    M = np.array([[sx, 0, cx - rcx * sx], [0, sy, fit["top"] - rtop * sy + kf("r_headr_dy", 0.0)]], np.float32)
    warped = cv2.warpAffine(rgba, M, (W, H), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    wcls = cv2.warpAffine(cls, M, (W, H), flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    wa = warped[..., 3] / 255.0

    # where the head render may draw: inside the mannequin head, or anywhere above its last row
    # (the ears and the chin can sit a few pixels past the mannequin's), and never over a labelled
    # muscle -- the neck and the traps draw over the skull base on a body, so they still do here
    last = int(np.nonzero(head_mask.any(1))[0][-1])
    allow = head_mask.copy()
    allow[: last + 1] |= True
    allow &= lab == 0
    a = wa * allow
    # the mannequin's own pixels inside its head mask that the render does not cover go away
    # and its anti-aliased rim just outside the mask, which otherwise stays as a dark ring round
    # the new head
    rim = cv2.dilate(head_mask.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool) & (lab == 0)
    keep_old = (alpha / 255.0) * (~(head_mask | rim))
    new_alpha = np.maximum(keep_old, a)
    blend = np.where(new_alpha > 1e-4, a / np.maximum(new_alpha, 1e-4), 0.0)
    rgb[:] = rgb * (1 - blend[..., None]) + warped[..., :3] * blend[..., None]
    alpha[:] = new_alpha * 255.0
    # every pixel the render drew gets a class, including its anti-aliased edge: a pixel at a < 0.5
    # left unclassed would keep Z-Anatomy's own copper and ring the head in it
    drawn = a > 0.02
    have = wcls > 0
    if have.any():
        from scipy import ndimage as ndi
        _, (iy, ix) = ndi.distance_transform_edt(~have, return_indices=True)
        filled = wcls[iy, ix]
    else:
        filled = wcls
    return np.where(drawn, filled, 0).astype(np.uint8)


def recolour(rgb, cls, target, bone, tendon, K):
    """Put each material into the figure's palette, keeping every pixel's own luminance about its
    class's median so the shaders' modelling and fibre survive."""
    kf = lambda k, d: float(K.get(k, d))
    w = np.array([0.299, 0.587, 0.114], np.float32)
    lum = rgb @ w
    floor, ceil = kf("r_headr_floor", 0.40), kf("r_headr_ceil", 1.45)
    eye_tone = np.array([150, 136, 128], np.float32)
    for name, tone, contrast in (("muscle", target * kf("r_headr_muscle_level", 1.0), kf("r_headr_muscle_contrast", 1.0)),
                                 ("tendon", tendon, kf("r_headr_tendon_contrast", 0.8)),
                                 ("ear", tendon * kf("r_headr_ear_level", 0.92), kf("r_headr_tendon_contrast", 0.8)),
                                 ("bone", bone * kf("r_headr_bone_level", 0.82), kf("r_headr_bone_contrast", 0.8)),
                                 ("eye", eye_tone * kf("r_headr_eye_level", 0.8), kf("r_headr_eye_contrast", 0.9))):
        m = cls == CLASSES[name]
        if m.sum() < 16:
            continue
        l = lum[m]
        med = float(np.median(l))
        if med < 1.0:
            continue
        rel = np.clip((l / med) ** contrast, floor, ceil)
        rgb[m] = np.clip(tone[None, :] * rel[:, None], 0, 255)
