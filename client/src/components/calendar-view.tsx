import { useEffect, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  formatISO,
  isSameDay,
  isSameMonth,
  isToday,
  isTomorrow,
  isYesterday,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, CheckCircle2, Dumbbell, MoonStar } from "lucide-react";

export type CalendarEntry = {
  date: string;
  assignmentId: number;
  programDayId: number;
  programId: number;
  programName: string;
  title: string;
  isRestDay: boolean;
  exerciseCount: number;
  completed: boolean;
  athleteId?: number;
  athleteName?: string;
};

export type CalendarViewMode = "month" | "week" | "day";

const VIEW_LABEL: Record<CalendarViewMode, string> = {
  day: "3-Day",
  week: "Week",
  month: "Month",
};

function rangeFor(mode: CalendarViewMode, cursor: Date) {
  if (mode === "month") {
    return {
      start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
    };
  }
  if (mode === "week") {
    return {
      start: startOfWeek(cursor, { weekStartsOn: 1 }),
      end: endOfWeek(cursor, { weekStartsOn: 1 }),
    };
  }
  // "day" mode is actually a 3-day window (yesterday/today/tomorrow relative
  // to the cursor) -- a single isolated day was rarely useful on its own.
  return { start: subDays(cursor, 1), end: addDays(cursor, 1) };
}

function entryIcon(entry: CalendarEntry, className: string) {
  if (entry.isRestDay) return <MoonStar className={className} />;
  if (entry.completed) return <CheckCircle2 className={className} />;
  return <Dumbbell className={className} />;
}

export function EntryPill({
  entry,
  onClick,
  compact = true,
}: {
  entry: CalendarEntry;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded px-1.5 py-1 text-left font-semibold transition-colors",
        compact ? "text-[11px] sm:text-xs" : "text-sm",
        entry.isRestDay
          ? "bg-secondary text-muted-foreground"
          : entry.completed
            ? "bg-success/20 text-success hover:bg-success/30"
            : "bg-primary/20 text-primary hover:bg-primary/30",
      )}
    >
      {entryIcon(entry, "h-3 w-3 shrink-0")}
      <span className="truncate">
        {entry.athleteName ? `${entry.athleteName} · ` : ""}
        {entry.title}
      </span>
    </button>
  );
}

export function CalendarView({
  entries,
  onRangeChange,
  onEntryClick,
  initialView = "month",
}: {
  entries: CalendarEntry[];
  onRangeChange: (startISO: string, endISO: string, view: CalendarViewMode) => void;
  onEntryClick: (entry: CalendarEntry) => void;
  initialView?: CalendarViewMode;
}) {
  const [view, setView] = useState<CalendarViewMode>(initialView);
  const [cursor, setCursor] = useState(() => new Date());
  const lastRangeKey = useRef<string>("");

  const { start, end } = rangeFor(view, cursor);
  const startISO = formatISO(start, { representation: "date" });
  const endISO = formatISO(end, { representation: "date" });

  useEffect(() => {
    const key = `${view}:${startISO}:${endISO}`;
    if (lastRangeKey.current === key) return;
    lastRangeKey.current = key;
    onRangeChange(startISO, endISO, view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, startISO, endISO]);

  function goPrev() {
    if (view === "month") setCursor((c) => subMonths(c, 1));
    else if (view === "week") setCursor((c) => subWeeks(c, 1));
    else setCursor((c) => addDays(c, -1));
  }

  function goNext() {
    if (view === "month") setCursor((c) => addMonths(c, 1));
    else if (view === "week") setCursor((c) => addWeeks(c, 1));
    else setCursor((c) => addDays(c, 1));
  }

  const entriesByDate = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    const list = entriesByDate.get(e.date) ?? [];
    list.push(e);
    entriesByDate.set(e.date, list);
  }

  const label =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : view === "week"
        ? `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`
        : `${format(start, "MMM d")} – ${format(end, "MMM d")}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Previous" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-40 text-center font-display text-lg font-bold uppercase">
            {label}
          </span>
          <Button size="icon" variant="outline" aria-label="Next" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-1 rounded-md bg-secondary p-1">
          {(["day", "week", "month"] as CalendarViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setView(m)}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-semibold transition-colors",
                view === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {VIEW_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {view === "month" && (
        <MonthGrid
          start={start}
          end={end}
          cursor={cursor}
          entriesByDate={entriesByDate}
          onEntryClick={onEntryClick}
        />
      )}
      {view === "week" && (
        <WeekRow start={start} end={end} entriesByDate={entriesByDate} onEntryClick={onEntryClick} />
      )}
      {view === "day" && (
        <ThreeDayAgenda centerDate={cursor} entriesByDate={entriesByDate} onEntryClick={onEntryClick} />
      )}
    </div>
  );
}

function MonthGrid({
  start,
  end,
  cursor,
  entriesByDate,
  onEntryClick,
}: {
  start: Date;
  end: Date;
  cursor: Date;
  entriesByDate: Map<string, CalendarEntry[]>;
  onEntryClick: (entry: CalendarEntry) => void;
}) {
  const days = eachDayOfInterval({ start, end });
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-muted-foreground sm:gap-2 sm:text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day) => {
          const dateStr = formatISO(day, { representation: "date" });
          const dayEntries = entriesByDate.get(dateStr) ?? [];
          const inMonth = isSameMonth(day, cursor);
          return (
            <div
              key={dateStr}
              aria-current={isToday(day) ? "date" : undefined}
              className={cn(
                "flex min-h-20 flex-col gap-1 rounded-md border border-border p-1.5 sm:min-h-28 sm:gap-1 sm:p-2",
                !inMonth && "opacity-30",
                isToday(day) && "border-primary",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold sm:h-5 sm:w-5 sm:text-xs",
                  isToday(day) && "bg-primary text-primary-foreground",
                )}
              >
                {format(day, "d")}
                {isToday(day) && <span className="sr-only"> (Today)</span>}
              </span>

              {/* Mobile: icon-only dots so a full month fits on one screen
                  without scrolling -- tapping still opens that entry. Sized
                  well above the old 16px (way under any reasonable tap
                  target) now that the taller cell has room for it. */}
              <div className="flex flex-1 flex-wrap items-end gap-1 sm:hidden">
                {dayEntries.slice(0, 3).map((e) => (
                  <button
                    key={`${e.assignmentId}-${e.programDayId}`}
                    onClick={() => onEntryClick(e)}
                    aria-label={e.title}
                    title={e.title}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full",
                      e.isRestDay
                        ? "bg-secondary text-muted-foreground"
                        : e.completed
                          ? "bg-success/25 text-success"
                          : "bg-primary/25 text-primary",
                    )}
                  >
                    {entryIcon(e, "h-5 w-5")}
                  </button>
                ))}
              </div>

              {/* Desktop/tablet: full text pills. */}
              <div className="hidden flex-1 flex-col gap-1 sm:flex">
                {dayEntries.map((e) => (
                  <EntryPill
                    key={`${e.assignmentId}-${e.programDayId}`}
                    entry={e}
                    onClick={() => onEntryClick(e)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekRow({
  start,
  end,
  entriesByDate,
  onEntryClick,
}: {
  start: Date;
  end: Date;
  entriesByDate: Map<string, CalendarEntry[]>;
  onEntryClick: (entry: CalendarEntry) => void;
}) {
  const days = eachDayOfInterval({ start, end });
  const weekEntries = days.flatMap((d) => entriesByDate.get(formatISO(d, { representation: "date" })) ?? []);
  const workoutCount = weekEntries.filter((e) => !e.isRestDay).length;
  const completedCount = weekEntries.filter((e) => !e.isRestDay && e.completed).length;

  return (
    <div className="space-y-3">
      {workoutCount > 0 && (
        <div className="flex items-center gap-6 rounded-lg border border-border bg-surface p-4">
          <div>
            <p className="font-display text-2xl font-extrabold leading-none">{workoutCount}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase text-muted-foreground">
              Workouts this week
            </p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="font-display text-2xl font-extrabold leading-none text-success">
              {completedCount}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase text-muted-foreground">Completed</p>
          </div>
          <div className="ml-auto h-2 w-24 overflow-hidden rounded-full bg-secondary sm:w-32">
            <div
              className="h-full bg-success transition-all"
              style={{ width: `${workoutCount ? (completedCount / workoutCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map((day) => {
          const dateStr = formatISO(day, { representation: "date" });
          const dayEntries = entriesByDate.get(dateStr) ?? [];
          const today = isToday(day);
          return (
            <div
              key={dateStr}
              aria-current={today ? "date" : undefined}
              className={cn(
                "flex min-h-36 flex-col gap-1.5 rounded-lg border p-2.5 transition-colors",
                today ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className={cn(
                    "text-xs font-bold uppercase",
                    today ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {today ? "Today" : format(day, "EEE")}
                </span>
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-sm font-bold",
                    today && "bg-primary text-primary-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                {dayEntries.length === 0 && (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
                {dayEntries.map((e) => (
                  <EntryPill
                    key={`${e.assignmentId}-${e.programDayId}`}
                    entry={e}
                    onClick={() => onEntryClick(e)}
                    compact={false}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThreeDayAgenda({
  centerDate,
  entriesByDate,
  onEntryClick,
}: {
  centerDate: Date;
  entriesByDate: Map<string, CalendarEntry[]>;
  onEntryClick: (entry: CalendarEntry) => void;
}) {
  const days = [subDays(centerDate, 1), centerDate, addDays(centerDate, 1)];
  return (
    <div className="space-y-5">
      {days.map((day) => {
        const dateStr = formatISO(day, { representation: "date" });
        const dayEntries = entriesByDate.get(dateStr) ?? [];
        const label = isToday(day)
          ? "Today"
          : isYesterday(day)
            ? "Yesterday"
            : isTomorrow(day)
              ? "Tomorrow"
              : format(day, "EEEE");
        return (
          <div key={dateStr}>
            <div className="mb-2 flex items-baseline justify-between">
              <span
                className={cn(
                  "text-sm font-bold uppercase tracking-wide",
                  isToday(day) && "text-primary",
                )}
              >
                {label}
              </span>
              <span className="text-xs text-muted-foreground">{format(day, "MMM d")}</span>
            </div>
            {dayEntries.length === 0 ? (
              <div className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-6 text-xs text-muted-foreground">
                <MoonStar className="h-3.5 w-3.5" />
                Nothing scheduled
              </div>
            ) : (
              <div className="space-y-2">
                {dayEntries.map((e) => (
                  <button
                    key={`${e.assignmentId}-${e.programDayId}`}
                    onClick={() => onEntryClick(e)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-border p-3.5 text-left transition-colors hover:bg-surface-elevated"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                          e.isRestDay
                            ? "bg-secondary text-muted-foreground"
                            : e.completed
                              ? "bg-success/15 text-success"
                              : "bg-primary/15 text-primary",
                        )}
                      >
                        {entryIcon(e, "h-4.5 w-4.5")}
                      </div>
                      <div>
                        {e.athleteName && (
                          <p className="text-xs text-muted-foreground">{e.athleteName}</p>
                        )}
                        <p className="font-semibold">{e.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.programName}
                          {!e.isRestDay &&
                            ` · ${e.exerciseCount} exercise${e.exerciseCount === 1 ? "" : "s"}`}
                        </p>
                      </div>
                    </div>
                    {e.completed && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
