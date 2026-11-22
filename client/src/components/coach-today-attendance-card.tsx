import { useState } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { formatISO } from "date-fns";
import { Link } from "wouter";
import { CalendarCheck, ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { NOTHING_WAITING, needsLines, type NeedsYouToday } from "@shared/coach-needs-today";
import { warmupCompletionLine } from "@shared/program-day-warmup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReadFailed } from "@/components/read-failed";
import { CsvExportButton } from "@/components/csv-export-button";
import { apiRequest, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_CSV_HEADER,
  ATTENDANCE_LABEL,
  ATTENDANCE_STATUSES,
  SESSION_LABEL,
  attendanceWeekCsvRows,
  mondayOf,
  shiftWeek,
  type AttendanceStatus,
  type AttendanceWeek,
  type SessionStatus,
} from "@shared/attendance";

/* THE COACH DASHBOARD'S "TODAY" CARD (2026-11-21): who has a session today and whether they logged
 * it (from the workout log, nothing to type), plus one tap per athlete for attendance. The Week tab
 * is the same marks beside completion, Monday to Sunday, with a CSV. Held athletes are not on
 * Today; the week shows their earlier marks, flagged. See server/attendance.ts. */

type TodayAthlete = {
  athleteId: number;
  name: string;
  teamIds: number[];
  sessions: Array<{ title: string; status: SessionStatus }>;
  status: SessionStatus | "nothing_assigned";
  attendance: AttendanceStatus | null;
  /** Null when none of today's sessions has a warm-up (2026-11-22). */
  warmup: { withWarmup: number; done: number } | null;
};
type Today = {
  date: string;
  teams: Array<{ id: number; name: string }>;
  counts: { assigned: number; completed: number; started: number; notStarted: number };
  athletes: TodayAthlete[];
};

const ALL_TEAMS = "all";
const STATUS_PILL: Record<TodayAthlete["status"], { label: string; className: string }> = {
  completed: { label: SESSION_LABEL.completed, className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  started: { label: SESSION_LABEL.started, className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  not_started: { label: SESSION_LABEL.not_started, className: "bg-muted text-muted-foreground" },
  nothing_assigned: { label: "Nothing assigned", className: "text-muted-foreground" },
};
const MARK_STYLE: Record<AttendanceStatus, string> = {
  present: "bg-emerald-600 text-white hover:bg-emerald-600/90",
  absent: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  excused: "bg-blue-600 text-white hover:bg-blue-600/90",
};
const SHORT_MARK: Record<AttendanceStatus, string> = { present: "P", absent: "A", excused: "E" };
const DAY_LABEL: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", timeZone: "UTC" };

const localToday = () => formatISO(new Date(), { representation: "date" });
const teamParam = (teamId: string) => (teamId === ALL_TEAMS ? "" : `&teamId=${teamId}`);

export function CoachTodayAttendanceCard() {
  const [teamId, setTeamId] = useState<string>(ALL_TEAMS);
  const date = localToday();
  const today = useQuery<Today>({
    queryKey: ["/api/coach/attendance/today", date, teamId],
    queryFn: () => getJson(`/api/coach/attendance/today?date=${date}${teamParam(teamId)}`),
  });
  return (
    <Card data-testid="card-today-attendance">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="h-4 w-4 text-primary" />
              Today
            </CardTitle>
            <CardDescription>Who has a session today, whether they logged it, and who was here.</CardDescription>
          </div>
          {today.data && today.data.teams.length > 0 && (
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="w-[160px]" data-testid="select-attendance-team">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TEAMS}>Whole roster</SelectItem>
                {today.data.teams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <NeedsYouTodayLines date={date} />
        <Tabs defaultValue="today">
          <TabsList>
            <TabsTrigger value="today" data-testid="tab-attendance-today">Today</TabsTrigger>
            <TabsTrigger value="week" data-testid="tab-attendance-week">Week</TabsTrigger>
          </TabsList>
          <TabsContent value="today">
            <TodayBody query={today} date={date} teamId={teamId} />
          </TabsContent>
          <TabsContent value="week">
            <WeekBody teamId={teamId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/** "Needs you today" (2026-11-22): what is waiting on this coach, one line each, linking to the
 * screen that settles it. Coach-wide, not narrowed by the team picker; see shared/coach-needs-today.ts. */
function NeedsYouTodayLines({ date }: { date: string }) {
  const needs = useQuery<NeedsYouToday>({
    queryKey: ["/api/coach/needs-you-today", date],
    queryFn: () => getJson(`/api/coach/needs-you-today?date=${date}`),
  });
  if (needs.isError) return <ReadFailed what="what needs you today" error={needs.error} onRetry={() => void needs.refetch()} />;
  if (!needs.data) return <div className="h-6" aria-hidden data-testid="needs-today-loading" />;
  const lines = needsLines(needs.data);
  return (
    <section aria-label="Needs you today" data-testid="needs-you-today" className="rounded-md border p-3">
      <h3 className="mb-1 text-sm font-medium">Needs you today</h3>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="needs-today-nothing">{NOTHING_WAITING}</p>
      ) : (
        <ul className="divide-y">
          {lines.map((line) => (
            <li key={line.key}>
              <Link
                href={line.href}
                className="flex min-h-10 items-center justify-between gap-2 py-2 text-sm hover:underline"
                data-testid={`needs-today-${line.key}`}
              >
                <span>{line.text}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function useMarkMutations(date: string, teamId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["/api/coach/attendance/today"] });
    void qc.invalidateQueries({ queryKey: ["/api/coach/attendance/week"] });
  };
  const onError = (err: Error) => toast.error(`Couldn't save that mark. ${err.message}`);
  const team = teamId === ALL_TEAMS ? null : Number(teamId);
  const mark = useMutation({
    mutationFn: (v: { athleteId: number; status: AttendanceStatus | null }) =>
      apiRequest("PUT", "/api/coach/attendance", { date, athleteId: v.athleteId, status: v.status, teamId: team }),
    onSuccess: refresh,
    onError,
  });
  const markAll = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/coach/attendance/mark-all-present", { date, teamId: team })).json() as Promise<{ marked: number }>,
    onSuccess: (r) => {
      refresh();
      toast.success(r.marked === 1 ? "1 athlete marked present" : `${r.marked} athletes marked present`);
    },
    onError,
  });
  return { mark, markAll };
}

function TodayBody({ query, date, teamId }: { query: UseQueryResult<Today>; date: string; teamId: string }) {
  const { mark, markAll } = useMarkMutations(date, teamId);
  if (query.isError) return <ReadFailed what="today's roster" error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isLoading || !query.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { athletes, counts } = query.data;
  if (athletes.length === 0) return <p className="text-sm text-muted-foreground">No athletes on this roster yet.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" data-testid="text-today-counts">
          {counts.assigned === 0
            ? "No sessions assigned today."
            : `${counts.completed} of ${counts.assigned} completed · ${counts.started} started · ${counts.notStarted} not started`}
        </p>
        <Button size="sm" variant="outline" disabled={markAll.isPending} onClick={() => markAll.mutate()} data-testid="button-mark-all-present">
          Mark all present
        </Button>
      </div>
      <ul className="divide-y">
        {athletes.map((a) => (
          <li key={a.athleteId} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid={`row-today-${a.athleteId}`}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{a.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className={cn("mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium", STATUS_PILL[a.status].className)}>
                  {STATUS_PILL[a.status].label}
                </span>
                {a.warmup && <WarmupMark warmup={a.warmup} athleteId={a.athleteId} />}
                {a.sessions.map((s) => s.title).join(", ")}
              </p>
            </div>
            <div className="flex gap-1" role="group" aria-label={`Attendance for ${a.name}`}>
              {ATTENDANCE_STATUSES.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  aria-pressed={a.attendance === s}
                  title={ATTENDANCE_LABEL[s]}
                  className={cn("h-8 w-9 px-0", a.attendance === s && MARK_STYLE[s])}
                  disabled={mark.isPending}
                  data-testid={`button-mark-${s}-${a.athleteId}`}
                  onClick={() => mark.mutate({ athleteId: a.athleteId, status: a.attendance === s ? null : s })}
                >
                  {SHORT_MARK[s]}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">P present, A absent, E excused. Tap a lit mark again to clear it.</p>
    </div>
  );
}

function WeekBody({ teamId }: { teamId: string }) {
  const [monday, setMonday] = useState(() => mondayOf(localToday()));
  const week = useQuery<AttendanceWeek>({
    queryKey: ["/api/coach/attendance/week", monday, teamId],
    queryFn: () => getJson(`/api/coach/attendance/week?date=${monday}${teamParam(teamId)}`),
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Previous week" onClick={() => setMonday(shiftWeek(monday, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">Week of {monday}</span>
          <Button size="icon" variant="ghost" aria-label="Next week" onClick={() => setMonday(shiftWeek(monday, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <CsvExportButton
          filename={`attendance-${monday}.csv`}
          header={ATTENDANCE_CSV_HEADER}
          rows={week.data ? attendanceWeekCsvRows(week.data) : []}
          testId="button-export-attendance-csv"
        />
      </div>
      <WeekGrid query={week} />
    </div>
  );
}

/** The small warm-up mark beside an athlete's status: lit when every warm-up today was ticked. */
function WarmupMark({ warmup, athleteId }: { warmup: { withWarmup: number; done: number }; athleteId: number }) {
  const all = warmup.done >= warmup.withWarmup;
  const partial = `Warm-up ${warmupCompletionLine(warmup)} done`;
  const label = all ? "Warm-up done" : partial;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "mr-1.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-medium",
        all ? "bg-orange-500/15 text-orange-700 dark:text-orange-400" : "text-muted-foreground",
      )}
      data-testid={`warmup-mark-${athleteId}`}
    >
      <Flame className="h-3 w-3" />
      {all || warmup.withWarmup === 1 ? "WU" : `WU ${warmup.done}/${warmup.withWarmup}`}
    </span>
  );
}

function WeekGrid({ query }: { query: UseQueryResult<AttendanceWeek> }) {
  if (query.isError) return <ReadFailed what="this week's attendance" error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isLoading || !query.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { dates, athletes, warmupTeam } = query.data;
  if (athletes.length === 0) return <p className="text-sm text-muted-foreground">No athletes on this roster yet.</p>;
  const anyWarmups = warmupTeam.withWarmup > 0;
  return (
    <div className="overflow-x-auto">
      {anyWarmups && (
        <p className="mb-2 text-xs" data-testid="text-warmup-team-rate">
          <Flame className="mr-1 inline h-3 w-3 text-orange-500" />
          Warm-ups done: {warmupCompletionLine(warmupTeam)}
          {warmupTeam.ratePercent != null && ` (${warmupTeam.ratePercent}%)`}
        </p>
      )}
      <table className="w-full text-xs" data-testid="table-attendance-week">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-1 pr-2 text-left font-medium">Athlete</th>
            {dates.map((d) => (
              <th key={d} className="px-1 py-1 text-center font-medium">
                {new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", DAY_LABEL)}
              </th>
            ))}
            {anyWarmups && <th className="px-1 py-1 text-center font-medium">Warm-up</th>}
          </tr>
        </thead>
        <tbody>
          {athletes.map((a) => (
            <tr key={a.athleteId} className="border-t">
              <td className="max-w-[120px] truncate py-1.5 pr-2">
                {a.name}
                {a.held && <span className="ml-1 text-muted-foreground">(on hold)</span>}
              </td>
              {a.days.map((d) => (
                <td key={d.date} className="px-1 py-1.5 text-center">
                  <div className={cn("font-semibold", d.attendance && MARK_TEXT[d.attendance])}>{d.attendance ? SHORT_MARK[d.attendance] : "·"}</div>
                  <div className="text-muted-foreground">{d.assigned > 0 ? `${d.completed}/${d.assigned}` : ""}</div>
                </td>
              ))}
              {anyWarmups && (
                <td className="px-1 py-1.5 text-center" data-testid={`warmup-week-${a.athleteId}`}>
                  {a.warmup.withWarmup > 0 ? warmupCompletionLine(a.warmup) : "·"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        Letter: attendance mark. Fraction: sessions completed of assigned.{anyWarmups && " Warm-up: warm-ups ticked done of days that had one."}
      </p>
    </div>
  );
}

const MARK_TEXT: Record<AttendanceStatus, string> = {
  present: "text-emerald-600",
  absent: "text-destructive",
  excused: "text-blue-600",
};
