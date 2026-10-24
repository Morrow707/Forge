#!/usr/bin/env python3.13
"""Previews the studio pane can show. A pane picture is capped near 128 KB of markup, so each
preview is squeezed under a byte budget: preview.webp (<= 92 KB), preview-sm.webp (<= 44 KB, for
side-by-side compare) and preview.png (terminal). Writes preview.json with the sizes.

    preview.py                      the four body-map tiles in <BODYMAP_WORK>/site/img as a sheet
    preview.py --image F --out DIR  any one image, previews into DIR
"""
import argparse, json, os, pathlib
from PIL import Image

def contact(paths, height):
    tiles = [Image.open(p).convert("RGBA") for p in paths]
    tiles = [t.resize((max(1, round(t.width * height / t.height)), height), Image.LANCZOS) for t in tiles]
    gap = 16; w = sum(t.width for t in tiles) + gap * (len(tiles) + 1)
    sheet = Image.new("RGBA", (w, height + gap * 2), (21, 21, 27, 255)); x = gap
    for t in tiles:
        sheet.paste(t, (x, gap), t); x += t.width + gap
    return sheet

def squeeze(img, path, budget, start=82):
    q = start
    while True:
        img.convert("RGB").save(path, "WEBP", quality=q, method=6)
        if path.stat().st_size <= budget or q <= 30: return q
        q -= 8

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--image"); ap.add_argument("--out"); a = ap.parse_args()
    if a.image:
        out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
        img = Image.open(a.image).convert("RGBA")
        bg = Image.new("RGBA", img.size, (21, 21, 27, 255)); bg.paste(img, (0, 0), img); sheet = bg
        h = 520
    else:
        work = pathlib.Path(os.environ["BODYMAP_WORK"]); out = work
        h = int(json.load(open(work / "knobs.json")).get("preview_height", 520))
        sheet = contact([work / f"site/img/{n}.webp" for n in ("female-front", "female-back", "male-front", "male-back")], h)
    big = sheet if sheet.height <= h else sheet.resize((round(sheet.width * h / sheet.height), h), Image.LANCZOS)
    small = big.resize((round(big.width * 300 / big.height), 300), Image.LANCZOS)
    q1 = squeeze(big, out / "preview.webp", 92_000); q2 = squeeze(small, out / "preview-sm.webp", 44_000)
    big.convert("RGB").save(out / "preview.png", optimize=True)
    info = {"preview": {"w": big.width, "h": big.height, "bytes": (out / "preview.webp").stat().st_size, "quality": q1},
            "previewSmall": {"w": small.width, "h": small.height, "bytes": (out / "preview-sm.webp").stat().st_size, "quality": q2},
            "previewPng": {"w": big.width, "h": big.height, "bytes": (out / "preview.png").stat().st_size}}
    json.dump(info, open(out / "preview.json", "w")); print("PREVIEW " + json.dumps(info))

if __name__ == "__main__": main()
