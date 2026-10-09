import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { trackingDiagnosticsSchema } from "@shared/schema";

/* "IT SHOULD STILL BE RELYING ON THE BARBELL, WHICH CAN GET AN ACCURATE FRAME ALMOST EVERYTIME."
 *
 * Scott, 2026-10-09, and he is right: Rule #4 says the object is the only ruler in the scene
 * whose real size is KNOWN, and body rulers agree with each other by construction. The barbell
 * IS in frame on nearly every take -- the implement was found on 438, 135 and 431 frames of that
 * day's three lifts. What fails is not finding it, it is SIZING it.
 *
 * `plateScaleIfAdmitted` (build 633) could only ever say so beside a sensor, because it reports a
 * scale and judging a scale needs a truth to divide by. Three sessions of it were therefore
 * readable on exactly the days Scott filmed next to the OVR, and silent on every other take.
 *
 * This file pins the version of that question which needs no sensor: a bumper plate is 0.45m and
 * the take blended its own metres per pixel, so a plate HERE would box 0.45/scaleFactor pixels.
 * On 2026-10-09 that read 2.09 / 2.81 / 6.73 on press / row / bench -- the detector boxing
 * something two to seven times a plate's size, which is why every plate was refused and the
 * scale fell to body rulers on all three. It is the number that will say whether retraining the
 * CoreML model fixed it, on every take, forever.
 *
 * Both fields here RECORD and gate nothing (Rule #1).
 */
const ROOT = join(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const DIALOG = "client/src/components/av-bar-tracker-dialog.tsx";

/** The smallest payload the schema accepts, so a parse here fails for the field under test and
 *  not for an unrelated required sibling. Mirrors the required set in
 *  shared/tracking-diagnostics-roundtrip.test.ts, which covers the whole shape. */
const envelope = (calibration: Record<string, unknown>) => ({
  outcome: "tracked" as const,
  bodyPose: { framesTotal: 10, framesWithBody: 10, avgWristConfidence: 0.5 },
  objectDetection: {
    framesWithLeftImplement: 1,
    framesWithRightImplement: 1,
    avgImplementConfidence: 0.5,
    framesWithCoreMlImplement: 1,
    avgCoreMlConfidence: 0.5,
    coreMlSizeCheck: null,
    sourceAgreement: null,
  },
  calibration: {
    noseToAnkleFrames: 0,
    shoulderToAnkleFrames: 0,
    unresolvedFrames: 0,
    ...calibration,
  },
});

describe("the plate box, judged against the take's own scale", () => {
  const src = read(DIALOG);

  it("divides by the SAME plate size the plate ruler itself uses", () => {
    // The whole point of the measure is to grade the ruler. If the two divide by different
    // plates, the diagnostic silently grades it against the wrong one and reads as a detector
    // fault when it is an arithmetic one. One constant, derived from CALIBRATION_REFERENCES.
    expect(src).toContain("export const PLATE_NOMINAL_SIZE_M = PLATE_REFERENCE.nominalSizeM");
    expect(src).toContain("const reference = PLATE_REFERENCE;");
    // And no second hand-typed 0.45 anywhere near the gate, which is how the two would drift.
    const gateBlock = src.slice(src.indexOf("plateBoxToExpectedRatio"));
    expect(gateBlock.slice(0, 1200)).not.toMatch(/0\.45\s*\//);
  });

  it("computes the ratio from the blended scale, not from a sensor", () => {
    const at = src.indexOf("objectGateDiagnostics.expectedPlateLongEdgePx");
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at - 500, at + 500);
    expect(block).toContain("PLATE_NOMINAL_SIZE_M / scaleFactor");
    expect(block).toContain("plateScaleRaw.measured / expectedPx");
  });

  it("is null rather than zero when the take never resolved a scale", () => {
    // A take with no scale has nothing to divide by. Zero would read as a box of no size, or
    // worse as a perfect ratio, on exactly the refused takes whose record matters most.
    const at = src.indexOf("objectGateDiagnostics.expectedPlateLongEdgePx");
    const guard = src.slice(at - 300, at);
    expect(guard).toMatch(/scaleFactor != null && scaleFactor > 0/);
    expect(guard).toContain("plateScaleRaw?.measured != null");
  });

  it("gates nothing: the plate's admission is still decided by the old reasons alone", () => {
    // `plateScale` is what the scale blend may use, and it must still be decided by
    // plateRejectedReasons and nothing this diagnostic computes.
    expect(src).toContain("const plateScale = plateRejectedReasons.length > 0 ? null : plateScaleRaw;");
    const decide = src.slice(src.indexOf("const plateScale ="), src.indexOf("const plateScale =") + 200);
    expect(decide).not.toContain("plateBoxToExpectedRatio");
    // And the ratio is only ever assigned, never branched on.
    expect(src).not.toMatch(/if\s*\([^)]*plateBoxToExpectedRatio/);
  });

  it("is declared in the zod schema, which strips what it does not declare", () => {
    const parsed = trackingDiagnosticsSchema.parse(envelope({
      objectGate: {
        gripAcrossBodyFraction: 0.954,
        plateScaleIfAdmitted: 0.00143537,
        rejectedReasons: ["aspect_ratio"],
        appliedCorrection: false,
        plateBoxLongEdgePx: 313.5,
        expectedPlateLongEdgePx: 111.5,
        plateBoxToExpectedRatio: 2.812,
      },
    }) as never) as { calibration?: { objectGate?: Record<string, unknown> } };
    const gate = parsed.calibration?.objectGate;
    // The real 2026-10-09 Pendlay Row numbers. This has bitten twice: a field the client sends
    // and the schema does not declare vanishes on insert with no error anywhere.
    expect(gate?.plateBoxLongEdgePx).toBe(313.5);
    expect(gate?.expectedPlateLongEdgePx).toBe(111.5);
    expect(gate?.plateBoxToExpectedRatio).toBe(2.812);
  });

  it("still parses a capture stored before the field existed", () => {
    const parsed = trackingDiagnosticsSchema.parse(envelope({
      objectGate: {
        gripAcrossBodyFraction: 0.947,
        plateScaleIfAdmitted: null,
        rejectedReasons: [],
        appliedCorrection: false,
      },
    }) as never) as { calibration?: { objectGate?: Record<string, unknown> } };
    expect(parsed.calibration?.objectGate?.gripAcrossBodyFraction).toBe(0.947);
  });
});

describe("the shoulder ruler's grip ratio", () => {
  const src = read(DIALOG);

  it("is recorded from the same frames the ruler used", () => {
    const at = src.indexOf("gripToShoulderSpanRatio:");
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, at + 400);
    expect(block).toContain("gripWidthPx / shoulderScale.medianSpanUnits");
  });

  it("NOTHING READS IT -- three takes is not a fit, and they had a confound", () => {
    // Each of the three 2026-10-09 takes was a different lift, so each had a genuinely
    // different grip; the ordering was perfect (1.47/+1.4%, 2.06/+49%, 2.91/+62%) and three
    // confounded points still cannot choose an uncertainty. The day this starts weighting the
    // blend is the day it needs its own evidence, and this assertion is what makes somebody
    // bring it.
    const uses = src.split("gripToShoulderSpanRatio").length - 1;
    expect(uses, "assigned once, read nowhere").toBe(1);
    expect(src).not.toMatch(/uncertainty[^\n]*gripToShoulderSpanRatio/i);
  });

  it("is null rather than a divide-by-zero when either span is missing", () => {
    const at = src.indexOf("gripToShoulderSpanRatio:");
    const block = src.slice(at, at + 400);
    expect(block).toContain("gripWidthPx != null && gripWidthPx > 0");
    expect(block).toContain("shoulderScale.medianSpanUnits > 0");
  });

  it("is declared in the zod schema beside spanSpreadFraction", () => {
    const parsed = trackingDiagnosticsSchema.parse(envelope({
      shoulderRuler: {
        scale: 0.006541,
        uncertaintyFraction: 0.2,
        medianSpanUnits: 66.98,
        framesUsed: 262,
        framesRejectedForAngle: 0,
        rejectedBecause: null,
        spanSpreadFraction: 0.106,
        gripToShoulderSpanRatio: 2.91,
      },
    }) as never) as { calibration?: { shoulderRuler?: Record<string, unknown> } };
    expect(parsed.calibration?.shoulderRuler?.gripToShoulderSpanRatio).toBe(2.91);
    // And spanSpreadFraction survives beside it: they measure different things, and the press
    // proved on 2026-10-09 that the spread does not predict this error (tightest spread, 0.042,
    // second-worst error, +49%).
    expect(parsed.calibration?.shoulderRuler?.spanSpreadFraction).toBe(0.106);
  });
});
