import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildIcsFeed } from "./ics";

/* THE OUTBOUND FEED CARRIES A PERSON'S CALENDAR EVENTS (2026-11-22). A training day stays all-day;
 * an event with a time is written as a floating time with its end; an all-day event stays all-day;
 * the location rides along; UIDs are stable. And the feed route reads Forge events only, never an
 * imported calendar (a source scan, comments stripped first). */

describe("buildIcsFeed with events", () => {
  const feed = buildIcsFeed("Forge Training", [
    { uid: "forge-exercise1-day2-2026-12-05", date: "2026-12-05", summary: "Lower body", description: "Strength" },
    { uid: "forge-event7", date: "2026-12-05", summary: "Home game", location: "Main gym, north lot", startTime: "15:30", endTime: "17:00" },
    { uid: "forge-event8", date: "2026-12-06", summary: "Travel day", startTime: null },
    { uid: "forge-event9", date: "2026-12-07", summary: "Film", startTime: "09:00" },
  ]);
  const blocks = feed.split("BEGIN:VEVENT").slice(1);

  it("keeps a training day all-day", () => {
    expect(blocks[0]).toContain("DTSTART;VALUE=DATE:20261205");
    expect(blocks[0]).toContain("DTEND;VALUE=DATE:20261206");
  });

  it("writes a timed event as a floating time with its end and location", () => {
    expect(blocks[1]).toContain("UID:forge-event7@forge.app");
    expect(blocks[1]).toContain("DTSTART:20261205T153000");
    expect(blocks[1]).toContain("DTEND:20261205T170000");
    expect(blocks[1]).toContain("LOCATION:Main gym\\, north lot");
    expect(blocks[1]).not.toContain("VALUE=DATE");
  });

  it("writes an all-day event as all-day, and a start with no end as a start alone", () => {
    expect(blocks[2]).toContain("DTSTART;VALUE=DATE:20261206");
    expect(blocks[3]).toContain("DTSTART:20261207T090000");
    expect(blocks[3]).not.toContain("DTEND");
  });

  it("is stable: the same input gives the same UIDs", () => {
    const again = buildIcsFeed("Forge Training", [{ uid: "forge-event7", date: "2026-12-05", summary: "Home game", startTime: "15:30" }]);
    expect(again).toContain("UID:forge-event7@forge.app");
  });
});

/** Line comments and block comments out, so prose about the rule cannot satisfy or break it. */
function stripComments(src: string): string {
  // A block comment whose opener starts its line, so a "/*" inside a string ("*/*", "/uploads/*")
  // never pairs with a comment thousands of lines away. Matches "  /* x */"; rejects 'a = "/*"'.
  // https://regex101.com/?regex=%5E%5Cs*%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F&flags=gm&testString=%20%20%2F*%20x%20*%2F
  const noBlocks = src.replace(/^\s*\/\*[\s\S]*?\*\//gm, "");
  // A line comment that starts a line. Matches "  // x"; rejects "https://x".
  // https://regex101.com/?regex=%5E%5Cs*%5C%2F%5C%2F.*%24&flags=gm&testString=%20%20%2F%2F%20x
  return noBlocks.replace(/^\s*\/\/.*$/gm, "");
}

describe("the feed route and the reader it uses", () => {
  const routes = stripComments(fs.readFileSync(path.join(__dirname, "routes.ts"), "utf8"));
  const start = routes.indexOf('app.get("/api/calendar/:token.ics"');
  const end = routes.indexOf("\n  app.", start + 1);
  const handler = routes.slice(start, end);

  it("adds the person's Forge events to the feed", () => {
    expect(start).toBeGreaterThan(-1);
    expect(handler).toContain("forgeEventsForFeed(");
  });

  it("never reads an imported calendar into the outbound feed", () => {
    const events = stripComments(fs.readFileSync(path.join(__dirname, "calendar-events.ts"), "utf8"));
    const fnStart = events.indexOf("export async function forgeEventsForFeed");
    const fnEnd = events.indexOf("\nfunction ", fnStart);
    const body = events.slice(fnStart, fnEnd);
    expect(body).not.toContain("calendarImport");
    expect(handler).not.toContain("calendarImport");
  });
});
