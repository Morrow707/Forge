#!/usr/bin/env python3.13
"""Cut a single figure out of a labelled one-figure sheet (dark or white background), drop the
labels, leader lines and any pedestal, inpaint the lines that cross the body, and replace the
head with a blank one. Writes v2/tiles/<name>.png."""
import os, pathlib, sys
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi

ROOT = pathlib.Path(__file__).resolve().parent
IMAGES = pathlib.Path(os.environ["BODYMAP_SRC"])
OUT = pathlib.Path(os.environ["BODYMAP_WORK"]) / "tiles"; OUT.mkdir(parents=True, exist_ok=True)
disc = lambda r: (lambda y, x: (x - r) ** 2 + (y - r) ** 2 <= r * r)(*np.ogrid[:2 * r + 1, :2 * r + 1])

JOBS = {  # name: (file, background, blank head?)
    "female-front": ("female-front.webp", "white", False),
    "female-back": ("female-back.webp", "dark", False),
    "male-front": ("male-front.webp", "dark", False),
    "male-back": ("male-back.webp", "dark", False),
}

def fill_small(m, grow, limit):
    """Add what `grow(m)` would add, but only pieces under `limit` pixels: an arrowhead notch,
    a pinhole. The gap between two legs is thousands of pixels and stays open."""
    added = grow(m) & ~m
    lab_, n_ = ndi.label(added)
    if not n_: return m
    sizes_ = ndi.sum(added, lab_, range(1, n_ + 1))
    keep_ = np.isin(lab_, [i + 1 for i, sz in enumerate(sizes_) if sz < limit])
    return m | keep_

def run(name, file, bg, blank_head):
    img = np.asarray(Image.open(IMAGES / file).convert("RGB")).astype(np.int16)
    H, W, _ = img.shape
    mx = img.max(2); mn = img.min(2); rng = mx - mn
    lum = (0.299 * img[..., 0] + 0.587 * img[..., 1] + 0.114 * img[..., 2]).astype(np.float32)
    if bg == "dark":
        fg = mx > 72
        textish = (mn > 150) & (rng < 18)                 # white/grey text and lines; skin highlights are warmer
    else:
        fg = (mn < 232) | (rng > 14)                      # near-white skin highlights still count
        textish = (mx < 110) & (rng < 40)                 # dark text and lines
    # A line crossing the body is a thin ridge, bright or dark, in SOME channel -- a yellow
    # leader over a blue muscle is invisible in luminance and obvious in blue.
    ridge = np.zeros((H, W), np.float32)
    for c in range(3):
        ch = img[..., c].astype(np.float32)
        ridge = np.maximum(ridge, ch - ndi.grey_opening(ch, footprint=disc(4)))
        ridge = np.maximum(ridge, ndi.grey_closing(ch, footprint=disc(4)) - ch)
    darkblob = mx < 42                                    # a filled black arrowhead; shadow creases are lighter
    # The body: open away thin things, keep the biggest blob, then reattach fingers etc.
    body = ndi.binary_opening(fg & ~textish, structure=disc(4))
    lab, n = ndi.label(body)
    sizes = ndi.sum(body, lab, range(1, n + 1))
    big = lab == (int(np.argmax(sizes)) + 1)
    # Whole blobs that touch the body come back in one piece (a leg the opening split off at
    # the hip, a hand at the wrist); text and lines are already gone by colour.
    ped_grey = (rng < 22) & (mx < 170)                      # the flat grey of a pedestal
    cand = ndi.binary_opening(fg & ~textish & ~ped_grey, structure=disc(1))
    cl, cn = ndi.label(cand); keep = np.zeros_like(cand)
    near = ndi.binary_dilation(big, structure=disc(14))
    for k in range(1, cn + 1):
        part = cl == k
        if part.sum() >= 120 and (part & near).any(): keep |= part
    m = fill_small(keep, ndi.binary_fill_holes, 900)
    # A bright highlight on the body (the shine on a hair bun) is not a label: bright pixels
    # the closed silhouette encloses come back in.
    m |= fg & textish & ndi.binary_erosion(ndi.binary_closing(m, structure=disc(14)), structure=disc(2))
    m = fill_small(m, lambda x: ndi.binary_closing(x, structure=disc(5)), 500)   # arrowhead notches
    m = fill_small(m, ndi.binary_fill_holes, 900)
    core = ndi.binary_opening(m, structure=disc(3))
    core_d = ndi.binary_dilation(core, structure=disc(2))
    stubs = m & ~core_d
    far = ndi.distance_transform_edt(~core_d)             # how far a stub pixel is from the body
    sl_, sn = ndi.label(stubs)
    for k in range(1, sn + 1):
        part = sl_ == k
        if far[part].max() > 20: m &= ~part                # a leader line; a finger never reaches that far
    # A pedestal: rows near the bottom far wider than a pair of feet. Cut from its top down.
    widths = m.sum(1)
    ys = np.nonzero(m.sum(1))[0]; xs = np.nonzero(m.sum(0))[0]
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    # Blank head: everything above the neck becomes a smooth skin-coloured head of the same
    # silhouette, minus hair that sticks out. Neck = the narrowest rows in the top 16%.
    if blank_head:
        top = int(y0 + 0.16 * (y1 - y0))
        band = widths[y0:top] if False else m[y0:top].sum(1)
        neck = y0 + int(np.argmin(band[int(len(band) * 0.5):]) + len(band) * 0.5)
        head = m.copy(); head[neck:, :] = False
        # a tidy oval the width of the neck's shoulders-free head
        hy, hx = np.nonzero(head)
        cx = (hx.min() + hx.max()) / 2; hw = (hx.max() - hx.min()) * 0.86; hh = (neck - y0) * 1.0
        yy, xx = np.ogrid[:H, :W]
        oval = ((xx - cx) / (hw / 2)) ** 2 + ((yy - (y0 + hh * 0.5)) / (hh / 2)) ** 2 <= 1
        oval &= yy < neck + 6
        m[:neck + 6, :] &= oval[:neck + 6, :] | ndi.binary_dilation(m[:neck + 6, :] & (yy[:neck + 6] >= neck - 30), structure=disc(2))
        m[:neck + 6, :] |= oval[:neck + 6, :]
    pad = 8
    sl = (slice(max(0, y0 - pad), min(H, y1 + pad)), slice(max(0, x0 - pad), min(W, x1 + pad)))
    tile = img[sl].astype(np.float32); tm = m[sl]
    # Lines crossing the body: ridges well inside the silhouette, below the head.
    inner = ndi.binary_erosion(tm, structure=disc(5))
    fy = (np.arange(tm.shape[0])[:, None] + sl[0].start - y0) / max(1, y1 - y0)
    rm = (ridge[sl] > 34) & inner & (fy > 0.14)
    rl, rn = ndi.label(ndi.binary_dilation(rm, structure=disc(1)))
    tw = np.zeros_like(rm)
    for k, o in enumerate(ndi.find_objects(rl), start=1):
        if o is None: continue
        hh, ww = o[0].stop - o[0].start, o[1].stop - o[1].start
        if max(hh, ww) >= 45: tw |= (rl == k) & rm
    tw |= textish[sl] & tm
    tw |= darkblob[sl] & tm & (fy > 0.14)
    tw |= tm & ~fg[sl]                                     # closed-over notches have no colour yet
    if blank_head:
        tw |= tm & (fy < (neck - y0) / max(1, y1 - y0) + 0.004)   # repaint the whole head region
    tw = ndi.binary_dilation(tw, structure=disc(2)) & tm
    if tw.any():
        src8 = np.clip(tile, 0, 255).astype(np.uint8)
        filled = cv2.inpaint(src8, tw.astype(np.uint8) * 255, 4, cv2.INPAINT_TELEA)
        tile[tw] = filled[tw].astype(np.float32)
    if blank_head:
        # Paint the head as a smooth skin-toned oval: the figure's own skin colour (median of its
        # beige pixels), shaded like a sphere lit from the upper left.
        hy = int((neck - y0) + pad + 8)
        headpix = tm.copy(); headpix[hy:, :] = False
        tmx = tile.max(2); tmn = tile.min(2); trng = tmx - tmn
        tr, tg, tb = tile[..., 0], tile[..., 1], tile[..., 2]
        th = np.where(tmx == tr, ((tg - tb) / np.maximum(trng, 1e-6)) % 6, np.where(tmx == tg, (tb - tr) / np.maximum(trng, 1e-6) + 2, (tr - tg) / np.maximum(trng, 1e-6) + 4)) * 60
        skinpix = tm & ~headpix & (th > 10) & (th < 45) & (trng / np.maximum(tmx, 1) < 0.5) & (tmx > 120)
        skin = np.median(tile[skinpix], axis=0) if skinpix.sum() > 200 else np.array([225, 190, 165], np.float32)
        hys, hxs = np.nonzero(headpix)
        if len(hys):
            cy, cx = hys.mean(), hxs.mean(); ry = (hys.max() - hys.min()) / 2 or 1; rx = (hxs.max() - hxs.min()) / 2 or 1
            yy, xx = np.mgrid[:tile.shape[0], :tile.shape[1]]
            nx = (xx - cx) / rx; ny = (yy - cy) / ry
            z = np.sqrt(np.clip(1 - nx ** 2 - ny ** 2, 0, 1))
            light = np.clip(0.55 + 0.45 * (0.35 * -nx + 0.25 * -ny + 0.8 * z), 0.45, 1.05)
            tile[headpix] = (skin[None, :] * light[headpix][:, None])
            # soften the join at the neck
            band = headpix & (yy > hy - 10)
            blurred = np.stack([ndi.gaussian_filter(tile[..., c], 3) for c in range(3)], -1)
            tile[band] = blurred[band]
    rgba = np.dstack([np.clip(tile, 0, 255).astype(np.uint8), (tm * 255).astype(np.uint8)])
    Image.fromarray(rgba, "RGBA").save(OUT / f"{name}.png")
    print(name, rgba.shape[1], rgba.shape[0])

for name, (file, bg, bh) in JOBS.items():
    if len(sys.argv) > 1 and name not in sys.argv[1:]: continue
    run(name, file, bg, bh)
