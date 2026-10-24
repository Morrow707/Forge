# The body map pipeline

Four Cloudinary anatomy renders (Scott's, 2026-10-18) become the figures the app's body map
draws: a transparent tile per figure, a label map saying which Forge muscle group each pixel
belongs to, and a manifest with label anchors and the silhouette's edges.

    python3.13 tools/body-map/pipeline.py --work <dir> [--stage all|hd] [--set knob=value ...]

Stages, in order, each a script here that reads `BODYMAP_SRC` / `BODYMAP_WORK` from the
environment the orchestrator sets:

1. `extract.py`   cut each figure out of its sheet, drop labels, leader lines and the pedestal
2. `components.py` number every coloured muscle blob (per figure)
3. `assign.py`    map each blob to a Forge muscle group by hue, saturation and place on the body
4. `cleanup.py`   drop the stray leader dot on the male front hand
5. `face.py`      graft the male muscle head onto the female front (every figure shows muscles)
6. `hd.py`        2x upscale, denoise, sharpen, striations, edge shade, label maps, manifest,
                  and the previews the studio pane shows

`--stage hd` reruns step 6 alone, which is what `/tune` does: the knobs it takes are the ones
`hd.py` reads from `<work>/knobs.json`, listed with their defaults in `KNOBS` in `pipeline.py`.
Every knob is a NUMBER somebody can turn; the rules (what is a muscle, which group a blob is)
stay in the scripts.

`page/index.html` is the review page the artifact is published from; `pipeline.py` copies it
beside the rendered `site/` so the whole folder is one publish.

Python 3.13 with numpy, Pillow, scipy and opencv-python-headless (the sandbox's `python3.13`).
