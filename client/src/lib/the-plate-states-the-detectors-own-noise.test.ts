import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COREML_BOX_LONG_EDGE_UNCERTAINTY,
  CALIBRATION_REFERENCES,
  computeReferenceObjectScale,
  reconcileScaleEstimates,
} from "./pose-tracking";

/* THE PLATE RULER PROPAGATED ITS NUMERATOR'S ERROR AND TREATED THE DENOMINATOR AS EXACT.
 *
 * `computeReferenceObjectScale` returns `knownRealSizeM / measuredPixelSize` and, until
 * 2026-10-09, `uncertaintyFraction = toleranceM / knownRealSizeM` -- the plate's casting
 * tolerance, 6mm on 450mm, **1.3%** -- with nothing at all said about `measuredPixelSize`. That
 * denominator is a CoreML box's long edge, and it is by far the least certain term: measured on
 * the 41 held-out val images the retrained detector never trained on, the plate class's long-edge
 * ratio has a relative MAD of **5.6%** (77 matched boxes; barbell 4.9% over 19, dumbbell 5.1%
 * over 23, so the three agree and the widest is the honest one to state).
 *
 * The blend weights by 1/sigma^2, so understating the plate's noise fourfold overstated its
 * weight **~18x**: 225x a body ruler's where the measurement supports 12x. That is how a plate
 * took 100% of the vote on the 2026-10-09 Pendlay Row while two body rulers agreeing with each
 * other to 3% carried nothing at all.
 *
 * This is a MEASUREMENT replacing a term that was simply absent, which is the same move as the
 * grip floor (654) and the one CLAUDE.md's learning-loop note argues for in words:
 * `reconcileScaleEstimates` is already inverse-variance weighted and has only ever been handed
 * guessed variances. It is a property of the DETECTOR, shared by all 269 identities, so it is not
 * a per-lift number and `FITTED_OVERRIDES` stays empty.
 *
 * NOTHING IN THE 2026-10-09 CORPUS MOVES. Every take whose plate carried weight had it stepped
 * out by build 653/655; no currently-correct take has a weighted plate. This takes effect only
 * once the detector starts producing admissible plates, which is what the retrain is for.
 */

const PLATE = CALIBRATION_REFERENCES.find((r) => r.id === "bumper_plate_perform_better")!;
/** The plate's own casting tolerance as a fraction -- what this ruler used to state alone. */
const CASTING_ONLY = PLATE.toleranceM / PLATE.nominalSizeM;

describe("the plate ruler's stated uncertainty", () => {
  it("is the measured box noise combined with the disc's tolerance, not the tolerance alone", () => {
    const r = computeReferenceObjectScale(
      457, PLATE.nominalSizeM, PLATE.toleranceM, COREML_BOX_LONG_EDGE_UNCERTAINTY,
    )!;
    expect(r.uncertaintyFraction).toBeCloseTo(
      Math.hypot(CASTING_ONLY, COREML_BOX_LONG_EDGE_UNCERTAINTY), 10,
    );
    // Quadrature, because the two are independent: how big the disc is, and how well the detector
    // boxed it. Adding them would overstate; taking the max would discard the smaller entirely.
    expect(r.uncertaintyFraction).toBeLessThan(CASTING_ONLY + COREML_BOX_LONG_EDGE_UNCERTAINTY);
    expect(r.uncertaintyFraction).toBeGreaterThan(COREML_BOX_LONG_EDGE_UNCERTAINTY);
  });

  it("is dominated by the box, which is the finding", () => {
    // The casting tolerance is not wrong, it is small. If a future plate reference had a 10cm
    // tolerance this assertion would be the wrong shape -- so it is stated against the real one.
    expect(CASTING_ONLY).toBeLessThan(COREML_BOX_LONG_EDGE_UNCERTAINTY / 3);
  });

  it("costs the plate about eighteen times its weight, which is the whole effect", () => {
    const sigmaBefore = computeReferenceObjectScale(457, PLATE.nominalSizeM, PLATE.toleranceM)!
      .uncertaintyFraction;
    const sigmaAfter = computeReferenceObjectScale(
      457, PLATE.nominalSizeM, PLATE.toleranceM, COREML_BOX_LONG_EDGE_UNCERTAINTY,
    )!.uncertaintyFraction;
    // Weight goes as 1/sigma^2, so the weight the plate LOSES is (sigmaAfter/sigmaBefore)^2.
    const weightLost = (sigmaAfter / sigmaBefore) ** 2;
    expect(weightLost).toBeGreaterThan(10);
    expect(weightLost).toBeLessThan(30);
  });

  it("does not move the scale, only the confidence in it", () => {
    // Rule #1's neighbour, and the same assertion the grip floor carries: this changes what the
    // ruler is WORTH, never what it says. A correction would be a different decision.
    const withNoise = computeReferenceObjectScale(
      457, PLATE.nominalSizeM, PLATE.toleranceM, COREML_BOX_LONG_EDGE_UNCERTAINTY,
    )!;
    const without = computeReferenceObjectScale(457, PLATE.nominalSizeM, PLATE.toleranceM)!;
    expect(withNoise.scale).toBeCloseTo(without.scale, 12);
  });

  it("is bit-identical for a caller that states no measurement noise", () => {
    // Every other reference object, and every test written before this existed. The parameter
    // DEFAULTS to zero on purpose: a coach's own tape measure states 0 tolerance and should not
    // silently acquire a CoreML detector's noise.
    const r = computeReferenceObjectScale(300, 0.45, 0.006)!;
    expect(r.uncertaintyFraction).toBeCloseTo(0.006 / 0.45, 12);
    const exact = computeReferenceObjectScale(300, 0.45, 0)!;
    expect(exact.uncertaintyFraction).toBe(0);
  });

  it("refuses a negative or NaN measurement noise rather than returning NaN confidence", () => {
    expect(computeReferenceObjectScale(300, 0.45, 0.006, -0.1)).toBeNull();
    expect(computeReferenceObjectScale(300, 0.45, 0.006, Number.NaN)).toBeNull();
  });

  it("is what the plate ruler actually passes", () => {
    // `plateScaleFromFrames` is module-private, so the wiring is asserted by reading the call
    // site -- the same shape as the Swift arbiter's constants. A measured number nothing passes
    // is a comment.
    const dialog = readFileSync(
      join(__dirname, "..", "components", "av-bar-tracker-dialog.tsx"), "utf8",
    );
    const call = /computeReferenceObjectScale\(([\s\S]*?)\);/.exec(dialog);
    expect(call, "the plate ruler should still call computeReferenceObjectScale").not.toBeNull();
    expect(call![1]).toContain("COREML_BOX_LONG_EDGE_UNCERTAINTY");
  });

  it("names the script that measures it, so a retrain knows to re-measure", () => {
    // The number describes one specific set of weights and is wrong for the next ones. The only
    // thing that makes it maintainable is that the measurement is reproducible.
    const src = readFileSync(join(__dirname, "pose-tracking.ts"), "utf8");
    const at = src.indexOf("COREML_BOX_LONG_EDGE_UNCERTAINTY = ");
    expect(at).toBeGreaterThan(-1);
    const doc = src.slice(Math.max(0, at - 2000), at);
    expect(doc).toContain("validate_box_size.py");
    expect(doc).toContain("retrained");
  });

  it("still lets a right-sized plate decide the scale, which is Rule #4", () => {
    // The object is the only ruler in the scene whose real size is KNOWN. Stating its noise
    // honestly must not demote it to one vote among equals -- 5.6% against the body rulers' 20%
    // is still the best ruler in the room, and it must still carry the take.
    const sigma = Math.hypot(CASTING_ONLY, COREML_BOX_LONG_EDGE_UNCERTAINTY);
    const v = reconcileScaleEstimates([
      { source: "plate", scale: 0.0042, uncertaintyFraction: sigma },
      { source: "body_3d", scale: 0.00347, uncertaintyFraction: 0.2 },
      { source: "depth", scale: 0.00319, uncertaintyFraction: 0.2 },
    ]);
    const plate = v.weights.find((w) => w.source === "plate")!;
    expect(plate.weightPct).toBeGreaterThan(80);
    expect(v.scale!).toBeGreaterThan(0.0040);
  });

  it("does not weaken the step-out: a grossly wrong plate still leaves the vote", () => {
    // Build 653's fix. Raising the plate's sigma raises nothing about agreement (the tolerance is
    // the LOOSER ruler's, and a body ruler's 0.2 still dominates), so a plate 2.5x away from two
    // agreeing body rulers must still step out. Pendlay Row set 2's real candidates.
    const sigma = Math.hypot(CASTING_ONLY, COREML_BOX_LONG_EDGE_UNCERTAINTY);
    const v = reconcileScaleEstimates([
      { source: "plate", scale: 0.00139042, uncertaintyFraction: sigma },
      { source: "body_3d", scale: 0.00342228, uncertaintyFraction: 0.2 },
      { source: "depth", scale: 0.00352992, uncertaintyFraction: 0.2 },
    ]);
    expect(v.agreedSources).not.toContain("plate");
    expect(v.scale!).toBeGreaterThan(0.003);
  });
});
