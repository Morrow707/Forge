import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { CalendarEntry } from "@/components/calendar-view";
import { SkillDayViewDialog } from "@/components/skill-day-view-dialog";
import { NutritionQuickSummary } from "@/components/nutrition-quick-summary";
import { TeamChatQuickSummary } from "@/components/team-chat-quick-summary";
import { DigestBanner } from "@/components/digest-banner";
import { PendingVideosBanner } from "@/components/pending-videos-banner";
import { SortableHideableWidget } from "@/components/sortable-hideable-widget";
import { NextThreeDaysCard } from "@/components/next-three-days-card";
import { StatTile } from "@/components/stat-tile";
import { ReadinessBanner } from "@/components/readiness-banner";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { resolveWidgetOrder } from "@/lib/widget-layout";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { addDays, formatISO } from "date-fns";
import { Pencil, Check } from "lucide-react";
import {
  CalendarDays,
  UserPlus,
  Flame,
  ListChecks,
  CalendarCheck,
  Trophy,
  MessageSquareText,
  ChevronDown,
  Loader2,
} from "lucide-react";

// Kept in sync with the hook call below -- shared so the indicator's own
// "have we crossed the threshold yet" styling matches what actually
// triggers the refresh.
const PULL_REFRESH_THRESHOLD = 60;

type ProgressSummary = {
  totalWorkoutsCompleted: number;
  workoutsThisMonth: number;
  currentStreak: number;
  totalCompleted: number;
  recentPRs: { exerciseId: number; exerciseName: string }[];
  // Real daily-completed-workout counts for the last 7 days (oldest first),
  // bucketed server-side from the athlete's own workoutLogs rows -- backs
  // the Day Streak / Workouts This Month sparklines below. See
  // getAthleteProgressSummary in server/storage.ts.
  last7DaysCompleted: number[];
};

export default function AthleteDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const widgetVisibility = useWidgetVisibility("athlete");
  const [viewingSkill, setViewingSkill] = useState<{
    skillAssignmentId: number;
    skillProgramDayId: number;
    date: string;
  } | null>(null);

  // Same query AppShell already makes for its own CSS-var re-skin --
  // React Query dedupes the identical in-flight request, so reading it
  // again here for the welcome banner costs nothing extra.
  const { data: branding, refetch: refetchBranding } = useQuery<{
    brandWelcomeMessage?: string | null;
  }>({
    queryKey: ["/api/branding/me"],
    queryFn: () => getJson("/api/branding/me"),
  });

  const {
    data: coaches = [],
    isLoading: coachesLoading,
    refetch: refetchCoaches,
  } = useQuery<{ id: number; name: string; coachCode: string }[]>({
    queryKey: ["/api/athlete/coaches"],
  });

  const { data: progress, refetch: refetchProgress } = useQuery<ProgressSummary>({
    queryKey: ["/api/athlete/progress"],
  });

  // Same 3-day window the coach/admin dashboards use, against the same
  // /api/athlete/calendar the full Calendar tab reads -- always in sync,
  // never a second source of truth for what's actually scheduled.
  const days = [0, 1, 2].map((offset) => addDays(new Date(), offset));
  const rangeStart = formatISO(days[0], { representation: "date" });
  const rangeEnd = formatISO(days[days.length - 1], { representation: "date" });
  const today = rangeStart;
  const { data: upcoming = [], refetch: refetchUpcoming } = useQuery<CalendarEntry[]>({
    queryKey: ["/api/athlete/calendar", rangeStart, rangeEnd],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/athlete/calendar?start=${rangeStart}&end=${rangeEnd}`,
      );
      return res.json();
    },
  });

  // Pull-to-refresh re-fetches every query this dashboard's widgets read
  // from, rather than a single "the" query -- there's no one endpoint that
  // backs the whole page.
  const { containerRef, pullDistance, isRefreshing } = usePullToRefresh(
    async () => {
      await Promise.all([
        refetchBranding(),
        refetchCoaches(),
        refetchProgress(),
        refetchUpcoming(),
      ]);
    },
    { threshold: PULL_REFRESH_THRESHOLD },
  );

  // Team Chat only ever renders for a coached athlete (a Free Agent has no
  // team) -- excluded from the sortable set entirely when it wouldn't
  // render at all, rather than showing a drag handle for a widget that can
  // never actually appear.
  const hasTeamChat = !coachesLoading && coaches.length > 0;
  const WIDGET_IDS = [
    "next-3-days",
    "nutrition-summary",
    "stat-tiles",
    ...(hasTeamChat ? ["team-chat"] : []),
  ];
  const widgetOrder = resolveWidgetOrder(widgetVisibility.layout, WIDGET_IDS);
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = widgetOrder.indexOf(String(active.id));
    const newIndex = widgetOrder.indexOf(String(over.id));
    widgetVisibility.setOrder(arrayMove(widgetOrder, oldIndex, newIndex));
  }

  const widgetsById: Record<string, ReactNode> = {
    "next-3-days": (
      <SortableHideableWidget
        id="next-3-days"
        label="Next 3 Days"
        editMode={widgetVisibility.editMode}
        isHidden={widgetVisibility.hidden.has("next-3-days")}
        onToggle={widgetVisibility.setHidden}
      >
        <NextThreeDaysCard
          days={days}
          entries={upcoming}
          calendarHref="/athlete/calendar"
          description="Quick look at what's coming up -- synced with the full calendar."
          onEntryClick={(e) =>
            e.kind === "skill"
              ? setViewingSkill({
                  skillAssignmentId: e.assignmentId,
                  skillProgramDayId: e.programDayId,
                  date: e.date,
                })
              : navigate(`/athlete/day/${e.assignmentId}/${e.programDayId}/${e.date}`)
          }
        />
      </SortableHideableWidget>
    ),
    "nutrition-summary": (
      <SortableHideableWidget
        id="nutrition-summary"
        label="Today's Nutrition"
        editMode={widgetVisibility.editMode}
        isHidden={widgetVisibility.hidden.has("nutrition-summary")}
        onToggle={widgetVisibility.setHidden}
      >
        <NutritionQuickSummary />
      </SortableHideableWidget>
    ),
    "stat-tiles": (
      <SortableHideableWidget
        id="stat-tiles"
        label="Stat Tiles"
        editMode={widgetVisibility.editMode}
        isHidden={widgetVisibility.hidden.has("stat-tiles")}
        onToggle={widgetVisibility.setHidden}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={Flame}
            label="Day streak"
            value={progress?.currentStreak ?? 0}
            href="/athlete/progress"
            trend={progress?.last7DaysCompleted}
          />
          <StatTile
            icon={CalendarCheck}
            label="Workouts this month"
            value={progress?.workoutsThisMonth ?? 0}
            href="/athlete/progress"
            trend={progress?.last7DaysCompleted}
          />
          {/* No trend here on purpose -- totalCompleted is an all-time
              counter, and the same last7DaysCompleted series already drives
              the two tiles above it. A third copy of it wouldn't tell a
              coach anything new about "total," just repeat the same week. */}
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
      </SortableHideableWidget>
    ),
    "team-chat": (
      <SortableHideableWidget
        id="team-chat"
        label="Team Chat"
        editMode={widgetVisibility.editMode}
        isHidden={widgetVisibility.hidden.has("team-chat")}
        onToggle={widgetVisibility.setHidden}
      >
        <TeamChatQuickSummary />
      </SortableHideableWidget>
    ),
  };

  return (
    <AppShell
      title={`Welcome, ${user?.name?.split(" ")[0] ?? "Athlete"}`}
      actions={
        <Button
          size="sm"
          variant={widgetVisibility.editMode ? "default" : "outline"}
          onClick={() => widgetVisibility.setEditMode((v) => !v)}
        >
          {widgetVisibility.editMode ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          {widgetVisibility.editMode ? "Done" : "Edit"}
        </Button>
      }
    >
      <div ref={containerRef} className="relative">
        {/* Grows from 0 as the user pulls down from the top of the list --
            purely visual, so it's hidden from screen readers; the refetch
            itself is announced however the query's own consumers already
            surface loading/error state. */}
        <div
          aria-hidden="true"
          className="flex items-center justify-center overflow-hidden transition-[height] duration-150 ease-out"
          style={{ height: pullDistance }}
        >
          {isRefreshing ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <ChevronDown
              className={cn(
                "h-5 w-5 transition-transform duration-150",
                pullDistance >= PULL_REFRESH_THRESHOLD ? "text-primary" : "text-muted-foreground",
              )}
              style={{
                transform: `rotate(${Math.min(1, pullDistance / PULL_REFRESH_THRESHOLD) * 180}deg)`,
              }}
            />
          )}
        </div>

      <div className="flex flex-col gap-4">
        {branding?.brandWelcomeMessage && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-start gap-2.5 py-3.5 text-sm">
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="whitespace-pre-wrap">{branding.brandWelcomeMessage}</p>
            </CardContent>
          </Card>
        )}
        <ReadinessBanner date={today} />
        <PendingCoachRequests />
        <PendingVideosBanner />
        <DigestBanner />

        {/* Today's nutrition sits right under the calendar in default order
            -- it's the one thing on this page an athlete plausibly checks/
            updates several times a day, unlike the stat tiles and team chat
            below it (see WIDGET_IDS above for the default order itself). */}
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
            {widgetOrder.map((id) => (
              <div key={id} style={{ display: "contents" }}>
                {widgetsById[id]}
              </div>
            ))}
          </SortableContext>
        </DndContext>

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
