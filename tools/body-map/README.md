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


## The smoothing pass (2026-10-24)

Scott: "everything is just very chunky" -- the female front pale and blocky beside the male,
weird hands and feet on both fronts, a lower-back hover that was a staircase. All of it is in
`hd.py` behind knobs (defaults in `pipeline.py`):

- `label_smooth`, `label_close`, `label_min_island`: each group's label mask is closed and
  hole-filled at 1x, specks folded into their neighbour, then rebuilt at 2x from blurred soft
  masks by argmax. The hover outline follows a curve. `page/index.html` also blurs the overlay
  by 0.9px and draws a 2px outline.
- `hand_zone`, `foot_zone`: the last fraction of the FIGURE's height above each arm's lowest
  point, and from the bottom of the figure, is hand or foot: never a group, always smooth skin.
  The sheets paint tendon bits there in muscle colours and the hue rules read them as forearm
  or calf, which is where the purple hands came from.
- `flatten`, `flatten_blur`: each colour blob is pulled toward its own median and the seams
  blurred, so a muscle reads as one shape.
- `skin_smooth`, `skin_sigma`: every body pixel in no group below the head becomes smooth skin
  in the tile's own skin tone, shaded by the local blur.
- `outline_smooth`: the silhouette is blurred and re-thresholded before feathering.
- `match_color`: each tile's muscle saturation and value are matched to the male front's
  (measured over labelled pixels), which is what brought the female front into the same
  register.
