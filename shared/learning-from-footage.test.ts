import { describe, it, expect } from "vitest";
import {
  foldLimbMeasurement,
  limbHasConverged,
  scaleFromKnownLimb,
  RULERS_THAT_MAY_TEACH_A_LIMB,
} from "./athlete-body-model";
import {
  fitLoadVelocityProfile,
  compareTakeToProfile,
  scaleSourceIsAnchored,
  MIN_PROFILE_POINTS,
  type ProfilePoint,
} from "./load-velocity-profile";
import { repConsistency, repConsistencyFlag } from "./rep-consistency";

describe("the athlete's own skeleton as a ruler", () => {
  it("converges as takes arrive, and says so only once it has", () => {
    let est = foldLimbMeasurement(undefined, 0.33, "plate", []);
    expect(limbHasConverged(est)).toBe(false); // one take proves nothing
    est = foldLimbMeasurement(est, 0.331, "plate", [0.33]);
    expect(limbHasConverged(est)).toBe(false); // two cannot establish a spread
    est = foldLimbMeasurement(est, 0.329, "plate", [0.33, 0.331]);
    expect(limbHasConverged(est)).toBe(true);
    expect(est.metres).toBeCloseTo(0.33, 3);
  });

  it("refuses to be a ruler while the estimates still disagree", () => {
    // A limb that keeps changing was never measured -- it is the SCALE that moved, and using it
    // would launder that disagreement into a confident-looking number.
    const est = foldLimbMeasurement(undefined, 0.5, "plate", [0.3, 0.35, 0.45]);
    expect(est.spreadFraction).toBeGreaterThan(0.08);
    expect(limbHasConverged(est)).toBe(false);
    expect(scaleFromKnownLimb(est, 100)).toBeNull();
  });

  it("is outvoted by later takes rather than permanently shifted by one bad one", () => {
    // Median, not a running mean: one take whose ruler was wrong in a way the gate missed must
    // not move a bone forever.
    const est = foldLimbMeasurement(undefined, 0.9, "plate", [0.33, 0.33, 0.331, 0.329]);
    expect(est.metres).toBeCloseTo(0.331, 2);
  });

  it("turns a known limb back into a scale", () => {
    const est = foldLimbMeasurement(undefined, 0.33, "plate", [0.33, 0.33, 0.33]);
    const scale = scaleFromKnownLimb(est, 100)!;
    expect(scale.scale).toBeCloseTo(0.0033, 5);
  });

  it("never learns a bone from a body-derived scale", () => {
    // Learning a limb from a scale that was itself derived from a limb is circular.
    expect(RULERS_THAT_MAY_TEACH_A_LIMB).not.toContain("shoulder_width" as never);
    expect(RULERS_THAT_MAY_TEACH_A_LIMB).not.toContain("height" as never);
  });
});

describe("the load-velocity profile, and the circularity rule", () => {
  const pts = (loads: number[]): ProfilePoint[] =>
    loads.map((loadKg, i) => ({
      loadKg,
      meanVelocityMps: 1.2 - 0.004 * loadKg,
      source: "plate",
      date: `2026-09-0${i + 1}`,
    }));

  it("ADMITS ONLY ANCHORED TAKES -- this is the whole safety of the idea", () => {
    // A profile built from camera numbers and used to correct camera numbers corrects error
    // toward the average of the same error, and then a systematic bias becomes invisible.
    expect(scaleSourceIsAnchored("sensor")).toBe(true);
    expect(scaleSourceIsAnchored("plate")).toBe(true);
    expect(scaleSourceIsAnchored("gravity")).toBe(true);
    expect(scaleSourceIsAnchored("shoulder_width")).toBe(false);
    expect(scaleSourceIsAnchored("height")).toBe(false);
    expect(scaleSourceIsAnchored(null)).toBe(false);
  });

  it("refuses to fit a line through too few points", () => {
    expect(fitLoadVelocityProfile(pts([60, 80, 100]).slice(0, MIN_PROFILE_POINTS - 1))).toBeNull();
  });

  it("refuses a pile of points at the same load", () => {
    // Somebody who benches 135 every week gives one point and no line.
    expect(fitLoadVelocityProfile(pts([61, 61, 61, 61, 61]))).toBeNull();
  });

  it("recovers the slope when the loads are spread", () => {
    const profile = fitLoadVelocityProfile(pts([50, 70, 90, 110]))!;
    expect(profile.slopeMpsPerKg).toBeCloseTo(-0.004, 4);
    expect(profile.interceptMps).toBeCloseTo(1.2, 2);
  });

  it("reports the disagreement and NEVER rewrites the measurement", () => {
    const profile = fitLoadVelocityProfile(pts([50, 70, 90, 110]))!;
    const c = compareTakeToProfile(profile, 61, (1.2 - 0.004 * 61) * 1.5)!;
    expect(c.ratio).toBeCloseTo(1.5, 1);
    expect(c.extrapolated).toBe(false);
    // The returned shape carries no corrected velocity, on purpose: the camera reports what it
    // saw, with a caveat.
    expect(Object.keys(c).sort()).toEqual(["expectedMps", "extrapolated", "ratio"]);
  });

  it("says when it is extrapolating rather than pretending to know", () => {
    const profile = fitLoadVelocityProfile(pts([50, 70, 90, 110]))!;
    expect(compareTakeToProfile(profile, 200, 0.4)!.extrapolated).toBe(true);
  });
});

describe("a set repeats itself, and that is a label", () => {
  it("measures the tracker's own noise with no ground truth", () => {
    const c = repConsistency([
      { repNumber: 1, romCm: 36 },
      { repNumber: 2, romCm: 35 },
      { repNumber: 3, romCm: 37 },
      { repNumber: 4, romCm: 36 },
    ])!;
    expect(c.spreadFraction).toBeLessThan(0.05);
    expect(c.outlierReps).toEqual([]);
  });

  it("names the rep that did not happen that way", () => {
    // An athlete's range of motion does not change mid-set. A rep at half the others is a
    // segmentation error -- two fused or one split -- not a short rep.
    const c = repConsistency([
      { repNumber: 1, romCm: 36 },
      { repNumber: 2, romCm: 35 },
      { repNumber: 3, romCm: 70 },
      { repNumber: 4, romCm: 36 },
    ])!;
    expect(c.outlierReps).toEqual([3]);
    expect(repConsistencyFlag(c, 4)).toContain("Rep 3");
  });

  it("points at fusion when fewer reps were found than logged", () => {
    const c = repConsistency([
      { repNumber: 1, romCm: 36 },
      { repNumber: 2, romCm: 72 },
      { repNumber: 3, romCm: 36 },
    ])!;
    expect(repConsistencyFlag(c, 10)).toContain("two reps read as one");
  });

  it("claims nothing from two reps, where either is equally the outlier", () => {
    expect(repConsistency([{ repNumber: 1, romCm: 36 }, { repNumber: 2, romCm: 70 }])).toBeNull();
  });
});
