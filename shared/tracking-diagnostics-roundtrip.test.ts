import { describe, it, expect } from "vitest";
import { trackingDiagnosticsSchema } from "./schema";

/**
 * EVERY FIELD THE CLIENT SENDS HAS TO SURVIVE THE INSERT.
 *
 * A zod object strips what it does not declare. A field added to tracking-diagnostics.ts and
 * rendered by tracking-report.ts arrives as undefined unless it is also declared in the schema --
 * silently, with no error anywhere.
 *
 * That is not hypothetical. Three takes were filmed specifically to read the scale-source
 * diagnostics, on a build that captured every one of them, and the report showed nothing: the
 * insert had already dropped them. The camera work those takes were meant to answer went another
 * day without an answer.
 *
 * So this parses a payload carrying every field the client can produce and checks each one comes
 * out the other side. It fails the moment someone adds a field to one file and not the other,
 * which is the only moment anyone can still cheaply notice.
 */
const FULL_PAYLOAD = {
  outcome: "scale_free_only" as const,
  message: "Couldn't tell the reps apart in this one.",
  // Undeclared in the schema until it was found here: stripped on every insert, which turned a
  // take that had counted 31 reps into "tracking only found 0" on the report.
  scaleFree: {
    repCount: 31,
    concentricSeconds: 0.33,
    eccentricSeconds: 0.34,
    velocityLossPercent: 21.9,
    barPathDriftPercentOfRom: 12.4,
    reps: [
      {
        repNumber: 1,
        concentricSeconds: 0.33,
        eccentricSeconds: 0.34,
        timeToPeakVelocitySeconds: 0.26,
        relativePeakVelocity: 1.18,
        depthDeg: null,
      },
    ],
  },
  recording: {
    frameCount: 949,
    trackedFrameCount: 763,
    elapsedSeconds: 39.9,
    assetDurationSeconds: 31.6,
    readerStatus: "completed",
    readerErrorMessage: "none",
    visionFailureCount: 0,
    thermalState: "nominal",
    lowPowerModeEnabled: false,
    freeDiskSpaceBytes: 70_600_000_000,
    maxInterFrameGapSeconds: 0.04,
    boxTopNormalizedY: 0.443,
  },
  bodyPose: { framesTotal: 763, framesWithBody: 763, avgWristConfidence: 0.52 },
  objectDetection: {
    framesWithLeftImplement: 691,
    framesWithRightImplement: 549,
    avgImplementConfidence: 0.48,
    framesWithCoreMlImplement: 676,
    avgCoreMlConfidence: 0.47,
    coreMlSizeCheck: { framesChecked: 10, implausibleCount: 2 },
    sourceAgreement: {
      framesWithBoth: 1200,
      framesPoseOnly: 300,
      framesImplementOnly: 20,
      medianGapPx: 41.5,
      maxGapPx: 380.2,
    },
  },
  trace: {
    points: 705,
    repsFound: 10,
    framesUsable: 705,
    framesNoWristOrImplement: 0,
    framesVelocityRejected: 4,
    velocityRejections: 4,
    largestGapSeconds: 0.28,
  },
  calibration: {
    scaleFactor: 0.00525,
    scaleSource: "shoulder_width" as const,
    scaleCandidates: [{ source: "plate", scale: 0.000758, measured: 593.94, samples: 59 }],
    scaleOutliers: [{ source: "plate", ratioToChosen: 0.14 }],
    scaleCorroborated: false,
    gripWidthPx: 114.2,
    plateRejectedAgainstGrip: true,
    referenceObject: {
      label: "plate (secondary)",
      medianWidthPx: 593.94,
      medianHeightPx: 190.2,
      aspectRatio: 3.12,
      medianCenterXNorm: 0.18,
      medianCenterYNorm: 0.62,
      minConfidence: 0.41,
      maxConfidence: 0.66,
      samples: 59,
    },
    axisSource: "grip" as const,
    gripPairsUsed: 518,
    traceTravelAlongPx: 445,
    traceTravelAcrossPx: 120,
    traceTravelAlongCm: 184,
    traceTravelAcrossCm: 49.7,
    tracePointsDroppedOffAxis: 78,
    scalesRejectedAsImplausible: [{ source: "plate", impliedHeightIn: 19.3 }],
    noseToAnkleFrames: 53,
    shoulderToAnkleFrames: 4,
    supineFullLengthFrames: 0,
    unresolvedFrames: 706,
  },
};

/** Every leaf path in an object, as dotted strings, so a dropped nested field is caught too. */
function leafPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  if (Array.isArray(value)) return value.flatMap((v, i) => leafPaths(v, `${prefix}[${i}]`));
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("tracking diagnostics survive the trip into the database", () => {
  it("keeps every field the client can produce", () => {
    const parsed = trackingDiagnosticsSchema.parse(FULL_PAYLOAD);
    const sent = leafPaths(FULL_PAYLOAD).sort();
    const kept = leafPaths(parsed).sort();
    expect(kept).toEqual(sent);
  });

  // The check is only worth anything if it can actually see a field go missing.
  it("notices a field the schema does not declare", () => {
    const parsed = trackingDiagnosticsSchema.parse({
      ...FULL_PAYLOAD,
      somethingNobodyDeclared: { nested: 1 },
    });
    expect(leafPaths(parsed)).not.toContain("somethingNobodyDeclared.nested");
  });

  // The three fields added while chasing a bench press that reported nothing.
  it("keeps the ones added today, by name", () => {
    const parsed = trackingDiagnosticsSchema.parse(FULL_PAYLOAD) as typeof FULL_PAYLOAD;
    expect(parsed.objectDetection.sourceAgreement.medianGapPx).toBe(41.5);
    expect(parsed.trace.repsFound).toBe(10);
    expect(parsed.trace.framesVelocityRejected).toBe(4);
    expect(parsed.calibration.referenceObject.aspectRatio).toBe(3.12);
    expect(parsed.calibration.gripWidthPx).toBe(114.2);
    expect(parsed.calibration.plateRejectedAgainstGrip).toBe(true);
  });

  // The field this test was written a day too late to catch. Named on its own so a future edit
  // that drops it fails with the reason rather than a diff of two long path lists.
  it("keeps the scale-free summary, the one that was silently stripped", () => {
    const parsed = trackingDiagnosticsSchema.parse(FULL_PAYLOAD) as typeof FULL_PAYLOAD;
    expect(parsed.scaleFree.repCount).toBe(31);
    expect(parsed.scaleFree.reps[0].relativePeakVelocity).toBe(1.18);
  });
});
