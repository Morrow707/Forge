/**
 * Two coach-only notes on an athlete's page (2026-11-22), both reference only and never blocking:
 *   - SingleSportYearNote: the athlete's programs have been for one sport for more than 8 of the
 *     last 12 months (shared/single-sport-year.ts). Nothing is said to the athlete.
 *   - ThrowingWorkloadPanel: pitches per week and innings, from "Pitching (Game)", "Bullpen" and
 *     "Catching (Game)" sets, beside Forge's notes from published guidance for youth pitchers
 *     (shared/throwing-workload.ts).
 */
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ReadFailed } from "@/components/read-failed";
import {
  BULLPEN_EXERCISE,
  CATCHING_GAME_EXERCISE,
  PITCHING_GAME_EXERCISE,
  type ThrowingNote,
  type ThrowingWeek,
} from "@shared/throwing-workload";
import { useT } from "@/i18n";

type SingleSport = { note: { sport: string; months: number; text: string } | null };
type Throwing = { weeks: ThrowingWeek[]; inningsLastYear: number; notes: ThrowingNote[]; guide: string[]; hasAny: boolean };

export function SingleSportYearNote({ athleteId }: { athleteId: number }) {
  const { data } = useQuery<SingleSport>({ queryKey: [`/api/coach/roster/${athleteId}/single-sport-note`] });
  if (!data?.note) return null;
  return (
    <p className="mb-3 flex items-start gap-1.5 rounded-md border border-border bg-surface-elevated p-2 text-xs text-muted-foreground" data-testid="text-single-sport-note">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {data.note.text}
    </p>
  );
}

const WEEK_LABEL: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };

export function ThrowingWorkloadPanel({ athleteId }: { athleteId: number }) {
  const t = useT();
  const { data, isError, refetch } = useQuery<Throwing>({ queryKey: [`/api/coach/roster/${athleteId}/throwing`] });
  if (isError) {
    return (
      <Card>
        <CardContent className="p-5">
          <ReadFailed what={t("the throwing history")} onRetry={() => void refetch()} />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;
  return (
    <Card data-testid="panel-throwing-workload">
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="text-sm font-semibold">{t("Throwing workload")}</p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Log a game as one set of {pitching} per inning with reps as the pitches, a bullpen as one set of {bullpen}, and an inning caught as one set of {catching}.",
              {
                pitching: t.exercise(PITCHING_GAME_EXERCISE),
                bullpen: t.exercise(BULLPEN_EXERCISE),
                catching: t.exercise(CATCHING_GAME_EXERCISE),
              },
            )}
          </p>
        </div>
        {data.notes.length > 0 && (
          <div className="space-y-1 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
            {data.notes.map((n) => (
              <p key={n.kind}>{n.text}</p>
            ))}
          </div>
        )}
        {data.hasAny ? (
          <>
            <p className="text-xs">
              {t("Innings pitched in the last year:")} <span className="font-semibold">{data.inningsLastYear}</span>
            </p>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">{t("Week of")}</th>
                    <th className="py-1 pr-2 font-medium">{t("Pitches")}</th>
                    <th className="py-1 pr-2 font-medium">{t("Innings")}</th>
                    <th className="py-1 pr-2 font-medium">{t("Top game")}</th>
                    <th className="py-1 font-medium">{t("Caught")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weeks.map((w) => (
                    <tr key={w.weekOf} className="border-t border-border/60">
                      <td className="py-1 pr-2">{new Date(`${w.weekOf}T00:00:00Z`).toLocaleDateString(undefined, WEEK_LABEL)}</td>
                      <td className="py-1 pr-2">{w.pitches}</td>
                      <td className="py-1 pr-2">{w.innings}</td>
                      <td className="py-1 pr-2">{w.topGamePitches}</td>
                      <td className="py-1">{w.catchingInnings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t("No pitching, bullpen or catching logged in the last year.")}</p>
        )}
        <div className="space-y-0.5 text-[11px] text-muted-foreground">
          {data.guide.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
