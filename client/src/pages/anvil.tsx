import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ReadFailed } from "@/components/read-failed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/skeleton";
import { toast } from "sonner";
import { apiRequest, getJson } from "@/lib/queryClient";
import { useAnvilAccess } from "@/hooks/anvil-access";
import { AnvilRun, type AnvilRunResult } from "@/components/anvil/anvil-run";
import { ANVIL_PARTS, estimatedLabel } from "@shared/anvil-tasks";
import { localMinutesFrom, windowLabelFor } from "@shared/anvil-window";
import type { AnvilReading } from "@shared/anvil-reading";

/**
 * THE DAILY CHECK, FOR THE PERSON TAKING IT.
 *
 * Five states and each one is a different sentence: the answer has not arrived, the read failed,
 * this account may not take it (with the reason), the agreement has not been accepted, or today's
 * card. The second and third are kept apart deliberately -- a refusal with a reason and a request
 * that did not land are different things to put in front of somebody, and collapsing them is the
 * family this repo has now fixed on six surfaces.
 *
 * **NOTHING HERE DECIDES A NUMBER.** The median, the drift, the band and the lapse count all
 * arrive from the server, computed over the raw trials by `shared/anvil-*.ts`. This page sends
 * what the tasks measured and renders what comes back.
 */

type TodayResponse = {
  date: string;
  window: { opensMinutes: number; closesMinutes: number };
  attemptsToday: number;
  countsTodayId: number | null;
  check: { id: number; takenAt: string; window: string } | null;
  reading: AnvilReading | null;
};

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** The athlete's own local day, which is the only clock that knows what day it is where they
 *  are standing. The server takes this as given and never infers it. */
function localDateIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function AnvilPage() {
  const { access, loading, failed } = useAnvilAccess();
  const queryClient = useQueryClient();

  return (
    <AppShell title="The Anvil">
      <div className="mx-auto w-full max-w-md space-y-5 px-4 py-6">
        <p className="text-sm text-muted-foreground">
          Four short tasks, once a morning, compared only with your own earlier mornings.
        </p>

        {loading && <Skeleton className="h-40 w-full" />}

        {failed && (
          <ReadFailed
            what="whether the Anvil is open for your account"
            onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/anvil/access"] })}
          />
        )}

        {access && !access.allowed && access.reason !== "needs_the_anvil_agreement" && (
          <Card data-testid="anvil-refused">
            <CardContent className="space-y-2 pt-6">
              <p className="text-sm">{access.says}</p>
              {access.reason === "minor_pending_counsel" && (
                <p className="text-xs text-muted-foreground">
                  Nothing is being withheld from you by accident: the Anvil's paperwork for
                  under-18s is with Forge's lawyers, and it is offered to adults in the meantime.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {access && !access.allowed && access.reason === "needs_the_anvil_agreement" && (
          <AgreementCard />
        )}

        {access?.allowed === true && <CheckFlow stale={access.agreementStale} />}
      </div>
    </AppShell>
  );
}

function AgreementCard() {
  const queryClient = useQueryClient();
  const [ticked, setTicked] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery<{ version: string; text: string }>({
    queryKey: ["/api/anvil/agreement"],
    queryFn: () => getJson("/api/anvil/agreement"),
  });

  const accept = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/anvil/agreement");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anvil/access"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Couldn't record that. Try again."),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data)
    return <ReadFailed what="the Anvil agreement" onRetry={() => void refetch()} />;

  return (
    <Card data-testid="anvil-agreement">
      <CardHeader>
        <CardTitle className="text-base">Before your first check</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* The whole text, scrollable rather than truncated. A "read more" that hides the part
            about what this is not would be the one thing worth not hiding. */}
        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
          {data.text}
        </div>
        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox
            checked={ticked}
            onCheckedChange={(v) => setTicked(v === true)}
            data-testid="anvil-agreement-tick"
            className="mt-0.5"
          />
          <span>I have read this and I agree to take the daily check.</span>
        </label>
        <Button
          className="w-full"
          disabled={!ticked || accept.isPending}
          onClick={() => accept.mutate()}
          data-testid="anvil-agreement-accept"
        >
          {accept.isPending ? "Saving…" : "Agree and continue"}
        </Button>
        <p className="text-[11px] text-muted-foreground">Version {data.version}.</p>
      </CardContent>
    </Card>
  );
}

type Flow =
  | { kind: "card" }
  | { kind: "intro"; practice: boolean }
  | { kind: "run"; practice: boolean; startedLocalMinutes: number }
  /**
   * A FINISHED RUN THAT HAS NOT REACHED THE SERVER YET, and it is its own state for one reason:
   * four minutes of tasks must not be lost to a dropped request. The send fires immediately and
   * this state is what the page falls back to when it fails, with the result still in hand and a
   * button to try again. A toast saying "your results are still here" over a page that had
   * thrown them away would be the worse version of the same bug.
   */
  | { kind: "held"; practice: boolean; startedLocalMinutes: number; result: AnvilRunResult };

function CheckFlow({ stale }: { stale: boolean }) {
  const queryClient = useQueryClient();
  const [flow, setFlow] = useState<Flow>({ kind: "card" });
  const date = useMemo(() => localDateIso(), []);

  const today = useQuery<TodayResponse>({
    queryKey: ["/api/anvil/today", date],
    queryFn: () => getJson(`/api/anvil/today?date=${date}`),
  });

  const submit = useMutation({
    mutationFn: async (payload: AnvilRunResult & { practice: boolean; startedLocalMinutes: number }) => {
      const res = await apiRequest("POST", "/api/anvil/checks", {
        date,
        // WHEN THEY SAT DOWN, NOT WHEN IT FINISHED. The check runs about four minutes, so
        // sending the end time would label a check begun at 8:38 as late -- the athlete did the
        // thing the window asks for and the clock would say otherwise. The window is about when
        // the measurement was taken; "taken" starts at Begin.
        localMinutes: payload.startedLocalMinutes,
        practice: payload.practice,
        trialsMs: payload.trialsMs,
        omissions: payload.omissions,
        rulesMissed: payload.rulesMissed,
        goTrialsMs: payload.goTrialsMs,
        sequenceBest: payload.sequenceBest,
        tapCounts: payload.tapCounts,
        partsRun: payload.partsRun,
        timerResolutionMs: payload.timerResolutionMs,
      });
      return res.json();
    },
    onSuccess: () => {
      setFlow({ kind: "card" });
      queryClient.invalidateQueries({ queryKey: ["/api/anvil/today", date] });
      queryClient.invalidateQueries({ queryKey: ["/api/anvil/week"] });
    },
    onError: (err: unknown) => {
      // THE CHECK IS NOT LOST ON A FAILED SEND and the toast says so, because the alternative is
      // somebody doing four minutes of tasks twice. Rule #1's shape on a transport failure.
      toast.error(
        (err instanceof Error ? `${err.message} ` : "") +
          "Your results are still here -- press Send again.",
      );
    },
  });

  if (flow.kind === "run") {
    return (
      <AnvilRun
        onDone={(result) => {
          const started = flow.startedLocalMinutes;
          setFlow({ kind: "held", practice: flow.practice, startedLocalMinutes: started, result });
          submit.mutate({ ...result, practice: flow.practice, startedLocalMinutes: started });
        }}
      />
    );
  }

  if (flow.kind === "held") {
    return (
      <Card data-testid="anvil-held">
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm font-medium">
            {submit.isPending ? "Sending your check…" : "Your check hasn't been saved yet."}
          </p>
          <p className="text-xs text-muted-foreground">
            {flow.result.trialsMs.length} trials, {flow.result.partsRun.length} of{" "}
            {ANVIL_PARTS.length} parts. Nothing is lost while this page is open.
          </p>
          {!submit.isPending && (
            <Button
              className="w-full"
              onClick={() =>
                submit.mutate({
                  ...flow.result,
                  practice: flow.practice,
                  startedLocalMinutes: flow.startedLocalMinutes,
                })
              }
              data-testid="anvil-resend"
            >
              Send again
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (flow.kind === "intro") {
    return (
      <Card data-testid="anvil-intro">
        <CardHeader>
          <CardTitle className="text-base">
            {flow.practice ? "Practice run" : "Today's check"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            {ANVIL_PARTS.length} parts, {estimatedLabel()}.
          </p>
          <p className="text-sm font-medium">Same hand, same grip, sitting down.</p>
          <Button
            className="w-full"
            onClick={() =>
              setFlow({
                kind: "run",
                practice: flow.practice,
                startedLocalMinutes: localMinutesFrom(new Date()),
              })
            }
            data-testid="anvil-begin"
          >
            Begin
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setFlow({ kind: "card" })}>
            Not now
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {flow.practice
              ? "A practice run counts for nothing and is open at any hour. It exists so your first real check is not the one you spend learning the tasks."
              : "One attempt counts — the first one inside the morning window, not the best. A check taken later in the day is kept and shown and left out of your normal: a missing day is honest, a mistimed one folded into it is not."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (today.isLoading) return <Skeleton className="h-44 w-full" />;
  if (today.isError)
    return <ReadFailed what="today's check" onRetry={() => void today.refetch()} error={today.error} />;

  const data = today.data!;
  const nowLabel = windowLabelFor(localMinutesFrom(new Date()));
  const done = data.check != null;

  return (
    <div className="space-y-4">
      {stale && (
        <Card>
          <CardContent className="pt-6 text-xs text-muted-foreground">
            The agreement has been updated since you accepted it. You can read the new version from
            your account page.
          </CardContent>
        </Card>
      )}

      <Card data-testid="anvil-today">
        <CardContent className="space-y-3 pt-6">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {hhmm(data.window.opensMinutes)}–{hhmm(data.window.closesMinutes)}
          </p>
          {done && data.reading ? (
            <Result reading={data.reading} attempts={data.attemptsToday} counted={data.countsTodayId != null} />
          ) : (
            <>
              <p className="text-base font-medium">
                {nowLabel === "in_window"
                  ? "Today's check is open."
                  : `Outside the window — it opens again ${hhmm(data.window.opensMinutes)} tomorrow.`}
              </p>
              <p className="text-sm text-muted-foreground">
                {ANVIL_PARTS.length} parts, {estimatedLabel()}.
              </p>
            </>
          )}

          <div className="flex flex-col gap-2 pt-1">
            {/* THE BUTTON IS DRAWN WHATEVER THE HOUR, and that is the window being a label. A
                check taken at four in the afternoon is kept, scored and left out of the normal;
                refusing it here would destroy the one thing that cannot be recovered to protect
                a comparison that can simply be skipped. */}
            <Button
              className="w-full"
              onClick={() => setFlow({ kind: "intro", practice: false })}
              data-testid="anvil-start"
            >
              {done ? "Take another" : nowLabel === "in_window" ? "Start" : "Take it anyway"}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setFlow({ kind: "intro", practice: true })}
              data-testid="anvil-practice"
            >
              Practice run
            </Button>
          </div>
          {submit.isPending && (
            <p className="text-xs text-muted-foreground">Sending your check…</p>
          )}
        </CardContent>
      </Card>

      <WeekStrip />
    </div>
  );
}

function Result({
  reading,
  attempts,
  counted,
}: {
  reading: AnvilReading;
  attempts: number;
  counted: boolean;
}) {
  const n = reading.numbers;
  const c = reading.comparison;
  return (
    <div className="space-y-3" data-testid="anvil-result">
      <p className="text-4xl font-bold tabular-nums">
        {n.medianMs == null ? "—" : Math.round(n.medianMs)}
        <span className="pl-1 text-base font-normal text-muted-foreground">ms</span>
      </p>
      {c.kind === "compared" && (
        <p className="text-sm">
          Your normal band is {Math.round(c.bandLowMs)}–{Math.round(c.bandHighMs)} ms.
        </p>
      )}
      {c.kind === "learning" && (
        <p className="text-sm text-muted-foreground">
          Learning your normal — {c.have} of {c.need} mornings.
        </p>
      )}
      {c.kind === "no_spread" && (
        <p className="text-sm text-muted-foreground">
          Your last mornings are identical to the millisecond, which is a clock problem rather
          than a you problem. Nothing is compared until they are not.
        </p>
      )}
      <dl className="divide-y rounded-md border text-sm">
        <Row label="Drift across the check" value={n.driftMs == null ? "—" : `${n.driftMs >= 0 ? "+" : ""}${Math.round(n.driftMs)} ms`} />
        {c.kind === "compared" && (
          <Row label="Slow trials" value={`${c.lapses} of ${n.trials}`} />
        )}
        {n.rulesMissed != null && <Row label="Rules missed" value={String(n.rulesMissed)} />}
        {n.sequenceBest != null && <Row label="Longest sequence" value={String(n.sequenceBest)} />}
        {n.tapCount != null && <Row label="Taps in ten seconds" value={String(n.tapCount)} />}
        {n.omissions > 0 && <Row label="Missed signals" value={String(n.omissions)} />}
      </dl>
      {reading.outsideTheWindow && (
        <p className="text-xs text-muted-foreground">
          Taken outside the morning window, so it is kept and shown and left out of your normal.
        </p>
      )}
      {attempts > 1 && (
        <p className="text-xs text-muted-foreground">
          {attempts} attempts today.{" "}
          {counted
            ? "The first one inside the window is the one that counts."
            : "None of them landed inside the window, so none counts toward your normal."}
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

type WeekResponse = {
  from: string;
  to: string;
  days: Array<{
    id: number;
    date: string;
    counts: boolean;
    reading: AnvilReading;
  }>;
  verdict: { kind: string; reason?: string };
};

function WeekStrip() {
  const { data, isLoading, isError, refetch, error } = useQuery<WeekResponse>({
    queryKey: ["/api/anvil/week"],
    queryFn: () => getJson("/api/anvil/week?days=14"),
  });

  if (isLoading) return <Skeleton className="h-28 w-full" />;
  if (isError)
    return <ReadFailed what="your last two weeks" onRetry={() => void refetch()} error={error} />;

  const days = data?.days ?? [];
  if (days.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Nothing yet. Your first check is the start of your own normal.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Your last two weeks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {days
          .slice()
          .reverse()
          .map((d) => (
            <div key={d.id} className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">{d.date}</span>
              <span className="tabular-nums">
                {d.reading.numbers.medianMs == null
                  ? "no trials"
                  : `${Math.round(d.reading.numbers.medianMs)} ms`}
                {d.reading.comparison.kind === "compared" && (
                  <span className="pl-2 text-xs text-muted-foreground">
                    {d.reading.comparison.medianZ >= 0 ? "+" : ""}
                    {d.reading.comparison.medianZ.toFixed(2)} SD
                  </span>
                )}
                {!d.counts && <span className="pl-2 text-xs text-muted-foreground">not counted</span>}
              </span>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
