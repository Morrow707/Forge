type Metric = { value: number; target: number | null };

type RingKey = "water" | "calories" | "protein" | "carbs" | "fat" | "fiber";

// Outermost to innermost. Water is outermost and gets the biggest ring on
// purpose -- it's the one number here that changes by direct interaction
// (the quick-add buttons and the itemized log below) rather than by logging
// a food, so it earns the most visual weight. Fiber is innermost as the
// smallest gram value of the six.
const RING_ORDER: { key: RingKey; label: string; unit: string; color: string }[] = [
  { key: "water", label: "Water", unit: "oz", color: "#2ea8c9" },
  { key: "calories", label: "Calories", unit: "kcal", color: "hsl(var(--primary))" },
  { key: "protein", label: "Protein", unit: "g", color: "#3b8a5e" },
  { key: "carbs", label: "Carbs", unit: "g", color: "#4f7fd6" },
  { key: "fat", label: "Fat", unit: "g", color: "#c9973a" },
  { key: "fiber", label: "Fiber", unit: "g", color: "#8b6fce" },
];

// The innermost radius has to clear the centre readout, not just the ring below it.
// At r=16/stroke 8 the hole was 12px from centre and a four-digit calorie count is
// 23.6px half-width (measured in a real browser, not estimated) -- so "2450" and the
// "kcal today" label both struck through the fiber ring and into fat. It only looked
// right at a zero or two-digit total, which is exactly what a first render shows.
// 30px inner radius clears the widest realistic readout with room to spare; the
// thinner stroke keeps the outermost ring inside the viewBox (70 + 3 < 75) and keeps
// a 2px gap between bands.
const RADII: Record<RingKey, number> = {
  water: 70,
  calories: 62,
  protein: 54,
  carbs: 46,
  fat: 38,
  fiber: 30,
};
const STROKE_WIDTH = 6;
const CENTER = 75;
const VIEWBOX = 150;

// Same fallback the flat ProgressBar it replaces already used: with no
// target set, a filled ring would claim a percentage that means nothing, so
// this shows a small fixed sliver once anything's been logged rather than a
// real fraction.
function fillFraction(value: number, target: number | null): number {
  if (target && target > 0) return Math.min(1, value / target);
  return value > 0 ? 0.1 : 0;
}

/** Six concentric rings -- calories, protein, carbs, fat, fiber and water --
 * replacing the flat macro bars FoodLogPanel used to render one per row.
 * Same totals/targets data those bars read, just one shape instead of five
 * separate scans down the screen. The legend beneath the rings is the real
 * accessible data (exact numbers, screen-reader text); the rings are the
 * at-a-glance layer on top of it, not a replacement for it. */
export function NutrientRings({
  calories,
  protein,
  carbs,
  fat,
  fiber,
  water,
}: Record<RingKey, Metric>) {
  const metrics: Record<RingKey, Metric> = { calories, protein, carbs, fat, fiber, water };
  const summary = RING_ORDER.map((r) => {
    const m = metrics[r.key];
    return `${r.label} ${Math.round(m.value)}${m.target ? ` of ${m.target}` : ""} ${r.unit}`;
  }).join(", ");

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        width={190}
        height={190}
        role="img"
        aria-label={summary}
      >
        {RING_ORDER.map((ring) => {
          const r = RADII[ring.key];
          const circumference = 2 * Math.PI * r;
          const frac = fillFraction(metrics[ring.key].value, metrics[ring.key].target);
          return (
            <g key={ring.key}>
              <circle
                cx={CENTER}
                cy={CENTER}
                r={r}
                fill="none"
                stroke="hsl(var(--surface-elevated))"
                strokeWidth={STROKE_WIDTH}
              />
              {frac > 0 && (
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={r}
                  fill="none"
                  stroke={ring.color}
                  strokeWidth={STROKE_WIDTH}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - frac)}
                  transform={`rotate(-90 ${CENTER} ${CENTER})`}
                />
              )}
            </g>
          );
        })}
        <text x={CENTER} y={CENTER - 3} textAnchor="middle" fontSize="17" fontWeight="800" fill="currentColor">
          {Math.round(calories.value)}
        </text>
        <text x={CENTER} y={CENTER + 13} textAnchor="middle" fontSize="8" fill="currentColor" opacity={0.6}>
          kcal today
        </text>
      </svg>

      <ul className="w-full space-y-1.5">
        {RING_ORDER.map((ring) => {
          const m = metrics[ring.key];
          return (
            <li key={ring.key} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: ring.color }}
                aria-hidden="true"
              />
              <span className="flex-1 font-medium">{ring.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {Math.round(m.value)}
                {m.target ? ` / ${m.target}` : ""} {ring.unit}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
