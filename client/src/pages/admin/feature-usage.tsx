import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ReadFailed } from "@/components/read-failed";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { HARD_TO_USE_MIN_TRIES, HARD_TO_USE_SHARE, USAGE_GROUPS, type FeatureUsageReport, type ReportEntry, type UsageGroup, type UsageKind } from "@shared/feature-usage";
import { msg, useT } from "@/i18n";

/* WHAT PEOPLE USE (2026-11-12). Scott: "what are people using the least, why? ... what are people
 * using the most? why? ... if something has 0 views or clicks or interactions something is
 * obviously wrong ... i don't want to see who is doing the looking, just what they are looking at."
 *
 * Counts only, never a person: every row is a page, an action or a named tab/panel, with how often
 * it was used, on how many person-days, and the likeliest reason it reads the way it does. Looking
 * at one kind of account, a number with fewer than the floor behind it reads "fewer than 5". */

const WEEK = 7;
const FOUR_WEEKS = 28;
const QUARTER = 90;
const PERIODS = [WEEK, FOUR_WEEKS, QUARTER] as const;
const PERCENT = 100;
const STEADY_PCT = 5;
const SHOWN = 15;
const NAMED_IN_SUMMARY = 3;
const TABS: { kind: UsageKind; label: string; noun: string }[] = [
  { kind: "page", label: msg("Pages"), noun: msg("Find in pages") },
  { kind: "interaction", label: msg("Inside pages"), noun: msg("Find in tabs and panels") },
  { kind: "action", label: msg("Actions"), noun: msg("Find in actions") },
];

function Change({ now, before }: { now: number | null; before: number }) {
  const t = useT();
  if (now == null) return null;
  if (!before) return <span className="text-[11px] text-muted-foreground">{now ? t("new") : ""}</span>;
  const d = Math.round(((now - before) / before) * PERCENT);
  if (Math.abs(d) < STEADY_PCT) return <span className="text-[11px] text-muted-foreground">{t("steady")}</span>;
  return <span className={cn("text-[11px] font-semibold tabular-nums", d > 0 ? "text-primary" : "text-muted-foreground")}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}%</span>;
}

function Count({ value, floor }: { value: number | null; floor: number }) {
  const t = useT();
  return <span className="tabular-nums">{value == null ? t("fewer than {count}", { count: floor }) : t.number(value)}</span>;
}

function EntryRow({ e, floor, open, onToggle }: { e: ReportEntry; floor: number; open: boolean; onToggle: () => void }) {
  const t = useT();
  const platforms = Object.entries(e.byPlatform).filter(([, n]) => n);
  return (
    <li className="py-2">
      <button type="button" onClick={onToggle} aria-expanded={open} className="grid w-full grid-cols-[minmax(0,1fr)_auto_64px] items-start gap-2 text-left text-sm">
        <span className="min-w-0">
          <span className="block break-words">
            {e.label}
            {e.retired && <span className="ml-1.5 rounded bg-secondary px-1.5 text-[10px] font-semibold uppercase">{t("removed")}</span>}
            {e.hardToUse && <span className="ml-1.5 rounded bg-destructive/15 px-1.5 text-[10px] font-semibold uppercase text-destructive">{t("hard to use")}</span>}
            {e.linked === false && <span className="ml-1.5 rounded bg-secondary px-1.5 text-[10px] font-semibold uppercase">{t("no link")}</span>}
          </span>
          {e.why && <span className="mt-0.5 block text-[12px] text-muted-foreground">{e.why}</span>}
        </span>
        <Count value={e.uses} floor={floor} />
        <span className="text-right"><Change now={e.uses} before={e.before} /></span>
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg bg-secondary/60 p-2.5 text-[12px]">
          {e.kind === "page" && <><dt className="text-muted-foreground">{t("Address")}</dt><dd className="break-all font-mono">{e.feature}</dd></>}
          <dt className="text-muted-foreground">{t("Person-days")}</dt><dd><Count value={e.people} floor={floor} /></dd>
          <dt className="text-muted-foreground">{t("Period before")}</dt><dd className="tabular-nums">{e.before}</dd>
          {(e.refused > 0 || e.failed > 0) && <><dt className="text-muted-foreground">{t("Turned away")}</dt><dd>{t("{refused} refused, {failed} failed", { refused: e.refused, failed: e.failed })}</dd></>}
          {platforms.length > 0 && <><dt className="text-muted-foreground">{t("Where")}</dt><dd>{platforms.map(([p, n]) => `${p} ${n}`).join(" · ")}</dd></>}
          {e.doneOn != null && <><dt className="text-muted-foreground">{t("Saved from here")}</dt><dd className="tabular-nums">{e.doneOn}</dd></>}
          {e.cameFrom.length > 0 && <><dt className="text-muted-foreground">{t("Came from")}</dt><dd>{e.cameFrom.map((c) => `${c.label} (${c.uses})`).join(" · ")}</dd></>}
          <dt className="text-muted-foreground">{t("In the app since")}</dt><dd>{e.firstSeen ?? t("before counting started")}</dd>
        </dl>
      )}
    </li>
  );
}

export default function AdminFeatureUsage() {
  const t = useT();
  const [days, setDays] = useState<number>(PERIODS[1]);
  const [group, setGroup] = useState<UsageGroup | "">("");
  const [tab, setTab] = useState<UsageKind>("page");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const url = `/api/admin/feature-usage?days=${days}${group ? `&groups=${encodeURIComponent(group)}` : ""}`;
  const { data, isError, refetch } = useQuery<FeatureUsageReport>({ queryKey: [url], queryFn: () => getJson(url) });

  const ofKind = useMemo(() => (data?.entries ?? []).filter((e) => e.kind === tab && (!filter || e.label.toLowerCase().includes(filter.toLowerCase()))), [data, tab, filter]);
  const most = ofKind.filter((e) => e.rank > 0).slice(0, SHOWN);
  const least = [...ofKind].filter((e) => !e.retired).sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label)).slice(0, SHOWN);
  const hard = (data?.entries ?? []).filter((e) => e.hardToUse);
  const zeros = (data?.entries ?? []).filter((e) => e.rank === 0 && !e.retired && e.kind !== "action");
  const reasonCounts = zeros.reduce((acc, e) => acc.set(e.why ?? "Unknown", (acc.get(e.why ?? "Unknown") ?? 0) + 1), new Map<string, number>());
  const seenNotUsed = (data?.entries ?? []).filter((e) => e.kind === "page" && e.doneOn === 0 && (e.rank ?? 0) > 0);
  const row = (e: ReportEntry) => (
    <EntryRow key={`${e.kind}:${e.feature}`} e={e} floor={data?.floor ?? 0} open={open === `${e.kind}:${e.feature}`} onToggle={() => setOpen(open === `${e.kind}:${e.feature}` ? null : `${e.kind}:${e.feature}`)} />
  );

  return (
    <AppShell title={t("What People Use")}>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("What people use")}</CardTitle>
            <CardDescription>
              {t("Every page, tab and action in Forge, with how often it was used and the likeliest reason why. Counts only: never who, never what anybody typed. Your own admin use and the demo accounts are left out unless you pick Admins.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((d) => (
                <button key={d} type="button" onClick={() => setDays(d)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", days === d && "border-primary bg-primary text-primary-foreground")}>
                  {t("Last {days} days", { days: d })}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["", ...USAGE_GROUPS] as const).map((g) => (
                <button key={g || "all"} type="button" onClick={() => setGroup(g)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", group === g && "border-primary bg-primary text-primary-foreground")}>
                  {g || t("Everyone (not admins)")}
                </button>
              ))}
            </div>
            {data && (
              <p className="text-xs text-muted-foreground">
                {data.countingSince ? t("Counting since {date}: a zero means \"not since then\".", { date: data.countingSince }) : t("Nothing counted yet: the counts start with the build that added this page.")}
                {group && ` ${t("Looking at one kind of account, a number with fewer than {count} person-days behind it is hidden.", { count: data.floor })}`}
              </p>
            )}
          </CardContent>
        </Card>

        {isError && <ReadFailed what={t("the usage report")} onRetry={() => void refetch()} />}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                [t("Pages opened"), t("{used} of {total}", { used: data.pagesUsed, total: data.pagesInApp })],
                [t("Tabs and panels used"), t("{used} of {total}", { used: data.interactionsUsed, total: data.interactionsInApp })],
                [t("Actions done"), t("{used} of {total}", { used: data.actionsUsed, total: data.actionsInApp })],
                [t("Hard to use"), String(hard.length)],
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
              <CardHeader>
                <CardTitle className="text-lg">{t("What this suggests")}</CardTitle>
                <CardDescription>{t("Patterns in what people open, not proof of why. Tap any row below for the detail.")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {zeros.length === 0 ? (
                  <p>{t("Every page and tab was opened at least once.")}</p>
                ) : (
                  <>
                    <p className="font-semibold">{t("{count} pages and tabs were never opened:", { count: zeros.length })}</p>
                    <ul className="space-y-0.5 pl-4">
                      {Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1]).map(([why, n]) => <li key={why} className="list-disc">{n} · {why}</li>)}
                    </ul>
                  </>
                )}
                {hard.length > 0 && <p>{t.plural(hard.length, "{count} thing is tried often and mostly refused or failing, which is a feature people want and can't use: {names}.", "{count} things are tried often and mostly refused or failing, which is a feature people want and can't use: {names}.", { names: hard.slice(0, NAMED_IN_SUMMARY).map((e) => e.label).join("; ") })}</p>}
                {seenNotUsed.length > 0 && <p>{t.plural(seenNotUsed.length, "{count} page was opened but nothing was ever saved from it. Fine for a page you read; worth a look for one you're meant to use.", "{count} pages were opened but nothing was ever saved from them. Fine for a page you read; worth a look for one you're meant to use.")}</p>}
                <p className="pt-1 text-xs text-muted-foreground">
                  {t("People signed in this period (person-days): {list}", { list: data.activity.map((a) => `${a.userGroup} ${a.personDays == null ? t("fewer than {count}", { count: data.floor }) : a.personDays}`).join(" · ") })}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap gap-2" role="tablist">
                  {TABS.map((tr) => (
                    <button key={tr.kind} type="button" role="tab" aria-selected={tab === tr.kind} onClick={() => setTab(tr.kind)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", tab === tr.kind && "border-primary bg-primary text-primary-foreground")}>
                      {t(tr.label)}
                    </button>
                  ))}
                </div>
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t(TABS.find((tr) => tr.kind === tab)?.noun ?? "Find in pages")} aria-label={t("Filter")} className="h-9 w-full rounded-lg border bg-background px-3 text-sm" />
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <section>
                  <h3 className="font-semibold">{t("Used the most")}</h3>
                  <p className="text-xs text-muted-foreground">{t("Uses in the period, change against the period before.")}</p>
                  {most.length === 0 ? <p className="py-2 text-sm text-muted-foreground">{t("Nothing used yet.")}</p> : <ol className="divide-y">{most.map(row)}</ol>}
                </section>
                <section>
                  <h3 className="font-semibold">{t("Used the least")}</h3>
                  <p className="text-xs text-muted-foreground">{t("Zeros first, each with its likeliest reason.")}</p>
                  <ol className="divide-y">{least.map(row)}</ol>
                </section>
              </CardContent>
            </Card>

            {hard.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("Hard to use")}</CardTitle>
                  <CardDescription>{t("Tried at least {tries} times, refused or failed at least {percent}% of them.", { tries: HARD_TO_USE_MIN_TRIES, percent: Math.round(HARD_TO_USE_SHARE * PERCENT) })}</CardDescription>
                </CardHeader>
                <CardContent><ol className="divide-y">{hard.map(row)}</ol></CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
