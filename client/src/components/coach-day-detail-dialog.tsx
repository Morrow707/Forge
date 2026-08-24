import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DayDetailList, type CalendarEntry } from "@/components/calendar-view";
import { format, parseISO } from "date-fns";

/** The "very detailed view" a coach lands on after clicking a date (or a
 * combined pill) on the roster-wide month calendar -- every athlete
 * scheduled that day, grouped by program so duplicates read as one block
 * instead of a wall of identical rows, each still clickable through to its
 * own day-edit or skill-view dialog. Same breakdown also lives inline as
 * the calendar's "Day" tab (see DayDetailList in calendar-view.tsx). */
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>{date ? format(parseISO(date), "EEEE, MMMM d, yyyy") : ""}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DayDetailList entries={entries} onEntryClick={onEntryClick} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
