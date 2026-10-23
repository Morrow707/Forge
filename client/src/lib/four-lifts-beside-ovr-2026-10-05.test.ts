import { describe, it, expect } from "vitest";
import { postureForExercise, postureAllowsHeightCalibration } from "./exercise-camera-profile";
import { reconcileScaleEstimates } from "./pose-tracking";
import { candidatesAsFilmed, errorPctAgainstSensor, ledgerRow, type LedgerRow } from "@shared/accuracy-ledger";

/* BUILD 620 BESIDE THE OVR, 2026-10-05. See docs/camera-tracking-notes.md.
 *
 * Two findings, each pinned by the take it was found on. Both takes are real numbers off
 * trackingDiagnostics in the 2026-10-05 export, not hand-rolled.
 *
 * THE FIXTURES MOVED INTO shared/accuracy-ledger.ts ON 2026-10-23, and the reason is a defect in
 * how they were held here. This file hand-rolled the blend with the rulers' uncertainties typed
 * as `0.2, 0.2, 0.1` beside an imported `HEIGHT_RULER_UNCERTAINTY`. The literals are CORRECT
 * HISTORY -- `BIACROMIAL_TOLERANCE_FRACTION` was 0.1 until e70cc096 (2026-10-06) made it 0.2 and
 * a FLOOR -- and the import is LIVE, so half the blend was sealed at the values of the day and
 * half followed every later refit, which is a comparison that is a record of nothing. Replaying
 * both takes at the uncertainties the ledger records reproduces the scale the phone shipped to
 * 0.0000%, so the literals were faithful and the import was the defect.
 *
 * EVERY NUMBER IN THIS FILE IS NOW AS-FILMED, on purpose. "-7.0% with its height ruler, 0.0%
 * without" is a fact about BUILD 620 and about the change that was made on it, which is what this
 * file is for; it is not a standing property of the pipeline. The same two takes read -3.6% and
 * -2.0% today, and that is pinned in the ledger's own replay rather than here, so a later refit
 * moves one number in one place instead of silently rewriting this file's meaning.
 */

const SQUAT = ledgerRow("2026-10-05-back-squat");
const RDL = ledgerRow("2026-10-05-romanian-deadlift");

/** The take exactly as build 620 blended it. `withHeight` is the one thing the hinge fix changed,
 *  so it is the one thing this file varies -- every uncertainty still comes from one era. */
function blend(row: LedgerRow, withHeight: boolean): number {
  const candidates = withHeight
    ? candidatesAsFilmed(row)
    : candidatesAsFilmed(row).filter((c) => c.source !== "height");
  const v = reconcileScaleEstimates(
    candidates.map((c) => ({
      source: c.source as "body_3d",
      scale: c.scaleX1000 / 1000,
      uncertaintyFraction: row.uncertaintiesAsFilmed[c.source],
    })),
  );
  if (v.scale == null) throw new Error("no scale");
  return v.scale * 1000;
}
const errPct = (row: LedgerRow, withHeight: boolean) => errorPctAgainstSensor(blend(row, withHeight), row);

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
  it("puts the RDL on the sensor AS BUILD 620 BLENDED IT: -7.0% with its height ruler, 0.0% without", () => {
    expect(errPct(RDL, true)).toBeLessThan(-5);
    expect(Math.abs(errPct(RDL, false))).toBeLessThan(1.5);
  });

  it("and the Back Squat keeps its height ruler, because dropping it is 25% high", () => {
    expect(Math.abs(errPct(SQUAT, true))).toBeLessThan(7);
    expect(errPct(SQUAT, false)).toBeGreaterThan(20);
  });

  /* THE BASELINE IS THE REAL TAKE, which is what makes the two cases above measurements of the
   * change rather than of an arithmetic fixture. Both are blended with the height ruler in, as
   * build 620 shipped them, so this is the same number the phone used. */
  it("blends what each take really shipped", () => {
    for (const row of [SQUAT, RDL]) {
      expect(Math.abs(blend(row, true) / row.shippedScaleX1000 - 1), row.id).toBeLessThan(0.0001);
    }
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
