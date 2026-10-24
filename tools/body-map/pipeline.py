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
    "striations": 0.17,    # how dark the fibre lines are (0 = none)
    "stripe_period": 13.0, # pixels between fibre lines, at 2x
    "stripe_min_area": 1400, # blobs smaller than this get no lines
    "edge_shade": 0.07,    # darkening at the silhouette edge
    "feather": 1.6,        # alpha blur at the edge
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
    ap.add_argument("--stage", default="all", choices=["all", "hd", "preview"])
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
