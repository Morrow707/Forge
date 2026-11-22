import { describe, expect, it } from "vitest";
import { IcsParseError, parseIcsCalendar, zonedWallToInstant } from "./ics-parse";

/* THE READER FOR A PASTED CALENDAR (2026-11-22). All-day, timed in UTC, timed in a named zone
 * (IANA and the Windows names Outlook writes), floating, a weekly rule with an exception, a
 * monthly rule shown once and counted, a cancelled event left out, and a file that is not a
 * calendar refused while one broken event in a good file is only counted. */

const MAX_EVENTS = 1000;
const WINDOW = { start: "2026-11-01", end: "2027-01-31", maxEvents: MAX_EVENTS };
const JULY_4_1530_WALL = Date.parse("2026-07-04T15:30:00Z");
const cal = (body: string, name = "") =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...(name ? [`X-WR-CALNAME:${name}`] : []), body.trim(), "END:VCALENDAR"].join("\r\n");
const ev = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

describe("parseIcsCalendar", () => {
  it("reads an all-day event, its title, location and note, and the calendar's name", () => {
    const out = parseIcsCalendar(
      cal(ev("UID:a1", "DTSTART;VALUE=DATE:20261205", "DTEND;VALUE=DATE:20261206", "SUMMARY:Home game vs. Central\\, JV", "LOCATION:Main gym", "DESCRIPTION:Bus at 5\\nBring warmups"), "Athletics"),
      WINDOW,
    );
    expect(out.calendarName).toBe("Athletics");
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ allDay: true, date: "2026-12-05", title: "Home game vs. Central, JV", location: "Main gym", note: "Bus at 5\nBring warmups", startsAt: null });
  });

  it("draws a three-day all-day event on each of its days", () => {
    const out = parseIcsCalendar(cal(ev("UID:trip", "DTSTART;VALUE=DATE:20261210", "DTEND;VALUE=DATE:20261213", "SUMMARY:Tournament")), WINDOW);
    expect(out.events.map((e) => e.date)).toEqual(["2026-12-10", "2026-12-11", "2026-12-12"]);
  });

  it("reads a UTC event as an instant, with its end", () => {
    const out = parseIcsCalendar(cal(ev("UID:u1", "DTSTART:20261205T230000Z", "DTEND:20261206T003000Z", "SUMMARY:Late game")), WINDOW);
    expect(out.events[0].startsAt?.toISOString()).toBe("2026-12-05T23:00:00.000Z");
    expect(out.events[0].endsAt?.toISOString()).toBe("2026-12-06T00:30:00.000Z");
    expect(out.events[0].allDay).toBe(false);
  });

  it("converts a TZID time to the right instant, across standard and daylight time", () => {
    const winter = parseIcsCalendar(cal(ev("UID:t1", "DTSTART;TZID=America/New_York:20261205T153000", "DURATION:PT2H", "SUMMARY:Practice")), WINDOW);
    expect(winter.events[0].startsAt?.toISOString()).toBe("2026-12-05T20:30:00.000Z");
    expect(winter.events[0].endsAt?.toISOString()).toBe("2026-12-05T22:30:00.000Z");
    // July: Eastern Daylight Time, four hours behind.
    expect(new Date(zonedWallToInstant(JULY_4_1530_WALL, "America/New_York")).toISOString()).toBe("2026-07-04T19:30:00.000Z");
  });

  it("reads Outlook's Windows zone name", () => {
    const out = parseIcsCalendar(cal(ev("UID:w1", 'DTSTART;TZID="Pacific Standard Time":20261205T090000', "SUMMARY:Film")), WINDOW);
    expect(out.events[0].startsAt?.toISOString()).toBe("2026-12-05T17:00:00.000Z");
  });

  it("keeps a floating time (no zone) as the wall clock it was written in", () => {
    const out = parseIcsCalendar(cal(ev("UID:f1", "DTSTART:20261205T150000", "DTEND:20261205T163000", "SUMMARY:Lift")), WINDOW);
    expect(out.events[0]).toMatchObject({ date: "2026-12-05", startTime: "15:00", endTime: "16:30", startsAt: null });
  });

  it("expands a weekly rule with BYDAY, COUNT and an EXDATE, and lets an edited instance replace its date", () => {
    const text = cal(
      [
        ev("UID:w", "DTSTART;TZID=America/Chicago:20261102T160000", "DTEND;TZID=America/Chicago:20261102T173000", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6", "EXDATE;TZID=America/Chicago:20261104T160000", "SUMMARY:Practice"),
        ev("UID:w", "RECURRENCE-ID;TZID=America/Chicago:20261109T160000", "DTSTART;TZID=America/Chicago:20261109T180000", "SUMMARY:Practice (moved)"),
      ].join("\r\n"),
    );
    const out = parseIcsCalendar(text, WINDOW);
    const series = out.events.filter((e) => e.title === "Practice").map((e) => e.startsAt!.toISOString());
    // Six by COUNT: Nov 2, 4 (excluded), 9 (replaced), 11, 16, 18.
    expect(series).toEqual(["2026-11-02T22:00:00.000Z", "2026-11-11T22:00:00.000Z", "2026-11-16T22:00:00.000Z", "2026-11-18T22:00:00.000Z"]);
    expect(out.events.find((e) => e.title === "Practice (moved)")?.startsAt?.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });

  it("expands a daily rule to its UNTIL", () => {
    const out = parseIcsCalendar(cal(ev("UID:d", "DTSTART;VALUE=DATE:20261201", "RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261207", "SUMMARY:Camp")), WINDOW);
    expect(out.events.map((e) => e.date)).toEqual(["2026-12-01", "2026-12-03", "2026-12-05", "2026-12-07"]);
  });

  it("shows a monthly rule's first date only and counts it, and leaves a cancelled event out", () => {
    const out = parseIcsCalendar(
      cal([ev("UID:m", "DTSTART;VALUE=DATE:20261201", "RRULE:FREQ=MONTHLY;COUNT=3", "SUMMARY:Booster meeting"), ev("UID:c", "DTSTART;VALUE=DATE:20261202", "STATUS:CANCELLED", "SUMMARY:Scrimmage")].join("\r\n")),
      WINDOW,
    );
    expect(out.events.map((e) => e.title)).toEqual(["Booster meeting"]);
    expect(out.skipped.unsupportedRule).toBe(1);
  });

  it("refuses a file that is not a calendar, and counts one broken event without losing the rest", () => {
    expect(() => parseIcsCalendar("<html><body>Sign in</body></html>", WINDOW)).toThrow(IcsParseError);
    const out = parseIcsCalendar(cal([ev("UID:bad", "DTSTART:not-a-date", "SUMMARY:Broken"), ev("UID:ok", "DTSTART;VALUE=DATE:20261203", "SUMMARY:Fine")].join("\r\n")), WINDOW);
    expect(out.events.map((e) => e.title)).toEqual(["Fine"]);
    expect(out.skipped.malformed).toBe(1);
  });

  it("unfolds a long folded line and leaves out events outside the window", () => {
    const out = parseIcsCalendar(cal([ev("UID:x", "DTSTART;VALUE=DATE:20261203", "SUMMARY:A very long", " title"), ev("UID:old", "DTSTART;VALUE=DATE:20250101", "SUMMARY:Old")].join("\r\n")), WINDOW);
    expect(out.events.map((e) => e.title)).toEqual(["A very longtitle"]);
  });
});
