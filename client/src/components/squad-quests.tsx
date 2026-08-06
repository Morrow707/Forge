import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getJson } from "@/lib/queryClient";
import { Trophy } from "lucide-react";
import { format, parseISO } from "date-fns";
import { CHALLENGE_METRIC_LABEL, type TeamChallenge } from "@/lib/team-challenges";

/** Read-only for athletes -- team challenges are created and removed by the
 * coach only. Shows every quest for every team the athlete belongs to. */
export function SquadQuests() {
  const { data: challenges = [] } = useQuery<TeamChallenge[]>({
    queryKey: ["/api/athlete/team-challenges"],
    queryFn: () => getJson("/api/athlete/team-challenges"),
  });

  if (challenges.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          Squad Quests
        </CardTitle>
        <CardDescription>Your team's shared push -- everyone's sets count toward it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {challenges.map((c) => (
          <div key={c.id} className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{c.title}</p>
                <p className="text-xs text-muted-foreground">
                  {c.teamName} · {CHALLENGE_METRIC_LABEL[c.metric]} ·{" "}
                  {format(parseISO(c.startDate), "MMM d")}–{format(parseISO(c.endDate), "MMM d")}
                </p>
              </div>
            </div>
            <div className="mt-2">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-2xl font-bold text-primary">
                  {c.progress.teamTotal.toLocaleString()}
                </span>
                {c.progress.target != null && (
                  <span className="text-xs text-muted-foreground">
                    of {c.progress.target.toLocaleString()} goal
                  </span>
                )}
              </div>
              {c.progress.target != null && (
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-success transition-all"
                    style={{
                      width: `${Math.min(100, (c.progress.teamTotal / c.progress.target) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
            {c.progress.perAthlete.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {c.progress.perAthlete.map((a) => (
                  <div
                    key={a.athleteId}
                    className="flex items-center justify-between text-xs text-muted-foreground"
                  >
                    <span className="truncate">{a.name}</span>
                    <span className="shrink-0 font-semibold">{a.contribution.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
