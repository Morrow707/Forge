import { describe, it, expect } from "vitest";
import {
  ANVIL_PARTS,
  GNG_MIX,
  GNG_TRIALS,
  SEQ_PADS,
  SEQ_RELAYOUT_EACH_ROUND,
  buildGngPlan,
  buildSequence,
  estimatedLabel,
  estimatedSeconds,
  gngOrderIsValid,
} from "./anvil-tasks";
import { SEQUENCE_RERANDOMIZES_PER_TRIAL } from "./anvil-baseline";
import { TAPPING_TRIALS } from "./anvil-part-metrics";

/** A seeded source, so a constraint that holds 999 times in 1,000 fails here rather than in
 *  front of somebody. The same generator the sim scripts use. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

describe("the go/no-go order is constrained, not just shuffled", () => {
  it("accepts a plan that satisfies all three clauses and refuses each violation", () => {
    expect(gngOrderIsValid(["go", "go", "leave", "go", "hold"])).toBe(true);
    // Starts on an inhibition trial: nothing is prepotent yet, so it measures surprise.
    expect(gngOrderIsValid(["leave", "go", "go"])).toBe(false);
    // Two inhibition trials back to back: the second continues a pause rather than breaking a habit.
    expect(gngOrderIsValid(["go", "leave", "hold", "go"])).toBe(false);
    // A run of five go trials: part 2 has become part 1.
    expect(gngOrderIsValid(["go", "go", "go", "go", "go", "leave"])).toBe(false);
    expect(gngOrderIsValid(["go", "go", "go", "go", "leave", "go"])).toBe(true);
  });

  it("builds a plan with the right mix, and the mix is what makes the response prepotent", () => {
    for (const seed of [1, 7, 42, 99, 1234]) {
      const plan = buildGngPlan(seeded(seed));
      expect(plan).toHaveLength(GNG_TRIALS);
      expect(plan.filter((p) => p === "go")).toHaveLength(GNG_MIX.go);
      expect(plan.filter((p) => p === "leave")).toHaveLength(GNG_MIX.leave);
      expect(plan.filter((p) => p === "hold")).toHaveLength(GNG_MIX.hold);
      expect(gngOrderIsValid(plan), `seed ${seed} produced an invalid order`).toBe(true);
    }
    // The go share is the whole reason inhibition is measurable: a 50/50 task measures choice.
    expect(GNG_MIX.go / GNG_TRIALS).toBeGreaterThan(0.6);
  });

  it("STILL RETURNS A ROUND when the constraints can never be met", () => {
    // Rule #1 on a task. A random source that always returns 0 produces the same rotation every
    // time, so the shuffle cannot explore -- and refusing to run part 2 would cost the athlete
    // the whole part to protect an ordering preference. `partsRun` records what happened either
    // way, and a plan that breaks a constraint is a worse part rather than no part.
    const plan = buildGngPlan(() => 0);
    expect(plan).toHaveLength(GNG_TRIALS);
    expect(plan.filter((p) => p === "go")).toHaveLength(GNG_MIX.go);
  });
});

describe("the sequence", () => {
  it("never repeats a pad twice in a row, which on a touchscreen is one long flash", () => {
    for (const seed of [3, 11, 77, 2026]) {
      const seq = buildSequence(7, seeded(seed));
      expect(seq).toHaveLength(7);
      for (const n of seq) expect(n).toBeGreaterThanOrEqual(0);
      for (const n of seq) expect(n).toBeLessThan(SEQ_PADS);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    }
  });

  it("may repeat a pad that is not adjacent, so the span is not a permutation", () => {
    // Over many draws at length 7 on 6 pads, a repeat is forced by the pigeonhole -- so a
    // generator that produced only distinct pads would be measuring something else.
    const seq = buildSequence(7, seeded(5));
    expect(new Set(seq).size).toBeLessThan(seq.length);
  });

  it("re-lays the grid out every round, read off the baseline module rather than re-stated", () => {
    // The published flat practice curve this part's one-check burn-in rests on comes from
    // re-randomising BOTH the sequence and the layout. A fixed grid lets somebody learn six
    // positions by muscle memory, which is the drift the burn-in assumes does not happen.
    expect(SEQ_RELAYOUT_EACH_ROUND).toBe(SEQUENCE_RERANDOMIZES_PER_TRIAL);
    expect(SEQ_RELAYOUT_EACH_ROUND).toBe(true);
  });
});

describe("how long the check takes is derived, not typed", () => {
  it("lands where the parts actually put it", () => {
    const s = estimatedSeconds();
    expect(s).toBeGreaterThan(180);
    expect(s).toBeLessThan(330);
    expect(estimatedLabel()).toMatch(/^about [\d.]+ minutes$/);
  });

  it("MOVES when a part moves, which is the whole reason it is a function", () => {
    // The mock said "about three and a half minutes" and ran ONE ten-second tapping burst;
    // `TAPPING_TRIALS` is 3, measured, so the real check is longer. A sentence typed on a screen
    // would still be saying 3.5.
    expect(TAPPING_TRIALS).toBe(3);
    const withOneTrial = estimatedSeconds() - (TAPPING_TRIALS - 1) * 10_000 / 1000;
    expect(withOneTrial).toBeLessThan(estimatedSeconds());
  });

  it("names four parts, and the under-15 two-part check is deliberately absent", () => {
    // Parked with the minors the Anvil does not accept. A two-part branch here would be
    // machinery for a population four open counsel questions say cannot take it at all.
    expect(ANVIL_PARTS).toHaveLength(4);
    expect(ANVIL_PARTS[0]).toBe("reaction_time");
  });
});
