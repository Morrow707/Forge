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
  startOfMonth,
  startOfWeek,
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
  return { start: cursor, end: cursor };
}

function EntryPill({
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
      {entry.isRestDay ? (
        <MoonStar className="h-3 w-3 shrink-0" />
      ) : entry.completed ? (
        <CheckCircle2 className="h-3 w-3 shrink-0" />
      ) : (
        <Dumbbell className="h-3 w-3 shrink-0" />
      )}
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
        : format(cursor, "EEEE, MMM d");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-40 text-center font-display text-lg font-bold uppercase">
            {label}
          </span>
          <Button size="icon" variant="outline" onClick={goNext}>
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
                "rounded px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                view === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
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
        <DayAgenda date={cursor} entries={entriesByDate.get(startISO) ?? []} onEntryClick={onEntryClick} />
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
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-muted-foreground sm:gap-2">
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
              className={cn(
                "flex min-h-24 flex-col gap-1 rounded-md border border-border p-1.5 sm:min-h-28 sm:p-2",
                !inMonth && "opacity-30",
                isToday(day) && "border-primary",
              )}
            >
              <span className={cn("text-xs font-semibold", isToday(day) && "text-primary")}>
                {format(day, "d")}
              </span>
              <div className="flex flex-1 flex-col gap-1">
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
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {days.map((day) => {
        const dateStr = formatISO(day, { representation: "date" });
        const dayEntries = entriesByDate.get(dateStr) ?? [];
        return (
          <div
            key={dateStr}
            className={cn(
              "flex min-h-40 flex-col gap-1.5 rounded-md border border-border p-2.5",
              isToday(day) && "border-primary",
            )}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                {format(day, "EEE")}
              </span>
              <span className={cn("text-sm font-bold", isToday(day) && "text-primary")}>
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
  );
}

function DayAgenda({
  date,
  entries,
  onEntryClick,
}: {
  date: Date;
  entries: CalendarEntry[];
  onEntryClick: (entry: CalendarEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-16 text-center text-muted-foreground">
        <MoonStar className="h-8 w-8" />
        Nothing scheduled {isSameDay(date, new Date()) ? "today" : "this day"}.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <button
          key={`${e.assignmentId}-${e.programDayId}`}
          onClick={() => onEntryClick(e)}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-md border border-border p-4 text-left transition-colors hover:bg-surface-elevated",
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
                e.isRestDay
                  ? "bg-secondary text-muted-foreground"
                  : e.completed
                    ? "bg-success/15 text-success"
                    : "bg-primary/15 text-primary",
              )}
            >
              {e.isRestDay ? (
                <MoonStar className="h-5 w-5" />
              ) : e.completed ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Dumbbell className="h-5 w-5" />
              )}
            </div>
            <div>
              {e.athleteName && (
                <p className="text-xs text-muted-foreground">{e.athleteName}</p>
              )}
              <p className="font-semibold">{e.title}</p>
              <p className="text-xs text-muted-foreground">
                {e.programName}
                {!e.isRestDay && ` · ${e.exerciseCount} exercise${e.exerciseCount === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          {e.completed && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}
        </button>
      ))}
    </div>
  );
}
