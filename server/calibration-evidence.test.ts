import { describe, it, expect } from "vitest";
import {
  summariseCalibrationEvidence,
  type CalibrationEvidenceRow,
} from "./calibration-evidence";

const take = (over: Partial<CalibrationEvidenceRow> & { diag?: any } = {}): CalibrationEvidenceRow => ({
  exerciseName: "Bench Press",
  meanVelocityMps: 0.7,
  concentricSeconds: 0.5,
  romCm: 35,
  trackingDiagnostics: over.diag ?? null,
  ...over,
});

describe("what the fleet says about our own guesses", () => {
  it("measures a take against its own arithmetic, with no sensor anywhere", () => {
    // 0.7 m/s over 0.5s is 35cm, and range of motion is 35cm. That take agrees with itself.
    const e = summariseCalibrationEvidence([take()]);
    expect(e.selfContradiction.median).toBeCloseTo(1, 2);
    expect(e.selfContradiction.takesOutsideBand).toBe(0);
  });

  it("counts a take that contradicts itself", () => {
    // Scott's 2026-09-23 set 3: 0.46 m/s over 1.33s is 61cm, reported ROM 48.8cm.
    const e = summariseCalibrationEvidence([
      take({ meanVelocityMps: 0.46, concentricSeconds: 1.33, romCm: 48.8 }),
    ]);
    expect(e.selfContradiction.median).toBeCloseTo(1.25, 2);
    expect(e.selfContradiction.takesOutsideBand).toBe(1);
  });

  it("reports a DISTRIBUTION, so one catastrophic take cannot speak for the fleet", () => {
    const rows = [
      ...Array.from({ length: 20 }, () => take()),
      take({ meanVelocityMps: 9, concentricSeconds: 9, romCm: 1 }),
    ];
    const e = summariseCalibrationEvidence(rows);
    // A mean would be dragged into the hundreds by that one row.
    expect(e.selfContradiction.median).toBeCloseTo(1, 2);
    expect(e.selfContradiction.takesOutsideBand).toBe(1);
  });

  it("separates how far the point WALKED from how far it went", () => {
    const e = summariseCalibrationEvidence([
      take({ diag: { calibration: { tracePathCm: 1616, traceDisplacementCm: 720 } } }),
    ]);
    expect(e.wander.median).toBeCloseTo(2.244, 2);
  });

  it("tallies which ruler decided, and which was the odd one out", () => {
    const e = summariseCalibrationEvidence([
      take({
        diag: {
          calibration: {
            scaleSource: "shoulder_width",
            scaleOutliers: [{ source: "plate", ratioToChosen: 4.2 }],
          },
        },
      }),
      take({
        diag: {
          calibration: {
            scaleSource: "shoulder_width",
            scaleOutliers: [{ source: "plate", ratioToChosen: 3.8 }],
          },
        },
      }),
    ]);
    const shoulder = e.scaleSources.find((s) => s.source === "shoulder_width")!;
    const plate = e.scaleSources.find((s) => s.source === "plate")!;
    expect(shoulder.chosen).toBe(2);
    expect(plate.chosen).toBe(0);
    expect(plate.outlier).toBe(2);
    expect(plate.ratioWhenOutlier.median).toBeCloseTo(4.2, 1);
  });

  it("treats 'both' as corroboration rather than inventing a fourth ruler", () => {
    // "both" is the reconciliation saying two sources agreed. Counting it as a source would put
    // a phantom entry in the table that nothing implements.
    const e = summariseCalibrationEvidence([take({ diag: { calibration: { scaleSource: "both" } } })]);
    expect(e.scaleSources.find((s) => s.source === "both")).toBeUndefined();
    expect(e.corroboratedTakes).toBe(1);
    expect(e.takesWithAnyScale).toBe(1);
  });

  it("claims nothing from takes that carry nothing", () => {
    const e = summariseCalibrationEvidence([
      { exerciseName: null, trackingDiagnostics: null, meanVelocityMps: null, concentricSeconds: null, romCm: null },
    ]);
    expect(e.takesConsidered).toBe(1);
    expect(e.selfContradiction.median).toBeNull();
    expect(e.wander.median).toBeNull();
    expect(e.scaleSources).toEqual([]);
  });

  it("ignores a zero range of motion rather than dividing by it", () => {
    const e = summariseCalibrationEvidence([take({ romCm: 0 })]);
    expect(e.selfContradiction.samples).toBe(0);
  });
});
