import { describe, expect, it } from "vitest";
import { YOUTH_SAFE_MIN_AGE, heldBackForAge, keepForAge, normalizePositions } from "./exercise-tags";

/**
 * Youth-safe classification (Scott, 2026-11-22). Only an explicit `youthSafe === false` and a known
 * age under 14 hold an exercise back from what Forge offers; an unclassified exercise and an
 * unknown age never do.
 */
const LIST = [
  { name: "Goblet Squat", youthSafe: true },
  { name: "Back Squat", youthSafe: null },
  { name: "Depth Jump", youthSafe: false },
];
const UNDER = YOUTH_SAFE_MIN_AGE - 1;

describe("exercise tags", () => {
  it("holds back only an exercise marked not for under-14s, for an athlete known to be under 14", () => {
    expect(keepForAge(LIST, UNDER).map((e) => e.name)).toEqual(["Goblet Squat", "Back Squat"]);
    expect(keepForAge(LIST, YOUTH_SAFE_MIN_AGE)).toHaveLength(LIST.length);
    expect(keepForAge(LIST, null)).toHaveLength(LIST.length);
  });

  it("an unclassified exercise is never held back", () => {
    expect(heldBackForAge({ youthSafe: null }, UNDER)).toBe(false);
    expect(heldBackForAge({ youthSafe: false }, UNDER)).toBe(true);
  });

  it("stores positions lower case, trimmed, once each, in the order typed", () => {
    expect(normalizePositions(["  Defensive   End", "pitcher", "PITCHER", ""])).toEqual(["defensive end", "pitcher"]);
  });
});
