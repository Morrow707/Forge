import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { CalendarView, type CalendarEntry } from "@/components/calendar-view";
import { CoachDayEditDialog } from "@/components/coach-day-edit-dialog";
import { SkillDayViewDialog } from "@/components/skill-day-view-dialog";
import { CoachDayDetailDialog } from "@/components/coach-day-detail-dialog";
import { CoachDayBriefing } from "@/components/coach-day-briefing";
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
  const [viewingSkill, setViewingSkill] = useState<{
    skillProgramId: number;
    skillProgramDayId: number;
    athleteName: string;
  } | null>(null);
  const [viewingDay, setViewingDay] = useState<{ date: string; entries: CalendarEntry[] } | null>(
    null,
  );

  // A video/comment notification links here with these params (see the
  // athlete comment route in server/routes.ts) instead of relying on
  // whatever day the calendar happens to default to -- without this, the
  // notification landed on "today," which usually has nothing to do with
  // the day the athlete actually commented on (e.g. backfilling a past
  // date) and looked like a broken link. Runs once on mount; the params
  // aren't needed again after the dialog's open, so there's no need to keep
  // watching them.
  const search = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search);
    const notifAssignmentId = params.get("assignmentId");
    const notifProgramDayId = params.get("programDayId");
    const notifAthleteId = params.get("athleteId");
    if (notifAssignmentId && notifProgramDayId && notifAthleteId) {
      setEditing({
        assignmentId: Number(notifAssignmentId),
        programDayId: Number(notifProgramDayId),
        athleteId: Number(notifAthleteId),
        athleteName: params.get("athleteName") ?? "",
      });
    }
    // Only ever read on first mount -- the dialog owns its own open/close
    // state from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function openEntry(e: CalendarEntry) {
    setViewingDay(null);
    if (e.kind === "skill") {
      setViewingSkill({
        skillProgramId: e.programId,
        skillProgramDayId: e.programDayId,
        athleteName: e.athleteName!,
      });
    } else {
      setEditing({
        programDayId: e.programDayId,
        assignmentId: e.assignmentId,
        athleteId: e.athleteId!,
        athleteName: e.athleteName!,
      });
    }
  }

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
        onEntryClick={openEntry}
        onDayClick={(date, dayEntries) => setViewingDay({ date, entries: dayEntries })}
        singleDayContent={(date) => <CoachDayBriefing date={date} />}
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

      {viewingSkill && (
        <SkillDayViewDialog
          open
          onOpenChange={(open) => !open && setViewingSkill(null)}
          athleteName={viewingSkill.athleteName}
          source={{
            kind: "coach",
            skillProgramId: viewingSkill.skillProgramId,
            skillProgramDayId: viewingSkill.skillProgramDayId,
          }}
        />
      )}

      <CoachDayDetailDialog
        date={viewingDay?.date ?? null}
        entries={viewingDay?.entries ?? []}
        open={viewingDay !== null}
        onOpenChange={(open) => !open && setViewingDay(null)}
        onEntryClick={openEntry}
      />
    </AppShell>
  );
}
