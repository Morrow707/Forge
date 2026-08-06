import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  rollUpMuscleLoad,
  muscleHeatColor,
  MUSCLE_REGION_LABEL,
  type MuscleRegion,
} from "@shared/muscle-map";

const GRAY = "hsl(var(--muted))";

/** Front-view regions, in a 200x330 viewBox. Purely schematic (rounded
 * rects/ellipses), not anatomical art -- legible at a glance is the goal,
 * not realism. */
const FRONT_SHAPES: { region?: MuscleRegion; d?: string; ellipse?: [number, number, number, number]; rect?: [number, number, number, number, number] }[] = [
  { ellipse: [100, 28, 18, 22] }, // head
  { region: "neck", rect: [92, 48, 16, 12, 4] },
  { region: "shoulders", ellipse: [55, 72, 16, 14] },
  { region: "shoulders", ellipse: [145, 72, 16, 14] },
  { region: "chest", rect: [70, 62, 60, 38, 10] },
  { region: "biceps", rect: [32, 80, 18, 48, 8] },
  { region: "biceps", rect: [150, 80, 18, 48, 8] },
  { region: "forearms", rect: [30, 130, 16, 46, 7] },
  { region: "forearms", rect: [154, 130, 16, 46, 7] },
  { ellipse: [38, 182, 9, 11] }, // hand
  { ellipse: [162, 182, 9, 11] }, // hand
  { region: "abs", rect: [78, 102, 44, 42, 8] },
  { region: "obliques", rect: [64, 104, 12, 38, 5] },
  { region: "obliques", rect: [124, 104, 12, 38, 5] },
  { region: "hips", rect: [68, 146, 22, 18, 6] },
  { region: "hips", rect: [110, 146, 22, 18, 6] },
  { region: "adductors", rect: [84, 166, 14, 40, 6] },
  { region: "adductors", rect: [102, 166, 14, 40, 6] },
  { region: "quads", rect: [66, 166, 20, 70, 9] },
  { region: "quads", rect: [114, 166, 20, 70, 9] },
  { rect: [68, 238, 16, 60, 7] }, // shin
  { rect: [116, 238, 16, 60, 7] }, // shin
  { ellipse: [76, 306, 11, 8] }, // foot
  { ellipse: [124, 306, 11, 8] }, // foot
];

const BACK_SHAPES: typeof FRONT_SHAPES = [
  { ellipse: [100, 28, 18, 22] }, // head
  { rect: [92, 48, 16, 12, 4] }, // neck (shown once, on front view)
  { region: "shoulders", ellipse: [55, 72, 16, 14] },
  { region: "shoulders", ellipse: [145, 72, 16, 14] },
  { region: "upperBack", rect: [72, 64, 56, 44, 10] },
  { region: "triceps", rect: [32, 80, 18, 48, 8] },
  { region: "triceps", rect: [150, 80, 18, 48, 8] },
  { rect: [30, 130, 16, 46, 7] }, // forearm (shown once, on front view)
  { rect: [154, 130, 16, 46, 7] },
  { ellipse: [38, 182, 9, 11] },
  { ellipse: [162, 182, 9, 11] },
  { region: "lowerBack", rect: [78, 110, 44, 32, 8] },
  { region: "glutes", rect: [68, 144, 28, 32, 10] },
  { region: "glutes", rect: [104, 144, 28, 32, 10] },
  { region: "hamstrings", rect: [66, 178, 20, 64, 9] },
  { region: "hamstrings", rect: [114, 178, 20, 64, 9] },
  { region: "calves", rect: [68, 244, 16, 56, 7] },
  { region: "calves", rect: [116, 244, 16, 56, 7] },
  { ellipse: [76, 306, 11, 8] },
  { ellipse: [124, 306, 11, 8] },
];

function BodySvg({
  shapes,
  colorByRegion,
  countByRegion,
}: {
  shapes: typeof FRONT_SHAPES;
  colorByRegion: Map<MuscleRegion, string>;
  countByRegion: Map<MuscleRegion, number>;
}) {
  return (
    <svg viewBox="0 0 200 330" className="h-full w-full">
      {shapes.map((s, i) => {
        const fill = s.region ? (colorByRegion.get(s.region) ?? GRAY) : GRAY;
        const label = s.region
          ? `${MUSCLE_REGION_LABEL[s.region]}: ${Math.round(countByRegion.get(s.region) ?? 0)} sets`
          : undefined;
        const common = {
          fill,
          stroke: "hsl(var(--background))",
          strokeWidth: 1.5,
        };
        if (s.ellipse) {
          const [cx, cy, rx, ry] = s.ellipse;
          return (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} {...common}>
              {label && <title>{label}</title>}
            </ellipse>
          );
        }
        if (s.rect) {
          const [x, y, w, h, rx] = s.rect;
          return (
            <rect key={i} x={x} y={y} width={w} height={h} rx={rx} {...common}>
              {label && <title>{label}</title>}
            </rect>
          );
        }
        return null;
      })}
    </svg>
  );
}

/** Whole-athlete, not exercise-specific -- lives alongside ACWR and the
 * volume/intensity chart in the athlete overview. Colors are relative to
 * this athlete's own busiest region in the window, not an absolute scale,
 * so a lightly-training Free Agent and a daily-training athlete each see
 * their own real hot/cold spots rather than one washed out next to the
 * other (see muscleHeatColor). */
export function MuscleHeatMap({ athleteId }: { athleteId: string }) {
  const { data: rawByGroup, isLoading } = useQuery<Record<string, number>>({
    queryKey: ["/api/coach/roster", athleteId, "muscle-load"],
    queryFn: () => getJson(`/api/coach/roster/${athleteId}/muscle-load`),
    enabled: !!athleteId,
  });

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-md bg-surface" />;
  }
  if (!rawByGroup || Object.keys(rawByGroup).length === 0) return null;

  const byRegion = rollUpMuscleLoad(rawByGroup);
  const entries = Object.entries(byRegion) as [MuscleRegion, number][];
  const max = Math.max(...entries.map(([, v]) => v), 0);
  const colorByRegion = new Map<MuscleRegion, string>(
    entries.map(([region, count]) => [region, muscleHeatColor(max > 0 ? count / max : 0)]),
  );
  const countByRegion = new Map<MuscleRegion, number>(entries);
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Muscle Load Map</CardTitle>
        <CardDescription>
          Last 28 days of logged sets by muscle group, weighted by primary vs. secondary role in
          each exercise. Color is relative to this athlete's own busiest region.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-[auto_auto_1fr] sm:items-start">
          <div className="mx-auto w-32 sm:w-36">
            <BodySvg shapes={FRONT_SHAPES} colorByRegion={colorByRegion} countByRegion={countByRegion} />
            <p className="mt-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
              Front
            </p>
          </div>
          <div className="mx-auto w-32 sm:w-36">
            <BodySvg shapes={BACK_SHAPES} colorByRegion={colorByRegion} countByRegion={countByRegion} />
            <p className="mt-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
              Back
            </p>
          </div>
          <div className="space-y-1.5 self-center">
            {sorted.map(([region, count]) => (
              <div key={region} className="flex items-center gap-2 text-sm">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ background: muscleHeatColor(max > 0 ? count / max : 0) }}
                />
                <span className="text-foreground">{MUSCLE_REGION_LABEL[region]}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {Math.round(count)} sets
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
