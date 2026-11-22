/* How a calendar event is drawn (2026-11-22). The server sends an imported event that named a
 * zone or UTC as an instant; this turns it into the READER'S day and wall-clock time, so a 7 PM
 * game in New York lands on the right evening wherever the phone is. Forge's own events are
 * wall-clock already and pass through. */
import { CALENDAR_EVENT_COLORS, calendarColor, formatTimeOfDay, type CalendarEventItem } from "@shared/calendar-events";
import type { CSSProperties } from "react";

const PAD = 2;
const pad = (n: number) => String(n).padStart(PAD, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The event on the reader's own clock: date, start and end as wall-clock values. */
export function toLocalEvent(ev: CalendarEventItem): CalendarEventItem {
  if (!ev.startsAt) return ev;
  const start = new Date(ev.startsAt);
  const end = ev.endsAt ? new Date(ev.endsAt) : null;
  return {
    ...ev,
    date: localDate(start),
    startTime: localTime(start),
    endTime: end && localDate(end) === localDate(start) ? localTime(end) : null,
  };
}

/** "3:30 PM – 5:00 PM", "3:30 PM" or "All day". */
export function eventTimeText(ev: CalendarEventItem): string {
  const start = formatTimeOfDay(ev.startTime);
  if (!start) return "All day";
  const end = formatTimeOfDay(ev.endTime);
  return end ? `${start} – ${end}` : start;
}

/** The CSS variables the `.cal-ev` classes in index.css read, so one colour reads on both themes. */
export function eventColorStyle(colorId: string): CSSProperties {
  const c = calendarColor(colorId);
  return {
    ["--ev-solid" as string]: c.solid,
    ["--ev-tint" as string]: c.tint,
    ["--ev-fg-dark" as string]: c.textOnDark,
    ["--ev-fg-light" as string]: c.textOnLight,
  };
}

export { CALENDAR_EVENT_COLORS };
