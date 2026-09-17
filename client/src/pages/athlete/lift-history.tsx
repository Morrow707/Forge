import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { Crown } from "lucide-react";
import { ExerciseTrendDialog } from "@/components/exercise-trend-dialog";
import { PinnedExercisePicker } from "@/components/pinned-exercise-picker";
import { ReadFailed } from "@/components/read-failed";

type PrEntry = {
  exerciseId: number;
  exerciseName: string;
  weight: number;
  unit: string;
  reps: string;
  date: string;
};

/** Full, uncapped version of the Progress page's Recent PRs card -- every
 * exercise's most recent PR at any rep count, most-recent-first, not just
 * the top 5. Same click-through to a per-exercise trend as the card it's
 * linked from. */
export default function AthleteLiftHistory() {
  const [trendExercise, setTrendExercise] = useState<{ id: number; name: string } | null>(null);
  const [liftFilter, setLiftFilter] = useState("");

  const { data, isLoading, isError, refetch } = useQuery<PrEntry[]>({
    queryKey: ["/api/athlete/pr-history"],
    queryFn: () => getJson("/api/athlete/pr-history"),
  });

  // Same pinned major-lift tabs the coach analytics page uses, driven off
  // this athlete's own PR history rather than a roster query. The list is
  // already every exercise they've set a PR on, so it needs no extra
  // request: a pinned lift with no history renders dimmed (still tappable,
  // landing on the empty state below) exactly as it does for a coach.
  const trackedNames = Array.from(new Set((data ?? []).map((pr) => pr.exerciseName)));
  const visible = liftFilter ? (data ?? []).filter((pr) => pr.exerciseName === liftFilter) : (data ?? []);

  return (
    <AppShell title="Full Lift History">
      <p className="mb-6 text-sm text-muted-foreground">
        Every exercise's most recent PR, most recent first -- tap one to see the trend.
      </p>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      ) : (
        <Card>
          <CardContent className="space-y-4 p-4">
            <PinnedExercisePicker
              options={trackedNames}
              value={liftFilter}
              onChange={setLiftFilter}
            />
            {isError && <ReadFailed what="your PR history" onRetry={() => void refetch()} />}
            {!isError && !data?.length && (
              // "Log some sets to start tracking PRs" told an athlete who has set PRs for years
              // that they have none, on any request that failed.
              <p className="py-6 text-center text-sm text-muted-foreground">
                Log some sets to start tracking PRs.
              </p>
            )}
            {!!data?.length && visible.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No sets logged for {liftFilter} yet.
              </p>
            )}
            <div className="space-y-2">
              {visible.map((pr, i) => (
              <Button
                key={i}
                variant="ghost"
                className="h-auto w-full items-center justify-between gap-1 rounded-md border border-border p-3 text-left font-normal hover:border-primary/50 hover:bg-surface"
                onClick={() => setTrendExercise({ id: pr.exerciseId, name: pr.exerciseName })}
              >
                <div>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Crown className="h-4 w-4 shrink-0 text-primary" />
                    {pr.exerciseName}
                  </p>
                  <p className="text-xs text-muted-foreground">{format(parseISO(pr.date), "MMM d, yyyy")}</p>
                </div>
                <p className="font-display text-lg font-bold text-primary">
                  {pr.weight} {pr.unit} × {pr.reps}
                </p>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <ExerciseTrendDialog
        exercise={trendExercise}
        onOpenChange={(open) => {
          if (!open) setTrendExercise(null);
        }}
      />
    </AppShell>
  );
}
