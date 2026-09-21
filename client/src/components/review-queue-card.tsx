import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Film, VideoOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ReadFailed } from "@/components/read-failed";
import { getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type QueueRow = {
  id: number;
  athleteId: number;
  athleteName: string;
  setId: number;
  note: string | null;
  createdAt: string;
  exerciseName: string;
  setNumber: number | null;
  date: string | null;
  clipAvailable: boolean;
};

function ageInDays(iso: string): number | null {
  try {
    return differenceInCalendarDays(new Date(), parseISO(iso));
  } catch {
    return null;
  }
}

/**
 * CLIPS WAITING FOR THE COACH -- Phase 4b of docs/video-review-plan.md.
 *
 * OLDEST FIRST, and the age is on every row. That is the whole difference between a queue and
 * a feed: the ask that has been waiting eleven days is the one that has gone wrong, and a
 * newest-first list buries it under this morning's. The server orders it; this only says how
 * long, because a date the reader has to subtract from today is not an answer.
 *
 * A row whose clip is gone still appears, marked. Retention takes the file, not the ask, and a
 * request that silently vanished would be the longest-waiting one.
 */
export function ReviewQueueCard() {
  const queue = useQuery<QueueRow[]>({
    queryKey: ["/api/coach/video-review-requests"],
    queryFn: () => getJson("/api/coach/video-review-requests"),
  });

  // isError before any emptiness claim: "nobody has asked" and "we could not ask" are
  // different things, and a coach reading the second as the first thinks they are caught up.
  if (queue.isError) {
    return (
      <Card>
        <CardContent className="py-6">
          <ReadFailed what="your review queue" onRetry={() => void queue.refetch()} />
        </CardContent>
      </Card>
    );
  }

  const rows = queue.data ?? [];
  if (!queue.isLoading && rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Clips waiting for you{rows.length > 0 ? ` (${rows.length})` : ""}
        </CardTitle>
        <CardDescription>Oldest first — your athletes asked you to look at these.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {queue.isLoading ? (
          <div className="h-16 w-full animate-pulse rounded-lg bg-surface" />
        ) : (
          rows.map((r) => {
            const age = ageInDays(r.createdAt);
            return (
              <Link
                key={r.id}
                href={`/coach/roster/${r.athleteId}`}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted"
              >
                {r.clipAvailable ? (
                  <Film className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <VideoOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {r.athleteName} — {r.exerciseName}
                    {r.setNumber != null ? ` · Set ${r.setNumber}` : ""}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.note
                      ? r.note
                      : r.date
                        ? `Filmed ${format(parseISO(r.date), "MMM d")}`
                        : "Asked for a look"}
                    {r.clipAvailable ? "" : " · clip no longer available"}
                  </span>
                </span>
                {age != null && (
                  <span
                    className={cn(
                      "shrink-0 text-xs font-semibold",
                      age >= 7 ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {age === 0 ? "today" : age === 1 ? "1 day" : `${age} days`}
                  </span>
                )}
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
