import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { CalendarView, type CalendarEntry } from "@/components/calendar-view";
import { CoachDayEditDialog } from "@/components/coach-day-edit-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { getJson } from "@/lib/queryClient";
import { CalendarDays } from "lucide-react";

type RosterEntry = { id: number; name: string };

export default function CoachCalendar() {
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });

  const [athleteId, setAthleteId] = useState<string>("all");
  const [range, setRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [editing, setEditing] = useState<{
    programDayId: number;
    assignmentId: number;
    athleteId: number;
    athleteName: string;
  } | null>(null);

  const { data: entries = [], isLoading } = useQuery<CalendarEntry[]>({
    queryKey: ["/api/coach/calendar", range.start, range.end, athleteId],
    queryFn: () => {
      const params = new URLSearchParams({ start: range.start, end: range.end });
      if (athleteId !== "all") params.set("athleteId", athleteId);
      return getJson(`/api/coach/calendar?${params.toString()}`);
    },
    enabled: Boolean(range.start && range.end),
    // 60s matches every other poll in the app -- refetchOnWindowFocus
    // already covers the common "came back to this tab" case.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  return (
    <AppShell
      title="Calendar"
      actions={
        <Select value={athleteId} onValueChange={setAthleteId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All athletes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All athletes</SelectItem>
            {roster.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <CalendarView
        entries={entries}
        onRangeChange={(start, end) => setRange({ start, end })}
        onEntryClick={(e) =>
          setEditing({
            programDayId: e.programDayId,
            assignmentId: e.assignmentId,
            athleteId: e.athleteId!,
            athleteName: e.athleteName!,
          })
        }
      />

      {!isLoading && entries.length === 0 && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">
              Nothing scheduled yet. Assign a program to an athlete from Roster & Teams.
            </p>
          </CardContent>
        </Card>
      )}

      <CoachDayEditDialog
        programDayId={editing?.programDayId ?? null}
        assignmentId={editing?.assignmentId ?? null}
        athleteId={editing?.athleteId ?? null}
        athleteName={editing?.athleteName}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </AppShell>
  );
}
