import { useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { CalendarView, type CalendarEntry } from "@/components/calendar-view";
import { CalendarLinkDialog } from "@/components/calendar-link-dialog";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronDown, Loader2 } from "lucide-react";

// Kept in sync with the hook call below -- shared so the indicator's own
// "have we crossed the threshold yet" styling matches what actually
// triggers the refresh.
const PULL_REFRESH_THRESHOLD = 60;

/** Just the calendar -- schedule/training-plan browsing only. Everything
 * that isn't literally "what's on the calendar" (pending coach requests,
 * nutrition/team-chat summaries, the Free Agent empty state) lives on the
 * Dashboard tab now instead; this page used to carry all of that too. */
export default function AthleteCalendar() {
  const [, navigate] = useLocation();
  const [range, setRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [syncOpen, setSyncOpen] = useState(false);

  const { data: entries = [], refetch } = useQuery<CalendarEntry[]>({
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

  // Pull-to-refresh re-fetches whatever range is currently on screen --
  // there's no separate "refresh" endpoint, just re-running the same query.
  const { containerRef, pullDistance, isRefreshing } = usePullToRefresh(
    async () => {
      await refetch();
    },
    { threshold: PULL_REFRESH_THRESHOLD },
  );

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

        <CalendarView
          entries={entries}
          initialView="day"
          onRangeChange={(start, end) => setRange({ start, end })}
          onEntryClick={(e) =>
            navigate(
              e.kind === "skill"
                ? `/athlete/skill-day/${e.assignmentId}/${e.programDayId}/${e.date}`
                : `/athlete/day/${e.assignmentId}/${e.programDayId}/${e.date}`,
            )
          }
          dayPreviewFetchUrl={(e) =>
            `/api/athlete/day-preview?assignmentId=${e.assignmentId}&programDayId=${e.programDayId}`
          }
        />
      </div>

      <CalendarLinkDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        title="Sync Your Calendar"
        fetchUrl="/api/athlete/calendar-link"
      />
    </AppShell>
  );
}
