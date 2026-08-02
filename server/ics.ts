// Minimal RFC 5545 iCalendar writer -- just enough for read-only, all-day
// training-day events. No recurrence rules: the feed is regenerated fresh
// on every fetch from live assignment data, so "recurrence" is just
// whatever the calendar app's periodic re-fetch happens to see.

export type IcsEvent = {
  uid: string;
  date: string; // YYYY-MM-DD
  summary: string;
  description?: string;
};

function foldLine(line: string): string {
  // RFC 5545 §3.1: lines longer than 75 octets get folded with a leading
  // space on the continuation. Byte length matters more than char count
  // for non-ASCII, but exercise/program names are short enough in practice
  // that this simple char-based fold is a safe, good-enough approximation.
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export function buildIcsFeed(calendarName: string, events: IcsEvent[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Forge//Training Calendar//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const ev of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}@forge.app`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${toIcsDate(ev.date)}`,
      `DTEND;VALUE=DATE:${addOneDay(ev.date)}`,
      `SUMMARY:${escapeText(ev.summary)}`,
    );
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
