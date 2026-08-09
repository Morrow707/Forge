import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { entryIcon, type CalendarEntry } from "@/components/calendar-view";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";

/** Same grouping the month grid uses to combine identical-program-day pills
 * -- kept in sync so "N athletes" in the month view expands to exactly
 * those N athletes here, listed under one heading instead of N duplicate
 * rows. Different athletes on the same program but a different day-in-plan
 * (started on different dates) get their own heading, since they're
 * genuinely not doing the same thing today. */
function groupByProgramDay(entries: CalendarEntry[]) {
  const order: string[] = [];
  const groups = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    const key = `${e.kind}:${e.programId}:${e.programDayId}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else {
      groups.set(key, [e]);
      order.push(key);
    }
  }
  return order.map((key) => groups.get(key)!);
}

/** The "very detailed view" a coach lands on after clicking a date (or a
 * combined pill) on the roster-wide month calendar -- every athlete
 * scheduled that day, grouped by program so duplicates read as one block
 * instead of a wall of identical rows, each still clickable through to its
 * own day-edit or skill-view dialog. */
export function CoachDayDetailDialog({
  date,
  entries,
  open,
  onOpenChange,
  onEntryClick,
}: {
  date: string | null;
  entries: CalendarEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEntryClick: (entry: CalendarEntry) => void;
}) {
  const groups = groupByProgramDay(entries);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>{date ? format(parseISO(date), "EEEE, MMMM d, yyyy") : ""}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {groups.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
          )}
          {groups.map((group) => {
            const rep = group[0];
            return (
              <div key={`${rep.kind}:${rep.programId}:${rep.programDayId}`}>
                <div className="mb-1.5 flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      rep.isRestDay
                        ? "bg-secondary text-muted-foreground"
                        : rep.kind === "skill"
                          ? "bg-teal-500/15 text-teal-400"
                          : "bg-primary/15 text-primary",
                    )}
                  >
                    {entryIcon(rep, "h-4 w-4")}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{rep.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {rep.programName}
                      {!rep.isRestDay &&
                        ` · ${rep.exerciseCount} exercise${rep.exerciseCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
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
                      {e.completed && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
