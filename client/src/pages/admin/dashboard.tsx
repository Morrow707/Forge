import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/stat-tile";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { EntryPill, type CalendarEntry } from "@/components/calendar-view";
import {
  Dumbbell,
  Plus,
  ArrowRight,
  ClipboardCheck,
  CalendarDays,
  Users,
  UserCheck,
  UserPlus,
  Compass,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { addDays, format, formatISO, isToday } from "date-fns";
import type { ExerciseWithOwnership } from "@/lib/exercise-types";

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
type SystemStatus = {
  ai: boolean;
  email: boolean;
  webPush: boolean;
  apns: boolean;
  usdaFoodLookup: boolean;
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: exercises = [] } = useQuery<ExerciseWithOwnership[]>({
    queryKey: ["/api/admin/exercises"],
  });
  // limit=1: this widget only needs the total count, not the rows
  // themselves -- see getPendingSubmissionsForAdmin/getOpenReportsForAdmin's
  // own {total, rows} shape in storage.ts.
  const { data: submissions } = useQuery<PendingSubmissionsResponse>({
    queryKey: ["/api/admin/submissions?limit=1"],
    queryFn: () => getJson("/api/admin/submissions?limit=1"),
  });
  const { data: reports } = useQuery<OpenReportsResponse>({
    queryKey: ["/api/admin/reports?limit=1"],
    queryFn: () => getJson("/api/admin/reports?limit=1"),
  });
  const { data: platformStats } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/platform-stats"],
  });
  const { data: systemStatus } = useQuery<SystemStatus>({
    queryKey: ["/api/admin/system-status"],
  });

  const categoryCounts = exercises.reduce<Record<string, number>>((acc, ex) => {
    acc[ex.category] = (acc[ex.category] ?? 0) + 1;
    return acc;
  }, {});
  const pendingCount = (submissions?.total ?? 0) + (reports?.total ?? 0);

  // Admin's own training calendar -- same role-agnostic /api/admin/my/calendar
  // endpoint admin/my-calendar.tsx uses, just windowed to 3 days here.
  const days = [0, 1, 2].map((offset) => addDays(new Date(), offset));
  const rangeStart = formatISO(days[0], { representation: "date" });
  const rangeEnd = formatISO(days[days.length - 1], { representation: "date" });
  const { data: upcoming = [] } = useQuery<CalendarEntry[]>({
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
    <AppShell title={`Welcome, ${user?.name?.split(" ")[0] ?? "Admin"}`}>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Next 3 Days</CardTitle>
              <CardDescription className="hidden sm:block">
                Your own training -- synced with the full calendar.
              </CardDescription>
            </div>
            <Link href="/admin/my">
              <Button variant="outline" size="sm">
                Full Calendar
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
                        {isToday(day) ? "Today" : format(day, "EEEE")}
                      </span>
                      <span className={cn("text-sm font-bold", isToday(day) && "text-primary")}>
                        {format(day, "MMM d")}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {shown.length === 0 && (
                        <p className="flex items-center justify-center gap-1.5 py-2 text-center text-xs text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          Nothing scheduled
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
                            +{overflow} more
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
          <StatTile icon={Users} label="Coaches" value={platformStats?.totalCoaches ?? 0} href="/admin/users?role=coach" />
          <StatTile icon={UserCheck} label="Athletes" value={platformStats?.totalAthletes ?? 0} href="/admin/users?role=athlete" />
          <StatTile
            icon={UserPlus}
            label="New signups this week"
            value={platformStats?.newSignupsThisWeek ?? 0}
            trend={platformStats?.newSignupsTrend}
            href="/admin/users"
          />
          <StatTile icon={Compass} label="Free Agents" value={platformStats?.freeAgentCount ?? 0} href="/admin/users" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link href="/admin/exercises">
            <Card className="cursor-pointer transition-colors hover:border-primary/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Dumbbell className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-3xl font-bold">{exercises.length}</p>
                  <p className="text-sm text-muted-foreground">Forge exercises</p>
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
                  <p className="font-display text-3xl font-bold">{Object.keys(categoryCounts).length}</p>
                  <p className="text-sm text-muted-foreground">Categories covered</p>
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
                  <p className="font-display text-3xl font-bold">{pendingCount}</p>
                  <p className="text-sm text-muted-foreground">Awaiting review</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>
              Optional integrations that silently no-op until a key is configured -- what's
              actually live right now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <StatusRow label="AI features" ok={systemStatus?.ai} />
              <StatusRow label="Email sending" ok={systemStatus?.email} />
              <StatusRow label="Web push" ok={systemStatus?.webPush} />
              <StatusRow label="Native (iOS) push" ok={systemStatus?.apns} />
              <StatusRow label="USDA food lookup" ok={systemStatus?.usdaFoodLookup} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Forge Library</CardTitle>
              <CardDescription>
                Every exercise you create here shows up for every coach, branded FORGE, and can
                only be edited by you.
              </CardDescription>
            </div>
            <Link href="/admin/exercises/new">
              <Button>
                <Plus className="h-4 w-4" />
                New Exercise
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <Link href="/admin/exercises">
              <Button variant="outline" className="w-full">
                View Full Library
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  trend,
  href,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  trend?: number[];
  href?: string;
}) {
  const card = (
    <Card className={cn(href && "cursor-pointer transition-colors hover:border-primary/50")}>
      <CardContent className="flex items-center gap-3 p-3 md:p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-display text-2xl font-bold md:text-3xl">{value}</p>
            {trend && <Sparkline values={trend} className="mb-1 shrink-0" />}
          </div>
          <p className="truncate text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function StatusRow({ label, ok }: { label: string; ok: boolean | undefined }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className={cn("text-sm", !ok && "text-muted-foreground")}>{label}</span>
      <span
        className={cn(
          "ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-none",
          ok ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
        )}
      >
        {ok ? "Live" : "Not set up"}
      </span>
    </div>
  );
}
