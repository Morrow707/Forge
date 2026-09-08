import { describe, it, expect } from "vitest";
import {
  ageBandFor,
  cohortLabel,
  percentileBand,
  renderNormsForPrompt,
  NORM_MIN_COHORT,
  type Norm,
} from "./cohort-norms";

const norm: Norm = {
  metric: "vertical jump",
  unit: "in",
  n: 340,
  p10: 20,
  p25: 24,
  p50: 28,
  p75: 32,
  p90: 36,
};

describe("cohort norms", () => {
  it("moves an athlete to the next band on their birthday", () => {
    // The whole point of recomputing from live ages. Fifteen and sixteen are
    // different references, and nothing anywhere has to be told.
    expect(ageBandFor(15)).toBe("14-15");
    expect(ageBandFor(16)).toBe("16-17");
  });

  it("refuses to band an implausible age instead of guessing", () => {
    expect(ageBandFor(null)).toBeNull();
    expect(ageBandFor(3)).toBeNull();
    expect(ageBandFor(120)).toBeNull();
  });

  it("keeps a norm floor well above the anonymity floor", () => {
    // Five is enough to stop a chart identifying somebody. It is nowhere near
    // enough for a percentile to mean anything, and the two must not be
    // tidied into one constant.
    expect(NORM_MIN_COHORT).toBeGreaterThan(20);
  });

  it("bands a value against the distribution", () => {
    expect(percentileBand(18, norm)).toBe("bottom 10%");
    expect(percentileBand(26, norm)).toBe("below the middle");
    expect(percentileBand(40, norm)).toBe("top 10%");
  });

  it("mirrors the band where a lower number is better", () => {
    // A 4.4 second forty is a top result, and the same arithmetic reads
    // backwards. Getting this wrong tells a fast athlete they are slow.
    const forty: Norm = { metric: "40", unit: "s", n: 200, p10: 4.6, p25: 4.8, p50: 5.0, p75: 5.2, p90: 5.4 };
    expect(percentileBand(4.5, forty, false)).toBe("top 10%");
    expect(percentileBand(5.6, forty, false)).toBe("bottom 10%");
  });

  it("puts the sample size and the population's nature in the prompt", () => {
    // An answer built on 340 athletes and one built on 22 read identically
    // unless the count is on the page.
    const text = renderNormsForPrompt(
      { sport: "Football", position: "LB", ageBand: "16-17", gender: "male" },
      [norm],
    );
    expect(text).toContain("n=340");
    expect(text).toContain("not a random sample");
    expect(text).toContain("never present them as");
  });

  it("says which dimensions were dropped to reach a usable sample", () => {
    // A comparison against every athlete on the platform, presented as though
    // it were against linemen of the same age, is the specific way this
    // feature would mislead.
    const text = renderNormsForPrompt(
      { sport: null, position: null, ageBand: "16-17", gender: "male" },
      [norm],
      ["position", "sport"],
    );
    expect(text).toContain("too small on its own");
    expect(text).toContain("position and sport");
  });

  it("bands the athlete's own value on each line rather than leaving raw percentiles", () => {
    // Handing a model five percentiles and the athlete's number invites it to
    // do the comparison itself, which is how a value becomes "well above
    // average" with nothing behind it.
    const text = renderNormsForPrompt(
      { sport: "Football", position: null, ageBand: "16-17", gender: "male" },
      [norm],
      [],
      { "vertical jump": 34 },
    );
    expect(text).toContain("This athlete: 34");
    expect(text).toContain("top quarter");
  });

  it("reads a faster time as better, not worse", () => {
    // A 4.4 forty is the value a naive comparison calls bottom 10%. Getting
    // this backwards tells a fast athlete they are slow.
    const forty = { metric: "40-yard dash", unit: "s", n: 200, p10: 4.6, p25: 4.8, p50: 5.0, p75: 5.2, p90: 5.4 };
    const text = renderNormsForPrompt(
      { sport: null, position: null, ageBand: null, gender: null },
      [forty],
      [],
      { "40-yard dash": 4.5 },
    );
    expect(text).toContain("top 10%");
  });

  it("renders nothing at all when there are no norms", () => {
    expect(renderNormsForPrompt({ sport: null, position: null, ageBand: null, gender: null }, [])).toBe("");
  });

  it("names a cohort in words a coach would use", () => {
    expect(cohortLabel({ sport: "Football", position: "LB", ageBand: "16-17", gender: "male" })).toBe(
      "16-17 male Football LB",
    );
    expect(cohortLabel({ sport: null, position: null, ageBand: null, gender: null })).toBe("all athletes");
  });
});
