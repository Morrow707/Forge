import { describe, it, expect } from "vitest";
import {
  SCORABLE_MUSCLE_GROUPS,
  SCORABLE_GROUPS_ARE_REAL,
  isScorableMuscleGroup,
  bandForScore,
  overallScore,
  balanceHint,
  MOVEMENT_FOR_GROUP,
  STRENGTH_BANDS,
  estimatedOneRepMax,
  strengthRatio,
  MAX_SCORING_REPS,
  BROADEST_COHORT,
  cohortDescription,
  canNarrowByGender,
  readableGender,
} from "./strength-score";
import { MUSCLE_GROUPS } from "./exercise-taxonomy";

describe("what gets scored", () => {
  it("only names muscle groups the taxonomy actually has", () => {
    // The two lists live in different files and would otherwise drift silently -- a renamed
    // muscle group would leave a score nothing could ever populate.
    expect(SCORABLE_GROUPS_ARE_REAL).toBe(true);
    for (const g of SCORABLE_MUSCLE_GROUPS) expect(MUSCLE_GROUPS).toContain(g);
  });

  it("leaves out what a strength score cannot mean", () => {
    // "Full Body" is not a muscle; nobody trains an ankle for strength. A score against either
    // would be a number with no claim behind it.
    expect(isScorableMuscleGroup("Full Body")).toBe(false);
    expect(isScorableMuscleGroup("Ankle")).toBe(false);
    expect(isScorableMuscleGroup("Quads")).toBe(true);
  });
});

describe("bands", () => {
  it("reads like the tier people expect", () => {
    expect(bandForScore(6).display).toBe("Beginner I");
    expect(bandForScore(52).label).toBe("Intermediate");
    expect(bandForScore(68).label).toBe("Advanced");
    expect(bandForScore(100).label).toBe("World Class");
  });

  it("splits each band into thirds rather than inventing a second axis", () => {
    // Intermediate runs 40 to 59, so each third is about seven points: 40-46 is I, 47-53 is
    // II, 54-59 is III.
    expect(bandForScore(40).display).toBe("Intermediate I");
    expect(bandForScore(46).display).toBe("Intermediate I");
    expect(bandForScore(48).display).toBe("Intermediate II");
    expect(bandForScore(55).display).toBe("Intermediate III");
  });

  it("clamps rather than producing a band off the end of the list", () => {
    expect(bandForScore(-10).label).toBe("Beginner");
    expect(bandForScore(999).label).toBe("World Class");
    // World Class runs 95-100, so it has thirds like any other band: the very top is III.
    expect(bandForScore(95).display).toBe("World Class I");
    expect(bandForScore(100).display).toBe("World Class III");
  });

  it("covers the whole 0-100 range with no gap", () => {
    for (let n = 0; n <= 100; n++) {
      const b = bandForScore(n);
      expect(STRENGTH_BANDS.some((x) => x.key === b.key)).toBe(true);
      expect(b.display).toMatch(/ (I|II|III)$/);
    }
  });
});

describe("the overall score", () => {
  it("averages only what has been measured", () => {
    // THE point. An athlete who has never trained calves is not a person with zero calf
    // strength -- they are a person we have not measured. Averaging in a zero would punish
    // them for the shape of their log rather than the state of their training.
    expect(overallScore([{ score: 60 }, { score: 40 }, { score: null }])).toBe(50);
    expect(overallScore([{ score: 60 }, { score: 40 }, { score: 0 }])).toBe(33);
  });

  it("says nothing when nothing has been measured", () => {
    expect(overallScore([])).toBeNull();
    expect(overallScore([{ score: null }, { score: null }])).toBeNull();
  });
});

describe("the coaching line", () => {
  it("names MOVEMENTS, never body parts to improve", () => {
    // Forge has thirteen-year-olds on it. "Bring up your abs" said to a child is a sentence
    // about their body; "your trunk flexion is behind your squatting" is a sentence about
    // their training. This is the whole reason MOVEMENT_FOR_GROUP exists.
    const hint = balanceHint({ group: "Quads", score: 70 }, { group: "Abs", score: 20 })!;
    expect(hint).toContain("trunk flexion");
    expect(hint).toContain("squatting");
    expect(hint.toLowerCase()).not.toContain("abs");
    expect(hint.toLowerCase()).not.toContain("quads");
  });

  it("has a movement word for every group it can be asked about", () => {
    for (const g of SCORABLE_MUSCLE_GROUPS) {
      expect(MOVEMENT_FOR_GROUP[g], `no movement phrase for ${g}`).toBeTruthy();
    }
  });

  it("does not invent an imbalance out of noise", () => {
    // Four points apart is not a weakness, and telling somebody it is teaches them to chase
    // measurement error.
    const close = balanceHint({ group: "Quads", score: 52 }, { group: "Glutes", score: 48 })!;
    expect(close).toContain("tracking together");
    expect(close).not.toContain("behind");
  });

  it("says nothing at all when there is nothing to compare", () => {
    expect(balanceHint(null, null)).toBeNull();
    expect(balanceHint({ group: "Quads", score: 50 }, { group: "Quads", score: 50 })).toBeNull();
  });
});

describe("the comparable number", () => {
  it("puts a heavy triple and a set of ten in the same unit", () => {
    // 225x3 and 185x10 are close in real terms; without a common unit they cannot be compared
    // at all, which is the whole reason for the estimate.
    const triple = estimatedOneRepMax(225, 3)!;
    const tens = estimatedOneRepMax(185, 10)!;
    expect(triple).toBeCloseTo(247.5, 1);
    expect(tens).toBeCloseTo(246.7, 1);
  });

  it("returns a single unchanged", () => {
    expect(estimatedOneRepMax(300, 1)).toBe(300);
  });

  it("refuses to turn endurance into a maximal claim", () => {
    // A set of thirty bodyweight squats is not a 3x bodyweight single. Past the cap the
    // formula is extrapolating into something it cannot support, so it declines.
    expect(estimatedOneRepMax(135, 30)).toBeNull();
    expect(estimatedOneRepMax(135, MAX_SCORING_REPS)).not.toBeNull();
    expect(estimatedOneRepMax(135, MAX_SCORING_REPS + 1)).toBeNull();
  });

  it("refuses nonsense input rather than producing a number", () => {
    expect(estimatedOneRepMax(0, 5)).toBeNull();
    expect(estimatedOneRepMax(-10, 5)).toBeNull();
    expect(estimatedOneRepMax(135, 0)).toBeNull();
  });

  it("divides out bodyweight, and says nothing without one", () => {
    // A 135lb athlete and a 240lb athlete pressing the same bar are not doing the same thing.
    expect(strengthRatio(200, 1, 200)).toBeCloseTo(1, 5);
    expect(strengthRatio(200, 1, 100)).toBeCloseTo(2, 5);
    // A score computed against an ASSUMED bodyweight looks exactly like a real one, which is
    // why this returns null instead of picking a default.
    expect(strengthRatio(200, 1, null)).toBeNull();
    expect(strengthRatio(200, 1, 0)).toBeNull();
  });
});

describe("the comparison cohort", () => {
  it("describes the group in words the athlete would use", () => {
    expect(cohortDescription(BROADEST_COHORT, { ageBand: "16-17" })).toBe("athletes aged 16-17");
    expect(
      cohortDescription({ gender: true, sport: false }, { ageBand: "16-17", gender: "male" }),
    ).toBe("male athletes aged 16-17");
    expect(
      cohortDescription(
        { gender: true, sport: true },
        { ageBand: "16-17", gender: "male", sport: "Football" },
      ),
    ).toBe("male Football athletes aged 16-17");
  });

  it("offers the gender filter only where it would not turn a privacy answer into a category", () => {
    // Not because the other answers are less valid -- because a cohort of athletes who chose
    // "prefer not to say" is a group defined by a privacy choice, and measuring somebody
    // against it would make that choice a label. They get the broad comparison, which is the
    // default everybody gets anyway.
    expect(canNarrowByGender("male")).toBe(true);
    expect(canNarrowByGender("female")).toBe(true);
    expect(canNarrowByGender("non_binary")).toBe(false);
    expect(canNarrowByGender("prefer_not_to_say")).toBe(false);
    expect(canNarrowByGender(null)).toBe(false);
  });

  it("never lets a storage word reach a sentence about a child", () => {
    // "non_binary athletes aged 14-15" must never render. readableGender returns empty and the
    // description falls back to the broad wording.
    expect(readableGender("non_binary")).toBe("");
    expect(
      cohortDescription({ gender: true, sport: false }, { ageBand: "14-15", gender: "non_binary" }),
    ).not.toContain("non_binary");
  });

  it("starts at the broadest group", () => {
    // The default is the comparison that assumes least and fills up soonest.
    expect(BROADEST_COHORT).toEqual({ gender: false, sport: false });
  });
});
