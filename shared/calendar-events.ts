/* CALENDAR EVENTS AND CALENDAR SYNC (2026-11-22). The shared vocabulary for the events a person
 * adds to their Forge calendar (a game, a practice, a meeting) and for calendars pasted in from
 * Google, Apple or Outlook. Read by the server (server/calendar-events.ts) and the client
 * (client/src/components/calendar-event-dialog.tsx, calendar-view.tsx).
 *
 * An event is NEVER training: it has no assignment, no completion and no attendance, and nothing
 * that counts workouts reads it. It sits beside the training days on the calendar and nowhere
 * else. */

/** The labels an event can carry. "other" with a custom label covers anything else. */
export const CALENDAR_EVENT_LABELS = [
  { id: "game", name: "Game" },
  { id: "practice", name: "Practice" },
  { id: "testing", name: "Testing" },
  { id: "meeting", name: "Meeting" },
  { id: "travel", name: "Travel" },
  { id: "other", name: "Other" },
] as const;
export type CalendarEventLabel = (typeof CALENDAR_EVENT_LABELS)[number]["id"];
export const CALENDAR_EVENT_LABEL_IDS = CALENDAR_EVENT_LABELS.map((l) => l.id) as [CalendarEventLabel, ...CalendarEventLabel[]];

/** The fixed colour palette. Each colour carries a solid (the dot and the edge), a tinted
 * background that reads on both themes, and a text colour per theme: the darker shade on the light
 * theme, the lighter shade on the dark one. A fixed list on purpose, so no event can be drawn in a
 * colour that disappears on one of the two themes. */
export const CALENDAR_EVENT_COLORS = [
  { id: "red", name: "Red", solid: "#ef4444", textOnLight: "#b91c1c", textOnDark: "#fca5a5", tint: "rgba(239, 68, 68, 0.18)" },
  { id: "orange", name: "Orange", solid: "#f97316", textOnLight: "#c2410c", textOnDark: "#fdba74", tint: "rgba(249, 115, 22, 0.18)" },
  { id: "amber", name: "Amber", solid: "#f59e0b", textOnLight: "#b45309", textOnDark: "#fcd34d", tint: "rgba(245, 158, 11, 0.18)" },
  { id: "green", name: "Green", solid: "#22c55e", textOnLight: "#15803d", textOnDark: "#86efac", tint: "rgba(34, 197, 94, 0.18)" },
  { id: "teal", name: "Teal", solid: "#14b8a6", textOnLight: "#0f766e", textOnDark: "#5eead4", tint: "rgba(20, 184, 166, 0.18)" },
  { id: "blue", name: "Blue", solid: "#3b82f6", textOnLight: "#1d4ed8", textOnDark: "#93c5fd", tint: "rgba(59, 130, 246, 0.18)" },
  { id: "violet", name: "Violet", solid: "#8b5cf6", textOnLight: "#6d28d9", textOnDark: "#c4b5fd", tint: "rgba(139, 92, 246, 0.18)" },
  { id: "pink", name: "Pink", solid: "#ec4899", textOnLight: "#be185d", textOnDark: "#f9a8d4", tint: "rgba(236, 72, 153, 0.18)" },
  { id: "slate", name: "Slate", solid: "#64748b", textOnLight: "#334155", textOnDark: "#cbd5e1", tint: "rgba(100, 116, 139, 0.18)" },
] as const;
export type CalendarEventColor = (typeof CALENDAR_EVENT_COLORS)[number]["id"];
export const CALENDAR_EVENT_COLOR_IDS = CALENDAR_EVENT_COLORS.map((c) => c.id) as [CalendarEventColor, ...CalendarEventColor[]];

/** The colour a new event starts in for each label. The person can change it. */
export const DEFAULT_COLOR_FOR_LABEL: Record<CalendarEventLabel, CalendarEventColor> = {
  game: "red",
  practice: "blue",
  testing: "amber",
  meeting: "violet",
  travel: "teal",
  other: "slate",
};

/** The colour an imported calendar starts in. */
export const DEFAULT_IMPORT_COLOR: CalendarEventColor = "slate";

export function calendarColor(id: string | null | undefined) {
  return CALENDAR_EVENT_COLORS.find((c) => c.id === id) ?? CALENDAR_EVENT_COLORS[CALENDAR_EVENT_COLORS.length - 1];
}

/** What the pill says: the custom label when one was typed, otherwise the label's name. */
export function labelText(label: string, customLabel?: string | null): string {
  const custom = customLabel?.trim();
  if (custom) return custom;
  return CALENDAR_EVENT_LABELS.find((l) => l.id === label)?.name ?? "Event";
}

export const EVENT_TITLE_MAX = 120;
export const EVENT_CUSTOM_LABEL_MAX = 30;
export const EVENT_LOCATION_MAX = 200;
export const EVENT_NOTE_MAX = 1000;
export const IMPORT_NAME_MAX = 60;
/** A subscribe address is a URL; Google's private addresses run to about 200 characters. */
export const IMPORT_URL_MAX = 2000;
/** Imported calendars one person may hold. */
export const MAX_IMPORTS_PER_USER = 10;

/** A 24-hour wall-clock time, "HH:MM". https://regex101.com/?regex=%5E(%5B01%5D%5Cd%7C2%5B0-3%5D)%3A%5B0-5%5D%5Cd%24&testString=07%3A30 */
export const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A calendar date, "YYYY-MM-DD". https://regex101.com/?regex=%5E%5Cd%7B4%7D-%5Cd%7B2%7D-%5Cd%7B2%7D%24&testString=2026-11-22 */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "15:30" -> "3:30 PM". */
export function formatTimeOfDay(time: string | null | undefined): string | null {
  if (!time || !TIME_OF_DAY_RE.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  const NOON = 12;
  const MINUTE_DIGITS = 2;
  const suffix = h >= NOON ? "PM" : "AM";
  const hour12 = h % NOON === 0 ? NOON : h % NOON;
  return `${hour12}:${String(m).padStart(MINUTE_DIGITS, "0")} ${suffix}`;
}

/** One event as every calendar view receives it. Forge events and imported ones share the shape;
 * `source` tells them apart and only a Forge event the reader may change carries `canEdit`. */
export type CalendarEventItem = {
  /** "forge-12" or "import-4-<n>": unique across both sources. */
  key: string;
  source: "forge" | "imported";
  id: number;
  title: string;
  label: string;
  customLabel: string | null;
  color: string;
  /** The day it is drawn on, local to the reader (the client recomputes it for an instant). */
  date: string;
  /** Wall-clock times, when the event has them and no instant. */
  startTime: string | null;
  endTime: string | null;
  /** An instant (UTC ISO), for an imported event that named a time zone or UTC. */
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  note: string | null;
  teamId: number | null;
  teamName: string | null;
  /** The imported calendar's name, for an imported event. */
  calendarName: string | null;
  canEdit: boolean;
};
