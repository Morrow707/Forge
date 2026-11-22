/** Re-reads every calendar pasted into Forge every three hours (2026-11-22). The work is
 * `refreshAllImports` in server/calendar-events.ts, which keeps a calendar's events when a read
 * fails and records the sentence instead; the "Refresh" button on the sync dialog calls the same
 * `refreshImport` for one calendar.
 *
 * Under the advisory job lock like every job here, so two instances up during a deploy do not
 * fetch every outside calendar twice. */
import { runWithJobLock } from "./job-lock";
import { reportJobFailure } from "./job-errors";

export const CALENDAR_IMPORT_JOB = "calendar-import-refresh";
const HOURS = 3;
const MS_PER_HOUR = 3_600_000;
export const CALENDAR_IMPORT_INTERVAL_MS = HOURS * MS_PER_HOUR;

export async function runCalendarImportRefresh() {
  try {
    const { refreshAllImports } = await import("./calendar-events");
    return await refreshAllImports();
  } catch (err) {
    reportJobFailure(CALENDAR_IMPORT_JOB, err);
    return { calendars: 0, failed: 0 };
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startCalendarImportJob(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runWithJobLock(CALENDAR_IMPORT_JOB, runCalendarImportRefresh);
  }, CALENDAR_IMPORT_INTERVAL_MS);
  timer.unref?.();
}
