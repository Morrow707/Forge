import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ReadFailed } from "@/components/read-failed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/skeleton";
import { getJson, resolveApiUrl } from "@/lib/queryClient";
import { ANVIL_ACCURACY_CAVEAT, ANVIL_NOT_A_MEDICAL_TEST } from "@shared/anvil-agreement";
import type { AnvilReading } from "@shared/anvil-reading";

/**
 * THE COACH'S WEEK: A DAILY VIEW AND A WEEKLY LINE, AND THE DIFFERENCE BETWEEN THEM IS THE POINT.
 *
 * Scott asked for both -- "daily will show good spikes where weekly will show the trends" -- and
 * the distinction that makes that safe is between a VIEW and a FLAG. The daily row states where
 * somebody's morning sat against their own band and asserts nothing. The weekly line is the only
 * place the Anvil says anything, and it will not say it on one witness: a daily flag at the
 * corroboration threshold fires about 16.9 times per athlete per season on noise alone, measured
 * over 3,000 simulated pure-noise seasons.
 *
 * Nothing is computed here. Every number arrives scored from the server.
 */

type Day = {
  id: number;
  date: string;
  counts: boolean;
  window: string;
  reading: AnvilReading;
};

type AthleteWeek = {
  athleteId: number;
  athleteName: string;
  week: {
    days: Day[];
    fast: { channel: string; z?: number; absent?: string };
    verdict: { kind: string; witnesses?: string[]; z?: number; reason?: string };
    channelsNotBuilt: string[];
  };
};

type RosterWeek = {
  from: string;
  to: string;
  athletes: AthleteWeek[];
  noChecks: Array<{ athleteId: number; athleteName: string }>;
};

const RANGES = [7, 14, 28] as const;

export default function CoachAnvilWeek() {
  const [days, setDays] = useState<number>(7);
  const { data, isLoading, isError, refetch, error } = useQuery<RosterWeek>({
    queryKey: ["/api/coach/anvil/week", days],
    queryFn: () => getJson(`/api/coach/anvil/week?days=${days}`),
  });

  return (
    <AppShell title="The Anvil">
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((n) => (
            <Button
              key={n}
              size="sm"
              variant={days === n ? "default" : "outline"}
              onClick={() => setDays(n)}
              data-testid={`anvil-range-${n}`}
            >
              {n} days
            </Button>
          ))}
          <div className="ml-auto">
            {/* A PLAIN LINK, NOT A FETCH. The route answers with a PDF and a
                Content-Disposition, so the browser and the native web view both do the right
                thing with it; reading it into memory to re-offer it as a blob is work that buys
                nothing and breaks the filename. */}
            <Button asChild size="sm" variant="outline" data-testid="anvil-print">
              <a href={resolveApiUrl(`/api/coach/anvil/week.pdf?days=${days}`)}>Print or email</a>
            </Button>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {ANVIL_ACCURACY_CAVEAT} {ANVIL_NOT_A_MEDICAL_TEST} Every figure is one person against
          their own earlier mornings, never against another athlete.
        </p>

        {isLoading && <Skeleton className="h-64 w-full" />}
        {isError && (
          <ReadFailed
            what="your athletes' checks"
            onRetry={() => void refetch()}
            error={error}
          />
        )}

        {data && data.athletes.length === 0 && data.noChecks.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Nobody on your roster has taken the Anvil yet. It is adults-only while its paperwork
              is being reviewed, and each person accepts it on their own account.
            </CardContent>
          </Card>
        )}

        {data?.athletes.map((entry) => (
          <Card key={entry.athleteId} data-testid={`anvil-athlete-${entry.athleteId}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{entry.athleteName}</CardTitle>
              <p className="text-sm">{verdictLine(entry.week.verdict)}</p>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {entry.week.days.map((day) => (
                <div
                  key={day.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t py-1.5 text-sm first:border-t-0"
                >
                  <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                    {day.date}
                  </span>
                  <span className="font-medium tabular-nums">
                    {day.reading.numbers.medianMs == null
                      ? "no trials"
                      : `${Math.round(day.reading.numbers.medianMs)} ms`}
                  </span>
                  <span className="text-xs text-muted-foreground">{dayDetail(day)}</span>
                </div>
              ))}
              {entry.week.days.length === 0 && (
                <p className="text-sm text-muted-foreground">No check in this window.</p>
              )}
              <p className="pt-2 text-[11px] text-muted-foreground">
                {entry.week.channelsNotBuilt.join(" · ")}
              </p>
            </CardContent>
          </Card>
        ))}

        {data && data.noChecks.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">No check in this window</CardTitle>
            </CardHeader>
            <CardContent>
              {/* NAMED RATHER THAN LEFT OUT. A short list and a roster where nobody has set the
                  Anvil up look identical otherwise, and the second is the one a coach can act on. */}
              <p className="text-sm text-muted-foreground">
                {data.noChecks.map((a) => a.athleteName).join(", ")}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function verdictLine(verdict: AthleteWeek["week"]["verdict"]): string {
  if (verdict.kind === "finding") {
    return `A change showed up on ${(verdict.witnesses ?? []).join(" and ")} (${(verdict.z ?? 0).toFixed(2)} SD on the weaker of them). Worth a conversation.`;
  }
  if (verdict.kind === "quiet") return "Nothing stood out this week.";
  // NOT THE SAME SENTENCE AS "quiet", and never drawn as one. "nothing was wrong" and "nothing
  // could be judged" being one blank is the distinction the 2026-10-04 box jump lost.
  return `Not enough to judge on — ${verdict.reason ?? "fewer channels than the rule requires"}.`;
}

function dayDetail(day: Day): string {
  const bits: string[] = [];
  const c = day.reading.comparison;
  if (c.kind === "compared") {
    bits.push(`${c.medianZ >= 0 ? "+" : ""}${c.medianZ.toFixed(2)} SD vs own normal`);
    bits.push(`${c.lapses} slow ${c.lapses === 1 ? "trial" : "trials"}`);
  } else if (c.kind === "learning") {
    bits.push(`learning their normal (${c.have} of ${c.need})`);
  } else {
    bits.push("no spread in their own history yet");
  }
  const n = day.reading.numbers;
  if (n.driftMs != null) bits.push(`${n.driftMs >= 0 ? "+" : ""}${Math.round(n.driftMs)} ms drift`);
  if (n.sequenceBest != null) bits.push(`span ${n.sequenceBest}`);
  if (n.tapCount != null) bits.push(`${n.tapCount} taps`);
  if (day.window !== "in_window") {
    bits.push(day.window === "practice" ? "practice run" : "outside the morning window");
  }
  if (!day.counts && day.window === "in_window") bits.push("second attempt, does not count");
  return bits.join(" · ");
}
