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
 * Deliberately schematic rather than an anatomy illustration: this is drawn for a fifteen-year-
 * old who is not sure what a lat is, and detail they cannot name is detail in the way. Same
 * reason the figure has no face -- it is a diagram of muscles, not a picture of a person, and a
 * body shown to a minor should be the former.
 */

export type BodyMapView = "front" | "back";

/** A muscle region: which view it is drawn on, and the shape that makes it.
 *
 * `w` is what keeps the figure honest. A limb muscle drawn as a hand-written outline has to be
 * kept in sync with the limb it sits on by eye, and it was not -- the legs visibly missed the
 * body ("have it actually line up the legs don't"). With `w` the region is a STROKE along the
 * same centre line the figure's own limb is stroked on, at a narrower width, so it cannot drift:
 * both are generated from one coordinate. Torso muscles keep real outlines, because a pec or a
 * lat is a shape rather than a thickness.
 */
type Region = {
  group: string;
  view: BodyMapView;
  label: string;
  /** SVG path data, drawn in a 240x470 viewBox. */
  d: string;
  /** Stroke width when this region is a limb line rather than an outlined shape. */
  w?: number;
};

// ONE SKELETON, SHARED BY THE FIGURE AND ITS MUSCLES.
//
// Every limb below is a line between two points, drawn once as the body (thick, faint) and
// again as the muscle on it (narrower, tinted). Changing a limb's position moves both, which is
// the whole point -- the previous figure kept two hand-drawn copies and they disagreed.
const LIMB = {
  upperArmL: "M84 112 L68 178",
  upperArmR: "M156 112 L172 178",
  forearmL: "M68 178 L57 250",
  forearmR: "M172 178 L183 250",
  thighL: "M104 252 L99 348",
  thighR: "M136 252 L141 348",
  shinL: "M99 348 L97 428",
  shinR: "M141 348 L143 428",
};

const REGIONS: Region[] = [
  // ---- FRONT ----
  // Three-headed look without three shapes: a short stroke with a round cap reads as the cap of
  // the deltoid, which is what a shoulder looks like from the front.
  { group: "Shoulders", view: "front", label: "Shoulders", w: 27, d: "M84 106 L85 120 M156 106 L155 120" },
  { group: "Chest", view: "front", label: "Chest", d: "M116 116 q-24 1 -31 11 q-4 17 3 29 q15 7 27 2 q4 -21 1 -42 Z M124 116 q24 1 31 11 q4 17 -3 29 q-15 7 -27 2 q-4 -21 -1 -42 Z" },
  { group: "Biceps", view: "front", label: "Biceps", w: 20, d: "M82 124 L70 170 M158 124 L170 170" },
  { group: "Forearms", view: "front", label: "Forearms", w: 15, d: "M67 188 L58 244 M173 188 L182 244" },
  // Segmented, because an undivided slab does not read as abs at any size.
  { group: "Abs", view: "front", label: "Abs", d: "M106 158 q14 -3 28 0 q3 12 0 20 q-14 3 -28 0 q-3 -8 0 -20 Z M106 184 q14 -3 28 0 q3 12 0 20 q-14 3 -28 0 q-3 -8 0 -20 Z M107 210 q13 -3 26 0 q3 12 0 22 q-13 3 -26 0 q-3 -10 0 -22 Z" },
  { group: "Core", view: "front", label: "Obliques", d: "M101 160 q-5 30 -3 58 l-9 -7 q-4 -27 -2 -49 Z M139 160 q5 30 3 58 l9 -7 q4 -27 2 -49 Z" },
  { group: "Quads", view: "front", label: "Quads", w: 31, d: LIMB.thighL + " " + LIMB.thighR },
  { group: "Calves", view: "front", label: "Calves", w: 19, d: "M99 362 L98 418 M141 362 L142 418" },

  // ---- BACK ----
  { group: "Shoulders", view: "back", label: "Rear delts", w: 27, d: "M84 106 L85 120 M156 106 L155 120" },
  { group: "Back", view: "back", label: "Upper back & traps", d: "M120 90 q26 2 34 14 q4 14 -2 26 q-14 6 -32 6 q-18 0 -32 -6 q-6 -12 -2 -26 q8 -12 34 -14 Z" },
  { group: "Lats", view: "back", label: "Lats", d: "M92 136 q28 9 56 0 q-3 33 -15 51 q-18 6 -26 0 q-12 -18 -15 -51 Z" },
  { group: "Triceps", view: "back", label: "Triceps", w: 20, d: "M82 124 L70 170 M158 124 L170 170" },
  { group: "Forearms", view: "back", label: "Forearms", w: 15, d: "M67 188 L58 244 M173 188 L182 244" },
  { group: "Lower Back", view: "back", label: "Lower back", d: "M107 190 q13 -3 26 0 q3 17 0 30 q-13 3 -26 0 q-3 -13 0 -30 Z" },
  { group: "Glutes", view: "back", label: "Glutes", d: "M118 224 q-16 0 -22 12 q-3 15 6 22 q12 5 18 -5 q2 -16 -2 -29 Z M122 224 q16 0 22 12 q3 15 -6 22 q-12 5 -18 -5 q-2 -16 2 -29 Z" },
  { group: "Hamstrings", view: "back", label: "Hamstrings", w: 29, d: "M104 272 L99 344 M136 272 L141 344" },
  { group: "Calves", view: "back", label: "Calves", w: 19, d: "M99 362 L98 418 M141 362 L142 418" },
];

/** The figure itself, under every region so it reads as a body rather than floating shapes.
 * Never interactive. Limbs are the same lines the regions use; only the torso and head are
 * shapes of their own. */
const TORSO =
  "M84 108 q36 -16 72 0 q-4 28 -6 46 q-2 22 0 40 q2 20 2 38 q-16 8 -32 8 q-16 0 -32 -8 q0 -18 2 -38 q2 -18 0 -40 q-2 -18 -6 -46 Z";

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

      {/* THE FIGURE. Limbs are stroked along the same lines their muscles are, which is what
          makes them line up; round caps give shoulders, elbows, knees and ankles without four
          more shapes to keep in sync. */}
      <g stroke="currentColor" fill="none" opacity={0.45} strokeLinecap="round">
        <ellipse cx={120} cy={48} rx={21} ry={25} strokeWidth={2} />
        <path d="M110 70 L110 88 M130 70 L130 88" strokeWidth={2} />
        <path d={TORSO} strokeWidth={2} />
        <path d={`${LIMB.upperArmL} ${LIMB.upperArmR}`} strokeWidth={24} opacity={0.35} />
        <path d={`${LIMB.forearmL} ${LIMB.forearmR}`} strokeWidth={18} opacity={0.35} />
        <path d={`${LIMB.thighL} ${LIMB.thighR}`} strokeWidth={36} opacity={0.35} />
        <path d={`${LIMB.shinL} ${LIMB.shinR}`} strokeWidth={23} opacity={0.35} />
        {/* Hands and feet: the figure stops dead without them. */}
        <path d="M57 250 L54 266 M183 250 L186 266" strokeWidth={13} opacity={0.35} />
        <path d="M97 432 L90 440 M143 432 L150 440" strokeWidth={12} opacity={0.35} />
      </g>

      {regions.map((r) => {
        const isSelected = selected === r.group;
        const fill = fills?.[r.group];
        const tint = fill ?? "currentColor";
        const opacity = fill ? 0.85 : isSelected ? 0.9 : 0.22;
        const shape = r.w ? (
          <path
            d={r.d}
            fill="none"
            stroke={tint}
            strokeOpacity={opacity}
            strokeWidth={r.w}
            strokeLinecap="round"
          />
        ) : (
          <path
            d={r.d}
            fill={tint}
            fillOpacity={opacity}
            stroke={isSelected ? "currentColor" : "none"}
            strokeWidth={1.5}
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
            {/* A transparent wider stroke so a fingertip hits the region, not just the fill. */}
            <path
              d={r.d}
              fill="none"
              stroke="transparent"
              strokeWidth={(r.w ?? 0) + (compact ? 12 : 18)}
              strokeLinecap="round"
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
