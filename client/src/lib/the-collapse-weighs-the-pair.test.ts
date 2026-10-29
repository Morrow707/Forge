import { describe, it, expect } from "vitest";
import { reconcileScaleEstimates } from "./pose-tracking";

/* THE 3D-POSE COLLAPSE WEIGHS ITS PAIR BY WHAT EACH HALF STATES (2026-10-29).
 *
 * body_3d and depth are read off one skeleton and vote once (build 578). Until this the vote was
 * their UNWEIGHTED geometric mean, so a stated uncertainty on either bought nothing -- the one
 * place in the blend where it did not -- and the Romanian deadlift's record could not say "the
 * depth ruler is a 0.6 instrument on a hinge" in a way the pipeline heard. Two properties, both
 * load-bearing, both mutation-tested:
 *   1. with EQUAL uncertainties the result is the old geometric mean to the last digit, so every
 *      lift whose record states 0.2 for both is bit-identical (the ledger replay proves it on
 *      five squat rows);
 *   2. with unequal uncertainties the witness moves toward the tighter half and STATES the
 *      tighter uncertainty -- not the wider, which handed the vote to the 2D shoulder ruler. */
function blend(body: number, depth: number, uBody: number, uDepth: number) {
  return reconcileScaleEstimates([
    { source: "body_3d", scale: body, uncertaintyFraction: uBody },
    { source: "depth", scale: depth, uncertaintyFraction: uDepth },
  ] as any);
}

describe("the 3D-pose collapse", () => {
  it("is the plain geometric mean when both halves state the same uncertainty", () => {
    const v = blend(0.0030, 0.0040, 0.2, 0.2) as any;
    expect(v.blendTrace.collapsedPose3d.scale).toBeCloseTo(Math.sqrt(0.003 * 0.004), 8);
    expect(v.blendTrace.collapsedPose3d.uncertaintyFraction).toBe(0.2);
  });
  it("moves toward the half that states it knows better, and states that half's uncertainty", () => {
    const equal = (blend(0.0030, 0.0040, 0.2, 0.2) as any).blendTrace.collapsedPose3d.scale;
    const v = blend(0.0030, 0.0040, 0.2, 0.6) as any;
    const c = v.blendTrace.collapsedPose3d;
    // weights 25 : 2.78 in log space -> 0.9 of the way toward the bone
    const expected = Math.exp((25 * Math.log(0.003) + (1 / 0.36) * Math.log(0.004)) / (25 + 1 / 0.36));
    // the blend trace rounds its scales to eight decimals, which is where the tolerance comes from
    expect(c.scale).toBeCloseTo(expected, 8);
    expect(c.scale).toBeLessThan(equal);
    expect(c.scale).toBeGreaterThan(0.003);
    expect(c.uncertaintyFraction).toBe(0.2);
    // and the same pair the other way round lands in the same place: order does not matter
    const r = (reconcileScaleEstimates([
      { source: "depth", scale: 0.004, uncertaintyFraction: 0.6 },
      { source: "body_3d", scale: 0.003, uncertaintyFraction: 0.2 },
    ] as any) as any).blendTrace.collapsedPose3d;
    expect(r.scale).toBeCloseTo(c.scale, 8);
  });
});
