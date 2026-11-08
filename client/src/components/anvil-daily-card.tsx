import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReadFailed } from "@/components/read-failed";
import { Skeleton } from "@/components/skeleton";
import { getJson } from "@/lib/queryClient";
import { useAnvilAccess } from "@/hooks/anvil-access";
import { useAuth } from "@/hooks/use-auth";
import { anvilRoutesFor } from "@shared/anvil-routes";
import { estimatedLabel } from "@shared/anvil-tasks";
import { localMinutesFrom, windowLabelFor } from "@shared/anvil-window";
import type { AnvilReading } from "@shared/anvil-reading";

/**
 * THE DASHBOARD CARD. One line of state and one button.
 *
 * **IT DRAWS NOTHING UNTIL THE ANSWER ARRIVES, AND NOTHING AT ALL FOR SOMEBODY WHO MAY NOT TAKE
 * IT.** The Anvil is adults-only while four counsel questions are open, so a card that flashed
 * onto a seventeen-year-old's dashboard and then vanished would be worse than no card -- the
 * tri-state rule `useIsFreeAgent` already states in words, and the bug the 2026-10-24 sweep found
 * on three surfaces: `undefined` is "not yet", never "no".
 *
 * A refusal is deliberately SILENT here and spoken on the page itself. A dashboard is not where
 * somebody should learn that their account is held out of something; a card saying so on every
 * visit is a daily reminder nobody asked for.
 */

type TodayResponse = {
  window: { opensMinutes: number; closesMinutes: number };
  attemptsToday: number;
  countsTodayId: number | null;
  check: { id: number } | null;
  reading: AnvilReading | null;
};

function localDateIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/**
 * The href is RESOLVED FROM THE ROLE, never passed in. This card is rendered on three different
 * dashboards and each Anvil route is declared for exactly one role, so a prop is a chance for one
 * call site to hand a coach the athlete's path -- which does not degrade, it refuses, and reads
 * as a session problem rather than a typo. `shared/anvil-routes.ts` is the one map and a test
 * holds every path in it against the router.
 */
export function AnvilDailyCard() {
  const { user } = useAuth();
  const { access, loading } = useAnvilAccess();
  const routes = anvilRoutesFor(user?.role ?? "");
  const date = useMemo(() => localDateIso(), []);
  const allowed = access?.allowed === true;

  const today = useQuery<TodayResponse>({
    queryKey: ["/api/anvil/today", date],
    queryFn: () => getJson(`/api/anvil/today?date=${date}`),
    enabled: allowed,
  });

  if (loading) return <Skeleton className="h-20 w-full" />;
  // A role with no Anvil route is a role that does not train through Forge. Nothing is drawn,
  // rather than a card pointing at a page that would refuse them.
  if (!allowed || !routes) return null;

  if (today.isError) {
    return (
      <Card>
        <CardContent className="pt-6">
          {/* A FAILED READ IS NOT A QUIET MORNING. Drawing "Today's check is open" over a read
              that never landed would send somebody to take a second check they had already done. */}
          <ReadFailed
            what="today's Anvil check"
            onRetry={() => void today.refetch()}
            error={today.error}
          />
        </CardContent>
      </Card>
    );
  }
  if (today.isLoading || !today.data) return <Skeleton className="h-20 w-full" />;

  const data = today.data;
  const done = data.check != null && data.reading != null;
  const nowLabel = windowLabelFor(localMinutesFrom(new Date()));

  return (
    <Card data-testid="anvil-daily-card">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">The Anvil</p>
          <p className="font-medium">{headline(data, done, nowLabel)}</p>
          <p className="text-xs text-muted-foreground">{sub(data, done, nowLabel)}</p>
        </div>
        <Button asChild size="sm" variant={done ? "outline" : "default"}>
          <Link href={routes.check} data-testid="anvil-card-link">
            {done ? "See it" : "Start"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function headline(data: TodayResponse, done: boolean, nowLabel: string): string {
  if (done) {
    const ms = data.reading?.numbers.medianMs;
    return ms == null ? "Taken today" : `Taken today · ${Math.round(ms)} ms`;
  }
  return nowLabel === "in_window" ? "Today's check" : "Today's check";
}

function sub(data: TodayResponse, done: boolean, nowLabel: string): string {
  if (done) {
    const c = data.reading?.comparison;
    if (c?.kind === "compared") {
      const inBand =
        data.reading!.numbers.medianMs != null &&
        data.reading!.numbers.medianMs >= c.bandLowMs &&
        data.reading!.numbers.medianMs <= c.bandHighMs;
      // A DESCRIPTION, NOT A VERDICT. The band is where this person's mornings usually land and
      // nothing fires at its edge; the week is the only place anything is asserted.
      return inBand ? "In your normal band" : "Outside your normal band";
    }
    if (c?.kind === "learning") return `Learning your normal — ${c.have} of ${c.need} mornings`;
    return "Kept and shown; nothing to compare it with yet";
  }
  return nowLabel === "in_window"
    ? `${estimatedLabel()} · open until ${hhmm(data.window.closesMinutes)}`
    : `Opens ${hhmm(data.window.opensMinutes)}–${hhmm(data.window.closesMinutes)}`;
}
