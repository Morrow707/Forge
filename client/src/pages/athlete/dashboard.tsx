import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarView, type CalendarEntry } from "@/components/calendar-view";
import { CalendarLinkDialog } from "@/components/calendar-link-dialog";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Dumbbell, CalendarDays } from "lucide-react";

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
    refetchInterval: 10_000,
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
          was a redundant, confusing double empty-state. */}
      {!coachesLoading && coaches.length === 0 && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Dumbbell className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">
              Nothing on your calendar yet. Ask your coach to assign you a program.
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
