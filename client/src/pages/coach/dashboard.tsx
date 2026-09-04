import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CalendarEntry } from "@/components/calendar-view";
import { CoachDayEditDialog } from "@/components/coach-day-edit-dialog";
import { SkillDayViewDialog } from "@/components/skill-day-view-dialog";
import { CoachDigestBanner } from "@/components/coach-digest-banner";
import { WeeklyDigestCard } from "@/components/weekly-digest-card";
import { TeamPrWallCard } from "@/components/team-pr-wall-card";
import { ReengagementBanner } from "@/components/reengagement-banner";
import { SortableHideableWidget } from "@/components/sortable-hideable-widget";
import { NextThreeDaysCard } from "@/components/next-three-days-card";
import { StatTile } from "@/components/stat-tile";
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
import { Pencil, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import {
  Dumbbell,
  ListChecks,
  Users,
  ArrowRight,
  Copy,
  Mail,
  QrCode,
  HeartPulse,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { addDays, formatISO } from "date-fns";

// Kept in sync with the hook call below -- shared so the indicator's own
// "have we crossed the threshold yet" styling matches what actually
// triggers the refresh.
const PULL_REFRESH_THRESHOLD = 60;

type ProgramSummary = {
  id: number;
  name: string;
  description: string | null;
  weekCount: number;
  dayCount: number;
  assignedAthleteCount: number;
};

type RosterEntry = { id: number; name: string; email: string };
type ExerciseSummary = { id: number };
type TeamSummary = { id: number; name: string; code: string | null };

export default function CoachDashboard() {
  const { user } = useAuth();
  const widgetVisibility = useWidgetVisibility("coach");
  const { data: programs = [], refetch: refetchPrograms } = useQuery<ProgramSummary[]>({
    queryKey: ["/api/coach/programs"],
  });
  const { data: roster = [], refetch: refetchRoster } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });
  const { data: exercises = [], refetch: refetchExercises } = useQuery<ExerciseSummary[]>({
    queryKey: ["/api/coach/exercises"],
  });
  const { data: teams = [], refetch: refetchTeams } = useQuery<TeamSummary[]>({
    queryKey: ["/api/coach/teams"],
  });
  const { data: wellnessToday = [], refetch: refetchWellnessToday } = useQuery<
    { level: "green" | "yellow" | "red" }[]
  >({
    queryKey: ["/api/coach/roster-wellness"],
  });
  const flaggedToday = wellnessToday.filter((w) => w.level === "red").length;
  // Real last-7-days flagged counts, bucketed server-side from the same
  // wellnessCheckins rows "Flagged today" itself reads -- see
  // getRosterFlaggedTrend in server/storage.ts.
  const { data: flaggedTrend = [], refetch: refetchFlaggedTrend } = useQuery<number[]>({
    queryKey: ["/api/coach/roster-wellness-trend"],
  });

  const days = [0, 1, 2].map((offset) => addDays(new Date(), offset));
  const rangeStart = formatISO(days[0], { representation: "date" });
  const rangeEnd = formatISO(days[days.length - 1], { representation: "date" });

  const { data: upcoming = [], refetch: refetchUpcoming } = useQuery<CalendarEntry[]>({
    queryKey: ["/api/coach/calendar", rangeStart, rangeEnd],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/coach/calendar?start=${rangeStart}&end=${rangeEnd}`,
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
        refetchPrograms(),
        refetchRoster(),
        refetchExercises(),
        refetchTeams(),
        refetchWellnessToday(),
        refetchFlaggedTrend(),
        refetchUpcoming(),
      ]);
    },
    { threshold: PULL_REFRESH_THRESHOLD },
  );

  const [editing, setEditing] = useState<{
    programDayId: number;
    assignmentId: number;
    athleteId: number;
    athleteName: string;
  } | null>(null);
  const [viewingSkill, setViewingSkill] = useState<{
    skillProgramId: number;
    skillProgramDayId: number;
    athleteName: string;
  } | null>(null);

  // digest-banner/weekly-digest/team-pr-wall/reengagement used to render in a fixed block
  // above the sortable list -- a coach could hide or reorder everything below them but not
  // those four, which is exactly the "can't move those two things" gap. Listed first so a
  // coach who's never touched Edit mode still sees them in the same top-of-page order they
  // always have; resolveWidgetOrder appends them after anything already in an existing
  // coach's saved layout instead of reshuffling it.
  const WIDGET_IDS = [
    "digest-banner",
    "weekly-digest",
    "team-pr-wall",
    "reengagement",
    "next-3-days",
    "stat-tiles",
    "recent-programs",
    "invite-athletes",
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

  // Keyed by widget id so the drag-and-drop order below can render each
  // one in whatever position the coach last dragged it to -- the "which
  // widgets exist and what's in each" part stays exactly the same JSX as
  // before, just addressed by id instead of appearing in fixed order.
  const widgetsById: Record<string, ReactNode> = {
    "digest-banner": (
      <SortableHideableWidget
        id="digest-banner"
        label="Digest Banner"
        editMode={widgetVisibility.editMode}
        isHidden={widgetVisibility.hidden.has("digest-banner")}
        onToggle={widgetVisibility.setHidden}
      >
        <CoachDigestBanner />
      </SortableHideableWidget>
    ),
    "weekly-digest": (
      <SortableHideableWidget
        id="weekly-digest"
        label="This Week"
        editMode={widgetVisibility.editMode}
        isHidden={widgetVisibility.hidden.has("weekly-digest")}
        onToggle={widgetVisibility.setHidden}
      >
        <WeeklyDigestCard />
      </SortableHideableWidget>
    ),
    "team-pr-wall": (
      <SortableHideableWidget
        id="team-pr-wall"
        label="Team PR Wall"
        editMode={widgetVisibility.editMode}
        isHidden={widgetVisibility.hidden.has("team-pr-wall")}
        onToggle={widgetVisibility.setHidden}
      >
        <TeamPrWallCard />
      </SortableHideableWidget>
    ),
    "reengagement": (
      <SortableHideableWidget
        id="reengagement"
        label="Athletes Haven't Logged"
        editMode={widgetVisibility.editMode}
        isHidden={widgetVisibility.hidden.has("reengagement")}
        onToggle={widgetVisibility.setHidden}
      >
        <ReengagementBanner />
      </SortableHideableWidget>
    ),
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
          calendarHref="/coach/calendar"
          description="Quick look across your roster — synced with the full calendar."
          compact
          onEntryClick={(e) =>
            e.kind === "skill"
              ? setViewingSkill({
                  skillProgramId: e.programId,
                  skillProgramDayId: e.programDayId,
                  athleteName: e.athleteName!,
                })
              : setEditing({
                  programDayId: e.programDayId,
                  assignmentId: e.assignmentId,
                  athleteId: e.athleteId!,
                  athleteName: e.athleteName!,
                })
          }
        />
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
        <div className="grid grid-cols-1 shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile icon={Users} label="Athletes" value={roster.length} href="/coach/roster" />
          <StatTile
            icon={ListChecks}
            label="Programs"
            value={programs.length}
            href="/coach/programs"
          />
          <StatTile
            icon={Dumbbell}
            label="Exercises in bank"
            value={exercises.length}
            href="/coach/exercises"
          />
          <StatTile
            icon={HeartPulse}
            label="Flagged today"
            value={flaggedToday}
            href="/coach/roster"
            trend={flaggedTrend}
          />
        </div>
      </SortableHideableWidget>
    ),
    "recent-programs": (
      <SortableHideableWidget
        id="recent-programs"
        label="Recent Programs"
        editMode={widgetVisibility.editMode}
        isHidden={widgetVisibility.hidden.has("recent-programs")}
        onToggle={widgetVisibility.setHidden}
      >
        <Card className="flex flex-col">
          <CardHeader className="flex-row shrink-0 items-center justify-between space-y-0 p-3 md:p-4">
            <div>
              <CardTitle className="text-base md:text-lg">Recent Programs</CardTitle>
              <CardDescription className="hidden sm:block">
                Your most recently created training blocks.
              </CardDescription>
            </div>
            <Link href="/coach/programs">
              <Button variant="outline" size="sm">
                View all
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0 md:p-4 md:pt-0">
            {programs.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ListChecks className="h-5 w-5" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No programs yet. Build your first one to start assigning workouts.
                </p>
              </div>
            )}
            {programs.slice(0, 5).map((p) => (
              <Link key={p.id} href={`/coach/programs/${p.id}`}>
                <div className="flex cursor-pointer items-center justify-between rounded-md border border-border p-2.5 transition-colors hover:bg-surface-elevated">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.weekCount} weeks · {p.dayCount} days · {p.assignedAthleteCount}{" "}
                      athlete{p.assignedAthleteCount === 1 ? "" : "s"} assigned
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </Link>
            ))}
            <Link href="/coach/programs">
              <Button variant="secondary" className="w-full">
                + New Program
              </Button>
            </Link>
          </CardContent>
        </Card>
      </SortableHideableWidget>
    ),
    "invite-athletes": (
      <SortableHideableWidget
        id="invite-athletes"
        label="Invite Athletes"
        editMode={widgetVisibility.editMode}
        isHidden={widgetVisibility.hidden.has("invite-athletes")}
        onToggle={widgetVisibility.setHidden}
      >
        <TeamInviteCard teams={teams} coachCode={user?.coachCode ?? null} />
      </SortableHideableWidget>
    ),
  };

  return (
    <AppShell
      title={`Welcome, ${user?.name?.split(" ")[0] ?? "Coach"}`}
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

        <div className="flex flex-col gap-3">
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
              {widgetOrder.map((id) => (
                <div key={id} style={{ display: "contents" }}>
                  {widgetsById[id]}
                </div>
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <CoachDayEditDialog
        programDayId={editing?.programDayId ?? null}
        assignmentId={editing?.assignmentId ?? null}
        athleteId={editing?.athleteId ?? null}
        athleteName={editing?.athleteName}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />

      {viewingSkill && (
        <SkillDayViewDialog
          open
          onOpenChange={(open) => !open && setViewingSkill(null)}
          athleteName={viewingSkill.athleteName}
          source={{
            skillProgramId: viewingSkill.skillProgramId,
            skillProgramDayId: viewingSkill.skillProgramDayId,
          }}
        />
      )}
    </AppShell>
  );
}

function TeamInviteCard({
  teams,
  coachCode,
}: {
  teams: TeamSummary[];
  coachCode: string | null;
}) {
  const codeOptions = [
    ...(coachCode ? [{ label: "All teams (personal code)", code: coachCode }] : []),
    ...teams.filter((t) => t.code).map((t) => ({ label: t.name, code: t.code as string })),
  ];
  const [selectedCode, setSelectedCode] = useState("");
  const [emails, setEmails] = useState("");
  const [qrOption, setQrOption] = useState<{ label: string; code: string } | null>(null);
  const effectiveCode =
    codeOptions.find((opt) => opt.code === selectedCode)?.code ?? codeOptions[0]?.code ?? "";

  function sendInvite() {
    const recipients = emails
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      toast.error("Add at least one email");
      return;
    }
    const subject = "Join our team on Forge";
    const body = `Hey! Join our training program on Forge:\n\n1. Sign up at ${window.location.origin}/signup\n2. Choose "Athlete" and enter this invite code: ${effectiveCode}\n\nSee you there!`;
    const mailto = `mailto:?bcc=${encodeURIComponent(recipients.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="shrink-0 p-3 md:p-4">
        <CardTitle className="text-base md:text-lg">Invite Athletes</CardTitle>
        <CardDescription className="hidden sm:block">
          Each team has its own code -- athletes who use it join that team automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0 md:p-4 md:pt-0">
        {codeOptions.length === 0 && (
          <div className="flex items-center gap-3 rounded-md border border-dashed border-border p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </div>
            <p className="text-sm text-muted-foreground">
              Create a team on the Roster page to get a shareable code.
            </p>
          </div>
        )}
        {codeOptions.map((opt) => (
          <div
            key={opt.code}
            className="flex items-center justify-between rounded-md bg-surface-elevated px-3 py-1.5"
          >
            <div className="min-w-0">
              <p className="label-xs truncate">
                {opt.label}
              </p>
              <p className="font-display text-lg font-bold tracking-widest text-primary">
                {opt.code}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Show QR code for ${opt.label}`}
                onClick={() => setQrOption(opt)}
              >
                <QrCode className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Copy ${opt.label} code`}
                onClick={() => {
                  navigator.clipboard.writeText(opt.code);
                  toast.success("Code copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {codeOptions.length > 0 && (
          <div className="space-y-2 border-t border-border pt-2">
            <Select value={effectiveCode} onValueChange={setSelectedCode}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Code to include" />
              </SelectTrigger>
              <SelectContent>
                {codeOptions.map((opt) => (
                  <SelectItem key={opt.code} value={opt.code}>
                    {opt.label} — {opt.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="athlete1@email.com, athlete2@email.com"
              className="min-h-12 text-sm"
            />
            <Button size="sm" className="w-full" onClick={sendInvite}>
              <Mail className="h-3.5 w-3.5" />
              Email Invite
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={qrOption !== null} onOpenChange={(open) => !open && setQrOption(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{qrOption?.label}</DialogTitle>
            <DialogDescription>
              Scan to sign up as an athlete with this code pre-filled.
            </DialogDescription>
          </DialogHeader>
          {qrOption && (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="rounded-md bg-white p-3">
                <QRCodeSVG
                  value={`${window.location.origin}/signup?code=${qrOption.code}`}
                  size={200}
                />
              </div>
              <p className="font-display text-xl font-bold tracking-widest text-primary">
                {qrOption.code}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
