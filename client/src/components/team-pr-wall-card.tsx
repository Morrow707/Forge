import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow, parseISO } from "date-fns";
import { getJson } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AthleteAvatar } from "@/components/athlete-avatar";
import { Trophy } from "lucide-react";

type RecentPr = {
  id: number;
  athleteId: number;
  athleteName: string;
  exerciseName: string;
  date: string;
  reps: string | null;
  weight: string | null;
  weightUnit: string;
};

/** Coach dashboard's "Team PR Wall" -- the most recent isPr-flagged sets
 * across the whole roster, newest first (see getRecentPrsForCoach in
 * server/storage.ts). Its own query, same as the other dashboard widgets,
 * so a slow request never blocks the rest of the page. Renders nothing
 * while the first fetch is in flight and a real (not hidden) empty state
 * when the roster genuinely has no PRs in the recent window, same pattern
 * WeeklyDigestCard uses for its "quiet week" state. */
export function TeamPrWallCard() {
  const { data } = useQuery<RecentPr[]>({
    queryKey: ["/api/coach/recent-prs"],
    queryFn: () => getJson("/api/coach/recent-prs"),
    staleTime: 5 * 60 * 1000,
  });

  if (!data) return null;

  return (
    <Card className="flex flex-col">
      <CardHeader className="p-3 md:p-4">
        <CardTitle className="flex items-center gap-2 text-base md:text-lg">
          <Trophy className="h-4 w-4 text-primary" />
          Team PR Wall
        </CardTitle>
        <CardDescription>Recent personal records across your roster.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0 md:p-4 md:pt-0">
        {data.length === 0 ? (
          <p className="py-1 text-sm text-muted-foreground">
            No PRs logged across your roster in the last 30 days.
          </p>
        ) : (
          data.map((pr) => (
            <Link key={pr.id} href={`/coach/roster/${pr.athleteId}`}>
              <div className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-2.5 transition-colors hover:bg-surface-elevated">
                <AthleteAvatar name={pr.athleteName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{pr.athleteName}</p>
                  <p className="truncate text-xs text-muted-foreground">{pr.exerciseName}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-sm font-bold tabular-nums text-primary">
                    {pr.weight} {pr.weightUnit}
                    {pr.reps ? ` × ${pr.reps}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(parseISO(pr.date), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
