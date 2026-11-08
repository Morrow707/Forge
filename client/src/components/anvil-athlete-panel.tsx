import { useQuery } from "@tanstack/react-query";
import { ReadFailed } from "@/components/read-failed";
import { Skeleton } from "@/components/skeleton";
import { getJson } from "@/lib/queryClient";
import { ANVIL_ACCURACY_CAVEAT } from "@shared/anvil-agreement";
import type { AnvilReading } from "@shared/anvil-reading";

/**
 * ONE ATHLETE'S ANVIL, ON THEIR COACH'S PAGE.
 *
 * The roster week shows everybody over seven days; this is the longer window for the one person
 * a coach has opened. It exists as a panel rather than only as a route because a route nothing
 * calls is dead code that looks live -- and the day somebody wires it, the guards inside it go
 * from unexercised to load-bearing in one commit.
 *
 * **NOTHING IS ASSERTED HERE.** The weekly verdict is on the roster page, where it needs two of
 * three channels; this is the daily reading, which states a number and where it sat against that
 * person's own band.
 */

type Day = {
  id: number;
  date: string;
  counts: boolean;
  window: string;
  reading: AnvilReading;
};

export function AnvilAthletePanel({
  athleteId,
  athleteName,
}: {
  athleteId: number;
  athleteName: string;
}) {
  const { data, isLoading, isError, refetch, error } = useQuery<{ days: Day[] }>({
    queryKey: [`/api/coach/roster/${athleteId}/anvil`],
    queryFn: () => getJson(`/api/coach/roster/${athleteId}/anvil?days=28`),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (isError) {
    return (
      <ReadFailed
        what={`${athleteName}'s Anvil checks`}
        onRetry={() => void refetch()}
        error={error}
      />
    );
  }

  const days = data?.days ?? [];
  return (
    <div className="space-y-2 border-t border-border pt-4" data-testid="anvil-athlete-panel">
      <p className="text-sm font-medium">The Anvil · last 28 days</p>
      {days.length === 0 ? (
        // NOT "nothing to report". Most accounts have not accepted the agreement, and a coach
        // reading an empty panel should know which of the two it is.
        <p className="text-sm text-muted-foreground">
          {athleteName} hasn't taken the Anvil in this window. It is adults-only while its
          paperwork is being reviewed, and each person accepts it on their own account.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {days
              .slice()
              .reverse()
              .map((d) => (
                <div key={d.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{d.date}</span>
                  <span className="font-medium tabular-nums">
                    {d.reading.numbers.medianMs == null
                      ? "no trials"
                      : `${Math.round(d.reading.numbers.medianMs)} ms`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {d.reading.comparison.kind === "compared"
                      ? `${d.reading.comparison.medianZ >= 0 ? "+" : ""}${d.reading.comparison.medianZ.toFixed(2)} SD vs own normal`
                      : d.reading.comparison.kind === "learning"
                        ? `learning their normal (${d.reading.comparison.have} of ${d.reading.comparison.need})`
                        : "no spread in their own history yet"}
                    {d.window !== "in_window" &&
                      (d.window === "practice" ? " · practice run" : " · outside the window")}
                    {!d.counts && d.window === "in_window" && " · second attempt"}
                  </span>
                </div>
              ))}
          </div>
          <p className="text-[11px] text-muted-foreground">{ANVIL_ACCURACY_CAVEAT}</p>
        </>
      )}
    </div>
  );
}
