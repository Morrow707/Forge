import { describe, expect, it } from "vitest";
import {
  POSTSEASON_MAX_WEEKS,
  PRESEASON_MAX_WEEKS,
  addDays,
  isReturnToTrainingProgram,
  PROFICIENCY_LOADING_NOTE,
  positionMatchesProgram,
  proposeSeasonPlan,
  repeatsToFill,
  restrictionsLine,
  suggestTeamGender,
} from "./season-plan";

const FIRST = "2027-03-15"; // a Monday
const LAST = "2027-05-23";

describe("proposeSeasonPlan", () => {
  it("proposes nothing without a first game", () => {
    const r = proposeSeasonPlan({ firstGameDate: "", lastGameDate: LAST, programs: [{ programId: 1, seasonPhase: "in_season", weekCount: 4 }] });
    expect(r.ok).toBe(false);
  });

  it("refuses a last game before the first, with a sentence", () => {
    const r = proposeSeasonPlan({ firstGameDate: LAST, lastGameDate: FIRST, programs: [{ programId: 1, seasonPhase: "in_season", weekCount: 4 }] });
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("before the first") });
  });

  it("places each phase working back from the first game", () => {
    const r = proposeSeasonPlan({
      firstGameDate: FIRST,
      lastGameDate: LAST,
      programs: [
        { programId: 1, seasonPhase: "off_season", weekCount: 4 },
        { programId: 2, seasonPhase: "pre_season", weekCount: 6 },
        { programId: 3, seasonPhase: "in_season", weekCount: 4 },
        { programId: 4, seasonPhase: "post_season", weekCount: 3 },
      ],
    });
    if (!r.ok) throw new Error(r.reason);
    const by = new Map(r.proposals.map((p) => [p.programId, p]));
    // Preseason: the 6 weeks before the first game, ending the day before it.
    expect(by.get(2)).toMatchObject({ startDate: addDays(FIRST, -42), durationWeeks: 1, endDate: addDays(FIRST, -1) });
    // Off-season: one 4-week block ending the day before preseason.
    expect(by.get(1)).toMatchObject({ startDate: addDays(FIRST, -42 - 28), durationWeeks: 1 });
    // In-season: from the first game, repeating to reach the last (70 days = 10 weeks -> 3 x 4 weeks).
    expect(by.get(3)).toMatchObject({ startDate: FIRST, durationWeeks: 3 });
    // Postseason: the day after the last game.
    expect(by.get(4)).toMatchObject({ startDate: addDays(LAST, 1), durationWeeks: 1 });
    // Sorted by date.
    expect(r.proposals.map((p) => p.programId)).toEqual([1, 2, 3, 4]);
  });

  it("a short preseason program repeats into 4-6 weeks; a long one is never cut", () => {
    const short = proposeSeasonPlan({ firstGameDate: FIRST, lastGameDate: FIRST, programs: [{ programId: 1, seasonPhase: "pre_season", weekCount: 2 }] });
    if (!short.ok) throw new Error();
    expect(short.proposals[0]).toMatchObject({ durationWeeks: 2, startDate: addDays(FIRST, -28) });
    const long = proposeSeasonPlan({ firstGameDate: FIRST, lastGameDate: FIRST, programs: [{ programId: 1, seasonPhase: "pre_season", weekCount: 8 }] });
    if (!long.ok) throw new Error();
    expect(long.proposals[0]).toMatchObject({ durationWeeks: 1, startDate: addDays(FIRST, -56) });
  });

  it("several preseason programs run back to back and the last ends the day before the first game", () => {
    const r = proposeSeasonPlan({
      firstGameDate: FIRST,
      lastGameDate: FIRST,
      programs: [
        { programId: 1, seasonPhase: "pre_season", weekCount: 3 },
        { programId: 2, seasonPhase: "pre_season", weekCount: 2 },
      ],
    });
    if (!r.ok) throw new Error();
    expect(r.proposals.map((p) => [p.programId, p.startDate])).toEqual([
      [1, addDays(FIRST, -35)],
      [2, addDays(FIRST, -14)],
    ]);
  });

  it("no programs = nothing proposed", () => {
    expect(proposeSeasonPlan({ firstGameDate: FIRST, lastGameDate: LAST, programs: [] })).toEqual({ ok: true, proposals: [] });
  });
});

describe("repeatsToFill", () => {
  it("fills the minimum without passing the maximum", () => {
    expect(repeatsToFill(1, 2, POSTSEASON_MAX_WEEKS)).toBe(2);
    expect(repeatsToFill(4, 4, PRESEASON_MAX_WEEKS)).toBe(1);
    expect(repeatsToFill(5, 4, PRESEASON_MAX_WEEKS)).toBe(1);
    expect(repeatsToFill(10, 4, PRESEASON_MAX_WEEKS)).toBe(1);
  });
});

describe("the step's small rules", () => {
  it("suggests a team gender only from male and female answers", () => {
    expect(suggestTeamGender(["female", "female"])).toBe("girls");
    expect(suggestTeamGender(["male", null])).toBe("boys");
    expect(suggestTeamGender(["male", "female"])).toBe("mixed");
    expect(suggestTeamGender(["prefer_not_to_say", null])).toBeNull();
  });

  it("the loading note is about proficiency and names no age (Scott, 2026-11-22)", () => {
    expect(PROFICIENCY_LOADING_NOTE).toContain("correctly and safely");
    // Any digit at all: rejects "under 14" and "14 and older"; accepts the note as written.
    // https://regex101.com/?regex=%5Cd&testString=under%2014
    expect(PROFICIENCY_LOADING_NOTE).not.toMatch(/\d/);
  });

  it("a return-to-training program is the one carrying the purpose", () => {
    expect(isReturnToTrainingProgram({ purposes: ["return_to_training"] })).toBe(true);
    expect(isReturnToTrainingProgram({ purposes: ["care"] })).toBe(false);
    expect(isReturnToTrainingProgram({ purposes: null })).toBe(false);
  });

  it("matches a profile position against the program's tags, normalised", () => {
    expect(positionMatchesProgram("  Pitcher ", ["pitcher", "catcher"])).toBe(true);
    expect(positionMatchesProgram("Shortstop", ["pitcher"])).toBe(false);
    expect(positionMatchesProgram("Pitcher", [])).toBe(false);
  });

  it("restrictions become one line, or nothing", () => {
    expect(restrictionsLine("No overhead pressing.")).toBe("Clinician's restrictions: No overhead pressing.");
    expect(restrictionsLine("   ")).toBeNull();
  });
});
