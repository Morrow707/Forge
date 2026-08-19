import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarView, type CalendarEntry } from "@/components/calendar-view";
import { CalendarLinkDialog } from "@/components/calendar-link-dialog";
import { SkillDayViewDialog } from "@/components/skill-day-view-dialog";
import { NutritionQuickSummary } from "@/components/nutrition-quick-summary";
import { TeamChatQuickSummary } from "@/components/team-chat-quick-summary";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { CalendarDays, UserPlus } from "lucide-react";

export default function AthleteDashboard() {
  const [, navigate] = useLocation();
  const [range, setRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [syncOpen, setSyncOpen] = useState(false);
  const [viewingSkill, setViewingSkill] = useState<{
    skillAssignmentId: number;
    skillProgramDayId: number;
    date: string;
  } | null>(null);

  const { data: entries = [] } = useQuery<CalendarEntry[]>({
    queryKey: ["/api/athlete/calendar", range.start, range.end],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/athlete/calendar?start=${range.start}&end=${range.end}`,
      );
      return res.json();
    },
    enabled: Boolean(range.start && range.end),
    // 60s matches every other poll in the app -- refetchOnWindowFocus
    // already covers the common "coach changed today's plan while I had
    // this tab open" case the moment the athlete comes back to look.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: coaches = [], isLoading: coachesLoading } = useQuery<
    { id: number; name: string; coachCode: string }[]
  >({
    queryKey: ["/api/athlete/coaches"],
  });

  return (
    <AppShell
      title="My Calendar"
      actions={
        <Button variant="outline" size="sm" onClick={() => setSyncOpen(true)}>
          <CalendarDays className="h-4 w-4" />
          Sync to Phone
        </Button>
      }
    >
      <PendingCoachRequests />

      {/* Quick view: today's nutrition and (for a coached athlete -- a Free
          Agent has no team, see app-shell.tsx's own nav filtering) the
          latest team chat, both just a summary with a link through to their
          full page. The calendar below still defaults to the 3-day agenda
          rather than the month grid so "what's actually happening the next
          couple days" is visible without switching views. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <NutritionQuickSummary />
        {!coachesLoading && coaches.length > 0 && <TeamChatQuickSummary />}
      </div>

      <CalendarView
        entries={entries}
        initialView="day"
        onRangeChange={(start, end) => setRange({ start, end })}
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

      {/* Only the "you have no coach at all" case gets a big empty state --
          an empty day/week within a real program is just "nothing scheduled",
          already shown inline by the calendar itself. Showing both here too
          was a redundant, confusing double empty-state. No coach doesn't
          mean no path forward though -- Free Agent status is purely derived
          (zero rows in coachAthletes for this athlete, nothing stored).
          The full AI program builder/chat/form-check are a paid upgrade for
          a Free Agent (see requirePaidAiAccess in routes.ts, always false
          until real billing exists) -- Forge templates and exercise
          substitution stay free either way. Deliberately no AI branding or
          entry point here (no Sparkles icon, no "AI" in the copy) -- the AI
          program builder lives exclusively on the Programs page (see
          aiFirstCreate in program-list.tsx); this is just a plain link over. */}
      {!coachesLoading && coaches.length === 0 && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Badge className="gap-1.5 bg-primary/15 text-primary hover:bg-primary/15">
              Free Agent
            </Badge>
            <p className="max-w-sm text-muted-foreground">
              You don't have a coach yet. Head to My Programs to build one -- start from a Forge
              template and swap out any exercise that doesn't work for you, or let the AI ask a
              few questions and build it with you (a paid upgrade, coming soon).
            </p>
            <Button asChild>
              <Link href="/athlete/programs">
                <CalendarDays className="h-4 w-4" />
                Go to My Programs
              </Link>
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Joining a team later? Your programs stay right where they are.
            </p>
            <CoachJoinHint />
          </CardContent>
        </Card>
      )}

      <CalendarLinkDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        title="Sync Your Calendar"
        fetchUrl="/api/athlete/calendar-link"
      />

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
    <div className="mb-6 space-y-2">
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
