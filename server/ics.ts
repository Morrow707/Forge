// Minimal RFC 5545 iCalendar writer -- just enough for read-only training-day events and the
// calendar events a person adds (2026-11-22). No recurrence rules: the feed is regenerated fresh
// on every fetch from live data, so "recurrence" is just whatever the calendar app's periodic
// re-fetch happens to see. The reader for calendars pasted INTO Forge is server/ics-parse.ts.

export type IcsEvent = {
  uid: string;
  date: string; // YYYY-MM-DD
  summary: string;
  description?: string;
  location?: string;
  /** Wall-clock "HH:MM". Absent means an all-day event. Written as a floating time, so a
   * subscriber sees 3:30 PM as 3:30 PM, which is what the person who typed it meant. */
  startTime?: string | null;
  endTime?: string | null;
};

/** RFC 5545 3.1: lines longer than 75 octets are folded. */
const FOLD_AT = 75;

function foldLine(line: string): string {
  // Byte length matters more than char count for non-ASCII, but exercise/program names are short
  // enough in practice that this simple char-based fold is a safe, good-enough approximation.
  if (line.length <= FOLD_AT) return line;
  const parts: string[] = [];
  let rest = line;
  // eslint-disable-next-line ts-patterns/no-loop-statements -- each fold depends on the last
  while (rest.length > FOLD_AT) {
    parts.push(rest.slice(0, FOLD_AT));
    rest = " " + rest.slice(FOLD_AT);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

function escapeText(value: string): string {
  // Backslash, semicolon, comma and newline are escaped (RFC 5545 3.3.11). Each matches its one
  // character, e.g. "," in "Smith, J"; none matches "abc".
  // https://regex101.com/?regex=%5C%5C&flags=g&testString=a%5Cb
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toIcsDate(dateStr: string): string {
  // The dashes of a date. Matches "-" in "2026-11-22"; rejects "20261122".
  // https://regex101.com/?regex=-&flags=g&testString=2026-11-22
  return dateStr.replace(/-/g, "");
}

function toIcsDateTime(dateStr: string, time: string): string {
  // The colon of a time. Matches ":" in "15:30"; rejects "1530".
  // https://regex101.com/?regex=%3A&flags=g&testString=15%3A30
  return `${toIcsDate(dateStr)}T${time.replace(/:/g, "")}00`;
}

const ISO_DATE_LENGTH = 10;

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return toIcsDate(d.toISOString().slice(0, ISO_DATE_LENGTH));
}

export function buildIcsFeed(calendarName: string, events: IcsEvent[]): string {
  // The separators and fraction of an ISO timestamp. Matches "-" and ":" in
  // "2026-11-22T10:00:00.000Z"; rejects "T".
  // https://regex101.com/?regex=%5B-%3A%5D&flags=g&testString=2026-11-22T10%3A00%3A00.000Z
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Forge//Training Calendar//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  events.forEach((ev) => {
    lines.push("BEGIN:VEVENT", `UID:${ev.uid}@forge.app`, `DTSTAMP:${now}`);
    if (ev.startTime) {
      lines.push(`DTSTART:${toIcsDateTime(ev.date, ev.startTime)}`);
      if (ev.endTime && ev.endTime > ev.startTime) lines.push(`DTEND:${toIcsDateTime(ev.date, ev.endTime)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(ev.date)}`, `DTEND;VALUE=DATE:${addOneDay(ev.date)}`);
    }
    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
