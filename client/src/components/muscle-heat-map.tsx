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
} from "@shared/muscle-map";

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
  const { data: rawByGroup, isLoading, isError, refetch } = useQuery<Record<string, number>>({
    queryKey: ["muscle-load", athleteId ?? "self", windowDays],
    queryFn: () => getJson(path),
  });

  if (isLoading && !rawByGroup) {
    return <div className="h-24 animate-pulse rounded-md bg-surface" />;
  }

  const byRegion = rollUpMuscleLoad(rawByGroup ?? {});
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
              if (match) setWindowDays(match.days);
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
          <div className="grid gap-4 sm:grid-cols-[auto_auto_1fr] sm:items-start">
            <div className="mx-auto w-32 sm:w-36">
              <BodyMap view="front" fills={fillsForBodyMap(colorByRegion)} className="text-muted-foreground" />
              <p className="mt-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
                Front
              </p>
            </div>
            <div className="mx-auto w-32 sm:w-36">
              <BodyMap view="back" fills={fillsForBodyMap(colorByRegion)} className="text-muted-foreground" />
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
        )}
      </CardContent>
    </Card>
  );
}
