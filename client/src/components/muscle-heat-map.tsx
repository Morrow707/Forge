import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { ReadFailed } from "@/components/read-failed";
import { BodyMap } from "@/components/body-map";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadioChipGroup } from "@/components/filter-chip-group";
import {
  rollUpMuscleLoad,
  muscleHeatColor,
  MUSCLE_REGION_LABEL,
  type MuscleRegion,
  type MuscleLoadBreakdown,
} from "@shared/muscle-map";
import { BODY_MAP_LEADERS } from "@/components/body-map";

const MUSCLE_LOAD_WINDOW_OPTIONS = [
  { label: "28d", days: 28 },
  { label: "90d", days: 90 },
  { label: "180d", days: 180 },
];

const GRAY = "hsl(var(--muted))";

/** THE HEAT MAP AND THE STRENGTH PROFILE DRAW THE SAME BODY.
 *
 * They did not. This file had its own figure -- rounded rects and ellipses, with its own comment
 * calling it "purely schematic ... not anatomical art" -- while the strength profile had
 * BodyMap. Two figures for the same athlete's muscles, and after body-map.tsx was redrawn as
 * real anatomy this one was still the blocky one, which is what Scott was looking at when he
 * said he saw no difference. Scott, 2026-09-23: "Both should be the same very very detailed
 * anatomy."
 *
 * One drawing, used twice, is also the only arrangement that cannot drift. BodyMap already takes
 * a `fills` map of muscle group to colour, which is exactly what a heat map is.
 *
 * THE TWO VOCABULARIES HAVE TO BE TRANSLATED, and this is the one seam.
 *
 * `MuscleRegion` (this file's rollup, 16 coarse regions) and BodyMap's groups (the exercise
 * taxonomy's own names) were built for different jobs and do not line up one to one. Anything
 * unmapped simply stays neutral on the figure and keeps its row in the list beside it -- a
 * region with nowhere to be drawn is still a region somebody trained, and dropping it from the
 * numbers to suit the picture would be the picture telling a lie about the training.
 */
const REGION_TO_BODY_MAP_GROUP: Partial<Record<MuscleRegion, string[]>> = {
  shoulders: ["Shoulders"],
  chest: ["Chest"],
  // The rollup has no separate lat region, so the whole back above the waist is one number.
  // Tinting both shapes from it is honest about that; tinting only the traps would leave the
  // largest muscle on the back permanently grey for an athlete who rows every week.
  upperBack: ["Back", "Lats"],
  lowerBack: ["Lower Back"],
  biceps: ["Biceps"],
  triceps: ["Triceps"],
  forearms: ["Forearms"],
  abs: ["Abs"],
  obliques: ["Core"],
  glutes: ["Glutes"],
  quads: ["Quads"],
  hamstrings: ["Hamstrings"],
  calves: ["Calves"],
  // neck, hips and adductors have no region drawn on the figure. They keep their list rows.
};

/** The reverse lookup, derived rather than written twice. A tap lands on a BodyMap group and
 *  every number this card holds is keyed by MuscleRegion, so something has to translate back --
 *  and a second hand-written table is a second thing to get out of step. */
const GROUP_TO_REGION: Record<string, MuscleRegion> = Object.fromEntries(
  Object.entries(REGION_TO_BODY_MAP_GROUP).flatMap(([region, groups]) =>
    (groups ?? []).map((g) => [g, region as MuscleRegion]),
  ),
);

function fillsForBodyMap(colorByRegion: Map<MuscleRegion, string>): Record<string, string> {
  const fills: Record<string, string> = {};
  for (const [region, color] of colorByRegion) {
    for (const group of REGION_TO_BODY_MAP_GROUP[region] ?? []) fills[group] = color;
  }
  return fills;
}

/** Whole-athlete, not exercise-specific -- lives alongside ACWR and the
 * volume/intensity chart in the athlete overview. Colors are relative to
 * this athlete's own busiest region in the window, not an absolute scale,
 * so a lightly-training Free Agent and a daily-training athlete each see
 * their own real hot/cold spots rather than one washed out next to the
 * other (see muscleHeatColor). */
export function MuscleHeatMap({ athleteId }: { athleteId?: string }) {
  const [windowDays, setWindowDays] = useState(28);
  // Two callers, two endpoints. With an athleteId this is a coach reading one
  // athlete on their roster; without one it is the athlete reading themselves,
  // which is a different query (all of their training, not one coach's
  // assignments) and so a different route -- see /api/athlete/muscle-load.
  const path = athleteId
    ? `/api/coach/roster/${athleteId}/muscle-load?days=${windowDays}`
    : `/api/athlete/muscle-load?days=${windowDays}`;
  const { data, isLoading, isError, refetch } = useQuery<MuscleLoadBreakdown>({
    queryKey: ["muscle-load", athleteId ?? "self", windowDays],
    queryFn: () => getJson(path),
  });
  // Which muscle the reader has open. Cleared when the window changes, because the list under a
  // selection is window-scoped and leaving it up would attribute 90 days of work to 28.
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  if (isLoading && !data) {
    return <div className="h-24 animate-pulse rounded-md bg-surface" />;
  }

  const byRegion = rollUpMuscleLoad(data?.groups ?? {});
  const entries = Object.entries(byRegion) as [MuscleRegion, number][];
  const max = Math.max(...entries.map(([, v]) => v), 0);
  const colorByRegion = new Map<MuscleRegion, string>(
    entries.map(([region, count]) => [region, muscleHeatColor(max > 0 ? count / max : 0)]),
  );
  const countByRegion = new Map<MuscleRegion, number>(entries);
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const windowLabel = MUSCLE_LOAD_WINDOW_OPTIONS.find((o) => o.days === windowDays)?.label ?? "28d";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Muscle Load Map</CardTitle>
            <CardDescription>
              Last {windowDays} days of logged sets by muscle group, weighted by primary vs.
              secondary role in each exercise. Color is relative to{" "}
              {athleteId ? "this athlete's" : "your"} own busiest region.
            </CardDescription>
          </div>
          <RadioChipGroup
            label=""
            className="[&>p]:hidden"
            options={MUSCLE_LOAD_WINDOW_OPTIONS.map((o) => o.label)}
            value={windowLabel}
            onChange={(label) => {
              const match = MUSCLE_LOAD_WINDOW_OPTIONS.find((o) => o.label === label);
              if (match) {
                setWindowDays(match.days);
                setOpenGroup(null);
              }
            }}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isError ? (
          // "No sets logged in the last N days" is what this map says about somebody who has
          // been resting. Saying it when the request failed turns a loading problem into a
          // training-history claim, on the screen a coach uses to see what an athlete has
          // already hammered this week.
          <ReadFailed what="this training load" onRetry={() => void refetch()} />
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No sets logged in the last {windowDays} days -- try a wider window.
          </p>
        ) : (
          <>
            {/* FRONT AND BACK, SIDE BY SIDE AND BIG, with every group labelled off the figure.
                Scott, 2026-09-23: "give me little lines with what the muscle groups are
                connecting them, I can click on the group, or click on the name, to pop up those
                exercises."

                The set count rides on the label, so the week reads without tapping anything --
                the tap is for the next question (doing what?), not for the first one. */}
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              {(["front", "back"] as const).map((view) => (
                <div key={view} className="flex min-w-0 flex-col gap-1.5">
                  <BodyMap
                    view={view}
                    fills={fillsForBodyMap(colorByRegion)}
                    selected={openGroup}
                    onSelect={(g) => setOpenGroup((cur) => (cur === g ? null : g))}
                    leaders={BODY_MAP_LEADERS[view]}
                    captionFor={(g) => {
                      const region = GROUP_TO_REGION[g];
                      const count = region ? countByRegion.get(region) : undefined;
                      return count ? `${Math.round(count)} sets` : "none logged";
                    }}
                    className="max-h-[58vh]"
                  />
                  <p className="text-center text-[10px] uppercase tracking-wide text-muted-foreground">
                    {view}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
              {sorted.slice(0, 6).map(([region, count]) => (
                <span key={region} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: muscleHeatColor(max > 0 ? count / max : 0) }}
                  />
                  {MUSCLE_REGION_LABEL[region]}
                  <span className="tabular-nums opacity-70">{Math.round(count)}</span>
                </span>
              ))}
            </div>

            {/* WHAT PUT THE LOAD THERE. The card could always say a muscle was the hottest thing
                the athlete owns and then stop; this is the answer to the obvious next question,
                and it is the reason a coach opens this card at all. */}
            <MuscleExerciseList
              group={openGroup}
              region={openGroup ? GROUP_TO_REGION[openGroup] : undefined}
              sets={openGroup ? countByRegion.get(GROUP_TO_REGION[openGroup]) : undefined}
              colour={openGroup ? colorByRegion.get(GROUP_TO_REGION[openGroup]) : undefined}
              rows={(data?.exercises ?? []).filter((e) => e.group === openGroup)}
              windowDays={windowDays}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The list under the figure: what the athlete actually did to make this muscle hot.
 *
 * SECONDARY ROWS SHOW THE FULL SET COUNT, not the halved one. The group total weights a
 * secondary muscle at half a set, which is right for a heat colour and wrong for a list: nobody
 * performed "1.5 sets of bench press". The athlete did three, and some of it reached the
 * shoulders. The role word says which, and the total above it is still the weighted one -- so
 * the rows will not sum to the header, deliberately, and the header says what it is.
 */
function MuscleExerciseList({
  group,
  region,
  sets,
  colour,
  rows,
  windowDays,
}: {
  group: string | null;
  region?: MuscleRegion;
  sets?: number;
  colour?: string;
  rows: { name: string; role: "primary" | "secondary"; sets: number }[];
  windowDays: number;
}) {
  if (!group) {
    return (
      <p className="mt-3 rounded-md border border-border bg-surface-elevated px-3 py-3 text-center text-xs text-muted-foreground">
        Tap a muscle or a name to see what has been training it.
      </p>
    );
  }
  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border bg-surface-elevated">
      <div className="flex items-baseline gap-2 border-b border-border px-3 py-2.5">
        <span className="h-2.5 w-2.5 shrink-0 self-center rounded-sm" style={{ background: colour ?? GRAY }} />
        <h4 className="text-sm font-semibold">{region ? MUSCLE_REGION_LABEL[region] : group}</h4>
        <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
          {sets ? `${Math.round(sets)} sets` : "none logged"} &middot; last {windowDays} days
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          Nothing logged for this one in the last {windowDays} days.
        </p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li
              key={`${r.role}-${r.name}`}
              className="flex items-baseline gap-2 px-3 py-2 text-sm [&+li]:border-t [&+li]:border-border"
            >
              <span className="min-w-0 truncate">{r.name}</span>
              <span className="shrink-0 rounded border border-border px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {r.role}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-xs text-muted-foreground">
                {r.sets} sets
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
