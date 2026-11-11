import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ReadFailed } from "@/components/read-failed";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { HARDY_GROUPS, HARDY_OUTCOME_LABEL, HARDY_OUTCOMES, HARDY_REPORT_FLOOR, type HardyOutcome, type HardyReport } from "@shared/hardy-vocabulary";

/* WHAT PEOPLE ASK HARDY (2026-11-11). Scott: "so then we can check and see oh they are looking at
 * training more, lets make that part of the app smarter". Counts across everyone: the kind of
 * question and which of Forge's own words it matched, never what anybody typed and never a person.
 * Every row is hidden until HARDY_REPORT_FLOOR different people are behind it. */

type Report = HardyReport & { days: number; group: string | null };
const WEEK = 7;
const FOUR_WEEKS = 28;
const PERIODS = [WEEK, FOUR_WEEKS] as const;
/** A kind is called out as rising past this share of growth on the period before. */
const RISING_SHARE = 0.1;
const PERCENT = 100;
const STEADY_PCT = 5;
const SHORT_MIN_QUESTIONS = 20;
const SHORT_MIN_PCT = 10;
const SHORT_ROWS = 6;

function Change({ now, before }: { now: number; before: number }) {
  if (!before) return <span className="text-[11px] text-muted-foreground">new</span>;
  const d = Math.round(((now - before) / before) * PERCENT);
  if (Math.abs(d) < STEADY_PCT) return <span className="text-[11px] text-muted-foreground">steady</span>;
  return <span className={cn("text-[11px] font-semibold tabular-nums", d > 0 ? "text-primary" : "text-muted-foreground")}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}%</span>;
}

function Bar({ label, value, max, right }: { label: string; value: number; max: number; right: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_44px_64px] items-center gap-2 py-1 text-sm">
      <span className="truncate">{label}</span>
      <span className="h-2 rounded bg-secondary">
        <i className="block h-2 rounded bg-primary" style={{ width: `${(value / Math.max(1, max)) * PERCENT}%` }} />
      </span>
      <span className="text-right tabular-nums text-muted-foreground">{value}</span>
      <span className="text-right">{right}</span>
    </div>
  );
}

export default function AdminHardyUsage() {
  const [days, setDays] = useState<number>(PERIODS[1]);
  const [group, setGroup] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);
  const url = `/api/admin/hardy-usage?days=${days}${group ? `&group=${encodeURIComponent(group)}` : ""}`;
  const { data, isError, refetch } = useQuery<Report>({ queryKey: [url], queryFn: () => getJson(url) });
  const short = (data?.words ?? [])
    .filter((w) => w.questions >= SHORT_MIN_QUESTIONS)
    .map((w) => ({ ...w, miss: Math.round(((w.outcomes.missed ?? 0) / w.questions) * PERCENT) }))
    .filter((w) => w.miss >= SHORT_MIN_PCT)
    .sort((a, b) => b.miss - a.miss)
    .slice(0, SHORT_ROWS);
  const maxKind = Math.max(1, ...(data?.kinds ?? []).map((k) => k.questions));
  const rising = (data?.kinds ?? []).filter((k) => k.key !== "Other" && k.before > 0).map((k) => ({ k: k.key, d: (k.questions - k.before) / k.before })).sort((a, b) => b.d - a.d)[0];

  return (
    <AppShell title="What People Ask Hardy">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>What people ask Hardy</CardTitle>
            <CardDescription>
              Counts across everyone: the kind of question and which of Forge's own words it matched. Never what anybody typed, never who asked. A row shows only when {HARDY_REPORT_FLOOR} or more different people are behind it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {PERIODS.map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", days === d && "border-primary bg-primary text-primary-foreground")}>
                Last {d} days
              </button>
            ))}
            {["", ...HARDY_GROUPS].map((g) => (
              <button key={g || "all"} type="button" onClick={() => setGroup(g)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", group === g && "border-primary bg-primary text-primary-foreground")}>
                {g || "Everyone"}
              </button>
            ))}
          </CardContent>
        </Card>

        {isError && <ReadFailed what="Hardy's report" onRetry={() => void refetch()} />}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Questions", data.questions.toLocaleString()],
                ["People asked", data.people >= HARDY_REPORT_FLOOR ? data.people.toLocaleString() : `Fewer than ${HARDY_REPORT_FLOOR}`],
                ["Answered", `${data.answeredPct}%`],
                ["Couldn't answer", `${data.missedPct}%`],
              ].map(([label, value]) => (
                <Card key={label}>
                  <CardContent className="p-4">
                    <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader><CardTitle className="text-lg">What they ask about</CardTitle></CardHeader>
              <CardContent>
                {data.kinds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not enough people have asked yet to show anything.</p>
                ) : (
                  data.kinds.map((k) => <Bar key={k.key} label={k.key} value={k.questions} max={maxKind} right={<Change now={k.questions} before={k.before} />} />)
                )}
                <p className="mt-2 text-xs text-muted-foreground">Change is against the {data.days} days before.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top words</CardTitle>
                <CardDescription>Forge's own words only. Tap one to see how Hardy did.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.words.length === 0 && <p className="text-sm text-muted-foreground">Not enough people have asked yet to show any word.</p>}
                <ol className="divide-y">
                  {data.words.map((w, i) => (
                    <li key={w.key}>
                      <button type="button" onClick={() => setOpen(open === w.key ? null : w.key)} aria-expanded={open === w.key} className="grid w-full grid-cols-[24px_minmax(0,1fr)_auto_70px] items-center gap-2 py-2 text-left text-sm">
                        <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                        <span className="min-w-0">{w.key}<span className="block text-[11px] text-muted-foreground">{w.kind}</span></span>
                        <span className="tabular-nums">{w.questions}</span>
                        <span className="text-right"><Change now={w.questions} before={w.before} /></span>
                      </button>
                      {open === w.key && (
                        <div className="pb-3 pl-8 text-sm">
                          {HARDY_OUTCOMES.filter((o) => w.outcomes[o]).map((o: HardyOutcome) => (
                            <div key={o} className="flex justify-between py-0.5"><span>{HARDY_OUTCOME_LABEL[o]}</span><span className="tabular-nums text-muted-foreground">{Math.round(((w.outcomes[o] ?? 0) / w.questions) * PERCENT)}%</span></div>
                          ))}
                          <p className="text-xs text-muted-foreground">{w.people} people asked.</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                {data.hiddenWords > 0 && <p className="mt-2 text-xs text-muted-foreground">{data.hiddenWords} word{data.hiddenWords === 1 ? "" : "s"} hidden: fewer than {HARDY_REPORT_FLOOR} people asked.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Where Hardy came up short</CardTitle>
                <CardDescription>The words he most often couldn't answer: a page to make easier to find, or something he should learn.</CardDescription>
              </CardHeader>
              <CardContent>
                {short.length === 0 ? <p className="text-sm text-muted-foreground">Nothing above {SHORT_MIN_PCT}% yet.</p> : short.map((w) => <Bar key={w.key} label={w.key} value={w.miss} max={PERCENT} right={<span className="text-xs text-muted-foreground">{w.miss}%</span>} />)}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Asked for, but not on their plan</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Asked for answers their plan doesn't include</span><span className="text-muted-foreground">{data.plan ? `${data.plan.questions} from ${data.plan.people} people` : `Fewer than ${HARDY_REPORT_FLOOR} people`}</span></div>
                {data.plan?.words.map((w) => <div key={w.word} className="flex justify-between pl-3 text-muted-foreground"><span>· {w.word}</span><span>{w.questions}</span></div>)}
                <div className="flex justify-between"><span>Coached athletes asking for answers (their coach's call)</span><span className="text-muted-foreground">{data.coach ? `${data.coach.questions} from ${data.coach.people} people` : `Fewer than ${HARDY_REPORT_FLOOR} people`}</span></div>
                <div className="flex justify-between"><span>Pain or injury questions sent to a doctor or trainer</span><span className="text-muted-foreground">{data.medical}</span></div>
                <p className="pt-1 text-xs text-muted-foreground">The first line is the upgrade signal: what people want enough to ask for.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">What this suggests</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {rising && rising.d > RISING_SHARE && <p>{rising.k} questions are up {Math.round(rising.d * PERCENT)}% on the {data.days} days before. That part of the app is getting more use; it's the one to make smarter next.</p>}
                {short[0] && <p>Hardy couldn't answer {short[0].miss}% of "{short[0].key}" questions. Either the page is hard to find or he doesn't know that area yet.</p>}
                {!(rising && rising.d > RISING_SHARE) && !short[0] && <p className="text-muted-foreground">Not enough questions yet to say anything.</p>}
                <p className="text-xs text-muted-foreground">Patterns in what people ask, not reasons why.</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
