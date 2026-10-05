import { describe, it, expect } from "vitest";
import { postureForExercise, postureAllowsHeightCalibration } from "./exercise-camera-profile";
import { reconcileScaleEstimates, HEIGHT_RULER_UNCERTAINTY } from "./pose-tracking";

/* BUILD 620 BESIDE THE OVR, 2026-10-05. See docs/camera-tracking-notes.md.
 *
 * Two findings, each pinned by the take it was found on. Both fixtures are real numbers off
 * trackingDiagnostics in the 2026-10-05 export, not hand-rolled.
 */

// trackingDiagnostics.calibration.scaleCandidates, scales x1000. "truth" is the scale the
// sensor's range of motion requires: the shipped scaleFactor times sensorRom/reportedRom.
const SQUAT = {
  body3d: 4.3906832628553705,
  depth: 6.182978508470917,
  height: 3.468957241363022,
  shoulder: 5.263465218260532,
  shipped: 4.460001794224457,
  romRead: 78.1,
  romSensor: 73.7,
};
const RDL = {
  body3d: 3.385283084489443,
  depth: 4.393551787195805,
  height: 3.4297664588115316,
  shoulder: 4.12703743774313,
  shipped: 3.7870913839708666,
  romRead: 60.0,
  romSensor: 64.5,
};
const truthOf = (c: typeof SQUAT) => c.shipped * (c.romSensor / c.romRead);

function blend(c: typeof SQUAT, withHeight: boolean) {
  const v = reconcileScaleEstimates([
    { source: "body_3d", scale: c.body3d / 1000, uncertaintyFraction: 0.2 },
    { source: "depth", scale: c.depth / 1000, uncertaintyFraction: 0.2 },
    ...(withHeight
      ? [{ source: "height" as const, scale: c.height / 1000, uncertaintyFraction: HEIGHT_RULER_UNCERTAINTY }]
      : []),
    { source: "shoulder_width", scale: c.shoulder / 1000, uncertaintyFraction: 0.1 },
  ]);
  if (v.scale == null) throw new Error("no scale");
  return v.scale * 1000;
}
const errPct = (c: typeof SQUAT, withHeight: boolean) => (blend(c, withHeight) / truthOf(c) - 1) * 100;

describe("the hip hinge is a bent-over posture (the RDL beside the OVR)", () => {
  it("classifies every hinge the library spells out, and the aliases, as bent_over", () => {
    for (const name of [
      "Romanian Deadlift",
      "Barbell Romanian Deadlift",
      "Dumbbell Romanian Deadlift",
      "Single-Leg Romanian Deadlift",
      "Stiff-Leg Deadlift",
      "Stiff-Legged Deadlift",
      "Hip Hinge",
      // Not in the explicit map -- these have to come out of the regex table.
      "Romanian Deadlift (Snatch Grip)",
      "Kettlebell Romanian Deadlift",
    ]) {
      expect(postureForExercise(name), name).toBe("bent_over");
    }
  });

  it("leaves the standing pulls alone -- a conventional deadlift finishes tall", () => {
    for (const name of ["Deadlift", "Sumo Deadlift", "Trap Bar Deadlift", "Back Squat"]) {
      expect(postureForExercise(name), name).toBe("standing");
      expect(postureAllowsHeightCalibration(postureForExercise(name)), name).toBe(true);
    }
  });

  it("means no height ruler on a hinge", () => {
    expect(postureAllowsHeightCalibration("bent_over")).toBe(false);
  });

  /* THE OUTCOME, NOT THE MECHANISM. A later change that holds the same accuracy another way
   * passes; one that undoes it fails. The RDL's height ruler read 16% below the scale the
   * sensor requires while carrying 44.4% of the weight. */
  it("puts the RDL on the sensor: -7.0% with its height ruler, 0.0% without", () => {
    expect(errPct(RDL, true)).toBeLessThan(-5);
    expect(Math.abs(errPct(RDL, false))).toBeLessThan(1.5);
  });

  it("and the Back Squat keeps its height ruler, because dropping it is 25% high", () => {
    expect(Math.abs(errPct(SQUAT, true))).toBeLessThan(7);
    expect(errPct(SQUAT, false)).toBeGreaterThan(20);
  });
});

/* THE SHOULDER RULER IS HIGH ON EVERY TAKE IN THE EXPORT, AND IS DELIBERATELY NOT REFITTED.
 *
 * Recorded so the next person does not spend the session rediscovering it. Against the median
 * of the other candidates the shoulder ruler was high on 19 of 19 captures, median 1.29x, and
 * there is a mechanism: BIACROMIAL_HEIGHT_FRACTION is 0.23, the adult anatomical biacromial
 * breadth, but the pixel span it divides is measured between VISION'S shoulder landmarks, which
 * sit inboard of the acromia. The 3D skeleton measures that span at a median 0.1934 of stature
 * across fifteen captures (0.188-0.202 on the six standing lifts), implying a 1.19x bias -- most
 * of the 1.29 observed, the rest being foreshortening, which only ever adds.
 *
 * AND ACTING ON IT ALONE MAKES THE NUMBERS WORSE, which is why nothing changed. Sweeping the
 * fraction through the real blend:
 *
 *   fraction   squat vs sensor   RDL vs sensor   worst
 *   0.23       +6.0%             -7.0%           7.0%   <- shipped
 *   0.21       +1.1%             -10.9%          10.9%
 *   0.195      -2.5%             -13.8%          13.8%
 *
 * The shoulder ruler's high bias was COMPENSATING for the RDL's height ruler being 16% low --
 * so the hinge fix above is the one that belongs, and the fraction cannot be refitted until a
 * take exists where it is the error rather than the counterweight.
 */
describe("the shoulder ruler's known bias is recorded, not fitted out", () => {
  it("still carries 0.23, on purpose", () => {
    const src = readProfileSource();
    expect(src).toContain("const BIACROMIAL_HEIGHT_FRACTION = 0.23;");
  });
});

function readProfileSource() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("node:fs").readFileSync(
    require("node:path").join(__dirname, "pose-tracking.ts"),
    "utf8",
  ) as string;
}
