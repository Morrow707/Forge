/* ATTENDANCE AND "WHO TRAINED TODAY" (2026-11-21). The rules the coach's Today card, the week view
 * and the parent's weekly summary share. Pure: no database, so `npm test` covers it with no Postgres.
 *
 * Scott: "they have the dashboard already and it's a quick add on if we don't already have like a
 * here's who did the lift today thing". What already existed: the calendar's Today tab
 * (getDayBriefingForCoach) knows completed or not. What it could not say is STARTED (a log exists
 * and is not finished), and nothing recorded whether somebody was in the room. Both are here.
 *
 *   - A session's status comes from the workout log alone: completed, started (a log row that is
 *     not complete), or not started. Nobody types it.
 *   - Attendance is the coach's own mark: present, absent or excused, one per athlete per day per
 *     PROGRAM (the primary coach), so an assistant and the head coach see and correct the same mark.
 *     It is never inferred from a log: an athlete can train at home and miss practice. */

export const ATTENDANCE_STATUSES = ["present", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  excused: "Excused",
};

export type SessionStatus = "completed" | "started" | "not_started";

export const SESSION_LABEL: Record<SessionStatus, string> = {
  completed: "Completed",
  started: "Started",
  not_started: "Not started",
};

/** One athlete's day, read from their sessions: the worst-placed session decides it only when
 * none is complete. Every session complete reads completed; any log at all reads started. */
export function dayStatus(sessions: SessionStatus[]): SessionStatus | "nothing_assigned" {
  if (sessions.length === 0) return "nothing_assigned";
  if (sessions.every((s) => s === "completed")) return "completed";
  if (sessions.some((s) => s !== "not_started")) return "started";
  return "not_started";
}

// A calendar date as YYYY-MM-DD: "2026-11-21" matches; "21/11/2026" and "2026-11-21T10:00" do not.
// https://regex101.com/?regex=%5E%5Cd%7B4%7D-%5Cd%7B2%7D-%5Cd%7B2%7D%24
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_LENGTH = 10;
const DAYS_IN_WEEK = 7;
const SUNDAY = 0;
const MONDAY_OFFSET_FROM_SUNDAY = 6;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addUtcDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, ISO_DATE_LENGTH);
}

/** The Monday of the week holding `iso` (weeks run Monday to Sunday). */
export function mondayOf(iso: string): string {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const back = weekday === SUNDAY ? MONDAY_OFFSET_FROM_SUNDAY : weekday - 1;
  return addUtcDays(iso, -back);
}

/** The seven dates of the week starting on `monday`. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, i) => addUtcDays(monday, i));
}

export function shiftWeek(monday: string, weeks: number): string {
  return addUtcDays(monday, weeks * DAYS_IN_WEEK);
}

export type AttendanceWeekDay = {
  date: string;
  attendance: AttendanceStatus | null;
  assigned: number;
  completed: number;
};

export type AttendanceWeekAthlete = {
  athleteId: number;
  name: string;
  held: boolean;
  days: AttendanceWeekDay[];
};

export type AttendanceWeek = {
  start: string;
  dates: string[];
  athletes: AttendanceWeekAthlete[];
};

/** The week view as a spreadsheet: one row per athlete per day, so a coach can filter and pivot it.
 * Hand-entered marks and logged sessions only; no camera number is in it, so it carries no caveat. */
export const ATTENDANCE_CSV_HEADER = ["Athlete", "Date", "Attendance", "Sessions assigned", "Sessions completed", "On hold"];

export function attendanceWeekCsvRows(week: AttendanceWeek): Array<Array<string | number>> {
  return week.athletes.flatMap((a) =>
    a.days.map((d) => [
      a.name,
      d.date,
      d.attendance ? ATTENDANCE_LABEL[d.attendance] : "",
      d.assigned,
      d.completed,
      a.held ? "Yes" : "",
    ]),
  );
}
