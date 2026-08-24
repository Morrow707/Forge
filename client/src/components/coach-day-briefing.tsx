import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { WellnessBadge, AcwrBadge, HealthStatusToggle } from "@/components/athlete-status-badges";
import { WellnessHistoryDialog } from "@/components/wellness-history-dialog";
import { AcwrHistoryDialog } from "@/components/acwr-history-dialog";
import { Target, MoonStar, Dumbbell, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReadinessLevel } from "@shared/wellness";
import type { AcwrRiskLevel } from "@shared/load";

type BriefingExercise = { name: string; sets: number; reps: string; weight: string | null };
type BriefingEntry = {
  kind: "exercise" | "skill";
  title: string;
  isRestDay: boolean;
  exercises: BriefingExercise[];
  correctives: string[];
};
type AthleteBriefing = {
  athleteId: number;
  athleteName: string;
  healthStatus: "healthy" | "hurt";
  readiness: { score: number; level: ReadinessLevel } | null;
  acwr: { ratio: number | null; level: AcwrRiskLevel } | null;
  entries: BriefingEntry[];
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** The coach calendar's "Today" tab -- a dense, per-athlete daily briefing
 * (what they're training, correctives, injury/health status, readiness,
 * recovery/ACWR risk) instead of the generic grouped-by-program list every
 * other calendar view uses. ACWR is deliberately only shown when `date` is
 * actually today -- it's a live "right now" risk snapshot (see
 * getRosterAcwrSummary), not something that can be shown historically for
 * a past date without being misleading. */
export function CoachDayBriefing({ date }: { date: string }) {
  const [historyAthlete, setHistoryAthlete] = useState<{ id: number; name: string } | null>(null);
  const [historyView, setHistoryView] = useState<"wellness" | "acwr" | null>(null);

  const { data = [], isLoading } = useQuery<AthleteBriefing[]>({
    queryKey: ["/api/coach/day-briefing", date],
    queryFn: () => getJson(`/api/coach/day-briefing?date=${date}`),
  });

  const isRealToday = date === todayIso();

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-lg bg-surface" />;
  }

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">No athletes on your roster yet.</p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((a) => (
          <div key={a.athleteId} className="rounded-lg border border-border bg-surface p-3">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-auto truncate text-sm font-semibold">{a.athleteName}</span>
              <HealthStatusToggle athleteId={a.athleteId} status={a.healthStatus} />
              <WellnessBadge
                entry={a.readiness ?? undefined}
                onClick={() => {
                  setHistoryAthlete({ id: a.athleteId, name: a.athleteName });
                  setHistoryView("wellness");
                }}
              />
              {isRealToday && (
                <AcwrBadge
                  entry={a.acwr ?? undefined}
                  onClick={() => {
                    setHistoryAthlete({ id: a.athleteId, name: a.athleteName });
                    setHistoryView("acwr");
                  }}
                />
              )}
            </div>

            {a.entries.length === 0 && (
              <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
            )}

            <div className="space-y-2">
              {a.entries.map((e, i) => (
                <div key={i} className="text-xs">
                  {e.isRestDay ? (
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <MoonStar className="h-3 w-3 shrink-0" />
                      {e.title || "Rest day"}
                    </p>
                  ) : (
                    <>
                      <p
                        className={cn(
                          "flex items-center gap-1 font-semibold",
                          e.kind === "skill" ? "text-teal-400" : "text-foreground",
                        )}
                      >
                        {e.kind === "skill" ? (
                          <Target className="h-3 w-3 shrink-0" />
                        ) : (
                          <Dumbbell className="h-3 w-3 shrink-0" />
                        )}
                        {e.title}
                      </p>
                      {e.exercises.length > 0 && (
                        <p className="mt-0.5 text-muted-foreground">
                          {e.exercises.map((ex) => `${ex.name} ${ex.sets}x${ex.reps}`).join(" · ")}
                        </p>
                      )}
                    </>
                  )}
                  {e.correctives.length > 0 && (
                    <p className="mt-0.5 flex items-center gap-1 text-amber-500">
                      <Stethoscope className="h-3 w-3 shrink-0" />
                      {e.correctives.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <WellnessHistoryDialog
        open={historyView === "wellness" && historyAthlete != null}
        onOpenChange={(open) => !open && setHistoryView(null)}
        athleteName={historyAthlete?.name ?? ""}
        fetchUrl={`/api/coach/roster/${historyAthlete?.id}/wellness-history`}
      />
      <AcwrHistoryDialog
        open={historyView === "acwr" && historyAthlete != null}
        onOpenChange={(open) => !open && setHistoryView(null)}
        athleteName={historyAthlete?.name ?? ""}
        fetchUrl={`/api/coach/roster/${historyAthlete?.id}/acwr-history`}
      />
    </>
  );
}
