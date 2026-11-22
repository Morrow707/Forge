/* READING A CALENDAR SOMEBODY PASTED IN (2026-11-22). The inbound half of calendar sync: the text
 * a Google, Apple or Outlook subscribe address returns, turned into the events Forge draws
 * read-only beside training days. The outbound writer is server/ics.ts; the fetch that gets the
 * text, with its address checks, is server/calendar-fetch.ts.
 *
 * What it reads, and what it states it does not:
 *   - all-day events (VALUE=DATE), one row per day for a multi-day one, capped at a month;
 *   - timed events in UTC ("...Z"), in a named zone (TZID=, including the common Windows names
 *     Outlook writes), or floating (no zone, shown as written);
 *   - DTEND or DURATION;
 *   - RRULE with FREQ=DAILY or FREQ=WEEKLY (INTERVAL, COUNT, UNTIL, BYDAY), EXDATE, and an
 *     edited instance (RECURRENCE-ID) replacing the one it overrides;
 *   - a cancelled event is left out.
 * A MONTHLY or YEARLY rule shows its first date only and is counted in `skipped.unsupportedRule`,
 * so the dialog can say so rather than pretend the calendar was read in full. A file that is not a
 * calendar throws IcsParseError; one malformed event is counted and skipped, never the whole file.
 * Pure: no network, no database, so `npm test` covers it with no Postgres. */

/* The parser walks lines, properties and recurrence steps with early exits (a COUNT, an UNTIL, the
 * window's end), which a for loop says plainly and a reduce would hide. */
/* eslint-disable ts-patterns/no-loop-statements */

export class IcsParseError extends Error {}

export type ParsedCalendarEvent = {
  uid: string;
  /** Unique per instance within one calendar: the uid plus the instance's start. */
  instanceKey: string;
  title: string;
  location: string | null;
  note: string | null;
  allDay: boolean;
  /** YYYY-MM-DD: the wall date for an all-day or floating event, the UTC date of an instant. */
  date: string;
  startTime: string | null;
  endTime: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type ParsedCalendar = {
  calendarName: string | null;
  events: ParsedCalendarEvent[];
  skipped: { malformed: number; unsupportedRule: number; truncated: boolean };
};

export type ParseWindow = { start: string; end: string; maxEvents: number };

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MS_PER_SECOND = 1000;
const MS_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * MS_PER_MINUTE;
const DAYS_PER_WEEK = 7;
/** A multi-day all-day event is drawn on each of its days, up to this many. */
const MAX_ALL_DAY_SPAN_DAYS = 31;
/** A recurrence is never walked further than this many steps, whatever its COUNT says. */
const MAX_RECURRENCE_STEPS = 5000;
const TITLE_MAX = 120;
const LOCATION_MAX = 200;
const NOTE_MAX = 1000;
const ISO_DATE_LENGTH = 10;
const HH_MM_LENGTH = 5;
const FIRST_MONTH = 1;

/** The Windows zone names Outlook writes in TZID, mapped to their IANA names. */
const WINDOWS_ZONES: Record<string, string> = {
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "US Mountain Standard Time": "America/Phoenix",
  "Pacific Standard Time": "America/Los_Angeles",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  UTC: "UTC",
  "Coordinated Universal Time": "UTC",
};

/** ICS weekday codes in JavaScript getUTCDay order (Sunday 0). */
const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MONDAY = 1;

type Prop = { name: string; params: Record<string, string>; value: string };
type RawEvent = Prop[];

/** A date-time read off a property. `wall` is the written clock as if it were UTC milliseconds,
 * so day arithmetic on it is plain addition; `instant` is the real moment when one is known. */
type When =
  | { kind: "date"; wall: number }
  | { kind: "utc"; wall: number }
  | { kind: "zoned"; wall: number; tz: string }
  | { kind: "floating"; wall: number };

function unfold(text: string): string[] {
  // RFC 5545 3.1: a line break followed by a space or tab continues the line. Matches "\r\n " in
  // "DESC:a\r\n b"; rejects the plain break in "a\r\nb".
  // https://regex101.com/?regex=%5Cr%3F%5Cn%5B%20%5Ct%5D&testString=DESC%3Aa%0D%0A%20b
  const joined = text.replace(/\r?\n[ \t]/g, "");
  // Any line break. Matches "\r\n" and "\n"; rejects a lone "\r".
  // https://regex101.com/?regex=%5Cr%3F%5Cn&testString=a%0D%0Ab
  return joined.split(/\r?\n/).filter((l) => l.length > 0);
}

function parseLine(line: string): Prop | null {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts: string[] = [];
  let cur = "";
  inQuotes = false;
  for (const ch of head) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === ";" && !inQuotes) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq > 0) {
      // A quoted parameter value keeps what is inside the quotes. Matches '"America/New_York"';
      // rejects the unquoted 'America/New_York'.
      // https://regex101.com/?regex=%5E%22(.*)%22%24&testString=%22America%2FNew_York%22
      params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"(.*)"$/, "$1");
    }
  }
  return { name: parts[0].toUpperCase(), params, value };
}

function unescapeText(value: string): string {
  // RFC 5545 3.3.11 text escapes. Matches "\\," and "\\n" in "a\\,b\\nc"; rejects "\\x".
  // https://regex101.com/?regex=%5C%5C(%5B%5C%5C%3B%2CnN%5D)&testString=a%5C%2Cb%5Cnc
  return value.replace(/\\([\\;,nN])/g, (_m, c: string) => (c === "n" || c === "N" ? "\n" : c)).trim();
}

function clip(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

/** Whether a zone name is one this runtime can convert with. */
function knownZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function resolveZone(tzid: string | undefined): string | null {
  if (!tzid) return null;
  const mapped = WINDOWS_ZONES[tzid] ?? tzid;
  return knownZone(mapped) ? mapped : null;
}

// A date or a date-time. Matches "20261122", "20261122T153000" and "20261122T153000Z"; rejects
// "2026-11-22".
// https://regex101.com/?regex=%5E(%5Cd%7B4%7D)(%5Cd%7B2%7D)(%5Cd%7B2%7D)(%3F%3AT(%5Cd%7B2%7D)(%5Cd%7B2%7D)(%5Cd%7B2%7D)%3F(Z)%3F)%3F%24&testString=20261122T153000Z
const DATE_VALUE_RE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/;

function parseWhen(value: string, params: Record<string, string>): When | null {
  const m = DATE_VALUE_RE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const wall = Date.UTC(Number(y), Number(mo) - FIRST_MONTH, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0));
  if (Number.isNaN(wall)) return null;
  if (h === undefined || params.VALUE === "DATE") return { kind: "date", wall: Date.UTC(Number(y), Number(mo) - FIRST_MONTH, Number(d)) };
  if (z) return { kind: "utc", wall };
  const tz = resolveZone(params.TZID);
  return tz ? { kind: "zoned", wall, tz } : { kind: "floating", wall };
}

/** The written clock of an instant in a zone, as wall milliseconds. */
function wallInZone(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - FIRST_MONTH, get("day"), get("hour"), get("minute"), get("second"));
}

/** The instant a written clock in a zone names. Two passes settle the offset across a DST change. */
export function zonedWallToInstant(wall: number, tz: string): number {
  let guess = wall - (wallInZone(wall, tz) - wall);
  guess = wall - (wallInZone(guess, tz) - guess);
  return guess;
}

function instantOf(when: When, wall: number): number | null {
  if (when.kind === "utc") return wall;
  if (when.kind === "zoned") return zonedWallToInstant(wall, when.tz);
  return null;
}

const isoDate = (wall: number) => new Date(wall).toISOString().slice(0, ISO_DATE_LENGTH);
const isoTime = (wall: number) => new Date(wall).toISOString().slice(ISO_DATE_LENGTH + 1, ISO_DATE_LENGTH + 1 + HH_MM_LENGTH);

// An ISO 8601 duration. Matches "P1D", "PT1H30M", "-PT15M" and "P2W"; rejects "1H".
// https://regex101.com/?regex=%5E(%5B%2B-%5D)%3FP(%3F%3A(%5Cd%2B)W)%3F(%3F%3A(%5Cd%2B)D)%3F(%3F%3AT(%3F%3A(%5Cd%2B)H)%3F(%3F%3A(%5Cd%2B)M)%3F(%3F%3A(%5Cd%2B)S)%3F)%3F%24&testString=PT1H30M
const DURATION_RE = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

function parseDurationMs(value: string): number | null {
  const m = DURATION_RE.exec(value.trim());
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms =
    Number(w ?? 0) * DAYS_PER_WEEK * MS_PER_DAY +
    Number(d ?? 0) * MS_PER_DAY +
    Number(h ?? 0) * MINUTES_PER_HOUR * MS_PER_MINUTE +
    Number(mi ?? 0) * MS_PER_MINUTE +
    Number(s ?? 0) * MS_PER_SECOND;
  return sign === "-" ? -ms : ms;
}

// The weekday of a BYDAY entry, ignoring an ordinal (which only a MONTHLY rule uses). Matches
// "MO" in "1MO" and "MO"; rejects "XX".
// https://regex101.com/?regex=(SU%7CMO%7CTU%7CWE%7CTH%7CFR%7CSA)%24&testString=1MO
const BYDAY_WEEKDAY_RE = /(SU|MO|TU|WE|TH|FR|SA)$/;

type Rule = { freq: string; interval: number; count: number | null; until: When | null; byDay: number[] };

function parseRule(value: string): Rule | null {
  const fields: Record<string, string> = {};
  for (const part of value.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) fields[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  if (!fields.FREQ) return null;
  const interval = Math.max(1, Number(fields.INTERVAL ?? 1) || 1);
  const count = fields.COUNT ? Number(fields.COUNT) : null;
  const until = fields.UNTIL ? parseWhen(fields.UNTIL, {}) : null;
  const byDay = (fields.BYDAY ?? "")
    .split(",")
    .map((c) => BYDAY_WEEKDAY_RE.exec(c.trim())?.[1])
    .filter((c): c is string => !!c)
    .map((c) => WEEKDAY_CODES.indexOf(c));
  return { freq: fields.FREQ.toUpperCase(), interval, count: count && count > 0 ? count : null, until, byDay };
}

/** Comparable key of a start, the instant when there is one and the wall clock otherwise. */
function startKey(when: When, wall: number): number {
  return instantOf(when, wall) ?? wall;
}

function untilKey(until: When): number {
  // An UNTIL that is a bare date includes the whole of that day.
  if (until.kind === "date") return until.wall + MS_PER_DAY - 1;
  return until.kind === "utc" ? until.wall : startKey(until, until.wall);
}

/** Every start of a recurring event, as wall milliseconds, from DTSTART until the rule or the
 * window ends. COUNT counts from the first instance, including those before the window. */
function expandRule(start: When, rule: Rule, windowEndWall: number): number[] {
  const out: number[] = [];
  const limit = rule.count ?? MAX_RECURRENCE_STEPS;
  const until = rule.until ? untilKey(rule.until) : null;
  const accept = (wall: number): boolean => {
    if (until !== null && startKey(start, wall) > until) return false;
    if (wall > windowEndWall) return false;
    out.push(wall);
    return out.length < limit;
  };
  if (rule.freq === "DAILY") {
    for (let i = 0; i < MAX_RECURRENCE_STEPS; i++) {
      if (!accept(start.wall + i * rule.interval * MS_PER_DAY)) break;
    }
    return out;
  }
  // WEEKLY. Weeks start on Monday (WKST's default); with no BYDAY, the DTSTART weekday.
  const startDay = new Date(start.wall).getUTCDay();
  const days = (rule.byDay.length > 0 ? rule.byDay : [startDay]).slice().sort((a, b) => ((a - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK) - ((b - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK));
  const weekStart = start.wall - ((startDay - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK) * MS_PER_DAY;
  for (let week = 0; week < MAX_RECURRENCE_STEPS; week++) {
    const base = weekStart + week * rule.interval * DAYS_PER_WEEK * MS_PER_DAY;
    if (base > windowEndWall) break;
    for (const day of days) {
      const wall = base + ((day - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK) * MS_PER_DAY;
      if (wall < start.wall) continue;
      if (!accept(wall)) return out;
    }
  }
  return out;
}

function propsOf(ev: RawEvent, name: string): Prop[] {
  return ev.filter((p) => p.name === name);
}
function propOf(ev: RawEvent, name: string): Prop | undefined {
  return ev.find((p) => p.name === name);
}

/** The instances of one VEVENT inside the window, or null when it is malformed. */
function eventInstances(
  ev: RawEvent,
  excluded: Set<number>,
  windowStartWall: number,
  windowEndWall: number,
  onUnsupportedRule: () => void,
): ParsedCalendarEvent[] | null {
  const dtstart = propOf(ev, "DTSTART");
  if (!dtstart) return null;
  const start = parseWhen(dtstart.value, dtstart.params);
  if (!start) return null;
  const uid = propOf(ev, "UID")?.value.trim() || `${dtstart.value}-${propOf(ev, "SUMMARY")?.value ?? ""}`;
  const dtend = propOf(ev, "DTEND");
  const endWhen = dtend ? parseWhen(dtend.value, dtend.params) : null;
  const durationProp = propOf(ev, "DURATION");
  let lengthMs: number;
  if (endWhen) lengthMs = endWhen.wall - start.wall;
  else if (durationProp) lengthMs = parseDurationMs(durationProp.value) ?? 0;
  else lengthMs = start.kind === "date" ? MS_PER_DAY : 0;
  if (lengthMs < 0) lengthMs = 0;

  const title = clip(unescapeText(propOf(ev, "SUMMARY")?.value ?? ""), TITLE_MAX) || "(No title)";
  const location = clip(unescapeText(propOf(ev, "LOCATION")?.value ?? ""), LOCATION_MAX);
  const note = clip(unescapeText(propOf(ev, "DESCRIPTION")?.value ?? ""), NOTE_MAX);

  const rruleProp = propOf(ev, "RRULE");
  let starts: number[] = [start.wall];
  if (rruleProp && !propOf(ev, "RECURRENCE-ID")) {
    const rule = parseRule(rruleProp.value);
    if (rule && (rule.freq === "DAILY" || rule.freq === "WEEKLY")) starts = expandRule(start, rule, windowEndWall);
    else onUnsupportedRule();
  }

  const out: ParsedCalendarEvent[] = [];
  for (const wall of starts) {
    if (excluded.has(startKey(start, wall))) continue;
    if (start.kind === "date") {
      const spanDays = Math.min(MAX_ALL_DAY_SPAN_DAYS, Math.max(1, Math.round(lengthMs / MS_PER_DAY)));
      for (let d = 0; d < spanDays; d++) {
        const day = wall + d * MS_PER_DAY;
        if (day < windowStartWall || day > windowEndWall) continue;
        const date = isoDate(day);
        out.push({ uid, instanceKey: `${uid}|${date}`, title, location, note, allDay: true, date, startTime: null, endTime: null, startsAt: null, endsAt: null });
      }
      continue;
    }
    const instant = instantOf(start, wall);
    if (instant !== null) {
      // The instant's UTC date is only a filter key; the reader's own day is drawn on the client.
      if (instant + lengthMs < windowStartWall || instant - MS_PER_DAY > windowEndWall) continue;
      out.push({
        uid,
        instanceKey: `${uid}|${new Date(instant).toISOString()}`,
        title,
        location,
        note,
        allDay: false,
        date: isoDate(instant),
        startTime: null,
        endTime: null,
        startsAt: new Date(instant),
        endsAt: lengthMs > 0 ? new Date(instant + lengthMs) : null,
      });
      continue;
    }
    if (wall < windowStartWall || wall > windowEndWall + MS_PER_DAY) continue;
    const endWall = wall + lengthMs;
    out.push({
      uid,
      instanceKey: `${uid}|${new Date(wall).toISOString()}`,
      title,
      location,
      note,
      allDay: false,
      date: isoDate(wall),
      startTime: isoTime(wall),
      endTime: lengthMs > 0 && isoDate(endWall) === isoDate(wall) ? isoTime(endWall) : null,
      startsAt: null,
      endsAt: null,
    });
  }
  return out;
}

export function parseIcsCalendar(text: string, window: ParseWindow): ParsedCalendar {
  const lines = unfold(text);
  if (!lines.some((l) => l.trim().toUpperCase() === "BEGIN:VCALENDAR")) {
    throw new IcsParseError("That address did not return a calendar.");
  }
  let calendarName: string | null = null;
  const events: RawEvent[] = [];
  let current: RawEvent | null = null;
  let depth = 0;
  for (const line of lines) {
    const prop = parseLine(line);
    if (!prop) continue;
    if (prop.name === "BEGIN") {
      if (prop.value.trim().toUpperCase() === "VEVENT" && !current) {
        current = [];
        depth = 0;
      } else if (current) depth++;
      continue;
    }
    if (prop.name === "END") {
      if (current && depth === 0 && prop.value.trim().toUpperCase() === "VEVENT") {
        events.push(current);
        current = null;
      } else if (current) depth--;
      continue;
    }
    if (current) {
      // Properties of a nested VALARM are not the event's.
      if (depth === 0) current.push(prop);
    } else if (prop.name === "X-WR-CALNAME" && !calendarName) {
      calendarName = clip(unescapeText(prop.value), TITLE_MAX);
    }
  }

  const windowStartWall = Date.parse(`${window.start}T00:00:00Z`);
  const windowEndWall = Date.parse(`${window.end}T23:59:59Z`);
  const skipped = { malformed: 0, unsupportedRule: 0, truncated: false };

  // An edited instance (RECURRENCE-ID) replaces the instance it names on the series.
  const excludedByUid = new Map<string, Set<number>>();
  for (const ev of events) {
    const uid = propOf(ev, "UID")?.value.trim();
    if (!uid) continue;
    const set = excludedByUid.get(uid) ?? new Set<number>();
    for (const p of [...propsOf(ev, "RECURRENCE-ID"), ...propsOf(ev, "EXDATE")]) {
      for (const v of p.value.split(",")) {
        const when = parseWhen(v, p.params);
        if (when) set.add(startKey(when, when.wall));
      }
    }
    excludedByUid.set(uid, set);
  }

  const out: ParsedCalendarEvent[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    if (propOf(ev, "STATUS")?.value.trim().toUpperCase() === "CANCELLED") continue;
    const uid = propOf(ev, "UID")?.value.trim() ?? "";
    // An override's own RECURRENCE-ID must not exclude the override itself.
    const excluded = propOf(ev, "RECURRENCE-ID") ? new Set<number>() : excludedByUid.get(uid) ?? new Set<number>();
    const instances = eventInstances(ev, excluded, windowStartWall, windowEndWall, () => skipped.unsupportedRule++);
    if (instances === null) {
      skipped.malformed++;
      continue;
    }
    for (const inst of instances) {
      if (seen.has(inst.instanceKey)) continue;
      if (out.length >= window.maxEvents) {
        skipped.truncated = true;
        break;
      }
      seen.add(inst.instanceKey);
      out.push(inst);
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return { calendarName, events: out, skipped };
}
