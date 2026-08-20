import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { Crown } from "lucide-react";
import { ExerciseTrendDialog } from "@/components/exercise-trend-dialog";

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

  const { data, isLoading } = useQuery<PrEntry[]>({
    queryKey: ["/api/athlete/pr-history"],
    queryFn: () => getJson("/api/athlete/pr-history"),
  });

  return (
    <AppShell title="Full Lift History">
      <p className="mb-6 text-sm text-muted-foreground">
        Every exercise's most recent PR, most recent first -- tap one to see the trend.
      </p>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      ) : (
        <Card>
          <CardContent className="space-y-2 p-4">
            {!data?.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Log some sets to start tracking PRs.
              </p>
            )}
            {data?.map((pr, i) => (
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
