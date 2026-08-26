import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarView, type CalendarEntry } from "@/components/calendar-view";
import { CalendarLinkDialog } from "@/components/calendar-link-dialog";
import { apiRequest } from "@/lib/queryClient";
import { Dumbbell, CalendarDays } from "lucide-react";

// A coach's own training calendar reuses the exact same CalendarView as
// every athlete's -- same orange --primary throughout -- which made it easy
// to lose track of whose calendar is on screen. Overriding the CSS custom
// properties on a wrapper (same mechanism as computeBrandingStyle's org/
// personal accent colors, see branding-style.ts) reskins just this page's
// content, not the shared component or the global theme, so athlete
// calendars and every other orange use in the app are untouched.
const SELF_TRAINING_ACCENT_STYLE: CSSProperties = {
  ["--primary" as string]: "217 91% 60%",
  ["--ring" as string]: "217 91% 60%",
  ["--accent" as string]: "217 91% 60%",
};

export default function CoachMyCalendar() {
  const [, navigate] = useLocation();
  const [range, setRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [syncOpen, setSyncOpen] = useState(false);

  const { data: entries = [] } = useQuery<CalendarEntry[]>({
    queryKey: ["/api/coach/my/calendar", range.start, range.end],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/coach/my/calendar?start=${range.start}&end=${range.end}`,
      );
      return res.json();
    },
    enabled: Boolean(range.start && range.end),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  return (
    <AppShell
      title="My Training"
      actions={
        <Button variant="outline" size="sm" onClick={() => setSyncOpen(true)}>
          <CalendarDays className="h-4 w-4" />
          Sync to Phone
        </Button>
      }
    >
      <div style={SELF_TRAINING_ACCENT_STYLE}>
        <CalendarView
          entries={entries}
          onRangeChange={(start, end) => setRange({ start, end })}
          onEntryClick={(e) => navigate(`/coach/my/day/${e.assignmentId}/${e.programDayId}/${e.date}`)}
        />

        {entries.length === 0 && (
          <Card className="mt-6">
            <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
              <Dumbbell className="h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">
                Nothing on your calendar yet. Assign one of your programs to yourself from the
                program library.
              </p>
              <Button asChild size="sm">
                <Link href="/coach/programs">Go to Programs</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <CalendarLinkDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        title="Sync Your Calendar"
        fetchUrl="/api/coach/my/calendar-link"
      />
    </AppShell>
  );
}
