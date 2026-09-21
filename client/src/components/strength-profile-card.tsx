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
  /** The server's own sentence for the group, so the claim on screen and the group the query
   * actually used cannot drift into describing different things. */
  cohortLabel: string;
  /** What can be offered to THIS athlete -- somebody with no sport on file gets no sport
   * toggle rather than a toggle that does nothing. */
  available: { gender: boolean; sport: boolean };
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
function CohortChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function StrengthProfileCard({ fetchUrl }: { fetchUrl: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"front" | "back">("front");

  // Starts broad. The default is the comparison that fills up soonest and assumes least;
  // narrowing is something the athlete asks for.
  const [cohort, setCohort] = useState({ gender: false, sport: false });
  const query = `${fetchUrl}?gender=${cohort.gender}&sport=${cohort.sport}`;

  const { data, isLoading, isError, refetch } = useQuery<Profile>({
    queryKey: [query],
    queryFn: () => getJson(query),
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
            {/* NARROWING, stacked the way somebody thinks about it: everyone my age, then my
                own gender, then my own sport. Rendered OUTSIDE the empty/scored branch on
                purpose -- narrowing to a thin cohort shows no number, and taking away the
                control that undoes it would strand the athlete there. */}
            {(data.available.gender || data.available.sport) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Compare against</span>
                <CohortChip
                  label="Everyone my age"
                  active={!cohort.gender && !cohort.sport}
                  onClick={() => setCohort({ gender: false, sport: false })}
                />
                {data.available.gender && (
                  <CohortChip
                    label="My gender"
                    active={cohort.gender}
                    onClick={() => setCohort((c) => ({ ...c, gender: !c.gender }))}
                  />
                )}
                {data.available.sport && (
                  <CohortChip
                    label="My sport"
                    active={cohort.sport}
                    onClick={() => setCohort((c) => ({ ...c, sport: !c.sport }))}
                  />
                )}
              </div>
            )}

            {scored.length === 0 ? (
              // Said plainly, with the reason. A blank card reads as "you have done nothing".
              <p className="text-sm text-muted-foreground">
                {data.ageBand == null
                  ? "Add your date of birth to compare against athletes your age."
                  : `Not enough ${data.cohortLabel} on Forge yet to compare fairly.${
                      cohort.gender || cohort.sport
                        ? " Widen the comparison above to see where you stand."
                        : " Your lifts are still being recorded."
                    }`}
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
                  Compared with {data.cohortSize} {data.cohortLabel} on Forge, using your best
                  logged lift on each movement relative to your bodyweight. Names are never
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
