import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { Crown, Dumbbell, CalendarCheck, Flame } from "lucide-react";

type ProgressSummary = {
  totalWorkoutsCompleted: number;
  workoutsThisMonth: number;
  recentPRs: { exerciseName: string; weight: number; unit: string; reps: string; date: string }[];
  currentLifts: { exerciseName: string; weight: string; unit: string; reps: string; date: string }[];
};

export default function AthleteProgress() {
  const { data, isLoading } = useQuery<ProgressSummary>({
    queryKey: ["/api/athlete/progress"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/athlete/progress");
      return res.json();
    },
  });

  return (
    <AppShell title="My Progress">
      <p className="mb-6 text-sm text-muted-foreground">
        A quick look at your own numbers -- for the full breakdown (velocity trends, bar path,
        team rankings), ask your coach.
      </p>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-3xl font-bold">
                    {data?.totalWorkoutsCompleted ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Workouts completed all-time</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-3xl font-bold">
                    {data?.workoutsThisMonth ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Workouts this month</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  Recent PRs
                </CardTitle>
                <CardDescription>Your latest personal records, most recent first.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!data?.recentPRs.length && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Log some sets to start tracking PRs.
                  </p>
                )}
                {data?.recentPRs.map((pr, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="font-semibold">{pr.exerciseName}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(pr.date), "MMM d, yyyy")}
                      </p>
                    </div>
                    <p className="font-display text-lg font-bold text-primary">
                      {pr.weight} {pr.unit} × {pr.reps}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Dumbbell className="h-5 w-5 text-primary" />
                  Your Lifts
                </CardTitle>
                <CardDescription>Most recently logged set for each exercise.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!data?.currentLifts.length && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nothing logged yet.
                  </p>
                )}
                {data?.currentLifts.map((lift, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="font-semibold">{lift.exerciseName}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(lift.date), "MMM d, yyyy")}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-muted-foreground">
                      {lift.weight} {lift.unit} × {lift.reps}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
