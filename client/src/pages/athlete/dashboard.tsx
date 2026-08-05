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
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { CalendarDays, Sparkles } from "lucide-react";

export default function AthleteDashboard() {
  const [, navigate] = useLocation();
  const [range, setRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [syncOpen, setSyncOpen] = useState(false);

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
      <CalendarView
        entries={entries}
        onRangeChange={(start, end) => setRange({ start, end })}
        onEntryClick={(e) => navigate(`/athlete/day/${e.assignmentId}/${e.programDayId}/${e.date}`)}
      />

      {/* Only the "you have no coach at all" case gets a big empty state --
          an empty day/week within a real program is just "nothing scheduled",
          already shown inline by the calendar itself. Showing both here too
          was a redundant, confusing double empty-state. No coach doesn't
          mean no path forward though -- Free Agent status is purely derived
          (zero rows in coachAthletes for this athlete, nothing stored).
          The AI program builder and AI form-check are a paid upgrade for a
          Free Agent (see requirePaidAiAccess in routes.ts, always false
          until real billing exists) -- manual programs, Forge templates,
          exercise substitution, and the AI chat coach stay free either way. */}
      {!coachesLoading && coaches.length === 0 && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Badge className="gap-1.5 bg-primary/15 text-primary hover:bg-primary/15">
              <Sparkles className="h-3.5 w-3.5" />
              Free Agent
            </Badge>
            <p className="max-w-sm text-muted-foreground">
              You don't have a coach yet. Build your own program by hand or start from a Forge
              template, swap out any exercise that doesn't work for you, and ask the AI chat coach
              anything -- conversational AI program building and AI form-check are a paid upgrade,
              coming soon.
            </p>
            <Button asChild>
              <Link href="/athlete/programs">
                <Sparkles className="h-4 w-4" />
                Build a Program
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
    </AppShell>
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
