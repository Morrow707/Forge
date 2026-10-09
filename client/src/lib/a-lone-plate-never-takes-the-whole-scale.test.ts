import { describe, it, expect } from "vitest";
import { reconcileScaleEstimates } from "./pose-tracking";

/* A PLATE NOBODY AGREES WITH TOOK 100% OF THE SCALE AND COST A SET TWO THIRDS OF ITS RANGE.
 *
 * The guard for this has existed since build 594 and reads, in its own comment, "a plate that
 * corroborates with nothing, when at least two other rulers are in the room, steps out of the
 * vote". On 2026-10-09 it did not fire on the commonest ruler set there is, and the reason was
 * one line:
 *
 *     if (best.length === 1 && best[0].source === "plate" && voters.length >= 3)
 *
 * `voters` is counted AFTER the 3D-pose collapse folds body_3d and depth into a single witness
 * (Rule #2, so a correlated pair cannot out-vote a third). A take whose rulers are exactly
 * {plate, body_3d, depth} therefore arrives with TWO voters, the guard sleeps, and the plate
 * takes the whole scale.
 *
 * Pendlay Row set 2, measured against the OVR, is the case and the numbers below are its real
 * ones. The plate was 60.5% low and carried 100%; body_3d and depth were -2.7% and +0.4% and
 * carried nothing. The set reported 22.3 cm against a real 56.4. Set 1 of the same lift minutes
 * earlier had no plate at all and read +23.1%, which is how ONE LIFT disagreed with itself by
 * 3.21x in one session while the sensor's own two sets differed by 1.03x.
 *
 * The collapse is right about agreement and wrong as a corroboration count: two readings that
 * agree with each other to 3% and both disagree with the plate by 2.5x are not "one against
 * one". The count is now taken on independent non-plate READINGS, before the collapse.
 */

/** The real inputs off `calibration.scaleBlend` for Pendlay Row set 2, 2026-10-09. Truth, from
 *  the OVR's 22.2in over Forge's reported range, is 0.0035158 m/unit. */
const ROW_SET_2 = [
  { source: "plate" as const, scale: 0.00139042, uncertaintyFraction: 0.013333333333333332 },
  { source: "body_3d" as const, scale: 0.00342228, uncertaintyFraction: 0.2 },
  { source: "depth" as const, scale: 0.00352992, uncertaintyFraction: 0.2 },
];
const ROW_SET_2_TRUTH = 0.0035158;

describe("a lone plate against the body rulers", () => {
  it("steps out when two independent non-plate readings disagree with it", () => {
    const v = reconcileScaleEstimates(ROW_SET_2);
    expect(v.scale).not.toBeNull();
    // Was 0.00139042 -- the plate's own number, 60.5% below truth.
    expect(v.scale!).toBeGreaterThan(0.003);
    expect(v.agreedSources).not.toContain("plate");
  });

  it("lands within 2% of the sensor where it was 60% below it", () => {
    const err = (reconcileScaleEstimates(ROW_SET_2).scale! / ROW_SET_2_TRUTH - 1) * 100;
    expect(Math.abs(err), `got ${err.toFixed(1)}%`).toBeLessThan(2);
  });

  it("reports the plate as the outlier it is, rather than dropping it from the record", () => {
    // Rule #1's shape: the refused reading still has to appear. A plate that vanished from the
    // record is a plate nobody can score against the sensor next session.
    const v = reconcileScaleEstimates(ROW_SET_2);
    expect(v.outliers.map((o) => o.source)).toContain("plate");
  });

  it("KEEPS the plate when it is the only other ruler -- one against one is a tie", () => {
    // The original comment's deliberate exception, and it must survive the fix. With a single
    // non-plate reading there is nothing to corroborate against, and a disc of known size
    // outranks a population fraction of a body.
    const v = reconcileScaleEstimates([
      { source: "plate", scale: 0.00139042, uncertaintyFraction: 0.013 },
      { source: "shoulder_width", scale: 0.0059, uncertaintyFraction: 0.2 },
    ]);
    expect(v.scale).toBeCloseTo(0.00139042, 6);
  });

  it("KEEPS the plate when something actually agrees with it", () => {
    // Corroboration is the whole test. A plate two body rulers endorse is the best ruler in the
    // room and must not be stepped out by a count.
    const v = reconcileScaleEstimates([
      { source: "plate", scale: 0.0035, uncertaintyFraction: 0.013 },
      { source: "body_3d", scale: 0.00342228, uncertaintyFraction: 0.2 },
      { source: "depth", scale: 0.00352992, uncertaintyFraction: 0.2 },
    ]);
    expect(v.agreedSources).toContain("plate");
    expect(v.scale!).toBeCloseTo(0.0035, 4);
  });

  it("counts readings before the collapse, which is the whole bug", () => {
    // body_3d + depth collapse to ONE voter. Counting voters gave 2 and the guard slept.
    // Counting readings gives 2 non-plate and it fires. This case is the regression: if the
    // count ever moves back after the collapse, this is what goes red first.
    const collapsingPair = reconcileScaleEstimates(ROW_SET_2);
    expect(collapsingPair.agreedSources).not.toContain("plate");
    // And the same shape with a NON-collapsing pair behaved correctly even before the fix, so
    // it is the control: height and shoulder_width are not folded together.
    const nonCollapsing = reconcileScaleEstimates([
      { source: "plate", scale: 0.00139042, uncertaintyFraction: 0.013 },
      { source: "height", scale: 0.00342228, uncertaintyFraction: 0.1 },
      { source: "shoulder_width", scale: 0.00352992, uncertaintyFraction: 0.2 },
    ]);
    expect(nonCollapsing.agreedSources).not.toContain("plate");
  });

  it("leaves a take with no plate exactly as it was", () => {
    // 13 of the 14 captures in the 2026-10-09 export are bit-identical under this change, and
    // that is the claim the fix is allowed to make. Pendlay Row set 1's real candidates.
    const v = reconcileScaleEstimates([
      { source: "body_3d", scale: 0.00366514, uncertaintyFraction: 0.2 },
      { source: "depth", scale: 0.00315299, uncertaintyFraction: 0.2 },
      { source: "shoulder_width", scale: 0.00654101, uncertaintyFraction: 0.2 },
    ]);
    expect(v.scale).toBeCloseTo(0.00497022, 5);
  });
});
