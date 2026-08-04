import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarView, type CalendarEntry } from "@/components/calendar-view";
import { CalendarLinkDialog } from "@/components/calendar-link-dialog";
import { apiRequest } from "@/lib/queryClient";
import { Dumbbell, CalendarDays } from "lucide-react";

export default function AdminMyCalendar() {
  const [, navigate] = useLocation();
  const [range, setRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [syncOpen, setSyncOpen] = useState(false);

  const { data: entries = [] } = useQuery<CalendarEntry[]>({
    queryKey: ["/api/admin/my/calendar", range.start, range.end],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/my/calendar?start=${range.start}&end=${range.end}`,
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
        onRangeChange={(start, end) => setRange({ start, end })}
        onEntryClick={(e) => navigate(`/admin/my/day/${e.assignmentId}/${e.programDayId}/${e.date}`)}
      />

      {entries.length === 0 && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Dumbbell className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">
              Nothing on your calendar yet. Build a program and add it to your own calendar.
            </p>
            <Button asChild size="sm">
              <Link href="/admin/programs">Go to Programs</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <CalendarLinkDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        title="Sync Your Calendar"
        fetchUrl="/api/admin/my/calendar-link"
      />
    </AppShell>
  );
}
