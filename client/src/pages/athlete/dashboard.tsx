import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EntryPill, type CalendarEntry } from "@/components/calendar-view";
import { SkillDayViewDialog } from "@/components/skill-day-view-dialog";
import { NutritionQuickSummary } from "@/components/nutrition-quick-summary";
import { TeamChatQuickSummary } from "@/components/team-chat-quick-summary";
import { DigestBanner } from "@/components/digest-banner";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { addDays, format, formatISO, isToday } from "date-fns";
import {
  CalendarDays,
  UserPlus,
  Flame,
  ListChecks,
  CalendarCheck,
  Trophy,
} from "lucide-react";

type ProgressSummary = {
  totalWorkoutsCompleted: number;
  workoutsThisMonth: number;
  currentStreak: number;
  totalCompleted: number;
  recentPRs: { exerciseId: number; exerciseName: string }[];
};

export default function AthleteDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [viewingSkill, setViewingSkill] = useState<{
    skillAssignmentId: number;
    skillProgramDayId: number;
    date: string;
  } | null>(null);

  const { data: coaches = [], isLoading: coachesLoading } = useQuery<
    { id: number; name: string; coachCode: string }[]
  >({
    queryKey: ["/api/athlete/coaches"],
  });

  const { data: progress } = useQuery<ProgressSummary>({
    queryKey: ["/api/athlete/progress"],
  });

  // Same 3-day window the coach/admin dashboards use, against the same
  // /api/athlete/calendar the full Calendar tab reads -- always in sync,
  // never a second source of truth for what's actually scheduled.
  const days = [0, 1, 2].map((offset) => addDays(new Date(), offset));
  const rangeStart = formatISO(days[0], { representation: "date" });
  const rangeEnd = formatISO(days[days.length - 1], { representation: "date" });
  const { data: upcoming = [] } = useQuery<CalendarEntry[]>({
    queryKey: ["/api/athlete/calendar", rangeStart, rangeEnd],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/athlete/calendar?start=${rangeStart}&end=${rangeEnd}`,
      );
      return res.json();
    },
  });

  return (
    <AppShell title={`Welcome, ${user?.name?.split(" ")[0] ?? "Athlete"}`}>
      <div className="flex flex-col gap-4">
        <PendingCoachRequests />
        <DigestBanner />

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Next 3 Days</CardTitle>
              <CardDescription className="hidden sm:block">
                Quick look at what's coming up -- synced with the full calendar.
              </CardDescription>
            </div>
            <Link href="/athlete/calendar">
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
                          "text-xs font-semibold uppercase text-muted-foreground",
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
                          onClick={() =>
                            e.kind === "skill"
                              ? setViewingSkill({
                                  skillAssignmentId: e.assignmentId,
                                  skillProgramDayId: e.programDayId,
                                  date: e.date,
                                })
                              : navigate(`/athlete/day/${e.assignmentId}/${e.programDayId}/${e.date}`)
                          }
                        />
                      ))}
                      {overflow > 0 && (
                        <Link href="/athlete/calendar">
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
          <StatTile
            icon={Flame}
            label="Day streak"
            value={progress?.currentStreak ?? 0}
            href="/athlete/progress"
          />
          <StatTile
            icon={CalendarCheck}
            label="Workouts this month"
            value={progress?.workoutsThisMonth ?? 0}
            href="/athlete/progress"
          />
          <StatTile
            icon={ListChecks}
            label="Total completed"
            value={progress?.totalCompleted ?? 0}
            href="/athlete/progress"
          />
          <StatTile
            icon={Trophy}
            label="Recent PRs"
            value={progress?.recentPRs?.length ?? 0}
            href="/athlete/progress"
          />
        </div>

        {/* Quick view: today's nutrition and (for a coached athlete -- a
            Free Agent has no team) the latest team chat, both just a
            summary with a link through to their full page. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NutritionQuickSummary />
          {!coachesLoading && coaches.length > 0 && <TeamChatQuickSummary />}
        </div>

        {/* Free Agent status is purely derived (zero rows in coachAthletes
            for this athlete, nothing stored) -- see app-shell.tsx's own nav
            filtering for the same check. The full AI program builder/chat/
            form-check are a paid upgrade for a Free Agent (see
            requirePaidAiAccess in routes.ts, always false until real
            billing exists) -- Forge templates and exercise substitution
            stay free either way. Deliberately no AI branding or entry point
            here (no Sparkles icon, no "AI" in the copy) -- the AI program
            builder lives exclusively on the Library page. */}
        {!coachesLoading && coaches.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <Badge className="gap-1.5 bg-primary/15 text-primary hover:bg-primary/15">
                Free Agent
              </Badge>
              <p className="max-w-sm text-muted-foreground">
                You don't have a coach yet. Head to Library to build a program -- start from a
                Forge template and swap out any exercise that doesn't work for you, or let the AI
                ask a few questions and build it with you (a paid upgrade, coming soon).
              </p>
              <Button asChild>
                <Link href="/athlete/programs">
                  <CalendarDays className="h-4 w-4" />
                  Go to Library
                </Link>
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Joining a team later? Your programs stay right where they are.
              </p>
              <CoachJoinHint />
            </CardContent>
          </Card>
        )}
      </div>

      {viewingSkill && (
        <SkillDayViewDialog
          open
          onOpenChange={(open) => !open && setViewingSkill(null)}
          source={{
            kind: "athlete",
            skillAssignmentId: viewingSkill.skillAssignmentId,
            skillProgramDayId: viewingSkill.skillProgramDayId,
            date: viewingSkill.date,
          }}
        />
      )}
    </AppShell>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Flame;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-3 p-3 md:p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-2xl font-bold md:text-3xl">{value}</p>
            <p className="truncate text-sm text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

type CoachRequest = { id: number; coachId: number; coachName: string; createdAt: string };

// A coach can invite an existing Free Agent by email (see the roster's "Add
// Free Agent" button), but that never links them automatically -- the
// athlete always sees it here first and has to accept or decline.
function PendingCoachRequests() {
  const qc = useQueryClient();
  const { data: requests = [] } = useQuery<CoachRequest[]>({
    queryKey: ["/api/athlete/coach-requests"],
    refetchInterval: 60_000,
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, accept }: { id: number; accept: boolean }) => {
      await apiRequest("POST", `/api/athlete/coach-requests/${id}/respond`, { accept });
    },
    onSuccess: (_data, { accept }) => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/coach-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/coaches"] });
      toast.success(accept ? "You're on their roster now" : "Invite declined");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't respond to that invite"),
  });

  if (requests.length === 0) return null;

  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <Card key={r.id} className="border-primary/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              <p className="text-sm">
                <span className="font-semibold">{r.coachName}</span> wants to add you to their
                roster.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={respondMutation.isPending}
                onClick={() => respondMutation.mutate({ id: r.id, accept: false })}
              >
                Decline
              </Button>
              <Button
                size="sm"
                disabled={respondMutation.isPending}
                onClick={() => respondMutation.mutate({ id: r.id, accept: true })}
              >
                Accept
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CoachJoinHint() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/join-coach", { coachCode: code });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/coaches"] });
      toast.success(`Linked to ${data.coachName}`);
      setCode("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Invalid invite code"),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) joinMutation.mutate();
      }}
      className="flex items-center gap-2"
    >
      <span className="text-xs text-muted-foreground">Or join a team:</span>
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Enter invite code"
        className="h-9 w-40"
      />
      <Button type="submit" size="sm" disabled={joinMutation.isPending}>
        Join
      </Button>
    </form>
  );
}
