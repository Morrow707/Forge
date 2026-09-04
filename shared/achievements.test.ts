import { describe, it, expect } from "vitest";
import {
  ALL_TROPHY_DEFINITIONS,
  TROPHY_DEFINITIONS_BY_KEY,
  TROPHY_TIER_ORDER,
  TROPHY_CATEGORY_LABEL,
  WORKOUT_COUNT_TROPHIES,
  STREAK_TROPHIES,
  PR_COUNT_TROPHIES,
  SPEED_TROPHIES,
  NUTRITION_STREAK_TROPHIES,
  type TrophyDefinition,
} from "./achievements";

const GROUPS: [string, TrophyDefinition[]][] = [
  ["workout_count", WORKOUT_COUNT_TROPHIES],
  ["streak", STREAK_TROPHIES],
  ["pr_count", PR_COUNT_TROPHIES],
  ["speed", SPEED_TROPHIES],
  ["nutrition_streak", NUTRITION_STREAK_TROPHIES],
];

describe("trophy catalogue integrity", () => {
  it("keeps every trophy key unique across all categories", () => {
    const keys = ALL_TROPHY_DEFINITIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps every label unique, so two trophies never read the same in the UI", () => {
    const labels = ALL_TROPHY_DEFINITIONS.map((d) => d.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("collects every group into the combined list exactly once", () => {
    const fromGroups = GROUPS.flatMap(([, defs]) => defs);
    expect(ALL_TROPHY_DEFINITIONS).toHaveLength(fromGroups.length);
    expect(new Set(ALL_TROPHY_DEFINITIONS.map((d) => d.key))).toEqual(new Set(fromGroups.map((d) => d.key)));
  });

  it("indexes every trophy by key", () => {
    expect(TROPHY_DEFINITIONS_BY_KEY.size).toBe(ALL_TROPHY_DEFINITIONS.length);
    for (const def of ALL_TROPHY_DEFINITIONS) {
      expect(TROPHY_DEFINITIONS_BY_KEY.get(def.key)).toBe(def);
    }
  });

  it("returns nothing for a key that is not a trophy", () => {
    expect(TROPHY_DEFINITIONS_BY_KEY.get("workout_count_999")).toBeUndefined();
  });
});

describe.each(GROUPS)("%s trophies", (category, defs) => {
  it("tags every entry with its own category", () => {
    expect(defs.every((d) => d.category === category)).toBe(true);
  });

  it("lists thresholds in strictly ascending order", () => {
    const thresholds = defs.map((d) => d.threshold);
    expect(thresholds).toEqual([...new Set(thresholds)].sort((a, b) => a - b));
  });

  it("uses positive whole-number thresholds", () => {
    expect(defs.every((d) => Number.isInteger(d.threshold) && d.threshold > 0)).toBe(true);
  });

  it("never lowers a tier as the threshold climbs", () => {
    const ranks = defs.map((d) => TROPHY_TIER_ORDER[d.tier]);
    // TROPHY_TIER_ORDER is a display ordering with gold first, so a harder
    // trophy has a numerically SMALLER rank -- the sequence must not rise.
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeLessThanOrEqual(ranks[i - 1]);
    }
  });

  it("prefixes every key with its category", () => {
    expect(defs.every((d) => d.key.startsWith(`${category}_`))).toBe(true);
  });

  it("ends each key with its own threshold, so the two can never drift apart", () => {
    for (const d of defs) {
      expect(d.key).toBe(`${d.category}_${d.threshold}`);
    }
  });

  it("gives every entry a non-empty label", () => {
    expect(defs.every((d) => d.label.trim().length > 0)).toBe(true);
  });
});

describe("tier and category presentation", () => {
  it("orders gold ahead of silver ahead of bronze", () => {
    expect(TROPHY_TIER_ORDER.gold).toBeLessThan(TROPHY_TIER_ORDER.silver);
    expect(TROPHY_TIER_ORDER.silver).toBeLessThan(TROPHY_TIER_ORDER.bronze);
  });

  it("labels every category that any trophy actually uses", () => {
    for (const def of ALL_TROPHY_DEFINITIONS) {
      expect(TROPHY_CATEGORY_LABEL[def.category]).toBeTruthy();
    }
  });

  it("does not label a category no trophy belongs to", () => {
    const used = new Set(ALL_TROPHY_DEFINITIONS.map((d) => d.category));
    expect(Object.keys(TROPHY_CATEGORY_LABEL).sort()).toEqual([...used].sort());
  });

  it("uses only the three known tiers", () => {
    expect(ALL_TROPHY_DEFINITIONS.every((d) => d.tier in TROPHY_TIER_ORDER)).toBe(true);
  });

  it("gives the nutrition streak a stricter ramp than the workout streak", () => {
    // The nutrition streak has no rest-day forgiveness, so its thresholds
    // are deliberately spread wider -- see the file's own comment.
    const workoutMax = Math.max(...STREAK_TROPHIES.map((d) => d.threshold));
    const nutritionMax = Math.max(...NUTRITION_STREAK_TROPHIES.map((d) => d.threshold));
    expect(nutritionMax).toBeGreaterThanOrEqual(workoutMax);
  });
});

describe("award thresholds behave as a ladder", () => {
  // How a caller uses these: everything at or below the athlete's count is
  // earned, everything above is not.
  function earnedAt(defs: TrophyDefinition[], count: number) {
    return defs.filter((d) => count >= d.threshold).map((d) => d.key);
  }

  it("earns nothing at zero", () => {
    for (const [, defs] of GROUPS) expect(earnedAt(defs, 0)).toEqual([]);
  });

  it("earns exactly the first trophy at its own threshold", () => {
    for (const [, defs] of GROUPS) {
      expect(earnedAt(defs, defs[0].threshold)).toEqual([defs[0].key]);
      expect(earnedAt(defs, defs[0].threshold - 1)).toEqual([]);
    }
  });

  it("earns everything at the top threshold", () => {
    for (const [, defs] of GROUPS) {
      const top = defs[defs.length - 1].threshold;
      expect(earnedAt(defs, top)).toHaveLength(defs.length);
    }
  });

  it("only ever adds trophies as the count rises", () => {
    for (const [, defs] of GROUPS) {
      let previous: string[] = [];
      for (let n = 0; n <= defs[defs.length - 1].threshold; n++) {
        const earned = earnedAt(defs, n);
        expect(earned.slice(0, previous.length)).toEqual(previous);
        previous = earned;
      }
    }
  });
});
