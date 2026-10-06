// A RULER THAT REFUSED IS STILL A RULER THAT HAS SOMETHING TO SAY.
//
// 2026-10-06, the second session on build 629. Three takes across two days had the shoulder ruler
// simply ABSENT from `scaleCandidates` -- body_3d standing alone at 100% of the blend -- and all
// three read 34-43% LOW against the OVR sensor (bench -43%, bench -39%, Pendlay row -34%), while
// every take with two or more witnesses landed inside 8%. That is Rule #4 measured on real sets:
// "a number corroborated by one system is not a trusted number, it is an assertion."
//
// And the export could not say why the second witness was missing. `ShoulderScaleReading` has
// carried `rejectedBecause`, `framesRejectedForAngle` and the span it measured since it was
// written, and NONE of it ever reached the export: a refused ruler contributed nothing at all,
// not even a reason. The same rule the capture-diagnostics section states for a whole take
// applies to a ruler inside one -- the reading whose record matters most is the one that failed.
import { describe, expect, it } from "vitest";

import { bodyScaleFallbacks } from "./body-scale-fallback";

describe("the export says why a ruler refused", () => {
  it("returns a shoulder ruler block even when nothing could be measured", () => {
    // No frames at all: the ruler has no scale and every field still arrives.
    const out = bodyScaleFallbacks([], [], 70, "lying");
    expect(out.shoulderRuler).toBeDefined();
    expect(out.shoulderRuler.scale).toBeNull();
    expect(out.shoulderRuler).toHaveProperty("rejectedBecause");
    expect(out.shoulderRuler).toHaveProperty("framesRejectedForAngle");
    expect(out.shoulderRuler).toHaveProperty("framesUsed");
    expect(out.shoulderRuler).toHaveProperty("medianSpanUnits");
    expect(out.shoulderRuler).toHaveProperty("spanSpreadFraction");
    // And it carries its uncertainty, so a refit can be argued from the export alone.
    expect(out.shoulderRuler.uncertaintyFraction).toBeGreaterThan(0);
  });

  it("is reported separately from the vote, so an absent candidate still has a record", () => {
    // The candidate list is what the blend reads; the ruler block is what the report reads. A
    // ruler that refused leaves the first empty and the second populated, which is exactly the
    // state that was invisible before.
    const out = bodyScaleFallbacks([], [], 70, "lying");
    expect(out.candidates.some((c) => c.source === "shoulder_width")).toBe(false);
    expect(out.shoulderRuler).not.toBeNull();
  });

  it("declares every field in the zod schema, or the insert drops them silently", async () => {
    // A zod object strips what it does not declare, with no error anywhere. This has bitten
    // twice: three takes were filmed specifically to read scale diagnostics the insert had
    // already dropped. The fields are checked against the schema rather than trusted.
    const { trackingDiagnosticsSchema } = await import("@shared/schema");
    const parsed = trackingDiagnosticsSchema.parse({
      outcome: "tracked",
      bodyPose: { framesWithPose: 0, framesTotal: 0, framesWithBody: 0 },
      objectDetection: { framesWithObject: 0, framesTotal: 0, framesWithLeftImplement: 0, framesWithRightImplement: 0 },
      calibration: {
        noseToAnkleFrames: 0,
        shoulderToAnkleFrames: 0,
        unresolvedFrames: 0,
        scaleSource: "body_3d",
        scaleCandidates: [],
        scaleOutliers: [],
        scaleCorroborated: false,
        shoulderRuler: {
          scale: null,
          uncertaintyFraction: 0.2,
          medianSpanUnits: null,
          framesUsed: 0,
          framesRejectedForAngle: 12,
          rejectedBecause: "shoulders_turned_away",
          spanSpreadFraction: null,
        },
        scaleWitnesses: { votingCount: 1, sources: ["body_3d"] },
      },
    } as never) as { calibration: { shoulderRuler: unknown; scaleWitnesses: unknown } };
    expect(parsed.calibration.shoulderRuler).toMatchObject({
      rejectedBecause: "shoulders_turned_away",
      framesRejectedForAngle: 12,
    });
    expect(parsed.calibration.scaleWitnesses).toMatchObject({ votingCount: 1 });
  });
});
