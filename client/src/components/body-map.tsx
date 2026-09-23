import { useId } from "react";
import { cn } from "@/lib/utils";
import { SCORABLE_MUSCLE_GROUPS } from "@shared/strength-score";

/**
 * ONE ANATOMICAL FIGURE, EVERYWHERE A MUSCLE IS DRAWN.
 *
 * A filter in the exercise picker (tap a muscle, see the exercises that train it), a readout on
 * the strength profile, and the body under the Muscle Load Map. One drawing, three jobs: two
 * figures of the same athlete's muscles will always drift, and the one that drifts is the one
 * showing somebody their own body.
 *
 * REGIONS ARE KEYED TO MUSCLE_GROUPS, not invented ids. The exercise library tags every exercise
 * with a muscleGroup, so a region keyed to anything else is a region nothing can ever fill --
 * body-map-regions.test.ts refuses one.
 *
 * WHY IT LOOKS THE WAY IT DOES, after three goes at it.
 *
 * The first version was rounded rectangles, and its own comment defended that: "deliberately
 * schematic ... detail they cannot name is detail in the way." Wrong -- a schematic body does not
 * read as a body at all, so it stops being a picture and becomes a legend you decode.
 *
 * The second was contoured, and still looked bad, because contour was never the problem.
 * COVERAGE was. Scott's reference anatomy models have no empty space: every part of the body is
 * some muscle, edge to edge. Isolated bellies floating on a grey silhouette look unfinished no
 * matter how well each one is drawn. So the regions here TILE -- they abut, and barely any
 * neutral body shows through.
 *
 * Three things do the rest of the work, and all three came out of holding ours beside his
 * references: a dark SEAM stroke between neighbours (without it two similar colours merge into
 * one mass), a per-belly GRADIENT (light along the centre line, dark at the edges -- the cheapest
 * thing that makes flat vector look rounded), and bellies that are actually belly-shaped, narrow
 * at origin and insertion, full through the middle.
 *
 * THE SHAPES ARE GENERATED, NOT TYPED. `belly()` takes a centre line and a width profile and
 * emits a smooth closed outline. That is what makes a muscle land on its limb by construction
 * rather than by eye -- the failure the very first version had, which the stroke-along-a-line
 * trick fixed at the cost of every limb muscle being a capsule. This keeps the guarantee and
 * loses the capsules.
 *
 * TWO RULES THAT ARE NOT STYLE AND MUST SURVIVE ANY REDRAW:
 *  1. THE FIGURE HAS NO FACE. Forge has thirteen-year-olds on it. This is a diagram of muscles,
 *     not a picture of a person. Never add eyes, hair or expression.
 *  2. NOTHING IS GENDERED. One neutral athletic build for everybody. A figure that changed shape
 *     with `users.gender` would make a category out of a field that exists for a percentile, and
 *     would put a body type in front of a child as though it were theirs.
 */

export type BodyMapView = "front" | "back";

/** Where a label sits when leader lines are drawn, and the point on the muscle it points at. */
export type BodyMapLeader = {
  group: string;
  side: "left" | "right";
  /** Label baseline in viewBox units. */
  y: number;
  /** The anchor on the muscle the line runs to. */
  at: [number, number];
};

const V = { w: 240, h: 470 };
/** Extra room either side for labels. The figure's own coordinates never change. */
const GUTTER = 48;

/* ------------------------------------------------------------------ geometry */

const fmt = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

/** Closed Catmull-Rom through the points, as cubic beziers. Smooth everywhere -- a polygon is
 *  exactly the blockiness this drawing exists to get away from. */
function through(pts: [number, number][]): string {
  const n = pts.length;
  const out = [`M${fmt(pts[0])}`];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const d = pts[(i + 2) % n];
    out.push(
      `C${fmt([b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6])}` +
        ` ${fmt([c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6])} ${fmt(c)}`,
    );
  }
  return `${out.join(" ")} Z`;
}

/** A muscle belly along a centre line: narrow at the origin, full through the middle, narrow at
 *  the insertion. `bow` sweeps it sideways -- the outer quad and the lat both need it. */
function belly(
  x0: number, y0: number, x1: number, y1: number,
  wTop: number, wMid: number, wBot: number, bow = 0,
): string {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const px = -dy / len;
  const py = dx / len;
  const ts = [0, 0.22, 0.5, 0.78, 1];
  const ws = [wTop, ((wTop + wMid) / 2) * 1.05, wMid, ((wMid + wBot) / 2) * 1.05, wBot];
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  ts.forEach((t, i) => {
    const s = Math.sin(Math.PI * t) * bow;
    const cx = x0 + dx * t + px * s;
    const cy = y0 + dy * t + py * s;
    left.push([cx - (px * ws[i]) / 2, cy - (py * ws[i]) / 2]);
    right.push([cx + (px * ws[i]) / 2, cy + (py * ws[i]) / 2]);
  });
  return through(left.concat(right.reverse()));
}

/** Reflect a path about the figure's centre line. Only M/C/Z, which is all the generators emit. */
function flip(d: string): string {
  const toks = d.match(/[MCZ]|-?\d+\.?\d*/g) ?? [];
  const out: string[] = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t === "Z") {
      out.push("Z");
      i += 1;
    } else if (t === "M" || t === "C") {
      const k = t === "M" ? 2 : 6;
      const nums = toks.slice(i + 1, i + 1 + k).map(Number);
      for (let j = 0; j < k; j += 2) nums[j] = V.w - nums[j];
      out.push(t + nums.map((v) => v.toFixed(1)).join(" "));
      i += 1 + k;
    } else i += 1;
  }
  return out.join(" ");
}
/** Both sides of a paired muscle, as one path -- they are one group and select together. */
const both = (d: string) => `${d} ${flip(d)}`;

/* ------------------------------------------------------------------ the body */

const TORSO = through([
  [86, 92], [120, 80], [154, 92], [159, 140], [150, 186], [151, 214],
  [152, 246], [120, 258], [88, 246], [89, 214], [90, 186], [81, 140],
]);

/** Limb centre lines, mirrored by the renderer. The muscles below are generated against these
 *  same numbers, which is why nothing can drift off a limb. */
const LIMBS: [number, number, number, number, number][] = [
  [86, 96, 70, 182, 31],   // upper arm
  [70, 184, 61, 254, 25],  // forearm
  [61, 256, 58, 278, 18],  // hand
  [104, 252, 103, 344, 41],// thigh
  [103, 348, 105, 428, 28],// shin
  [105, 432, 95, 444, 16], // foot
];

/* ------------------------------------------------------------------ muscles */

type Region = { group: string; view: BodyMapView; label: string; d: string };

const REGIONS: Region[] = [
  // ---- FRONT. Order matters: the delt cap overlays the pec, the way it does on a body.
  { group: "Chest", view: "front", label: "Chest",
    d: both(through([[118, 96], [99, 102], [87, 118], [90, 142], [105, 150], [118, 146]])) },
  { group: "Shoulders", view: "front", label: "Shoulders", d: both(belly(88, 90, 70, 132, 26, 30, 20, -4)) },
  { group: "Biceps", view: "front", label: "Biceps", d: both(belly(84, 124, 71, 180, 20, 25, 16, -2)) },
  { group: "Forearms", view: "front", label: "Forearms", d: both(belly(70, 186, 62, 250, 20, 23, 12, -1)) },
  { group: "Abs", view: "front", label: "Abs",
    d: through([[120, 152], [136, 156], [139, 196], [134, 232], [120, 240], [106, 232], [101, 196], [104, 156]]) },
  { group: "Core", view: "front", label: "Obliques", d: both(belly(100, 158, 94, 228, 14, 17, 10, -3)) },
  { group: "Quads", view: "front", label: "Quads", d: both(belly(104, 250, 102, 340, 32, 37, 22, -5)) },
  { group: "Calves", view: "front", label: "Calves", d: both(belly(103, 356, 105, 424, 22, 25, 13, -2)) },

  // ---- BACK. Lats first, then the traps over them -- the trapezius overlays the lat at the
  // mid-back, and drawing it the other way hid an 18-set group behind an 11-set one.
  { group: "Lats", view: "back", label: "Lats", d: both(belly(92, 126, 112, 202, 30, 26, 12, -13)) },
  { group: "Back", view: "back", label: "Upper back",
    d: through([[120, 80], [146, 92], [158, 106], [148, 128], [131, 152], [120, 166], [109, 152], [92, 128], [82, 106], [94, 92]]) },
  { group: "Shoulders", view: "back", label: "Rear delts", d: both(belly(88, 90, 70, 132, 26, 30, 20, -4)) },
  { group: "Triceps", view: "back", label: "Triceps", d: both(belly(84, 122, 71, 180, 20, 25, 16, -2)) },
  { group: "Forearms", view: "back", label: "Forearms", d: both(belly(70, 186, 62, 250, 20, 23, 12, -1)) },
  { group: "Lower Back", view: "back", label: "Lower back", d: both(belly(112, 196, 114, 240, 14, 16, 12, 0)) },
  { group: "Glutes", view: "back", label: "Glutes",
    d: both(through([[120, 240], [103, 240], [92, 254], [94, 274], [110, 284], [120, 276]])) },
  { group: "Hamstrings", view: "back", label: "Hamstrings", d: both(belly(104, 286, 102, 342, 32, 34, 22, -4)) },
  { group: "Calves", view: "back", label: "Calves", d: both(belly(103, 356, 105, 424, 22, 25, 13, -2)) },
];

/** Where each label sits and what it points at, when a caller asks for leader lines. */
export const BODY_MAP_LEADERS: Record<BodyMapView, BodyMapLeader[]> = {
  front: [
    { group: "Shoulders", side: "left", y: 96, at: [74, 104] },
    { group: "Chest", side: "right", y: 120, at: [143, 120] },
    { group: "Biceps", side: "left", y: 152, at: [74, 150] },
    { group: "Core", side: "right", y: 172, at: [142, 190] },
    { group: "Abs", side: "right", y: 210, at: [126, 196] },
    { group: "Forearms", side: "left", y: 216, at: [65, 216] },
    { group: "Quads", side: "left", y: 296, at: [104, 292] },
    { group: "Calves", side: "right", y: 392, at: [136, 388] },
  ],
  back: [
    { group: "Shoulders", side: "right", y: 92, at: [166, 104] },
    { group: "Back", side: "left", y: 100, at: [100, 108] },
    { group: "Triceps", side: "right", y: 146, at: [166, 150] },
    { group: "Lats", side: "left", y: 158, at: [100, 158] },
    { group: "Lower Back", side: "left", y: 214, at: [114, 216] },
    { group: "Forearms", side: "right", y: 216, at: [175, 216] },
    { group: "Glutes", side: "left", y: 258, at: [104, 262] },
    { group: "Hamstrings", side: "right", y: 312, at: [136, 310] },
    { group: "Calves", side: "right", y: 392, at: [136, 388] },
  ],
};

/* ------------------------------------------------------------------ render */

export function BodyMap({
  view = "front",
  /** The one region that reads as selected. Single by design -- see the picker. */
  selected,
  /** Muscle group -> fill colour. Regions with no entry stay neutral. */
  fills,
  onSelect,
  className,
  /** Compact drops the hit padding -- see the picker's mobile strip. */
  compact = false,
  /** Leader-lined labels around the figure. The caller supplies the caption for each group, so
   *  the figure never has to know what a set count is. */
  leaders,
  captionFor,
}: {
  view?: BodyMapView;
  selected?: string | null;
  fills?: Record<string, string>;
  onSelect?: (group: string) => void;
  className?: string;
  compact?: boolean;
  leaders?: BodyMapLeader[];
  captionFor?: (group: string) => string | null;
}) {
  const uid = useId().replace(/:/g, "");
  const titleId = `${uid}-t`;
  const regions = REGIONS.filter((r) => r.view === view);
  const interactive = typeof onSelect === "function";
  const labelled = !!leaders?.length;
  const viewBox = labelled
    ? `${-GUTTER} 0 ${V.w + GUTTER * 2} ${V.h}`
    : `0 0 ${V.w} ${V.h}`;

  /** One gradient per distinct fill. Keyed by index so a colour can be any CSS value. */
  const palette = Array.from(new Set(Object.values(fills ?? {})));
  const gradIdFor = (colour: string | undefined) =>
    colour == null ? `${uid}-neutral` : `${uid}-g${palette.indexOf(colour)}`;

  return (
    <svg
      viewBox={viewBox}
      className={cn("h-full w-full select-none", labelled && "overflow-visible", className)}
      role={interactive ? "group" : "img"}
      aria-labelledby={titleId}
    >
      <title id={titleId}>
        {view === "front" ? "Front of the body" : "Back of the body"}
        {interactive ? " -- choose a muscle group" : ""}
      </title>

      <defs>
        {/* Light along the centre of each belly, dark at its edges. This is what stops a flat
            fill reading as a sticker rather than a muscle. */}
        {palette.map((c, i) => (
          <linearGradient key={i} id={`${uid}-g${i}`} x1="0" x2="1">
            <stop offset="0" stopColor={c} stopOpacity="0.5" />
            <stop offset="0.42" stopColor={c} stopOpacity="1" />
            <stop offset="1" stopColor={c} stopOpacity="0.45" />
          </linearGradient>
        ))}
        <linearGradient id={`${uid}-neutral`} x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.14" />
          <stop offset="0.42" stopColor="currentColor" stopOpacity="0.26" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* THE BODY. Under everything, so the muscles read as sitting on something. No face. */}
      <g fill="currentColor" fillOpacity={0.16} stroke="currentColor" strokeOpacity={0.16} strokeLinecap="round">
        <ellipse cx={120} cy={40} rx={18} ry={22} stroke="none" />
        <rect x={111} y={56} width={18} height={22} rx={7} stroke="none" />
        {LIMBS.map(([x0, y0, x1, y1, w], i) => (
          <path
            key={i}
            d={`M${x0} ${y0} L${x1} ${y1} M${V.w - x0} ${y0} L${V.w - x1} ${y1}`}
            fill="none"
            strokeWidth={w}
          />
        ))}
        <path d={TORSO} stroke="none" />
      </g>

      {regions.map((r) => {
        const isSelected = selected === r.group;
        const dimmed = selected != null && !isSelected;
        const fill = fills?.[r.group];
        const shape = (
          <path
            d={r.d}
            fill={`url(#${gradIdFor(fill)})`}
            // The seam. Two neighbours on similar colours merge into one mass without it, which
            // is most of what separates an anatomy plate from a blob.
            stroke={isSelected ? "currentColor" : "var(--background, #000)"}
            strokeOpacity={isSelected ? 0.95 : 0.55}
            strokeWidth={isSelected ? 2 : 1.2}
            strokeLinejoin="round"
            opacity={dimmed ? 0.45 : 1}
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
              // An SVG shape is not a button unless it behaves like one, and "tap the picture"
              // cannot be the only way in.
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect!(r.group);
              }
            }}
          >
            {shape}
            {/* A transparent stroke around the outline, so a fingertip hits the region and not
                only its fill. A contoured belly is narrower than the capsule it replaced. */}
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

      {leaders?.map((l) => {
        const isSelected = selected === l.group;
        const region = regions.find((r) => r.group === l.group);
        const x = l.side === "left" ? -GUTTER + 4 : V.w + GUTTER - 4;
        const elbow = l.side === "left" ? -6 : V.w + 6;
        const anchor = l.side === "left" ? "start" : "end";
        const caption = captionFor?.(l.group);
        const Tag = interactive ? "g" : "g";
        return (
          <Tag
            key={`lead-${l.group}`}
            {...(interactive
              ? {
                  role: "button" as const,
                  tabIndex: 0,
                  "aria-pressed": isSelected,
                  "aria-label": region?.label ?? l.group,
                  className: "cursor-pointer outline-none",
                  onClick: () => onSelect!(l.group),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect!(l.group);
                    }
                  },
                }
              : {})}
          >
            <path
              d={`M${l.side === "left" ? x + 40 : x - 40} ${l.y} L${elbow} ${l.y} L${l.at[0]} ${l.at[1]}`}
              fill="none"
              stroke="currentColor"
              strokeOpacity={isSelected ? 0.9 : 0.25}
              strokeWidth={isSelected ? 1.6 : 1}
            />
            <circle
              cx={l.at[0]}
              cy={l.at[1]}
              r={isSelected ? 3.2 : 2.2}
              fill="currentColor"
              fillOpacity={isSelected ? 0.95 : 0.35}
            />
            <text
              x={x}
              y={l.y - 2}
              textAnchor={anchor}
              className={cn("text-[13.5px] tracking-wide", isSelected ? "fill-foreground" : "fill-muted-foreground")}
            >
              {region?.label ?? l.group}
            </text>
            {caption && (
              <text x={x} y={l.y + 10} textAnchor={anchor} className="fill-muted-foreground text-[10px] opacity-70">
                {caption}
              </text>
            )}
            {/* The label is a tap target too, not just the muscle. */}
            <rect
              x={l.side === "left" ? x - 6 : x - 96}
              y={l.y - 16}
              width={102}
              height={26}
              fill="transparent"
            />
          </Tag>
        );
      })}
    </svg>
  );
}

/** Every group the figure can show, for tests and for callers that need the list. */
export const BODY_MAP_GROUPS = Array.from(new Set(REGIONS.map((r) => r.group)));

/** Groups that are scorable but have no region drawn -- the profile falls back to a list row for
 *  these rather than pretending they are not part of the score. */
export const UNDRAWN_SCORABLE_GROUPS = SCORABLE_MUSCLE_GROUPS.filter(
  (g) => !BODY_MAP_GROUPS.includes(g),
);
