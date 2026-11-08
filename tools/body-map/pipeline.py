#!/usr/bin/env python3.13
"""Run the body-map pipeline (see README.md) into a work directory, with knobs.

    pipeline.py --work DIR [--stage all|hd] [--set knob=value ...] [--reset]

Knobs persist in DIR/knobs.json so a later `--stage hd` reruns the finish with what was tuned.
Prints a JSON line at the end: the knobs in force, the output paths and the preview sizes.
"""
import argparse, json, os, pathlib, shutil, subprocess, sys, time

HERE = pathlib.Path(__file__).resolve().parent
KNOBS = {
    # hd.py: the finish
    "denoise": 8.0,        # non-local-means strength (0 = off). Higher flattens grain and detail alike.
    "blur": 1.8,           # gaussian sigma before the sharpen, at 2x
    "sharpen": 0.38,       # unsharp amount; 0 = none
    "sharpen_sigma": 3.0,  # width of the unsharp mask
    "gamma": 0.92,         # <1 darkens midtones a little
    "color": 1.05,         # saturation multiplier
    "striations": 0.0,     # how dark the fibre lines are (0 = none; off since the v4 pass, they read as noise)
    "stripe_period": 13.0, # pixels between fibre lines, at 2x
    "stripe_min_area": 1400, # blobs smaller than this get no lines
    "edge_shade": 0.12,    # darkening at the silhouette edge (a rounded look)
    "edge_shade_px": 22.0, # how far in from the edge that shading reaches, at 2x
    "feather": 0.8,        # alpha blur at the edge (the edge is already anti-aliased from the smoothed contour)
    # hd.py: the smoothing pass (2026-10-24)
    "outline_smooth": 2.5, # gaussian sigma on the silhouette before it is thresholded, at 2x
    "label_smooth": 4.0,   # sigma on each group's soft mask before the argmax; 0 = the old staircase
    "label_min_island": 2500, # a group speck under this many 2x pixels joins its neighbour
    "label_close": 3,      # radius (1x px) each group's mask is closed and hole-filled by first
    "hand_zone": 0.08,     # fraction of the FIGURE's height above each arm's lowest point that is hand: skin, no group
    "foot_zone": 0.075,    # fraction of the figure's height, from the bottom, that is foot (ankle included)
    "flatten": 0.6,        # 0..1, how far each blob is pulled toward its own median colour
    "flatten_blur": 1.5,   # sigma on the flat image, softens the seams between blobs
    "skin_smooth": 0.85,   # 0..1, how far ungrouped body pixels (hands, feet, tendon) go to smooth skin
    "skin_sigma": 7.0,     # how wide that skin blur is, at 2x
    "match_color": 1.0,    # 0..1, how far each tile's muscle saturation/value is matched to the male front
    # hd.py: the v4 pass (2026-10-24, Scott: "smooth everything out all pixels, head to toe")
    "contour_smooth": 9.0, # sigma, in boundary pixels at 2x, of the gaussian run ALONG the silhouette's contour
    "contour_open": 3,     # radius (2x px) of the opening that drops dangling specks before the contour is traced
    "smooth_all": 9,       # bilateral filter diameter over EVERY body pixel (0 = off)
    "smooth_color": 30.0,  # bilateral colour sigma: how different two colours may be and still blend
    "smooth_space": 9.0,   # bilateral space sigma
    "smooth_passes": 2,    # how many times the bilateral runs
    "smooth_gauss": 0.0,   # plain gaussian over the body, at 2x (0 = off; 1.3 read "out of focus")
    "extrem_round": 20.0,  # hands and feet: pixels from the edge over which the flat skin shades up to full tone
    "extrem_blend": 11.0,  # how softly the painted hand/foot meets the arm or shin (a ramp, not a sock line)
    "final_sharpen": 0.6,  # unsharp amount after all smoothing: flat regions, crisp edges (0 = off)
    "final_sharpen_sigma": 2.0, # width of that unsharp mask, at 2x
    "symmetrize": 1,       # 1 = mirror the torso/leg column of the silhouette about the figure's axis, fuller side wins
    "sym_column": 0.24,    # half-width of that column as a fraction of the tile width (the arms lie outside it)
    # realistic.py: the finish for the 3D figures (2026-11-08). Scott: "only realistic ... it just
    # looks flat, missing some edits around the striations, where muscles insert to others".
    # The shading is in the source; these knobs uncover it. See realistic.py's docstring.
    "r_scale": 2,          # the scale the shading, seams and fibre are COMPUTED at
    "r_out_scale": 1,      # the scale the tile is WRITTEN at (the page caches an overlay per muscle)
    "r_sat": 0.80,         # chroma multiplier on muscle colour: the candy that was burying the form
    "r_shade_gain": 1.95,  # gamma about each group's own median value; 1.0 = the source, untouched
    "r_shade_floor": 0.26, # how dark that amplification may drive a pixel (a guard, not a look)
    "r_shade_hold": 90.0,  # the percentile of each group's own value the gain must leave where it was
    "r_value": 1.00,       # re-centres each muscle's midtone so the shading has room below white
    "r_gamma": 1.0,        # whole-tile gamma after everything (<1 lifts, >1 deepens)
    "r_fibre": 1.20,       # the render's OWN high-frequency fibre, amplified (0 = the flat source)
    "r_fibre_sigma": 2.2,  # the scale that high-pass is taken at, at r_scale
    "r_fibre_clip": 26.0,  # cap on one fibre sample, so a speck cannot become a black dot
    "r_seam": 0.38,        # the crease where a muscle meets another muscle, bone or skin
    "r_seam_px": 8.0,      # how far that crease reaches into each belly, at r_scale
    "r_seam_falloff": 0.75,# <1 keeps the crease tight to the boundary, >1 spreads it
    "r_seam_blur": 1.3,    # softens the crease so a seam is a groove, not a drawn line
    "r_belly": 0.13,       # the other half of a seam: each belly rounds up away from its creases
    "r_belly_px": 46.0,    # how far into a belly that rounding reaches, at r_scale
    "r_light": 0.10,       # a soft key from the upper left, so the figure has a direction
    "r_rim": 0.17,         # darkening at the silhouette (roundness)
    "r_rim_px": 26.0,      # how far in that reaches, at r_scale
    "r_sharpen": 0.55,     # unsharp after the shading moves
    "r_sharpen_sigma": 1.6,
    "r_feather": 0.0,      # alpha blur; 0 keeps the render's own edge (the fingers are 2 px wide)
    "r_label_smooth": 1.6, # sigma on each group's soft mask before the 2x argmax
    "r_bare_gain": 1.35,   # the head, hands, feet and exposed bone get the shading move too
    "r_head_tint": 0.92,   # the head alone (not the hands, not the feet): how far it takes the colour below
    "r_head_r": 195.0,     # a deep red. Each pixel takes this chroma and keeps its own shading.
    "r_head_g": 58.0,
    "r_head_b": 54.0,
    "r_head_value": 0.48,  # how far the head's own value is pulled down (chroma alone only ever gives a LIGHT red)
    "r_head_neck": 0.25,   # the head stops where its own shape narrows to this share of the skull's width
    "r_bare_sat": 0.95,
    "r_bare_value": 0.93,
    "r_quality": 86,       # webp quality for the realistic tiles
    # face.py: the graft
    "face_scale": 0.96,    # male head width relative to the female head box
    "face_fade": 14,       # rows the graft fades over at the neck
    # previews
    "preview_height": 520,
}

def run(script, env):
    r = subprocess.run([sys.executable, str(HERE / script)], env=env, capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        raise SystemExit(f"{script} failed ({r.returncode})")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--stage", default="all", choices=["all", "hd", "realistic", "preview"])
    ap.add_argument("--set", action="append", default=[], help="knob=value")
    ap.add_argument("--reset", action="store_true", help="forget tuned knobs first")
    a = ap.parse_args()
    work = pathlib.Path(a.work).resolve(); work.mkdir(parents=True, exist_ok=True)
    kpath = work / "knobs.json"
    knobs = dict(KNOBS)
    if kpath.exists() and not a.reset:
        knobs.update(json.load(open(kpath)))
    for s in a.set:
        k, _, v = s.partition("=")
        if k not in KNOBS: raise SystemExit(f"unknown knob {k!r}; knobs: {', '.join(KNOBS)}")
        knobs[k] = type(KNOBS[k])(float(v)) if isinstance(KNOBS[k], (int, float)) else v
    json.dump(knobs, open(kpath, "w"), indent=1)
    env = dict(os.environ, BODYMAP_SRC=str(HERE / "source"), BODYMAP_WORK=str(work), BODYMAP_HERE=str(HERE))
    t0 = time.time()
    if a.stage == "all":
        run("extract.py", env)
        for name in ("female-front", "female-back", "male-front", "male-back"):
            run_components(name, env)
        run("assign.py", env)
        run("cleanup.py", env)
        run("face.py", env)
    if a.stage in ("all", "hd"):
        run("hd.py", env)
    if a.stage in ("all", "realistic"):
        run("realistic.py", env)
    env = dict(env, BODYMAP_PREVIEW_DIR="img3d" if a.stage == "realistic" else "img")
    run("preview.py", env)
    # the review page beside the rendered site, so the folder publishes as one artifact
    shutil.copy(HERE / "page/index.html", work / "site/index.html")
    shutil.copy(HERE / "exercises.json", work / "site/exercises.json")
    out = {"knobs": knobs, "work": str(work), "site": str(work / "site"),
           "preview": str(work / "preview.webp"), "previewPng": str(work / "preview.png"),
           "previewSmall": str(work / "preview-sm.webp"), "seconds": round(time.time() - t0, 1)}
    for k in ("preview", "previewPng", "previewSmall"):
        p = pathlib.Path(out[k]); out[k + "Bytes"] = p.stat().st_size if p.exists() else 0
    print("RESULT " + json.dumps(out))

def run_components(name, env):
    r = subprocess.run([sys.executable, str(HERE / "components.py"), name], env=env, capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr); raise SystemExit("components.py failed")

if __name__ == "__main__":
    main()
