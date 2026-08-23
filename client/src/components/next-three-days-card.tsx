import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EntryPill, type CalendarEntry } from "@/components/calendar-view";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";
import { format, formatISO, isToday } from "date-fns";

/** The "what's coming up in the next 3 days" card shared by the coach and
 * athlete dashboards -- was two hand-duplicated copies of the same markup
 * (down to the exact class names) before this was pulled out; what
 * genuinely differs between the two callers -- padding density, the
 * description line, and what tapping an entry actually does (a coach opens
 * an edit dialog for a specific athlete's day, an athlete navigates to
 * their own) -- stays as props rather than being hardcoded here. */
export function NextThreeDaysCard({
  days,
  entries,
  calendarHref,
  description,
  compact,
  onEntryClick,
}: {
  days: Date[];
  entries: CalendarEntry[];
  calendarHref: string;
  description: string;
  /** Tighter padding + shrink-0 -- the coach dashboard's treatment,
   * since that page packs more cards into the same view. */
  compact?: boolean;
  onEntryClick: (entry: CalendarEntry) => void;
}) {
  return (
    <Card className={compact ? "shrink-0" : undefined}>
      <CardHeader
        className={cn(
          "flex-row items-center justify-between space-y-0",
          compact && "p-3 md:p-4",
        )}
      >
        <div>
          <CardTitle className={compact ? "text-base md:text-lg" : undefined}>
            Next 3 Days
          </CardTitle>
          <CardDescription className="hidden sm:block">{description}</CardDescription>
        </div>
        <Link href={calendarHref}>
          <Button variant="outline" size="sm">
            Full Calendar
          </Button>
        </Link>
      </CardHeader>
      <CardContent className={compact ? "p-3 pt-0 md:p-4 md:pt-0" : undefined}>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {days.map((day) => {
            const dateStr = formatISO(day, { representation: "date" });
            const dayEntries = entries.filter((e) => e.date === dateStr);
            const shown = dayEntries.slice(0, 3);
            const overflow = dayEntries.length - shown.length;
            return (
              <div key={dateStr} className="rounded-md border border-border p-2">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span
                    className={cn(
                      "text-xs font-semibold uppercase text-muted-foreground",
                      isToday(day) && "text-primary",
                    )}
                  >
                    {isToday(day) ? "Today" : format(day, "EEEE")}
                  </span>
                  <span className={cn("text-sm font-bold", isToday(day) && "text-primary")}>
                    {format(day, "MMM d")}
                  </span>
                </div>
                <div className="space-y-1">
                  {shown.length === 0 && (
                    <p className="flex items-center justify-center gap-1.5 py-2 text-center text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Nothing scheduled
                    </p>
                  )}
                  {shown.map((e) => (
                    <EntryPill
                      key={`${e.assignmentId}-${e.programDayId}`}
                      entry={e}
                      onClick={() => onEntryClick(e)}
                    />
                  ))}
                  {overflow > 0 && (
                    <Link href={calendarHref}>
                      <span className="block px-1.5 text-[11px] font-semibold text-primary hover:underline">
                        +{overflow} more
                      </span>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
