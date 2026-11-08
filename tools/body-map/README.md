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

## The v4 pass (2026-10-24): every pixel, head to toe

Scott, on the smoothing pass: "No they are not. Also hands and feet are still clunky. Smooth
everything out all pixels, head to toe make body bodies smoother on edges." Four changes in `hd.py`,
each a knob in `pipeline.py`:

- **The silhouette is a smoothed contour, not a blurred bitmap.** `smooth_silhouette` traces each
  outer contour, runs a gaussian (`contour_smooth`, sigma in boundary pixels at 2x) ALONG it, refills
  at 4x and averages down. A bump shorter than ~sigma is gone outright; a blur on the mask only ever
  rounded it. The alpha channel is that fill, so the edge carries its own anti-aliasing (`feather` is
  a touch on top). `contour_open` drops dangling specks before tracing.
- **Every body pixel is smoothed.** Two passes of a bilateral filter (`smooth_all` diameter,
  `smooth_color`, `smooth_space`, `smooth_passes`) keep each muscle a flat region while the grain and
  the sheet's brush marks go, then a normalised gaussian inside the body (`smooth_gauss`).
- **Hands and feet are painted, never blended.** The tile's skin tone -- the median of the ungrouped
  pixels that LOOK like skin (warm hue, low saturation, not dark; the plain median picked up the
  lavender gaps and painted the male back's hands purple-grey), pulled halfway to one warm beige so
  the four tiles agree -- shaded up from the edge by the distance transform (`extrem_round`) and met
  by the limb over a ramp (`extrem_blend`), over muscle too, so the wrist is a fade and not a sock line.
- **Striations default to 0.** At a glance they read as noise. The knob stays.

`edge_shade` reaches `edge_shade_px` in from the edge now (a rounded look) instead of a fixed 8 px.
The label maps are unchanged from the smoothing pass, confined to the new silhouette.

### v4c, the same day: crisp again, and the hips line up

Scott on v4: "much better, but now everything looks blurry ... almost like its out of focus, also
female back doesn't line up, left hip indents where right hip does not." Two changes:

- **The blur was the plain gaussian, not the bilateral.** `smooth_gauss` defaults to 0 now,
  `flatten_blur` 3 -> 1.5, `feather` 1.2 -> 0.8, and a `final_sharpen` unsharp mask (0.6 at sigma 2)
  runs after the edge shade. The bilateral keeps every region flat; the sharpen gives the edges
  between them back.
- **The hip is in the source render**: the figure is centred but one glute flares where the other
  notches, and the gap between the legs sits ~20 px off the axis. `symmetrize_body` mirrors the
  torso-and-legs column (`sym_column`, half-width 0.24 of the tile) about the figure's own axis and
  takes the fuller outline on both sides. The arms are outside the column and untouched: a pose is
  never perfectly mirrored, and a union there would ghost a limb.


## REALISTIC ONLY, AND THE REALISTIC FIGURES HAD NEVER HAD A FINISH PASS (2026-11-08)

Scott: "ditch the diagram portion, only realistic, what can we do to upgrade realistic, to me it
just looks flat, missing some edits around the striations, where muscles insert to others, just
looks flat."

**The reason they looked flat beside the diagram is that the diagram had had four passes of work
and the realistic figures had had none.** `hd.py` is the diagram's finish; the realistic tiles
were the Z-Anatomy render cut out of its background and published as-is. `realistic.py` is their
first finish pass, and the knobs are `r_*` so the two sets can never be confused.

**THE SHADING WAS ALREADY IN THE RENDER AND THE PAINT WAS BURYING IT.** Measured on the source
before anything was written: inside one muscle the render's own value spans about a hundred
levels (Chest 138-242, Quads 111-243), so the geometry is modelled -- while saturation sits at
110-186 of 255 and the mean value at 170-215, poster paint pushed against white, where a hundred
levels of form read as "the same colour, slightly darker". So the pass uncovers light rather than
adding it: `r_sat` drops the candy, `r_shade_gain` amplifies each group's own shading about its
own median, `r_seam` cuts the crease where one muscle meets another (the insertions), `r_belly`
rounds each belly up away from its creases, and `r_fibre` amplifies the render's OWN
high-frequency texture -- real striations, which is why `hd.py`'s drawn cosine stripes stay off:
a flat vector fill has no fibre to recover and a drawn stripe over a real one is the "reads as
noise" that turned the diagram's striations off in the v4 pass.

**THE FIRST VERSION WASHED THE POSTERIOR CHAIN OUT, AND THE FIX IS THE INTERESTING PART.** A bare
gamma about the median brightens everything above it, so a group whose source already carries a
wide range (glutes and hamstrings, V_std 67-80 against the chest's 35) pushed its bright side
into clipping and came back paler rather than rounder -- the hamstrings went cream, the calves
sage. `r_shade_hold` (90th percentile) renormalises the gain so it leaves each group's own
highlight where the source had it: the gain can then only ever spend itself DOWNWARD, the shadow
side deepens, and that is what reads as form. Same knobs, opposite result.

**THE SILHOUETTE IS NOT SMOOTHED, and this is the one place the diagram's recipe must not be
copied.** `contour_smooth` is 9 boundary pixels; these figures have skeletal fingers and toes
narrower than that, so tracing and smoothing their contour would melt the hands off. The alpha is
the source's own.

**IT SUPERSAMPLES AT 2x AND WRITES AT 1x** (`r_scale` 2, `r_out_scale` 1), because `index.html`
caches a full-size ImageData overlay per muscle per tile: a 2x tile costs four times the memory
for twelve groups across four figures, which is a phone's worth of it. The source is 829x2065, so
a 2x tile carries no detail the source does not have; what 2x buys is sub-pixel room for the seam
distances, the fibre high-pass and the sharpen, and `INTER_AREA` on the way down is what makes
that survive as tone instead of aliasing into speckle. The published tiles are the same
dimensions and the same byte size as before, so nothing about the page's memory or bandwidth
moved -- the whole gain is in the pixels.

`page/index.html` draws the realistic figures and nothing else: the Diagram/Realistic switch,
`setLook`, the `real:` tile-key prefix and the `hasReal` fallback are gone, and the page fetches
`manifest3d.json` alone. **The repo's copy of that page was STALE** -- the published artifact
carried the Realistic toggle and three tap fixes that were never written back -- so it was
re-based on the published one before the diagram was stripped out of it.

`source3d/` is checked in for the same reason `tools/body-map/` exists at all: the realistic
tiles existed only inside the published artifact, nowhere in the repo and nowhere on disk, so one
container recycle would have ended the ability to re-render them. It is their own source now --
these are the raw render, not a finished tile, which is exactly why a finish pass can be run over
them.

`/tune` drives the realistic stage now (`pipeline.py --stage realistic`), and `/tune list` prints
the `r_*` knobs. The diagram knobs and `hd.py` stay; nothing on the page reads them.

### The head is a light red (2026-11-08)

Scott: "that looks way better, but lets change the head make it like a light red." `r_head_tint`
plus `r_head_r/g/b`, and every pixel keeps its OWN luminance and takes only the target's chroma --
the mannequin head is modelled and that shading is the only thing making it a head rather than a
shape, so this is a recolour and never a fill over the face.

**THE HEAD HAD TO BE FOUND, NOT FENCED OFF.** The render leaves the head, the hands, the feet and
every bit of exposed bone all on label 0, so a tint on label 0 paints the skeleton's fingers too.
`head_mask` takes the ungrouped component that reaches the top row of the silhouette -- and the
first render of it tinted the BREASTBONE pink, because on a front view the sternum and the linea
alba are ungrouped bone CONNECTED to the skull: the component ran from row 13 to row 1100 of a
2065-row tile. It is cut at the neck now, the first row past the skull's widest where the
component narrows below `r_head_neck` of that width (223 px at the ears, 91 at the jaw, 21 at the
neck, then 7-31 all the way down the sternum). On a back view the traps reach the skull, so the
component ends at the jaw by itself and the cut changes nothing there. A fraction-of-the-figure
zone was the obvious alternative and is the wrong shape: it moves the moment a figure is rendered
at another crop.

Scott on the first one: "no darker red." **`r_head_value` is a SEPARATE knob from the target
colour, and that is the whole reason a darker red was reachable at all:** the recolour preserves
each pixel's luminance, the mannequin head is pale, so chroma alone can only ever give a LIGHT
red however deep the target is -- the first attempt at a deeper target still came back at a mean
R of 223, a traffic cone. Darkening is a move on the head's own VALUE, and it stays a multiplier
per pixel rather than a flat level so the brow, the nose and the jaw keep their relative shading
instead of collapsing into one slab. 195/58/54 at value 0.48 reads 190/68/64 on the fronts and
204/73/68 on the backs (the backs are a touch brighter because the skull catches the key light).

### The head follows the hip flexors, and the face comes off as far as the source allows (2026-11-08)

Scott: "no make it the same color as the hip flexors, and don't make it a face give it more
skeletal features, the muscles in the face, just leave them unlabeled."

**The colour is a NAME in the script, not an RGB triple in the knobs.** `HEAD_TAKES_COLOUR_FROM`
is `"Hip Flexors"`, read off the FINISHED tile, so the head keeps following that group when any
tone knob moves; `r_head_match` turns it on. It matches the LEVEL as well as the hue, because the
recolour preserves luminance and the mannequin head is pale -- a chroma match alone leaves a light
version of their colour. Measured after: head 172/67/64 against hip flexors 172/68/64 on the
female front, 165/65/61 against 165/66/61 on the male. The back views have no hip flexors in them,
so each front tile leaves its answer in `head_colour_cache` for the back of the same figure.

**THE SKULL AND THE FACIAL MUSCLES ARE NOT IN THE RENDER AND CANNOT BE PUT THERE FROM HERE.** The
head in `source3d` is a single smooth mannequin mesh: eyes, nose, lips, ears, and nothing else --
no cranium, no mandible, no temporalis, no masseter, not one facial muscle. Painting those on
would be inventing anatomy on a page a coach reads, which is Rule #3's class. **What closes it is
a new render**: the same four views, same camera, same pose, with the head's muscle layer turned
on, dropped into `source3d/` with its label map. Everything else in this pipeline then works on it
unchanged.

**What a face removal CAN do here, and the bug that made it look impossible.** Three techniques
were tried and all three read as failures:
- a blur keeps the features at a sigma small enough to keep the brow and cheek modelled, erases
  the head entirely at a sigma large enough to take them out, and at sigma 17 leaves them as
  GHOSTS, which is the worst of the three;
- finding and filling dark features took the mouth out and left the eyes, because an eye is an
  almond whose rim and interior deviate in OPPOSITE directions -- the deviation test is absolute
  now, and a fix that works on one feature and not its neighbour is the tell;
- `r_head_dome` paints the cranium as a shaded solid off its own distance transform, the way
  `hd.py` paints hands and feet, and that read as a blob with the jaw gone. It stays as a knob and
  defaults to 0.

**All three were being undone by the fibre pass.** `fibre` is a high-pass of the ORIGINAL
luminance, taken at step 1 and multiplied in at step 5, AFTER the head work -- so it was
re-printing the eyes and the mouth onto every head that had just had them removed. The removal had
worked every time. `fibre[hm] = 0` is the fix, and it is right on its own terms: the head carries
no muscle fibre to recover. **A pass that re-applies an earlier state after a later edit makes the
later edit look broken**, and nothing announces it -- the edit's own output is correct when it is
written.

With that fixed the eye sockets read as soft hollows, the mouth as a faint lip line, the nose
remains, and the brow, cheek and jaw keep their form. It is a blank-eyed head rather than a doll's
face, and it is not a skull.
