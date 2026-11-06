import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASELINE_BURN_IN_CHECKS,
  BASELINE_MIN_CHECKS,
  BASELINE_WINDOW,
  MAD_FINITE_SAMPLE_CORRECTION,
  MAD_TO_SIGMA,
  SEQUENCE_RERANDOMIZES_PER_TRIAL,
  TAP_EVENNESS_IS_REPORTED,
  baselineChecksFor,
  madCorrectionFor,
  partIsScoreable,
  robustSigma,
  type AnvilPart,
} from "./anvil-baseline";

const PARTS: AnvilPart[] = ["reaction_time", "go_no_go", "sequence_span", "tapping"];

describe("the MAD correction is measured, monotone, and applied where it matters most", () => {
  it("states the table the script measured, at the n the window really takes", () => {
    const at = (n: number) => MAD_FINITE_SAMPLE_CORRECTION.find(([k]) => k === n)?.[1];
    expect(at(20)).toBeCloseTo(1.0431, 4);
    expect(at(10)).toBeCloseTo(1.0964, 4);
    // tools/anvil-sim/madbias.py, 400,000 seeded draws per n. A changed value here is a
    // re-measurement and belongs in a commit that says so.
  });

  it("corrects MORE on a thin window than on a full one", () => {
    // THE WHOLE REASON IT IS A TABLE. A single constant fitted at n=20 under-corrects by five
    // points at n=10, which is an athlete's FIRST scored check -- when they are likeliest to be
    // flagged for nothing.
    expect(madCorrectionFor(10)).toBeGreaterThan(madCorrectionFor(20));
    expect(madCorrectionFor(20)).toBeGreaterThan(madCorrectionFor(60));
    for (let n = 10; n < 120; n++) {
      expect(madCorrectionFor(n + 1)).toBeLessThanOrEqual(madCorrectionFor(n) + 1e-12);
    }
  });

  it("never corrects below 1, in either tail", () => {
    // Over-correcting LOOSENS the guard, which is the one direction that fails silently.
    for (const n of [-5, 0, 1, 9, 10, 23, 119, 120, 500, 10_000, Number.NaN, Infinity]) {
      expect(madCorrectionFor(n)).toBeGreaterThanOrEqual(1);
    }
  });

  it("removes the bias it was measured to remove", () => {
    // Behaviour, not a table lookup: draw from a known sigma and check the corrected estimate
    // averages to it, where the uncorrected one is measurably low.
    let seed = 20261106;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const gauss = () =>
      Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-12))) * Math.cos(2 * Math.PI * rnd());
    const SIGMA = 12;
    let corrected = 0;
    let raw = 0;
    const REPS = 4000;
    for (let r = 0; r < REPS; r++) {
      const xs = Array.from({ length: 20 }, () => gauss() * SIGMA);
      const got = robustSigma(xs);
      expect("sigma" in got).toBe(true);
      if ("sigma" in got) {
        corrected += got.sigma;
        // The uncorrected estimate is DERIVED by dividing the correction back out, rather than
        // re-implementing the statistic here. The first draft of this case did re-implement it and
        // took sorted[10] as the median of twenty values, which is the UPPER middle, not the mean
        // of the two -- so its MAD came out high and the case reported a bias in the wrong
        // direction. A test that re-derives the thing under test tests its own arithmetic.
        raw += got.sigma / madCorrectionFor(20);
      }
    }
    // THE TOLERANCE IS THE ASSERTION AND IT HAS TO BE TIGHT ENOUGH TO EXCLUDE THE UNCORRECTED
    // VALUE, which averages 0.959 of the true sigma at n = 20. A `toBeCloseTo(1, 1)` here accepts
    // anything within 0.05, so it passes with the correction DELETED -- proven by mutation, and it
    // is the second time this one case has been circular: the first draft re-implemented the
    // median, the second derived the uncorrected figure from the corrected one. 4,000 reps put the
    // standard error of this ratio near 0.003, so +/-2% is comfortable and 0.959 is far outside it.
    const ratio = corrected / REPS / SIGMA;
    expect(ratio).toBeGreaterThan(0.98);
    expect(ratio).toBeLessThan(1.02);
    expect(raw / REPS / SIGMA, "the uncorrected estimate is biased LOW by construction").toBeLessThan(
      0.98,
    );
  });

  it("states a reason instead of a number when the window is too thin", () => {
    expect(robustSigma([1, 2, 3])).toEqual({ absent: "too_few_checks" });
    expect(robustSigma(Array.from({ length: 20 }, () => 7))).toEqual({ absent: "no_spread" });
    // Rule #1's shape: a blank is a stated reason, never a confident number from four readings.
  });
});

describe("the burn-in is per task because the evidence is per task", () => {
  it("covers every part and names no part twice", () => {
    expect(Object.keys(BASELINE_BURN_IN_CHECKS).sort()).toEqual(PARTS.slice().sort());
  });

  it("burns in the headline least and the two contaminated tasks most", () => {
    // The ORDERING is the finding, and a single "one week for all four" loses it: simple RT's
    // whole practice move is session 1->2 (under 3 ms across weekly sessions), while touchscreen
    // tapping gains 5-12% in a week and go/no-go had not plateaued at three.
    expect(BASELINE_BURN_IN_CHECKS.reaction_time).toBe(1);
    expect(BASELINE_BURN_IN_CHECKS.sequence_span).toBe(1);
    expect(BASELINE_BURN_IN_CHECKS.tapping).toBeGreaterThan(
      BASELINE_BURN_IN_CHECKS.reaction_time,
    );
    expect(BASELINE_BURN_IN_CHECKS.go_no_go).toBeGreaterThan(BASELINE_BURN_IN_CHECKS.tapping);
  });

  it("drops the burn-in from the OLD end and caps the window at the new end", () => {
    const checks = Array.from({ length: 40 }, (_, i) => i); // 0 is the oldest
    const win = baselineChecksFor("reaction_time", checks);
    expect(win.length).toBe(BASELINE_WINDOW);
    expect(win[0]).toBe(20);
    expect(win[win.length - 1]).toBe(39);
    // THE MISTAKE THIS CASE EXISTS FOR: handed newest-first, the same function silently discards
    // the most recent checks and returns a plausible number from the wrong end of the series.
    expect(baselineChecksFor("reaction_time", [0, 1, 2])).toEqual([1, 2]);
  });

  it("leaves nothing to score when every check is inside the burn-in", () => {
    expect(baselineChecksFor("go_no_go", Array.from({ length: 10 }, (_, i) => i))).toEqual([]);
    expect(partIsScoreable("go_no_go", 10)).toBe(false);
    expect(partIsScoreable("reaction_time", BASELINE_MIN_CHECKS)).toBe(false);
    expect(partIsScoreable("reaction_time", BASELINE_MIN_CHECKS + 1)).toBe(true);
  });

  it("costs the headline one check and part 2 three weeks, said out loud", () => {
    // The product consequence, pinned so it cannot drift from the copy on the card: the first
    // scored reaction-time check is day 11, and part 2's is day 31.
    const firstScored = (p: AnvilPart) => BASELINE_BURN_IN_CHECKS[p] + BASELINE_MIN_CHECKS + 1;
    expect(firstScored("reaction_time")).toBe(12);
    expect(firstScored("go_no_go")).toBe(32);
  });
});

describe("the two properties that read like implementation details", () => {
  it("keeps the sequence task re-randomizing, which is why its burn-in is 1", () => {
    expect(SEQUENCE_RERANDOMIZES_PER_TRIAL).toBe(true);
    expect(BASELINE_BURN_IN_CHECKS.sequence_span).toBe(1);
    // Held EQUAL rather than asserted separately: a seeded or memoized layout turns part 3 into
    // another part 2, and then the 1 above is wrong too.
  });

  it("does not report tap evenness", () => {
    expect(TAP_EVENNESS_IS_REPORTED).toBe(false);
  });

  it("states the evidence for every number, in the module rather than in a commit message", () => {
    const src = readFileSync(join(import.meta.dirname ?? __dirname, "anvil-baseline.ts"), "utf8");
    for (const cite of ["24673236", "26617505", "madbias.py", "Makai-Boloni", "Woelfle"]) {
      expect(src, `${cite} is the evidence for a number here and must stay findable`).toContain(
        cite,
      );
    }
  });
});
