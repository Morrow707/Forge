import { useId } from "react";
import { cn } from "@/lib/utils";
import { SCORABLE_MUSCLE_GROUPS } from "@shared/strength-score";

/**
 * ONE ANATOMICAL FIGURE, THREE JOBS.
 *
 * It is a filter in the exercise picker (tap a muscle, see the exercises that train it), a
 * readout on the profile (tinted by how each group scores), and the same drawing either way.
 * Built once as a shared component rather than twice, because two figures would drift and the
 * one that drifted would be the one showing somebody their own body.
 *
 * REGIONS ARE KEYED TO MUSCLE_GROUPS, not to invented ids. The exercise library already tags
 * every exercise with a muscleGroup, so a region whose key is not a real group is a region
 * nothing can ever fill -- body-map-regions.test.ts refuses one.
 *
 * DRAWN, NOT DIAGRAMMED -- and this reverses the call the first version made.
 *
 * That version said so in its own comment: "deliberately schematic rather than an anatomy
 * illustration ... detail they cannot name is detail in the way." The reasoning was about a
 * beginner, and it was not wrong about beginners. It was wrong about what a schematic actually
 * communicates. Rectangles with rounded corners do not read as a body at all, so the figure
 * stopped being a picture of anything and became a legend you have to decode -- which helps
 * nobody, least of all the reader it was simplified for. Scott, 2026-09-23, against a
 * competitor's: "ours is just blocky, not smooth, just not appealing to the eyes."
 *
 * So: contoured muscle bellies with real insertions, on a silhouette with real proportions.
 * Detail is what makes a shape recognisable; a lat that is lat-shaped teaches the word to
 * somebody who did not know it, where an orange rectangle labelled "Lats" does not.
 *
 * TWO THINGS SURVIVE FROM THE OLD VERSION AND MUST KEEP SURVIVING.
 *
 * 1. THE FIGURE HAS NO FACE. Forge has thirteen-year-olds on it. This is a diagram of muscles,
 *    not a picture of a person, and a body shown to a minor should be the former. The head is
 *    a blank contour on purpose -- never add eyes, hair or expression.
 * 2. NOTHING IS GENDERED. One neutral athletic build, the same for everybody. A figure that
 *    shifted shape with `users.gender` would make a category out of a field that exists for a
 *    percentile, and would put a body type in front of a child as though it were theirs.
 *
 * A note on how the paths are kept honest: every muscle is a CLOSED OUTLINE positioned inside
 * the silhouette, rather than the old "stroke along a shared limb line" trick. That trick
 * existed to stop limb muscles drifting off their limbs, which it did -- at the cost of every
 * limb muscle being a capsule. The outlines here are drawn against the same silhouette
 * coordinates listed in SILHOUETTE below, and body-map-regions.test.ts checks each region's
 * bounding box sits inside the figure, which is the same guarantee by measurement rather than
 * by construction.
 */

export type BodyMapView = "front" | "back";

/** A muscle region: which view it is drawn on, and the closed outline that makes it. */
type Region = {
  group: string;
  view: BodyMapView;
  label: string;
  /** SVG path data, drawn in a 240x470 viewBox. Always a closed, filled outline. */
  d: string;
};

/** THE BODY THE MUSCLES SIT ON.
 *
 * One silhouette per view, as a single filled outline: head, neck, shoulders, torso tapering to
 * the waist, hips, legs to the feet, arms hanging slightly clear of the body so the upper arm
 * and the lat do not overlap into mush. Front and back differ only where the outline honestly
 * differs (the back's shoulders sit wider, the calves fuller), so the two read as one person
 * turned around rather than two drawings.
 */
const SILHOUETTE: Record<BodyMapView, string> = {
  front:
    "M120 18 c-11 0 -19 9 -19 21 c0 9 3 16 8 20 l0 9 c-13 3 -26 8 -34 15 " +
    "c-7 6 -11 16 -13 28 l-5 33 c-2 12 -5 25 -9 36 l-8 22 c-2 6 2 11 8 11 " +
    "c5 0 8 -3 10 -8 l9 -23 l4 30 c1 10 2 19 2 27 l0 16 c0 11 2 21 5 30 " +
    "l6 19 c2 7 3 14 3 21 l1 35 c0 12 -1 24 -3 35 l-4 25 c-1 6 3 10 9 10 " +
    "c5 0 8 -3 9 -8 l7 -33 l5 -26 l4 26 l7 33 c1 5 4 8 9 8 c6 0 10 -4 9 -10 " +
    "l-4 -25 c-2 -11 -3 -23 -3 -35 l1 -35 c0 -7 1 -14 3 -21 l6 -19 " +
    "c3 -9 5 -19 5 -30 l0 -16 c0 -8 1 -17 2 -27 l4 -30 l9 23 c2 5 5 8 10 8 " +
    "c6 0 10 -5 8 -11 l-8 -22 c-4 -11 -7 -24 -9 -36 l-5 -33 c-2 -12 -6 -22 -13 -28 " +
    "c-8 -7 -21 -12 -34 -15 l0 -9 c5 -4 8 -11 8 -20 c0 -12 -8 -21 -19 -21 Z",
  back:
    "M120 18 c-11 0 -19 9 -19 21 c0 9 3 16 8 20 l0 9 c-14 3 -27 8 -35 16 " +
    "c-7 6 -11 16 -13 28 l-5 33 c-2 12 -5 25 -9 36 l-8 22 c-2 6 2 11 8 11 " +
    "c5 0 8 -3 10 -8 l9 -23 l4 30 c1 10 2 19 2 27 l0 16 c0 11 2 21 5 30 " +
    "l6 19 c2 7 3 14 3 21 l1 35 c0 12 -1 24 -3 35 l-4 25 c-1 6 3 10 9 10 " +
    "c5 0 8 -3 9 -8 l7 -33 l5 -26 l4 26 l7 33 c1 5 4 8 9 8 c6 0 10 -4 9 -10 " +
    "l-4 -25 c-2 -11 -3 -23 -3 -35 l1 -35 c0 -7 1 -14 3 -21 l6 -19 " +
    "c3 -9 5 -19 5 -30 l0 -16 c0 -8 1 -17 2 -27 l4 -30 l9 23 c2 5 5 8 10 8 " +
    "c6 0 10 -5 8 -11 l-8 -22 c-4 -11 -7 -24 -9 -36 l-5 -33 c-2 -12 -6 -22 -13 -28 " +
    "c-8 -8 -21 -13 -35 -16 l0 -9 c5 -4 8 -11 8 -20 c0 -12 -8 -21 -19 -21 Z",
};

/** Contour lines that belong to the BODY, not to any muscle -- the sternum, the knees, the
 *  achilles. Drawn faintly over the silhouette and under the muscles, never interactive. They
 *  are what stops the figure reading as a flat cut-out. */
const CONTOURS: Record<BodyMapView, string> = {
  front:
    "M120 96 L120 152 M104 300 q16 6 32 0 M104 356 q16 5 32 0 " +
    "M74 190 q6 3 12 0 M154 190 q6 3 12 0",
  back:
    "M120 92 L120 240 M104 300 q16 6 32 0 M104 356 q16 5 32 0 " +
    "M112 424 L114 444 M128 424 L126 444",
};

const REGIONS: Region[] = [
  // ---------------- FRONT ----------------
  // Deltoid: the cap over the shoulder joint, thick at the top and tapering to its insertion a
  // third of the way down the arm. That taper is the whole shape of a shoulder.
  {
    group: "Shoulders",
    view: "front",
    label: "Shoulders",
    d:
      "M97 92 c-9 1 -16 6 -20 14 c-4 8 -5 18 -4 27 c1 5 6 7 10 4 c7 -5 12 -13 15 -23 " +
      "c2 -8 3 -16 3 -22 Z " +
      "M143 92 c9 1 16 6 20 14 c4 8 5 18 4 27 c-1 5 -6 7 -10 4 c-7 -5 -12 -13 -15 -23 " +
      "c-2 -8 -3 -16 -3 -22 Z",
  },
  // Pectoral: broad at the sternum, sweeping up and out to the shoulder, with the lower border
  // curving rather than cut square.
  {
    group: "Chest",
    view: "front",
    label: "Chest",
    d:
      "M118 98 c-13 1 -24 4 -31 9 c-6 4 -9 11 -9 19 c0 9 3 17 9 22 c8 6 19 8 27 5 " +
      "c4 -2 5 -6 5 -12 l0 -40 c0 -2 -1 -3 -1 -3 Z " +
      "M122 98 c13 1 24 4 31 9 c6 4 9 11 9 19 c0 9 -3 17 -9 22 c-8 6 -19 8 -27 5 " +
      "c-4 -2 -5 -6 -5 -12 l0 -40 c0 -2 1 -3 1 -3 Z",
  },
  // Biceps: the belly bulges in the middle of the upper arm and narrows to the elbow.
  {
    group: "Biceps",
    view: "front",
    label: "Biceps",
    d:
      "M92 126 c-6 2 -10 8 -12 17 c-2 10 -2 21 0 30 c1 6 5 9 9 7 c5 -2 8 -9 10 -19 " +
      "c2 -12 1 -25 -2 -33 c-1 -2 -3 -3 -5 -2 Z " +
      "M148 126 c6 2 10 8 12 17 c2 10 2 21 0 30 c-1 6 -5 9 -9 7 c-5 -2 -8 -9 -10 -19 " +
      "c-2 -12 -1 -25 2 -33 c1 -2 3 -3 5 -2 Z",
  },
  // Forearm: thick just below the elbow, tapering hard to the wrist.
  {
    group: "Forearms",
    view: "front",
    label: "Forearms",
    d:
      "M87 186 c-5 3 -8 10 -10 21 c-2 13 -3 27 -2 38 c0 5 3 8 6 7 c4 -1 6 -6 8 -16 " +
      "c3 -16 3 -36 1 -47 c-1 -3 -2 -4 -3 -3 Z " +
      "M153 186 c5 3 8 10 10 21 c2 13 3 27 2 38 c0 5 -3 8 -6 7 c-4 -1 -6 -6 -8 -16 " +
      "c-3 -16 -3 -36 -1 -47 c1 -3 2 -4 3 -3 Z",
  },
  // Rectus abdominis: three visible bands a side, narrowing toward the navel, then the lower
  // band. Segmented because an undivided slab does not read as abs at any size.
  {
    group: "Abs",
    view: "front",
    label: "Abs",
    d:
      "M106 158 c-2 6 -2 13 0 19 c4 2 9 2 12 0 c1 -6 1 -13 0 -19 c-3 -2 -9 -2 -12 0 Z " +
      "M122 158 c-1 6 -1 13 0 19 c3 2 8 2 12 0 c2 -6 2 -13 0 -19 c-3 -2 -9 -2 -12 0 Z " +
      "M107 182 c-2 6 -2 13 0 19 c4 2 8 2 11 0 c1 -6 1 -13 0 -19 c-3 -2 -7 -2 -11 0 Z " +
      "M122 182 c-1 6 -1 13 0 19 c3 2 7 2 11 0 c2 -6 2 -13 0 -19 c-3 -2 -8 -2 -11 0 Z " +
      "M108 207 c-2 7 -2 15 0 22 c4 2 7 2 10 0 c1 -7 1 -15 0 -22 c-3 -2 -7 -2 -10 0 Z " +
      "M122 207 c-1 7 -1 15 0 22 c3 2 6 2 10 0 c2 -7 2 -15 0 -22 c-3 -2 -7 -2 -10 0 Z",
  },
  // Obliques: the flank, running from the ribs down to the hip and tucking in at the waist.
  {
    group: "Core",
    view: "front",
    label: "Obliques",
    d:
      "M103 158 c-5 3 -8 11 -9 22 c-1 14 0 29 3 40 c2 6 5 7 7 3 c3 -6 4 -17 4 -31 " +
      "c0 -14 -1 -27 -3 -33 c0 -1 -1 -2 -2 -1 Z " +
      "M137 158 c5 3 8 11 9 22 c1 14 0 29 -3 40 c-2 6 -5 7 -7 3 c-3 -6 -4 -17 -4 -31 " +
      "c0 -14 1 -27 3 -33 c0 -1 1 -2 2 -1 Z",
  },
  // Quadriceps: the outer sweep and the teardrop above the knee are what make a thigh a thigh.
  {
    group: "Quads",
    view: "front",
    label: "Quads",
    d:
      "M112 252 c-7 3 -12 13 -15 29 c-3 18 -3 38 -1 53 c1 8 4 13 8 13 c5 0 8 -6 10 -18 " +
      "c3 -19 3 -47 1 -64 c-1 -9 -2 -13 -3 -13 Z " +
      "M128 252 c7 3 12 13 15 29 c3 18 3 38 1 53 c-1 8 -4 13 -8 13 c-5 0 -8 -6 -10 -18 " +
      "c-3 -19 -3 -47 -1 -64 c1 -9 2 -13 3 -13 Z",
  },
  {
    group: "Calves",
    view: "front",
    label: "Calves",
    d:
      "M106 364 c-4 4 -6 13 -7 26 c-1 13 0 25 2 32 c1 5 4 6 6 3 c3 -5 5 -16 5 -30 " +
      "c0 -14 -2 -27 -4 -31 c-1 -1 -1 -1 -2 0 Z " +
      "M134 364 c4 4 6 13 7 26 c1 13 0 25 -2 32 c-1 5 -4 6 -6 3 c-3 -5 -5 -16 -5 -30 " +
      "c0 -14 2 -27 4 -31 c1 -1 1 -1 2 0 Z",
  },

  // ---------------- BACK ----------------
  {
    group: "Shoulders",
    view: "back",
    label: "Rear delts",
    d:
      "M97 92 c-9 1 -16 6 -20 14 c-4 8 -5 18 -4 27 c1 5 6 7 10 4 c7 -5 12 -13 15 -23 " +
      "c2 -8 3 -16 3 -22 Z " +
      "M143 92 c9 1 16 6 20 14 c4 8 5 18 4 27 c-1 5 -6 7 -10 4 c-7 -5 -12 -13 -15 -23 " +
      "c-2 -8 -3 -16 -3 -22 Z",
  },
  // Trapezius: the diamond. Up to the base of the skull, out to each shoulder, down to a point
  // in the middle of the back -- the shape the word actually means.
  {
    group: "Back",
    view: "back",
    label: "Upper back & traps",
    d:
      "M120 78 c-12 1 -23 5 -31 11 c-6 4 -9 10 -9 16 c0 5 3 8 8 8 c9 0 17 2 23 7 " +
      "c4 3 6 9 7 17 l2 26 c0 4 4 4 5 0 l2 -26 c1 -8 3 -14 7 -17 c6 -5 14 -7 23 -7 " +
      "c5 0 8 -3 8 -8 c0 -6 -3 -12 -9 -16 c-8 -6 -19 -10 -31 -11 Z",
  },
  // Latissimus: wide under the armpit, sweeping down and IN to a narrow insertion at the lower
  // back. The V.
  {
    group: "Lats",
    view: "back",
    label: "Lats",
    d:
      "M97 118 c-6 6 -9 17 -10 32 c-1 17 1 33 5 43 c3 7 7 9 11 6 c4 -3 6 -11 7 -23 " +
      "l2 -30 c0 -11 -3 -20 -8 -25 c-3 -3 -5 -4 -7 -3 Z " +
      "M143 118 c6 6 9 17 10 32 c1 17 -1 33 -5 43 c-3 7 -7 9 -11 6 c-4 -3 -6 -11 -7 -23 " +
      "l-2 -30 c0 -11 3 -20 8 -25 c3 -3 5 -4 7 -3 Z",
  },
  {
    group: "Triceps",
    view: "back",
    label: "Triceps",
    d:
      "M92 124 c-6 3 -10 10 -12 21 c-2 12 -2 24 0 33 c1 6 5 8 9 5 c5 -3 8 -11 10 -22 " +
      "c2 -13 1 -27 -2 -35 c-1 -3 -3 -3 -5 -2 Z " +
      "M148 124 c6 3 10 10 12 21 c2 12 2 24 0 33 c-1 6 -5 8 -9 5 c-5 -3 -8 -11 -10 -22 " +
      "c-2 -13 -1 -27 2 -35 c1 -3 3 -3 5 -2 Z",
  },
  {
    group: "Forearms",
    view: "back",
    label: "Forearms",
    d:
      "M87 186 c-5 3 -8 10 -10 21 c-2 13 -3 27 -2 38 c0 5 3 8 6 7 c4 -1 6 -6 8 -16 " +
      "c3 -16 3 -36 1 -47 c-1 -3 -2 -4 -3 -3 Z " +
      "M153 186 c5 3 8 10 10 21 c2 13 3 27 2 38 c0 5 -3 8 -6 7 c-4 -1 -6 -6 -8 -16 " +
      "c-3 -16 -3 -36 -1 -47 c1 -3 2 -4 3 -3 Z",
  },
  // Erectors: the two columns either side of the spine, above the pelvis.
  {
    group: "Lower Back",
    view: "back",
    label: "Lower back",
    d:
      "M112 196 c-4 2 -6 8 -7 18 c-1 11 0 21 2 27 c1 4 4 4 5 1 c2 -6 3 -16 3 -27 " +
      "c0 -11 -1 -18 -3 -19 Z " +
      "M128 196 c4 2 6 8 7 18 c1 11 0 21 -2 27 c-1 4 -4 4 -5 1 c-2 -6 -3 -16 -3 -27 " +
      "c0 -11 1 -18 3 -19 Z",
  },
  {
    group: "Glutes",
    view: "back",
    label: "Glutes",
    d:
      "M118 244 c-11 0 -19 4 -24 12 c-4 7 -5 16 -2 23 c3 8 10 12 18 10 c7 -2 11 -8 12 -18 " +
      "c1 -9 0 -19 -2 -26 c-1 -1 -1 -1 -2 -1 Z " +
      "M122 244 c11 0 19 4 24 12 c4 7 5 16 2 23 c-3 8 -10 12 -18 10 c-7 -2 -11 -8 -12 -18 " +
      "c-1 -9 0 -19 2 -26 c1 -1 1 -1 2 -1 Z",
  },
  // Hamstrings: two bellies a side is the honest shape, but at this size they read as one
  // column split by a seam -- drawn as the outer and inner heads meeting near the knee.
  {
    group: "Hamstrings",
    view: "back",
    label: "Hamstrings",
    d:
      "M112 286 c-6 3 -10 12 -12 26 c-2 16 -2 32 0 42 c1 7 4 10 7 9 c4 -1 7 -8 8 -19 " +
      "c2 -17 2 -42 0 -55 c-1 -3 -2 -4 -3 -3 Z " +
      "M128 286 c6 3 10 12 12 26 c2 16 2 32 0 42 c-1 7 -4 10 -7 9 c-4 -1 -7 -8 -8 -19 " +
      "c-2 -17 -2 -42 0 -55 c1 -3 2 -4 3 -3 Z",
  },
  // Gastrocnemius: two heads, the inner one hanging lower than the outer. That asymmetry is the
  // single detail that makes a calf read as a calf.
  {
    group: "Calves",
    view: "back",
    label: "Calves",
    d:
      "M105 364 c-4 4 -6 14 -7 28 c-1 14 0 26 3 33 c1 4 4 4 6 1 c3 -6 4 -18 4 -33 " +
      "c0 -15 -2 -28 -4 -30 c-1 -1 -1 -1 -2 1 Z " +
      "M114 366 c-2 4 -3 13 -3 24 c0 11 1 20 3 25 c1 3 3 3 4 0 c2 -5 3 -14 3 -25 " +
      "c0 -11 -1 -20 -3 -24 c-1 -2 -3 -2 -4 0 Z " +
      "M135 364 c4 4 6 14 7 28 c1 14 0 26 -3 33 c-1 4 -4 4 -6 1 c-3 -6 -4 -18 -4 -33 " +
      "c0 -15 2 -28 4 -30 c1 -1 1 -1 2 1 Z " +
      "M126 366 c2 4 3 13 3 24 c0 11 -1 20 -3 25 c-1 3 -3 3 -4 0 c-2 -5 -3 -14 -3 -25 " +
      "c0 -11 1 -20 3 -24 c1 -2 3 -2 4 0 Z",
  },
];

export function BodyMap({
  view = "front",
  /** The one region that should read as selected. Single by design -- see the picker. */
  selected,
  /** Muscle group -> fill colour, for the profile heat view. Regions with no entry stay neutral. */
  fills,
  onSelect,
  className,
  /** Compact drops the hit padding -- see the picker's mobile strip. */
  compact = false,
}: {
  view?: BodyMapView;
  selected?: string | null;
  fills?: Record<string, string>;
  onSelect?: (group: string) => void;
  className?: string;
  compact?: boolean;
}) {
  const titleId = useId();
  const regions = REGIONS.filter((r) => r.view === view);
  const interactive = typeof onSelect === "function";

  return (
    <svg
      viewBox="0 0 240 470"
      className={cn("h-full w-full select-none", className)}
      role={interactive ? "group" : "img"}
      aria-labelledby={titleId}
    >
      <title id={titleId}>
        {view === "front" ? "Front of the body" : "Back of the body"}
        {interactive ? " -- choose a muscle group" : ""}
      </title>

      {/* THE BODY, under every muscle so they read as sitting ON something. Filled faintly as
          well as outlined: an outline alone is a wireframe, and the muscles then float in it.
          No face -- see this file's header. */}
      <g>
        <path
          d={SILHOUETTE[view]}
          fill="currentColor"
          fillOpacity={0.07}
          stroke="currentColor"
          strokeOpacity={0.5}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <path
          d={CONTOURS[view]}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.22}
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      </g>

      {regions.map((r) => {
        const isSelected = selected === r.group;
        const fill = fills?.[r.group];
        const tint = fill ?? "currentColor";
        // A scored region is solid enough to read its colour at a glance; an unscored one is a
        // hint of shape, not a claim. Selection sits between the two.
        const opacity = fill ? 0.88 : isSelected ? 0.9 : 0.26;
        const shape = (
          <path
            d={r.d}
            fill={tint}
            fillOpacity={opacity}
            stroke={isSelected ? "currentColor" : tint}
            strokeOpacity={isSelected ? 0.9 : opacity * 0.6}
            strokeWidth={isSelected ? 1.6 : 0.8}
            strokeLinejoin="round"
          />
        );
        if (!interactive) return <g key={`${r.view}-${r.group}`}>{shape}</g>;
        return (
          <g
            key={`${r.view}-${r.group}`}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-label={r.label}
            className="cursor-pointer outline-none focus-visible:opacity-100"
            onClick={() => onSelect!(r.group)}
            onKeyDown={(e) => {
              // Keyboard reaches every region: an SVG shape is not a button unless it behaves
              // like one, and "tap the picture" cannot be the only way in.
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect!(r.group);
              }
            }}
          >
            {shape}
            {/* A transparent stroke AROUND the outline so a fingertip hits the region rather
                than only its fill. A contoured belly is narrower than the capsule it replaced,
                so this matters more now, not less. */}
            <path
              d={r.d}
              fill="transparent"
              stroke="transparent"
              strokeWidth={compact ? 14 : 20}
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Every group the figure can show, for tests and for callers that need the list. */
export const BODY_MAP_GROUPS = Array.from(new Set(REGIONS.map((r) => r.group)));

/** Groups that are scorable but have no region drawn -- the profile falls back to a list row
 * for these rather than pretending they are not part of the score. */
export const UNDRAWN_SCORABLE_GROUPS = SCORABLE_MUSCLE_GROUPS.filter(
  (g) => !BODY_MAP_GROUPS.includes(g),
);
