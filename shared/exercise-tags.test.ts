import { describe, expect, it } from "vitest";
import * as tags from "./exercise-tags";

describe("exercise tags", () => {
  it("stores positions lower case, trimmed, once each, in the order typed", () => {
    expect(tags.normalizePositions(["  Defensive   End", "pitcher", "PITCHER", ""])).toEqual(["defensive end", "pitcher"]);
  });

  it("exports no age rule (Scott, 2026-11-22: weight-room proficiency, not age)", () => {
    // An export named for a youth line or an age filter: matches "YOUTH_SAFE_MIN_AGE" and
    // "keepForAge"; rejects "MAX_TAGGED_POSITIONS" and "normalizePositions".
    // https://regex101.com/?regex=youth%7Cforage%7Cminage&flags=i&testString=keepForAge
    expect(Object.keys(tags).filter((n) => /youth|forage|minage/i.test(n))).toEqual([]);
  });
});
