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

### THE SKIN IS OFF THE FACE: THE FACIAL MUSCLES ARE DRAWN AND SHIPPED (2026-11-08)

Scott, after the plain head: "no you didn't change it the skull is still flat like its someones
face, i don't want to see someones face, i want to see the muscles under the skin, right now take
the skin off to show the face muscles." `r_face_muscles` is on.

**This is a DRAWING and `face_muscles.py` says so at the top.** The render's head is one smooth
mannequin mesh with no cranium and not one facial muscle, so nothing here is uncovered the way the
body's fibre and seams are. Seventeen muscles are placed from published facial anatomy onto
landmarks measured off the render -- frontalis, temporalis, corrugator, orbicularis oculi,
procerus, nasalis, both levators, both zygomatics, masseter, buccinator, risorius, orbicularis
oris, depressor anguli oris, depressor labii, mentalis, and occipitalis on the back -- in a frame
the render defines, so the same fractions land on the man and the woman. It is an illustration
standing in for a layer the source does not have, and it is not evidence about anybody's face.

**IT TOOK FOUR GOES AND EACH FAILED FOR ITS OWN REASON, WHICH IS WHY THEY ARE ALL WRITTEN DOWN.**
- **Filled polygons** read as hard-edged blocks taped to a head. A belly has no straight edges and
  no flat interior; a polygon fill has both.
- **Blurred fields at `sqrt(area) * 0.3`** turned straps into sausages. **The sigma has to come
  from the shape's MINOR AXIS, never its area**: a 200 x 20 zygomaticus got a sigma of 19 on a
  shape 20 px wide, while a sheet of the same area was barely touched. The minor axis is the width
  the blur must respect -- it rounds a sheet and leaves a strap a strap. The level set is 0.5 for
  the same reason: at any other level the blur also grows or shrinks the shape, so the anatomy
  drifts with a knob meant only to soften it.
- **Fibre at 0.13 was invisible**, and fibre is the whole cue -- the lats and the quads read as
  muscle in this render because of it, not because of their colour. At 0.34 and a 4.2 px period,
  fading out at each belly's own edge so a muscle ends in a tendon rather than a row of cut
  stripes, the face reads as muscle for the first time.
- **The temporalis was drawn on the EAR.** It ran u 0.56-0.97 and the ear's front edge is at
  u 0.71 on this render, so it came out as a pair of wings. The temple is in front of that.
- **The eye and mouth apertures were left at the head's colour**, which drew two red eyeballs and
  a red mouth. They are recessed now -- and FRONT ONLY, because the first version punched them
  through the back of the skull as well.
- **Every pixel no belly claims is the tendon sheet**, on both views. Confining it to a polygon
  left the crown and the gaps between bellies at the head's own colour, reading as bare SKIN on a
  face whose skin has been taken off. The galea and the periosteum are what is actually there:
  paler than a belly and pulled toward neutral, because a tendon has almost no blood in it.

**IT IS STILL A DRAWING NEXT TO A RENDER and one export would beat it**: the same four views, same
camera, same pose, with the head's muscle layer turned on, dropped into `source3d/`. Everything
here then works on it unchanged and the head ends up as good as the quads. A public-domain anatomy
plate was the one other path and `upload.wikimedia.org` is outside this environment's network
policy.

**THE EYE AND THE MOUTH ARE MEASURED OFF THE RENDER, not taken from the ring around them.** Scott
on the first shipped version: "looks freaky with the wide eyes and mouth give the eyes and mouth a
more human look, but the rest is good." Both apertures reused their muscle ring's inner radius,
which gave a 32 x 26 px eye and a 30 x 20 px mouth -- near-circular, which is exactly what "wide
eyes" describes. On male-front the real eye spans 45 x 15 px and the mouth about 56 x 8, so in the
head's own frame the eye is u 0.204 x v 0.0286 and the mouth u 0.253 x v 0.015: an almond at 3:1
and a lip line at 7:1. Both are drawn as pointed ovals rather than ellipses, because the canthi
and the corners of a mouth come to a point and an ellipse's do not.

**An eye is not a hole, it holds an eyeball**, so it is sclera, iris, pupil and an upper-lid
shadow -- all taken off the head's own colour pulled toward neutral, so they stay in the figure's
palette. Without the lid shadow the eye reads as a bead sitting on the face instead of something
set into a socket. And both rings had to close around them: the oculi's hole at 0.40 was TALLER
than the almond and left a pale band of tendon sheet above and below each eye, and the oris ring
is very nearly solid at 0.10 now because **the lips are that muscle** -- the mouth is a line drawn
over it, not a hole through it, and at 0.42 the hole showed as a pale lens above the lip line and
read as a second opening.

**THE FACE STAYS UNLABELED** (Scott: "just leave them unlabeled"). Nothing in `face_muscles.py`
writes the label map: these are not a Forge group, they are not tappable, and no strength score or
set count will ever attach to a face.

#### The two attempts that were not shipped, kept for the reasons they failed

Scott: "again the head is too smooth, redraw the man and womans head but make it the face with
only muscles, not smooth." `face_muscles.py` is that attempt. It is knob-gated at
`r_face_muscles`, **it defaults to 0**, and the code stays because the work of placing the
landmarks is done and reusable, not because the output is good.

**What it does.** Fifteen facial muscles -- frontalis, temporalis, orbicularis oculi, procerus,
nasalis, levator labii, both zygomatics, masseter, risorius, orbicularis oris, depressor anguli
oris, depressor labii, mentalis, and occipitalis on the back -- placed in a frame the render
defines (`u` across the head, `v` from crown to jaw), from landmarks read off a coordinate grid
over male-front: midline x 414, box rows 13-275 cols 304-525, eye line y 152 = v 0.531, mouth y
218 = v 0.782, jaw angle (342, 215) = u -0.652 / v 0.771. The female head is the same mesh at a
different width, so the same fractions land on it. The drawing is multiplied by the mannequin's
own luminance so the brow, cheek and jaw still model it.

**Both attempts read worse than the plain head, and the failures are worth keeping.**
- **Filled polygons** read as hard-edged blocks taped to a head. A belly has no straight edges and
  no flat interior, and a fill has both.
- **Blurred fields** (the polygon blurred, a level set taken as the edge, the same field used as
  the belly's dome) fixed the edges and overshot: at a sigma that rounds a strap it also rounds it
  into a sausage, and the face became a pile of jelly beans. Straps and sheets want different
  amounts of rounding and the knob is one number for both.

**The real reason is not craft, it is the source.** The body reads well because it is a real 3D
anatomy render and this pipeline only uncovers what is already in it. A face drawn here is polygon
art sitting next to that, and it will look pasted on however it is tuned. **What closes it is one
export**: the same four views, same camera, same pose, with the head's muscle layer turned on,
dropped into `source3d/`. Everything in this pipeline then works on it unchanged and the head ends
up as good as the quads.

A public-domain anatomy plate (Gray's 1918, Wikimedia) was the one qualitatively different path
and `upload.wikimedia.org` is outside this environment's network policy. Not worth widening it for
on a third speculative attempt; the export is the answer.

### A MUSCLE IS LABELLED ON THE VIEW THAT HOLDS IT (2026-11-09)

Found by loading the page in a real browser for the first time, after twenty-six publishes of it.
The back view was labelling **Chest**, **Biceps** and **Quads**, and the front was labelling
**Lats**, **Traps**, **Triceps**, **Hamstrings** and **Glutes** -- so a coach reading the back of
a body saw "Chest" with a leader line into the shoulder blade.

**The cause is that `count > 400` is an absolute number and the question is a relative one.** A
muscle that wraps round the silhouette leaves slivers on the far side, and a sliver of a big
muscle clears any threshold a small muscle also has to clear: Chest is 506 px on the back against
64,908 on the front, and Quads 4,930 against 89,938. Raising the number would have dropped real
small groups instead -- the test cannot be a count. `labelled()` takes the tile's share of the
group's own best tile and wants 12%: everything dropped is under it, while Neck and Adductors sit
at 25% and are genuinely visible from behind, so they keep both labels. **The same rule decides
which way a tap turns the figure**, so a muscle always opens on the view it is on rather than on a
sliver of itself.

Every one of the eighteen groups still has a label somewhere -- five front-only, seven back-only,
six on both -- which is the property to check after any change to that threshold.

**The lesson is the cheap one: load the page.** Both bugs were plainly visible the first time it
was rendered in a browser, and neither is visible in the tile images the pipeline prints.
`playwright` and Chromium are preinstalled in this sandbox; `python3.13 -m http.server` over the
`site/` folder plus a screenshot at 1280 and at 390 is a minute's work and should run before any
publish that changes the page.

### ONE BONE TONE AND ONE TENDON TONE, ACROSS THE HANDS, THE FEET AND THE SKULL (2026-11-09)

Scott: "Do 1 and 3 as they are related" -- the bare-skeleton hands and feet, and the head.

**THE HANDS AND FEET ARE NOT A GAP IN THE RENDER, WHICH IS THE FINDING.** It is tempting to read
four white claws on an all-muscle figure as something missing, and the first plan was to draw the
intrinsic muscles onto them the way the face was drawn. Reading the source settles it the other
way: the dorsum of a hand and the dorsum of a foot really are extensor tendon over bone with
almost no muscle on them, and that is exactly what the render draws -- strands running to each
digit over white bone. **It is anatomically right and it was only ever wrong in colour**: the
render draws them at a chroma of 9-22 where every muscle sits past 100, so they read as a grey
stock asset rather than as this body's own hands.

So they are recoloured, never repainted. `recolour_extremities` takes every ungrouped component
that is not the head -- both hands, both feet with the shin's subcutaneous tibia, the clavicles --
and tells bone from tendon by the part's OWN luminance rather than a fixed level, because the
bones are the bright things in a hand and the tendons the strands between them, and both sit
differently on a foot in shadow than on a hand in the light. Each pixel keeps its own value about
the part's median, so every bit of the render's modelling survives.

**AND THE TWO TONES ARE SHARED WITH THE SKULL, which is why these were done together.** The
cranium's sheet, the hand's bone and the foot's tendons are the same two materials, and a figure
carrying two different ivories and two different tendon greys reads as parts from two places.
`extremity_tones` derives both from the figure's own colour -- bone 80% of the way to white,
tendon 55% of the way to neutral because a tendon has almost no blood in it -- so moving the
head's colour moves all of them together and they cannot drift apart.

**What is NOT done, and is still Scott's:** the head is a drawing where the body is a render. One
export of the same four views, same camera, same pose, with the head's muscle layer turned on,
into `source3d/`, replaces `face_muscles.py` entirely and costs nothing else -- every other stage
works on it unchanged.
