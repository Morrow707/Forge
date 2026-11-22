import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnvilDailyCard } from "@/components/anvil-daily-card";
import { Link, useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/stat-tile";
import { ReadFailed } from "@/components/read-failed";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { EntryPill, type CalendarEntry } from "@/components/calendar-view";
import {
  Dumbbell,
  ArrowRight,
  ClipboardCheck,
  CalendarDays,
  Users,
  UserCheck,
  UserPlus,
  Compass,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { addDays, formatISO, isToday } from "date-fns";
import { msg, useT } from "@/i18n";

type PendingSubmissionsResponse = { total: number };
type OpenReportsResponse = { total: number };
type PlatformStats = {
  totalCoaches: number;
  totalAthletes: number;
  newSignupsThisWeek: number;
  // Real per-day signup counts for the last 7 days (oldest first), bucketed
  // server-side from users.createdAt -- backs the sparkline below. See
  // getAdminPlatformStats in server/storage.ts.
  newSignupsTrend: number[];
  freeAgentCount: number;
};
type IntegrationState = "ok" | "warning" | "failing" | "off";
type Integration = {
  state: IntegrationState;
  message?: string;
  count?: number;
  lastSeenAt?: string;
};
type SystemEvent = {
  id: number;
  source: string;
  severity: "warning" | "error";
  message: string;
  detail: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
};
type SystemStatus = {
  // Original booleans, still returned so nothing that reads the old shape breaks.
  ai: boolean;
  email: boolean;
  webPush: boolean;
  apns: boolean;
  usdaFoodLookup: boolean;
  integrations: Record<string, Integration>;
  errorReporting: { serverDsnSet: boolean; clientDsnSet: boolean };
  billing: {
    secretKeySet: boolean;
    webhookSecretSet: boolean;
    missingPriceEnvVars: string[];
    billingLive: boolean;
    enforcementEnabled: boolean;
  };
  storage: { freeBytes: number; totalBytes: number; usedFraction: number; state: IntegrationState } | null;
  delivery: {
    push: { attempted: number; delivered: number; rate: number | null };
    email: { attempted: number; delivered: number; rate: number | null };
  };
  jobs: JobHealth[];
  activeEvents: SystemEvent[];
};
type JobHealth = {
  jobName: string;
  hourUtc: number;
  lastRunAt: string | null;
  lastOutcome: "ran" | "failed" | "skipped_locked" | "skipped_unavailable" | null;
  lastDetail: Record<string, number> | null;
  lastError: string | null;
  durationMs: number | null;
  overdue: boolean;
};

export default function AdminDashboard() {
  const t = useT();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  // The count, not the library -- see storage.summarizeExercisesForOwners. Keyed under
  // "/api/admin/exercises" so every invalidation of the list refreshes these numbers too.
  const { data: exerciseSummary, isError: exercisesFailed } = useQuery<{ total: number; categories: number }>({
    queryKey: ["/api/admin/exercises", "summary"],
  });
  // limit=1: this widget only needs the total count, not the rows
  // themselves -- see getPendingSubmissionsForAdmin/getOpenReportsForAdmin's
  // own {total, rows} shape in storage.ts.
  const { data: submissions, isError: submissionsFailed } = useQuery<PendingSubmissionsResponse>({
    queryKey: ["/api/admin/submissions?limit=1"],
    queryFn: () => getJson("/api/admin/submissions?limit=1"),
  });
  const { data: reports, isError: reportsFailed } = useQuery<OpenReportsResponse>({
    queryKey: ["/api/admin/reports?limit=1"],
    queryFn: () => getJson("/api/admin/reports?limit=1"),
  });
  const { data: platformStats, isError: statsFailed } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/platform-stats"],
  });
  // Polled rather than fetched once: this card is what an operator leaves
  // open to watch, and a status panel that only tells the truth at the moment
  // you loaded it is barely a status panel. A minute is well inside the
  // 24-hour window a failure stays active for, so nothing is missed.
  const { data: systemStatus, isError: systemStatusFailed, refetch: refetchSystemStatus } = useQuery<SystemStatus>({
    queryKey: ["/api/admin/system-status"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const activeEvents = systemStatus?.activeEvents ?? [];
  const jobs = systemStatus?.jobs ?? [];
  const queryClient = useQueryClient();
  const clearEvent = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/system-events/${id}/clear`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/system-status"] }),
    // Without this the Clear button is indistinguishable from a dead control: the
    // row stays, nothing is said, and the next press does nothing either.
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't clear that event")),
  });

  const pendingCount = (submissions?.total ?? 0) + (reports?.total ?? 0);
  // Same rule as the StatTile `unavailable` prop beside it: a failed read must not
  // render as a confident "0 awaiting review", because the one thing that number is
  // for is deciding whether to open the queue at all.
  const pendingFailed = submissionsFailed || reportsFailed;

  // Admin's own training calendar -- same role-agnostic /api/admin/my/calendar
  // endpoint admin/my-calendar.tsx uses, just windowed to 3 days here.
  const days = [0, 1, 2].map((offset) => addDays(new Date(), offset));
  const rangeStart = formatISO(days[0], { representation: "date" });
  const rangeEnd = formatISO(days[days.length - 1], { representation: "date" });
  const { data: upcoming = [], isError: upcomingFailed } = useQuery<CalendarEntry[]>({
    queryKey: ["/api/admin/my/calendar", rangeStart, rangeEnd],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/my/calendar?start=${rangeStart}&end=${rangeEnd}`,
      );
      return res.json();
    },
  });

  return (
    <AppShell title={t("Welcome, {name}", { name: user?.name?.split(" ")[0] ?? t("Admin") })}>
      <div className="flex flex-col gap-4">
        {/* The admin account is the one that films the same four lifts over and over, so it is
            the one most likely to take this daily. Hidden until the server says it is open. */}
        <AnvilDailyCard />
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{t("Next 3 Days")}</CardTitle>
              <CardDescription className="hidden sm:block">
                {t("Your own training, synced with the full calendar.")}
              </CardDescription>
            </div>
            <Link href="/admin/my">
              <Button variant="outline" size="sm">
                {t("Full Calendar")}
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {days.map((day) => {
                const dateStr = formatISO(day, { representation: "date" });
                const dayEntries = upcoming.filter((e) => e.date === dateStr);
                const shown = dayEntries.slice(0, 3);
                const overflow = dayEntries.length - shown.length;
                return (
                  <div key={dateStr} className="rounded-md border border-border p-2">
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span
                        className={cn(
                          "label-xs",
                          isToday(day) && "text-primary",
                        )}
                      >
                        {isToday(day) ? t("Today") : t.date(day, { weekday: "long" })}
                      </span>
                      <span className={cn("text-sm font-bold", isToday(day) && "text-primary")}>
                        {t.date(day, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {shown.length === 0 && (
                        <p className="flex items-center justify-center gap-1.5 py-2 text-center text-xs text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {upcomingFailed ? t("Couldn't load") : t("Nothing scheduled")}
                        </p>
                      )}
                      {shown.map((e) => (
                        <EntryPill
                          key={`${e.assignmentId}-${e.programDayId}`}
                          entry={e}
                          onClick={() => {
                            // Admins have no roster to assign skill programs
                            // to yet -- unreachable today, guarded anyway
                            // since this route wouldn't understand a skill
                            // day's IDs if it ever were (same guard
                            // my-calendar.tsx uses).
                            if (e.kind === "skill") return;
                            navigate(`/admin/my/day/${e.assignmentId}/${e.programDayId}/${e.date}`);
                          }}
                        />
                      ))}
                      {overflow > 0 && (
                        <Link href="/admin/my">
                          <span className="block px-1.5 text-[11px] font-semibold text-primary hover:underline">
                            {t("+{count} more", { count: overflow })}
                          </span>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Every one of these reads `?? 0`, so a failed platform-stats request renders
              a platform with no coaches, no athletes and no signups -- which is not a
              quiet dashboard, it is an alarming one, and wrong. */}
          <StatTile icon={Users} label={t("Coaches")} value={platformStats?.totalCoaches ?? 0} unavailable={statsFailed} href="/admin/users?role=coach" />
          <StatTile icon={UserCheck} label={t("Athletes")} value={platformStats?.totalAthletes ?? 0} unavailable={statsFailed} href="/admin/users?role=athlete" />
          <StatTile
            icon={UserPlus}
            label={t("New signups this week")}
            value={platformStats?.newSignupsThisWeek ?? 0}
            unavailable={statsFailed}
            trend={platformStats?.newSignupsTrend}
            href="/admin/users"
          />
          <StatTile icon={Compass} label={t("Free Agents")} value={platformStats?.freeAgentCount ?? 0} unavailable={statsFailed} href="/admin/users" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link href="/admin/exercises">
            <Card className="cursor-pointer transition-colors hover:border-primary/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Dumbbell className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-3xl font-bold">
                    {exercisesFailed ? "--" : (exerciseSummary?.total ?? 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {exercisesFailed ? t("Forge exercises, couldn't load") : t("Forge exercises")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/exercises">
            <Card className="cursor-pointer transition-colors hover:border-primary/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-success/15 text-success">
                  <ArrowRight className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-3xl font-bold">{exerciseSummary?.categories ?? 0}</p>
                  <p className="text-sm text-muted-foreground">{t("Categories covered")}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/review">
            <Card className="cursor-pointer transition-colors hover:border-primary/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-500/15 text-amber-400">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className={pendingFailed ? "font-display text-3xl font-bold text-muted-foreground" : "font-display text-3xl font-bold"}>
                    {pendingFailed ? "--" : pendingCount}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {pendingFailed ? t("Awaiting review, couldn't load") : t("Awaiting review")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("System Status")}</CardTitle>
            <CardDescription>
              {t("Live state, not just what's configured, a badge turns red when something actually fails, and green again when it next succeeds.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <StatusRow label={t("AI features")} status={systemStatus?.integrations?.ai} />
              <StatusRow label={t("Email sending")} status={systemStatus?.integrations?.email} />
              <StatusRow label={t("Web push")} status={systemStatus?.integrations?.webPush} />
              <StatusRow label={t("Native (iOS) push")} status={systemStatus?.integrations?.apns} />
              <StatusRow label={t("USDA food lookup")} status={systemStatus?.integrations?.usdaFoodLookup} />
              <StatusRow label={t("Database")} status={systemStatus?.integrations?.database} />
              <StatusRow label={t("Billing (Stripe)")} status={systemStatus?.integrations?.billing} />
              {systemStatus?.storage && (
                <StatusRow
                  label={t("Video storage {percent}% full", { percent: Math.round(systemStatus.storage.usedFraction * 100) })}
                  status={{
                    state: systemStatus.storage.state,
                    message: t("{free} free of {total}", { free: formatGb(systemStatus.storage.freeBytes), total: formatGb(systemStatus.storage.totalBytes) }),
                  }}
                />
              )}
              <StatusRow label={t("Error alerting (Sentry)")} status={sentryStatus(systemStatus)} />
            </div>

            {systemStatus?.billing?.missingPriceEnvVars?.length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {t.plural(systemStatus.billing.missingPriceEnvVars.length, "Stripe is missing {count} price ID: {ids}", "Stripe is missing {count} price IDs: {ids}", { ids: systemStatus.billing.missingPriceEnvVars.join(", ") })}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* The nightly sweeps. Two of these permanently delete minor
            athletes' footage on a compliance schedule, so "did it run" is a
            question with a policy answer behind it -- and until now the only
            record was a log line. Always rendered, unlike the problems card:
            the whole value here is being able to confirm the boring case. */}
        <Card className={cn("md:col-span-2", jobs.some((j) => j.overdue) && "border-destructive/50")}>
          <CardHeader>
            <CardTitle>{t("Nightly jobs")}</CardTitle>
            <CardDescription>
              {t("Each sweep's last run. Overdue means its scheduled hour passed with no run recorded, the failure a run history alone cannot show, since a job that never starts leaves no trace.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* This card is the operator's evidence that the nightly jobs are running at
                all -- data retention, the research mirror, the norms rebuild. "No
                scheduled jobs have registered yet" off a failed read points at the
                server having never booted, which is a very different emergency from the
                one actually happening. */}
            {systemStatusFailed ? (
              <ReadFailed
                what={t("job health")}
                onRetry={() => void refetchSystemStatus()}
                className="flex flex-col items-start gap-2 text-left"
              />
            ) : jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("No scheduled jobs have registered yet. They register as the server boots.")}
              </p>
            ) : (
              jobs.map((job) => <JobRow key={job.jobName} job={job} />)
            )}
          </CardContent>
        </Card>

        {/* Rendered only when something is actually wrong. An always-present
            "no problems" panel becomes furniture people stop reading, and the
            whole point here is that the card's presence is itself the signal. */}
        {activeEvents.length > 0 && (
          <Card className="border-destructive/50 md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                {t.plural(activeEvents.length, "{count} problem in the last 24 hours", "{count} problems in the last 24 hours")}
              </CardTitle>
              <CardDescription>
                {t("Recorded inside Forge, so these appear whether or not Sentry alerting is configured. Dismissing one hides it until it happens again.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 rounded-md border border-border px-3 py-2">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-none",
                      event.severity === "error"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-amber-500/15 text-amber-500",
                    )}
                  >
                    {event.source}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{event.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.count > 1 ? `${t("{count} times, last", { count: event.count })} ` : ""}
                      {t.date(event.lastSeenAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {event.detail ? `, ${event.detail}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearEvent.mutate(event.id)}
                    disabled={clearEvent.isPending}
                  >
                    {t("Dismiss")}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

      </div>
    </AppShell>
  );
}

// The integration badges say "Live"/"Not set up", which reads wrong for a
// job -- a sweep is not live, it either ran or it did not.
const JOB_BADGE: Record<string, string> = {
  ran: msg("Ran"),
  failed: msg("Failed"),
  skipped_locked: msg("Skipped"),
  skipped_unavailable: msg("Skipped"),
  none: msg("No runs"),
};

function JobRow({ job }: { job: JobHealth }) {
  const t = useT();
  // Overdue outranks the last outcome: a job whose last run succeeded a
  // week ago is a problem no matter how well that run went.
  const state: IntegrationState = job.overdue
    ? "failing"
    : job.lastOutcome === "failed" || job.lastOutcome === "skipped_unavailable"
      ? "failing"
      : job.lastOutcome === null
        ? "off"
        : "ok";
  const presentation = STATUS_PRESENTATION[state];
  const Icon = presentation.icon;

  const outcomeText = () => {
    if (!job.lastRunAt) return t("Never run on this deployment");
    const when = t.date(job.lastRunAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    switch (job.lastOutcome) {
      case "ran": {
        // The counts the job used to only print. Showing them is what
        // separates "it ran" from "it ran and did something".
        const counts = job.lastDetail
          ? Object.entries(job.lastDetail)
              .map(([key, value]) => `${value} ${key}`)
              .join(", ")
          : null;
        return `${t("Ran {when}", { when })}${counts ? `, ${counts}` : ""}`;
      }
      case "failed":
        return `${t("Failed {when}", { when })}${job.lastError ? `, ${job.lastError}` : ""}`;
      case "skipped_locked":
        return t("Skipped {when}, another instance was running it", { when });
      case "skipped_unavailable":
        return t("Skipped {when}, could not reach the database", { when });
      default:
        return t("Last seen {when}", { when });
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border px-3 py-2",
        state === "failing" ? "border-destructive/50" : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", presentation.iconClass)} />
        <span className="text-sm">{job.jobName}</span>
        <span className="text-xs text-muted-foreground">
          {t("daily at {hour}:00 UTC", { hour: String(job.hourUtc).padStart(2, "0") })}
        </span>
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-none",
            job.overdue ? "bg-destructive/15 text-destructive" : presentation.badgeClass,
          )}
        >
          {job.overdue ? t("Overdue") : t(JOB_BADGE[job.lastOutcome ?? "none"])}
        </span>
      </div>
      <p className="pl-6 text-xs text-muted-foreground">{outcomeText()}</p>
    </div>
  );
}

function formatGb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

// Monitoring reporting on itself. With no DSN set, every alert path out of
// this app is dark and nothing else on the page would say so.
function sentryStatus(status: SystemStatus | undefined): Integration | undefined {
  if (!status?.errorReporting) return undefined;
  const { serverDsnSet, clientDsnSet } = status.errorReporting;
  if (!serverDsnSet) return { state: "off", message: msg("No alerts are being sent anywhere") };
  if (!clientDsnSet) return { state: "warning", message: msg("Server alerts on, browser alerts off") };
  return { state: "ok" };
}

// Four states, not two. "Not set up" and "broken" used to render identically
// because both were merely "not true", which is why the badge could never
// report a failure -- the case an operator most needs to see.
const STATUS_PRESENTATION: Record<
  IntegrationState,
  { badge: string; icon: typeof CheckCircle2; iconClass: string; badgeClass: string; muted: boolean }
> = {
  ok: {
    badge: msg("Live"),
    icon: CheckCircle2,
    iconClass: "text-success",
    badgeClass: "bg-success/15 text-success",
    muted: false,
  },
  warning: {
    badge: msg("Degraded"),
    icon: AlertTriangle,
    iconClass: "text-amber-500",
    badgeClass: "bg-amber-500/15 text-amber-500",
    muted: false,
  },
  failing: {
    badge: msg("Failing"),
    icon: AlertTriangle,
    iconClass: "text-destructive",
    badgeClass: "bg-destructive/15 text-destructive",
    muted: false,
  },
  off: {
    badge: msg("Not set up"),
    icon: XCircle,
    iconClass: "text-muted-foreground",
    badgeClass: "bg-muted text-muted-foreground",
    muted: true,
  },
};

function StatusRow({ label, status }: { label: string; status: Integration | undefined }) {
  const t = useT();
  // Undefined means the request hasn't landed yet, which is not the same as
  // "off" -- rendering "Not set up" during the first paint would flash a
  // false alarm on every load.
  const state = status?.state ?? "off";
  const presentation = STATUS_PRESENTATION[state];
  const Icon = presentation.icon;
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border px-3 py-2",
        state === "failing" ? "border-destructive/50" : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", presentation.iconClass)} />
        <span className={cn("text-sm", presentation.muted && "text-muted-foreground")}>{label}</span>
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-none",
            presentation.badgeClass,
          )}
        >
          {t(presentation.badge)}
        </span>
      </div>
      {status?.message && (
        <p className="pl-6 text-xs text-muted-foreground">
          {t(status.message)}
          {status.count && status.count > 1 ? ` ${t("({count} times)", { count: status.count })}` : ""}
        </p>
      )}
    </div>
  );
}
