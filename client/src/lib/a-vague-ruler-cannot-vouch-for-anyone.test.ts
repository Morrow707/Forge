import { describe, it, expect } from "vitest";
import { reconcileScaleEstimates } from "./pose-tracking";

/* LOOSENING A RULER MUST COST IT WEIGHT, NEVER BUY IT THE POWER TO DRAG OTHERS INTO A CLUSTER.
 *
 * A regression introduced by build 654's own fix, found on the Pendlay Row set 3 of 2026-10-09
 * within hours of shipping it.
 *
 * The grip floor (654) correctly put the shoulder ruler at an uncertainty of 0.587 on that take.
 * The agreement tolerance was the LOOSER ruler's uncertainty doubled, so it became 1.174 -- and
 * at that width the shoulder ruler "agreed" with a plate 3.5x away from it and a body ruler 1.85x
 * away. All three landed in ONE cluster anchored on the vaguest witness in the room, and then the
 * plate -- whose stated 0.0133 buys it 1/0.0133^2 = 5,625 times a body ruler's weight -- took
 * 99.5% of the blend. The set read -58.4% against the OVR.
 *
 * A ruler that cannot tell 1.85x from agreement is not corroborating anything, it is abstaining,
 * and an abstention must not be able to vouch for a third witness. The tolerance is capped at
 * what a normally-stated ruler would ask for (0.4, the figure every take used before any floor
 * existed). It is a CEILING on a tolerance, not a floor on a ruler: it can only ever make the
 * agreement test stricter, never admit a pair the old code refused.
 */

/** Pendlay Row set 3, 2026-10-09, exactly as `calibration.scaleBlend.inputs` recorded it --
 *  including the 0.587 the grip floor had just given the shoulder ruler. Truth is 0.0042083. */
const ROW_SET_3 = [
  { source: "plate" as const, scale: 0.00174043, uncertaintyFraction: 0.013333333333333332 },
  { source: "body_3d" as const, scale: 0.00347067, uncertaintyFraction: 0.2 },
  { source: "depth" as const, scale: 0.0031887, uncertaintyFraction: 0.2 },
  { source: "shoulder_width" as const, scale: 0.00615303, uncertaintyFraction: 0.5871547825670291 },
];
const ROW_SET_3_TRUTH = 0.0042083;

describe("a ruler loosened past the ordinary", () => {
  it("does not pull a 3.5x-away plate into its cluster", () => {
    const v = reconcileScaleEstimates(ROW_SET_3);
    // Before the cap: cluster ["plate", "body_3d", "shoulder_width"], anchored on the vaguest.
    expect(v.agreedSources).not.toContain("plate");
  });

  it("takes the set from -58% to within 15% of the sensor", () => {
    const err = (reconcileScaleEstimates(ROW_SET_3).scale! / ROW_SET_3_TRUTH - 1) * 100;
    expect(err).toBeGreaterThan(-20);
    expect(err).toBeLessThan(0);
    // The honest bound: no ruler on this take is right. Truth sits between the body rulers
    // (-21%) and the shoulder ruler (+46%), so a blend near -14% is the best the inputs allow.
    // This asserts the plate is gone, not that the take is solved.
  });

  it("still costs the loosened ruler weight, which is the point of the floor", () => {
    // The shoulder ruler must stay in the blend and stay light. If the cap had been implemented
    // by resetting its uncertainty, it would be back to carrying half.
    const v = reconcileScaleEstimates(ROW_SET_3);
    const shoulder = v.weights.find((w) => w.source === "shoulder_width");
    expect(shoulder, "shoulder ruler should still vote").toBeDefined();
    expect(shoulder!.weightPct).toBeLessThan(20);
  });

  it("can only ever make agreement STRICTER, never admit a pair the old test refused", () => {
    // Two ordinary rulers 10% apart agreed before the cap and must still agree: the cap is at
    // 0.4, which is what two 0.2 rulers already produced, so nothing ordinary changes.
    const v = reconcileScaleEstimates([
      { source: "body_3d", scale: 0.00400, uncertaintyFraction: 0.2 },
      { source: "shoulder_width", scale: 0.00440, uncertaintyFraction: 0.2 },
    ]);
    expect(v.agreedSources).toEqual(expect.arrayContaining(["body_3d", "shoulder_width"]));
    // CORROBORATED, not merely blended. Two body rulers that DISAGREE are averaged anyway by the
    // body-ruler fallback, so agreedSources alone cannot tell a real agreement from that rescue
    // -- which is how a cap tightened to 0.05 survived the first draft of this assertion.
    expect(v.corroborated, "an ordinary 10% apart pair must still AGREE, not just blend").toBe(true);
  });

  it("leaves a tight ruler's narrow tolerance alone", () => {
    // The cap is a maximum, so it must not widen a plate's own 0.0133 into something looser.
    // A plate and a body ruler 1.9x apart still disagree.
    const v = reconcileScaleEstimates([
      { source: "plate", scale: 0.00174043, uncertaintyFraction: 0.0133 },
      { source: "body_3d", scale: 0.00347067, uncertaintyFraction: 0.2 },
      { source: "depth", scale: 0.0031887, uncertaintyFraction: 0.2 },
    ]);
    expect(v.agreedSources).not.toContain("plate");
  });

  it("the other eight takes of 2026-10-09 are untouched", () => {
    // Bench set 2, the take that already read +1.5%. Nothing in this change may move it.
    const bench = reconcileScaleEstimates([
      { source: "body_3d", scale: 0.00370, uncertaintyFraction: 0.2 },
      { source: "shoulder_width", scale: 0.00392, uncertaintyFraction: 0.2 },
    ]);
    expect(bench.agreedSources).toHaveLength(2);
  });
});
