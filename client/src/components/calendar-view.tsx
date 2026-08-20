import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
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
  subMonths,
  subWeeks,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Dumbbell,
  MoonStar,
  Target,
} from "lucide-react";

export type CalendarEntry = {
  // Which system this entry came from -- an exercise-program day and a
  // skill-program day are equals that can share a date (see the
  // reconciliation comment in storage.ts), so the client needs to tell them
  // apart to style and route them differently: skill entries render teal
  // and open the read-only SkillDayViewDialog instead of the strength
  // day-edit/workout pages, which don't understand skill IDs.
  kind: "exercise" | "skill";
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
  // True only on a coach's own calendar, for a program they assigned to
  // themselves rather than an athlete (see getCalendarForCoach's own
  // comment) -- renders violet everywhere a skill entry renders teal, so a
  // coach can tell their own training apart from their roster's at a
  // glance. Always false/undefined for an athlete's or admin's calendar,
  // since neither has a "someone else's" entry to distinguish from.
  isSelfAssigned?: boolean;
};

export type CalendarViewMode = "single-day" | "month" | "week" | "day";

const VIEW_LABEL: Record<CalendarViewMode, string> = {
  "single-day": "Today",
  day: "3-Day",
  week: "Week",
  month: "Month",
};

function rangeFor(mode: CalendarViewMode, cursor: Date) {
  if (mode === "month") {
    return {
      start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }),
      end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }),
    };
  }
  if (mode === "week") {
    return {
      start: startOfWeek(cursor, { weekStartsOn: 0 }),
      end: endOfWeek(cursor, { weekStartsOn: 0 }),
    };
  }
  if (mode === "single-day") {
    return { start: cursor, end: cursor };
  }
  // "day" mode is a 3-day window starting at the cursor (cursor, +1, +2) --
  // matches the dashboard's "Next 3 Days" widget, which is always
  // forward-looking rather than centered on the cursor.
  return { start: cursor, end: addDays(cursor, 2) };
}

export function entryIcon(entry: CalendarEntry, className: string) {
  if (entry.isRestDay) return <MoonStar className={className} />;
  if (entry.kind === "skill") return <Target className={className} />;
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
          : entry.kind === "skill"
            ? "bg-teal-500/20 text-teal-400 hover:bg-teal-500/30"
            : entry.isSelfAssigned
              ? "bg-violet-500/20 text-violet-400 hover:bg-violet-500/30"
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
  onDayClick,
  initialView = "month",
  singleDayContent,
  dayPreviewFetchUrl,
}: {
  entries: CalendarEntry[];
  onRangeChange: (startISO: string, endISO: string, view: CalendarViewMode) => void;
  onEntryClick: (entry: CalendarEntry) => void;
  /** Opt-in: when provided, the month view combines same-program-same-day
   * entries shared by multiple athletes into a single pill (instead of one
   * colored pill per athlete), and both that combined pill and the date
   * number become clickable to open a full day-detail view via this
   * callback. Only the coach's roster-wide calendar passes this -- an
   * athlete's or admin's own calendar never has more than one entry per
   * program-day, so there's nothing to combine there. */
  onDayClick?: (dateISO: string, dayEntries: CalendarEntry[]) => void;
  initialView?: CalendarViewMode;
  /** Opt-in override for the "Today" tab's content, given the active
   * dateISO -- lets the coach's calendar swap in its own richer per-athlete
   * daily briefing (program + correctives + health/readiness/recovery)
   * instead of the default DayDetailList. Admin/athlete calendars omit this
   * and get the plain grouped-by-program list, since there's no roster of
   * other athletes to brief there. */
  singleDayContent?: (dateISO: string) => ReactNode;
  /** Opt-in: when provided, an exercise-day row in the default Today view
   * (i.e. singleDayContent isn't overriding it) gets an expand chevron that
   * fetches and shows a quick exercises/sets/reps preview inline, no
   * navigation required. Only the athlete's own calendar wires this up --
   * it needs an athlete-scoped preview endpoint that the coach/admin
   * calendars don't have one of yet. */
  dayPreviewFetchUrl?: (entry: CalendarEntry) => string;
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
        : view === "single-day"
          ? format(cursor, "EEEE, MMM d")
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
          {(["single-day", "day", "week", "month"] as CalendarViewMode[]).map((m) => (
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
          onDayClick={onDayClick}
        />
      )}
      {view === "week" && (
        <WeekRow start={start} end={end} entriesByDate={entriesByDate} onEntryClick={onEntryClick} />
      )}
      {view === "day" && (
        <ThreeDayAgenda centerDate={cursor} entriesByDate={entriesByDate} onEntryClick={onEntryClick} />
      )}
      {view === "single-day" &&
        (singleDayContent ? (
          singleDayContent(startISO)
        ) : (
          <DayDetailList
            entries={entriesByDate.get(startISO) ?? []}
            onEntryClick={onEntryClick}
            emptyLabel="Nothing scheduled."
            dayPreviewFetchUrl={dayPreviewFetchUrl}
          />
        ))}
    </div>
  );
}

/** Same program, same day-in-program, same kind -- multiple athletes on an
 * identical assignment collapse to one visual group. Different athletes on
 * the same program but at different points in it (started on different
 * dates) keep their own groups, since they're not actually on the same day. */
function groupKey(e: CalendarEntry) {
  return `${e.kind}:${e.programId}:${e.programDayId}`;
}

function groupDayEntries(dayEntries: CalendarEntry[]) {
  const order: string[] = [];
  const groups = new Map<string, CalendarEntry[]>();
  for (const e of dayEntries) {
    const key = groupKey(e);
    const list = groups.get(key);
    if (list) list.push(e);
    else {
      groups.set(key, [e]);
      order.push(key);
    }
  }
  return order.map((key) => groups.get(key)!);
}

/** The full "everything going on this day" breakdown -- every athlete
 * scheduled that day, grouped by program so duplicates read as one block
 * instead of a wall of identical rows. Shared by the "Day" tab above and
 * CoachDayDetailDialog (opened from a month-view date), so both surfaces
 * stay in sync automatically. */
export function DayDetailList({
  entries,
  onEntryClick,
  emptyLabel = "Nothing scheduled.",
  dayPreviewFetchUrl,
}: {
  entries: CalendarEntry[];
  onEntryClick: (entry: CalendarEntry) => void;
  emptyLabel?: string;
  dayPreviewFetchUrl?: (entry: CalendarEntry) => string;
}) {
  const groups = groupDayEntries(entries);

  if (groups.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const rep = group[0];
        const iconBox = (
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              rep.isRestDay
                ? "bg-secondary text-muted-foreground"
                : rep.kind === "skill"
                  ? "bg-teal-500/15 text-teal-400"
                  : rep.isSelfAssigned
                    ? "bg-violet-500/15 text-violet-400"
                    : "bg-primary/15 text-primary",
            )}
          >
            {entryIcon(rep, "h-4 w-4")}
          </div>
        );
        const titleBlock = (
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold">{rep.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {rep.programName}
              {!rep.isRestDay &&
                ` · ${rep.exerciseCount} exercise${rep.exerciseCount === 1 ? "" : "s"}`}
            </p>
          </div>
        );

        // A lone entry with no athleteName is someone looking at their own
        // day (athlete's calendar, or a coach/admin's self-assigned entry)
        // -- there's no "which athlete" list to disambiguate, so the header
        // itself is the tappable row instead of a redundant "View details"
        // button underneath restating what's already on screen.
        if (group.length === 1 && !rep.athleteName) {
          const canPreview = dayPreviewFetchUrl && !rep.isRestDay && rep.kind === "exercise";
          return (
            <PreviewableEntryRow
              key={groupKey(rep)}
              entry={rep}
              iconBox={iconBox}
              titleBlock={titleBlock}
              onEntryClick={onEntryClick}
              previewFetchUrl={canPreview ? dayPreviewFetchUrl!(rep) : undefined}
            />
          );
        }

        return (
          <div key={groupKey(rep)}>
            <div className="mb-1.5 flex items-center gap-2">
              {iconBox}
              {titleBlock}
              {group.length > 1 && (
                <span className="ml-auto shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {group.length} athletes
                </span>
              )}
            </div>
            <div className="space-y-1.5 pl-9">
              {group.map((e) => (
                <button
                  key={e.assignmentId}
                  type="button"
                  onClick={() => onEntryClick(e)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-surface-elevated"
                >
                  <span className="truncate font-medium">{e.athleteName}</span>
                  {e.completed && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type DayPreviewExercise = { exerciseName: string; sets: number; reps: string; supersetGroup: string | null };

/** Expand chevron button for DayPreviewRow below -- split out only so its
 * onClick can stop the click from bubbling to the row's own onEntryClick
 * (navigating away) without the whole row needing to know about that. */
function DayPreviewChevron({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={open ? `Hide ${label} preview` : `Preview ${label}`}
      aria-expanded={open}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
    >
      <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
    </button>
  );
}

/** The expanded content itself -- just exercise names + sets/reps (see
 * /api/athlete/day-preview), nothing a full workout page already shows in
 * more detail. Query only fires once actually expanded, and stays cached
 * after that (a day's prescription doesn't change underneath you
 * mid-glance). */
function DayPreviewList({ fetchUrl }: { fetchUrl: string }) {
  const { data, isLoading } = useQuery<DayPreviewExercise[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
    staleTime: Infinity,
  });

  return (
    <div className="space-y-1 border-t border-border p-2.5">
      {isLoading ? (
        <div className="h-12 animate-pulse rounded bg-surface" />
      ) : !data?.length ? (
        <p className="py-1 text-center text-xs text-muted-foreground">Nothing prescribed here yet.</p>
      ) : (
        data.map((ex, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate">{ex.exerciseName}</span>
            <span className="shrink-0 font-semibold text-muted-foreground">
              {ex.sets}x{ex.reps}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/** The Today view's "looking at your own single day" row -- tapping the
 * row itself still navigates to the full workout page like before; the
 * chevron (only rendered when a preview URL is given) instead expands a
 * quick exercises/sets/reps list in place, without leaving the calendar. */
function PreviewableEntryRow({
  entry,
  iconBox,
  titleBlock,
  onEntryClick,
  previewFetchUrl,
}: {
  entry: CalendarEntry;
  iconBox: ReactNode;
  titleBlock: ReactNode;
  onEntryClick: (entry: CalendarEntry) => void;
  previewFetchUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border">
      <div className="flex w-full items-center gap-2 p-2.5">
        <button
          type="button"
          onClick={() => onEntryClick(entry)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {iconBox}
          {titleBlock}
        </button>
        {entry.completed && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
        {previewFetchUrl && (
          <DayPreviewChevron open={open} onToggle={() => setOpen((v) => !v)} label={entry.title} />
        )}
      </div>
      {open && previewFetchUrl && <DayPreviewList fetchUrl={previewFetchUrl} />}
    </div>
  );
}

function GroupedEntryPill({ group, onClick }: { group: CalendarEntry[]; onClick: () => void }) {
  const rep = group[0];
  const completedCount = group.filter((e) => e.completed).length;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded px-1.5 py-1 text-left text-[11px] font-semibold transition-colors sm:text-xs",
        rep.isRestDay
          ? "bg-secondary text-muted-foreground"
          : rep.kind === "skill"
            ? "bg-teal-500/20 text-teal-400 hover:bg-teal-500/30"
            : rep.isSelfAssigned
              ? "bg-violet-500/20 text-violet-400 hover:bg-violet-500/30"
              : completedCount === group.length
                ? "bg-success/20 text-success hover:bg-success/30"
                : "bg-primary/20 text-primary hover:bg-primary/30",
      )}
    >
      {entryIcon(rep, "h-3 w-3 shrink-0")}
      <span className="truncate">{rep.title}</span>
      <span className="ml-auto shrink-0 rounded-full bg-background/40 px-1.5 text-[10px] leading-normal">
        {rep.isRestDay ? group.length : `${completedCount}/${group.length}`}
      </span>
    </button>
  );
}

function MonthGrid({
  start,
  end,
  cursor,
  entriesByDate,
  onEntryClick,
  onDayClick,
}: {
  start: Date;
  end: Date;
  cursor: Date;
  entriesByDate: Map<string, CalendarEntry[]>;
  onEntryClick: (entry: CalendarEntry) => void;
  onDayClick?: (dateISO: string, dayEntries: CalendarEntry[]) => void;
}) {
  const days = eachDayOfInterval({ start, end });
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-muted-foreground sm:gap-2 sm:text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day) => {
          const dateStr = formatISO(day, { representation: "date" });
          const dayEntries = entriesByDate.get(dateStr) ?? [];
          const dayGroups = onDayClick ? groupDayEntries(dayEntries) : dayEntries.map((e) => [e]);
          const inMonth = isSameMonth(day, cursor);
          return (
            <div
              key={dateStr}
              aria-current={isToday(day) ? "date" : undefined}
              className={cn(
                "flex min-h-16 flex-col gap-1 rounded-md border border-border p-1 sm:min-h-28 sm:gap-1 sm:p-2",
                !inMonth && "opacity-30",
                isToday(day) && "border-primary",
              )}
            >
              {onDayClick && dayEntries.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onDayClick(dateStr, dayEntries)}
                  aria-label={`View full details for ${format(day, "MMMM d, yyyy")}`}
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold transition-shadow hover:ring-2 hover:ring-primary/50 sm:h-5 sm:w-5 sm:text-xs",
                    isToday(day) && "bg-primary text-primary-foreground",
                  )}
                >
                  {format(day, "d")}
                  {isToday(day) && <span className="sr-only"> (Today)</span>}
                </button>
              ) : (
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold sm:h-5 sm:w-5 sm:text-xs",
                    isToday(day) && "bg-primary text-primary-foreground",
                  )}
                >
                  {format(day, "d")}
                  {isToday(day) && <span className="sr-only"> (Today)</span>}
                </span>
              )}

              {/* Mobile: icon-only dots so a full month fits on one screen
                  without scrolling -- tapping still opens that entry (or,
                  once grouped, the full day detail). Sized to a real touch
                  target (not just a legible dot) since these are the only
                  way to open an entry on a phone in this view. */}
              <div className="flex flex-1 flex-wrap items-end gap-1 sm:hidden">
                {dayGroups.slice(0, 3).map((group) => {
                  const e = group[0];
                  return (
                    <button
                      key={groupKey(e)}
                      onClick={() =>
                        group.length > 1 && onDayClick
                          ? onDayClick(dateStr, dayEntries)
                          : onEntryClick(e)
                      }
                      aria-label={e.title}
                      title={e.title}
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                        e.isRestDay
                          ? "bg-secondary text-muted-foreground"
                          : e.kind === "skill"
                            ? "bg-teal-500/25 text-teal-400"
                            : e.isSelfAssigned
                              ? "bg-violet-500/25 text-violet-400"
                              : e.completed
                                ? "bg-success/25 text-success"
                                : "bg-primary/25 text-primary",
                      )}
                    >
                      {entryIcon(e, "h-3.5 w-3.5")}
                    </button>
                  );
                })}
              </div>

              {/* Desktop/tablet: full text pills -- combined into one pill
                  per shared program-day when onDayClick is wired up. */}
              <div className="hidden flex-1 flex-col gap-1 sm:flex">
                {dayGroups.map((group) =>
                  group.length > 1 ? (
                    <GroupedEntryPill
                      key={groupKey(group[0])}
                      group={group}
                      onClick={() => onDayClick!(dateStr, dayEntries)}
                    />
                  ) : (
                    <EntryPill
                      key={groupKey(group[0])}
                      entry={group[0]}
                      onClick={() => onEntryClick(group[0])}
                    />
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One day's worth of entries as a label + a stack of full-width, generously
 * padded rows -- shared by the 3-day agenda and (on phones) the week view,
 * so both read the same way instead of the week view falling back to a
 * cramped grid of tiny fixed-height boxes on a narrow screen. */
function DayAgendaRow({
  day,
  dayEntries,
  onEntryClick,
  label,
}: {
  day: Date;
  dayEntries: CalendarEntry[];
  onEntryClick: (entry: CalendarEntry) => void;
  label: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span
          className={cn("text-sm font-bold uppercase tracking-wide", isToday(day) && "text-primary")}
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
                      : e.kind === "skill"
                        ? "bg-teal-500/15 text-teal-400"
                        : e.isSelfAssigned
                          ? "bg-violet-500/15 text-violet-400"
                          : e.completed
                            ? "bg-success/15 text-success"
                            : "bg-primary/15 text-primary",
                  )}
                >
                  {entryIcon(e, "h-[18px] w-[18px]")}
                </div>
                <div>
                  {e.athleteName && <p className="text-xs text-muted-foreground">{e.athleteName}</p>}
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
      )}
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

      {/* Phones: the same agenda-row layout as the 3-day view, just for all
          7 days -- a grid of fixed-height boxes at this width left most of
          them empty and cramped at once. */}
      <div className="space-y-5 sm:hidden">
        {days.map((day) => {
          const dateStr = formatISO(day, { representation: "date" });
          return (
            <DayAgendaRow
              key={dateStr}
              day={day}
              dayEntries={entriesByDate.get(dateStr) ?? []}
              onEntryClick={onEntryClick}
              label={isToday(day) ? "Today" : format(day, "EEEE")}
            />
          );
        })}
      </div>

      {/* Tablet/desktop: a real 7-column week grid, with room to spare. */}
      <div className="hidden gap-2 sm:grid sm:grid-cols-7">
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
  const days = [centerDate, addDays(centerDate, 1), addDays(centerDate, 2)];
  return (
    <div className="space-y-5">
      {days.map((day) => {
        const dateStr = formatISO(day, { representation: "date" });
        const label = isToday(day)
          ? "Today"
          : isYesterday(day)
            ? "Yesterday"
            : isTomorrow(day)
              ? "Tomorrow"
              : format(day, "EEEE");
        return (
          <DayAgendaRow
            key={dateStr}
            day={day}
            dayEntries={entriesByDate.get(dateStr) ?? []}
            onEntryClick={onEntryClick}
            label={label}
          />
        );
      })}
    </div>
  );
}
