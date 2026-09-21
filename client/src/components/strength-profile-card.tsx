import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, TrendingUp, Navigation } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ReadFailed } from "@/components/read-failed";
import { BodyMap } from "@/components/body-map";
import { getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { bandForScore, balanceHint, overallScore, MOVEMENT_FOR_GROUP } from "@shared/strength-score";

type GroupRow = {
  group: string;
  ratio: number | null;
  percentile: number | null;
  peerCount?: number;
  exerciseName: string | null;
};
type Profile = {
  ageBand: string | null;
  cohortSize: number;
  groups: GroupRow[];
};

/**
 * THE STRENGTH PROFILE -- where each muscle group sits against peers the same age.
 *
 * The score IS the percentile. There is no separate absolute standard, because Forge has no
 * validated standards table and inventing one would be exactly the uncalibrated-number problem
 * the camera work spent months apologising for. "Ahead of 68% of athletes your age" is a claim
 * this data can actually support; "Advanced II on a world scale" is not.
 *
 * COMPACT BY DEFAULT, EXPANDING ON TAP (Scott's own suggestion): the figure is a readout rather
 * than a control here, so it can start small in a corner of the profile and open when somebody
 * wants it, without pushing the rest of the page down for everyone.
 */
export function StrengthProfileCard({ fetchUrl }: { fetchUrl: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"front" | "back">("front");

  const { data, isLoading, isError, refetch } = useQuery<Profile>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });

  // isError before any emptiness claim: "you have not trained this" and "we could not ask" are
  // different sentences, and the second read as the first tells somebody their work is gone.
  if (isError) {
    return (
      <Card>
        <CardContent className="py-6">
          <ReadFailed what="your strength profile" onRetry={() => void refetch()} />
        </CardContent>
      </Card>
    );
  }
  if (isLoading || !data) {
    return <div className="h-24 w-full animate-pulse rounded-lg bg-surface" />;
  }

  const scored = data.groups.filter((g) => g.percentile != null);
  const overall = overallScore(data.groups.map((g) => ({ score: g.percentile })));
  const sorted = [...scored].sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0));
  const strongest = sorted[0] ? { group: sorted[0].group, score: sorted[0].percentile! } : null;
  const weakest = sorted.length > 1
    ? { group: sorted[sorted.length - 1].group, score: sorted[sorted.length - 1].percentile! }
    : null;
  const hint = balanceHint(strongest, weakest);

  // Tint only what has been scored. An unscored group stays neutral rather than reading as
  // zero -- an athlete who has never trained calves is not weak there, they are unmeasured.
  const fills: Record<string, string> = {};
  for (const g of scored) fills[g.group] = bandForScore(g.percentile!).color;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 text-left"
        >
          <div className="h-16 w-10 shrink-0 text-muted-foreground">
            <BodyMap view="front" fills={fills} />
          </div>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Strength profile</span>
            <span className="block text-xs text-muted-foreground">
              {overall == null
                ? "Log a few lifts to see where you stand"
                : `Ahead of ${overall}% of athletes your age, on average`}
            </span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="space-y-3 border-t border-border pt-3">
            {scored.length === 0 ? (
              // Said plainly, with the reason. A blank card reads as "you have done nothing".
              <p className="text-sm text-muted-foreground">
                {data.ageBand == null
                  ? "Add your date of birth to compare against athletes your age."
                  : `Not enough athletes in the ${data.ageBand} group yet to compare fairly. Your lifts are still being recorded.`}
              </p>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="h-48 flex-1 text-muted-foreground">
                    <BodyMap view={view} fills={fills} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {sorted.map((g) => {
                      const band = bandForScore(g.percentile!);
                      return (
                        <div key={g.group} className="flex items-center gap-2 text-sm">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: band.color }}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {MOVEMENT_FOR_GROUP[g.group] ?? g.group}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {g.percentile}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex overflow-hidden rounded-md border border-border text-xs">
                  {(["front", "back"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      aria-pressed={view === v}
                      className={cn(
                        "flex-1 px-3 py-1 capitalize",
                        view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>

                {hint && (
                  <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm">
                    <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {hint}
                  </p>
                )}

                {/* What the number actually means, in the athlete's own words rather than a
                    statistics lesson -- and the sample size, because a percentile without one
                    is a claim with its uncertainty hidden. */}
                <p className="text-xs text-muted-foreground">
                  Compared with {data.cohortSize} athletes aged {data.ageBand} on Forge, using your
                  best logged lift on each movement relative to your bodyweight. Names are never
                  shown or ranked — only where you sit in the spread.
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
