import { describe, it, expect } from "vitest";
import { shoulderWidthScaleFromFrames, WIDEST_BARBELL_GRIP_M } from "./pose-tracking";

/* THE SHOULDER RULER IS ONE SPAN, AND NOTHING INSIDE IT CAN TELL A SMALL SPAN FROM A NEAR ONE.
 *
 * `scale x medianSpanUnits` came to 0.438 m on all six sensor-paired takes of 2026-10-09, for a
 * 75in athlete -- i.e. BIACROMIAL_HEIGHT_FRACTION x stature, exactly. So the ruler is a constant
 * divided by one measured span, and when that span reads small the scale reads large in exact
 * proportion.
 *
 * The grip is the independent check: both are horizontal spans the body tracker measures in the
 * same frames, so their ratio is a pure number, and anatomy bounds it. The widest barbell grip is
 * about 0.81 m against a biacromial breadth of 0.23 x stature -- a ceiling of 1.85 for this
 * athlete. Measured against the OVR:
 *
 *     ratio   error            ratio   error
 *     1.47    +1.4%            2.16    +25.8%
 *     1.74    +8.3%            2.91    +62.0%
 *     2.06   +49.1%            3.20    +69.2%
 *
 * Five of six order exactly. The two ROW sets matter most -- same lift, same grip, same session,
 * 2.91 -> +62.0% and 3.20 -> +69.2% -- because that breaks the confound that made this
 * unactionable in the morning, when all three takes were different lifts with different grips.
 *
 * Carried as UNCERTAINTY, never a correction, and FLOORED so it can only loosen. The ceiling is
 * DERIVED per athlete from two constants that already exist, so FITTED_OVERRIDES stays empty.
 */

const HEIGHT_IN = 75;
const BIACROMIAL_M = 0.23 * HEIGHT_IN * 0.0254;
const CEILING = WIDEST_BARBELL_GRIP_M / BIACROMIAL_M;

/** Frames whose shoulder span is a fixed number of units, with a little spread. */
function framesWithSpan(spanUnits: number, spread = 0.02) {
  return Array.from({ length: 40 }, (_, i) => {
    const w = spanUnits * (1 + (i % 2 === 0 ? spread / 2 : -spread / 2));
    return {
      worldLandmarks: Array.from({ length: 33 }, (_, j) => {
        if (j === 11) return { x: -w / 2, y: 0, z: 0, visibility: 0.99 };
        if (j === 12) return { x: w / 2, y: 0, z: 0, visibility: 0.99 };
        return { x: 0, y: j * 0.01, z: 0, visibility: 0.99 };
      }),
    };
  });
}

describe("the grip-to-shoulder ceiling", () => {
  it("is about 1.85 for a 75in athlete, derived and not typed", () => {
    expect(CEILING).toBeGreaterThan(1.8);
    expect(CEILING).toBeLessThan(1.9);
    // Derived per athlete: a shorter lifter has a narrower biacromial breadth and so a HIGHER
    // ceiling for the same bar. A hardcoded 1.85 would be wrong for everyone but this athlete.
    const shorter = WIDEST_BARBELL_GRIP_M / (0.23 * 60 * 0.0254);
    expect(shorter).toBeGreaterThan(CEILING);
  });

  it("leaves a ratio inside anatomy exactly as it was", () => {
    // Bench set 1: grip 159.2, span 108.2, ratio 1.47 -- a real grip, and the ruler read +1.4%.
    const r = shoulderWidthScaleFromFrames(framesWithSpan(108.2), HEIGHT_IN, "lying", undefined, 159.2);
    expect(r.uncertaintyFraction).toBeCloseTo(0.2, 5);
  });

  it("loosens the ruler when the ratio is past anything anatomy allows", () => {
    // Pendlay Row set 1: grip 194.9, span 67.0, ratio 2.91. No one grips a bar at 2.9x their
    // own shoulder breadth; the span is read small, and the scale is large in proportion.
    const r = shoulderWidthScaleFromFrames(framesWithSpan(67.0), HEIGHT_IN, "bent_over", undefined, 194.9);
    expect(r.uncertaintyFraction).toBeGreaterThan(0.5);
    // Against the span the ruler actually measured, not the nominal one the fixture aimed at:
    // the frames carry a 2% spread, so the median lands beside 67.0 and the floor follows it.
    // Reading the ruler's own medianSpanUnits is also the honest assertion -- it is the number
    // the floor is computed from in the implementation.
    expect(r.uncertaintyFraction).toBeCloseTo(194.9 / r.medianSpanUnits! / CEILING - 1, 6);
  });

  it("only ever LOOSENS -- the floor can never tighten this ruler", () => {
    // A ratio well under the ceiling must not buy the shoulder ruler more weight than the
    // cross-take fit says it has earned. Same rule as spanSpreadFraction beside it.
    const tight = shoulderWidthScaleFromFrames(framesWithSpan(140), HEIGHT_IN, "standing", undefined, 150);
    expect(tight.uncertaintyFraction).toBeGreaterThanOrEqual(0.2);
  });

  it("never tightens when the floor is positive but SMALLER than the noise already measured", () => {
    // The case the first draft of this file missed, and mutation testing caught: a ruler whose
    // span wanders 30% across the take, with a ratio only just past the ceiling. Three terms are
    // in play and the answer must be the LARGEST. A version that took the floor whenever it was
    // positive would hand this ruler 0.1 -- four times the weight -- on a take that cannot hold
    // its own span still.
    const span = 100;
    // Derived from the span the ruler ACTUALLY measures, not the nominal one: a 30% spread moves
    // the median, and a grip computed off 100 left the ratio UNDER the ceiling, so the floor was
    // zero and this case silently stopped testing anything. (That is what let the tightening
    // mutation survive the first two drafts of this file.)
    const measuredSpan = shoulderWidthScaleFromFrames(
      framesWithSpan(span, 0.3), HEIGHT_IN, "bent_over",
    ).medianSpanUnits!;
    const grip = measuredSpan * CEILING * 1.1; // floor = 0.1, reliably
    // bent_over, not standing: the stature yardstick is only consulted where a body length IS a
    // stature (build 633), and this fixture's torso is a stub, so a standing posture refuses the
    // ruler outright and never reaches the three-term max this case is about.
    const r = shoulderWidthScaleFromFrames(framesWithSpan(span, 0.3), HEIGHT_IN, "bent_over", undefined, grip);
    expect(r.spanSpreadFraction!).toBeGreaterThan(0.2);
    expect(r.uncertaintyFraction).toBeCloseTo(r.spanSpreadFraction!, 6);
    expect(r.uncertaintyFraction).toBeGreaterThan(0.15);
  });

  it("behaves exactly as before when no grip is passed", () => {
    // Every caller that does not measure a grip, and every test written before this existed.
    const withGrip = shoulderWidthScaleFromFrames(framesWithSpan(67.0), HEIGHT_IN, "bent_over", undefined, 194.9);
    const without = shoulderWidthScaleFromFrames(framesWithSpan(67.0), HEIGHT_IN, "bent_over");
    expect(without.uncertaintyFraction).toBeCloseTo(0.2, 5);
    expect(withGrip.uncertaintyFraction).toBeGreaterThan(without.uncertaintyFraction);
    // And the SCALE is untouched either way: this changes what the ruler is worth, never what
    // it says. A correction would be a different decision and is not this one.
    expect(withGrip.scale).toBeCloseTo(without.scale!, 10);
  });

  it("does not move the scale, only the confidence in it", () => {
    // Rule #1's neighbour: the number still gets through. Nothing here withholds a reading.
    const r = shoulderWidthScaleFromFrames(framesWithSpan(67.0), HEIGHT_IN, "bent_over", undefined, 194.9);
    expect(r.scale).not.toBeNull();
    expect(r.rejectedBecause).toBeNull();
  });

  it("is null-safe on a take with no height, where the ceiling cannot be derived", () => {
    const r = shoulderWidthScaleFromFrames(framesWithSpan(67.0), null, "bent_over", undefined, 194.9);
    // No stature, no biacromial estimate, no ceiling -- and no scale either, so the floor is
    // moot. What matters is that it does not throw or return NaN confidence.
    expect(Number.isFinite(r.uncertaintyFraction)).toBe(true);
  });
});
