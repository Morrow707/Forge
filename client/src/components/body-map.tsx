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

/** A muscle region: which view it is drawn on, and the shapes that make it. */
type Region = {
  group: string;
  view: BodyMapView;
  label: string;
  /** SVG path data, drawn in a 220x460 viewBox. */
  d: string;
};

const REGIONS: Region[] = [
  // ---- FRONT ----
  { group: "Shoulders", view: "front", label: "Shoulders", d: "M62 116 q-16 4 -20 24 q-2 14 2 22 l20 -8 q2 -22 8 -32 Z M158 116 q16 4 20 24 q2 14 -2 22 l-20 -8 q-2 -22 -8 -32 Z" },
  { group: "Chest", view: "front", label: "Chest", d: "M76 120 q34 -10 68 0 q4 26 -2 42 q-32 8 -64 0 q-6 -16 -2 -42 Z" },
  { group: "Biceps", view: "front", label: "Biceps", d: "M44 160 q-8 22 -6 44 l18 4 q2 -26 6 -44 Z M176 160 q8 22 6 44 l-18 4 q-2 -26 -6 -44 Z" },
  { group: "Forearms", view: "front", label: "Forearms", d: "M36 210 q-6 28 -2 50 l18 2 q2 -28 4 -48 Z M184 210 q6 28 2 50 l-18 2 q-2 -28 -4 -48 Z" },
  { group: "Abs", view: "front", label: "Abs", d: "M86 168 q24 -6 48 0 q4 34 0 62 q-24 6 -48 0 q-4 -28 0 -62 Z" },
  { group: "Core", view: "front", label: "Obliques", d: "M74 172 q6 30 4 56 l-10 -4 q-6 -26 -4 -50 Z M146 172 q-6 30 -4 56 l10 -4 q6 -26 4 -50 Z" },
  { group: "Quads", view: "front", label: "Quads", d: "M82 244 q18 -6 34 0 q4 44 -4 78 q-14 4 -26 0 q-8 -36 -4 -78 Z M122 244 q18 -6 34 0 q4 44 -4 78 q-14 4 -26 0 q-8 -36 -4 -78 Z" },
  { group: "Calves", view: "front", label: "Calves", d: "M88 336 q14 -4 24 0 q2 34 -4 56 q-10 2 -16 0 q-6 -24 -4 -56 Z M128 336 q14 -4 24 0 q2 34 -4 56 q-10 2 -16 0 q-6 -24 -4 -56 Z" },

  // ---- BACK ----
  { group: "Shoulders", view: "back", label: "Rear delts", d: "M62 116 q-16 4 -20 24 q-2 14 2 22 l20 -8 q2 -22 8 -32 Z M158 116 q16 4 20 24 q2 14 -2 22 l-20 -8 q-2 -22 -8 -32 Z" },
  { group: "Back", view: "back", label: "Upper back & traps", d: "M78 108 q32 -8 64 0 q6 20 2 38 q-34 8 -68 0 q-4 -18 2 -38 Z" },
  { group: "Lats", view: "back", label: "Lats", d: "M74 150 q30 8 72 0 q-4 34 -16 52 q-20 6 -40 0 q-12 -18 -16 -52 Z" },
  { group: "Triceps", view: "back", label: "Triceps", d: "M44 160 q-8 22 -6 44 l18 4 q2 -26 6 -44 Z M176 160 q8 22 6 44 l-18 4 q-2 -26 -6 -44 Z" },
  { group: "Forearms", view: "back", label: "Forearms", d: "M36 210 q-6 28 -2 50 l18 2 q2 -28 4 -48 Z M184 210 q6 28 2 50 l-18 2 q-2 -28 -4 -48 Z" },
  { group: "Lower Back", view: "back", label: "Lower back", d: "M90 204 q20 -4 40 0 q2 20 -2 32 q-18 4 -36 0 q-4 -14 -2 -32 Z" },
  { group: "Glutes", view: "back", label: "Glutes", d: "M84 240 q24 -8 52 0 q4 24 -4 38 q-22 6 -44 0 q-8 -16 -4 -38 Z" },
  { group: "Hamstrings", view: "back", label: "Hamstrings", d: "M84 284 q18 -6 32 0 q2 34 -4 58 q-12 4 -22 0 q-6 -26 -6 -58 Z M124 284 q18 -6 32 0 q2 34 -4 58 q-12 4 -22 0 q-6 -26 -6 -58 Z" },
  { group: "Calves", view: "back", label: "Calves", d: "M88 348 q14 -4 24 0 q2 30 -4 48 q-10 2 -16 0 q-6 -20 -4 -48 Z M128 348 q14 -4 24 0 q2 30 -4 48 q-10 2 -16 0 q-6 -20 -4 -48 Z" },
];

/** The body outline, drawn under every region so the figure reads as a body rather than a set
 * of floating shapes. Never interactive. */
const OUTLINE =
  "M110 40 q-16 0 -16 18 q0 14 6 22 q-26 8 -34 30 q-8 22 -10 54 q-4 34 -8 54 q-2 12 6 14 q8 2 12 -10 q6 -22 10 -42 q2 26 0 50 q-2 26 2 48 q4 30 2 60 q-2 24 -6 44 q-2 12 8 14 q10 2 12 -10 q6 -34 10 -62 q4 -28 6 -46 q2 18 6 46 q4 28 10 62 q2 12 12 10 q10 -2 8 -14 q-4 -20 -6 -44 q-2 -30 2 -60 q4 -22 2 -48 q-2 -24 0 -50 q4 20 10 42 q4 12 12 10 q8 -2 6 -14 q-4 -20 -8 -54 q-2 -32 -10 -54 q-8 -22 -34 -30 q6 -8 6 -22 q0 -18 -16 -18 Z";

export function BodyMap({
  view = "front",
  /** Regions that should read as selected. */
  selected,
  /** Muscle group -> fill colour, for the profile heat view. Regions with no entry stay neutral. */
  fills,
  onSelect,
  className,
  /** Compact drops the labels and shrinks the hit padding -- see the picker's mobile strip. */
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
      viewBox="0 0 220 460"
      className={cn("h-full w-full select-none", className)}
      role={interactive ? "group" : "img"}
      aria-labelledby={titleId}
    >
      <title id={titleId}>
        {view === "front" ? "Front of the body" : "Back of the body"}
        {interactive ? " — choose a muscle group" : ""}
      </title>
      <path d={OUTLINE} fill="none" stroke="currentColor" strokeWidth={2} opacity={0.5} />
      {regions.map((r) => {
        const isSelected = selected === r.group;
        const fill = fills?.[r.group];
        const shape = (
          <path
            d={r.d}
            fill={fill ?? (isSelected ? "currentColor" : "currentColor")}
            fillOpacity={fill ? 0.85 : isSelected ? 0.85 : 0.18}
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
            {/* A transparent wider stroke so a fingertip hits the region, not just the fill.
                Without it the thin shapes (forearms, calves) are unusable on a phone. */}
            <path d={r.d} fill="none" stroke="transparent" strokeWidth={compact ? 10 : 16} />
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
