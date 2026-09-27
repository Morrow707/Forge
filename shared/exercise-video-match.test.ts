import { describe, expect, it } from "vitest";
import { isSeededSearchPlaceholder, parseIsoDuration } from "./exercise-video-match";

/* The word-set matcher these tests used to cover is gone -- see the file header. Every wrong
 * match it produced lives on as a fixture in exercise-signature-match.test.ts, asserted against
 * the parser that refuses it now. What is left here is the duration parser and the placeholder
 * test, which were never part of the matching and are still load-bearing: the placeholder test
 * is the one thing standing between this backfill and overwriting a URL somebody chose. */

describe("parseIsoDuration", () => {
  it("reads the shapes the API actually returns", () => {
    expect(parseIsoDuration("PT47S")).toBe(47);
    expect(parseIsoDuration("PT3M12S")).toBe(192);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("P1DT1H")).toBe(90000);
  });

  it("reads an unparseable duration as zero, which is never a candidate", () => {
    expect(parseIsoDuration("nonsense")).toBe(0);
  });
});

describe("isSeededSearchPlaceholder", () => {
  it("recognises the seeded search links", () => {
    expect(isSeededSearchPlaceholder("https://www.youtube.com/results?search_query=bench+press")).toBe(true);
    expect(isSeededSearchPlaceholder(null)).toBe(true);
  });

  it("refuses to call a real video, or anything else, a placeholder", () => {
    // A coach's chosen URL being overwritten is data loss, so this is the load-bearing half.
    expect(isSeededSearchPlaceholder("https://www.youtube.com/watch?v=abc12345678")).toBe(false);
    expect(isSeededSearchPlaceholder("https://youtu.be/abc12345678")).toBe(false);
    expect(isSeededSearchPlaceholder("https://vimeo.com/12345")).toBe(false);
    expect(isSeededSearchPlaceholder("not a url at all")).toBe(false);
  });
});


/**
 * EVERY CASE HERE IS A WRONG MATCH THE FIRST REAL DRY RUN ACTUALLY PRODUCED, 2026-09-27.
 *
 * Read off the report rather than imagined, which is why they are worth keeping: each one passed
 * coverage, and each one would have put a different movement on an athlete's screen with the
 * confidence of a chosen video.
 */
