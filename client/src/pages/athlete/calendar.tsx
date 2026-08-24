import { useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { CalendarView, type CalendarEntry } from "@/components/calendar-view";
import { CalendarLinkDialog } from "@/components/calendar-link-dialog";
import { SkillDayViewDialog } from "@/components/skill-day-view-dialog";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CalendarDays } from "lucide-react";

/** Just the calendar -- schedule/training-plan browsing only. Everything
 * that isn't literally "what's on the calendar" (pending coach requests,
 * nutrition/team-chat summaries, the Free Agent empty state) lives on the
 * Dashboard tab now instead; this page used to carry all of that too. */
export default function AthleteCalendar() {
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
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
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
        dayPreviewFetchUrl={(e) =>
          `/api/athlete/day-preview?assignmentId=${e.assignmentId}&programDayId=${e.programDayId}`
        }
      />

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
