import { describe, it, expect } from "vitest";
import { trackingDiagnosticsSchema } from "./schema";

/**
 * A DIAGNOSTICS LABEL IS NEVER THE REASON A SET DOES NOT SAVE.
 *
 * Build 569, first bench set, 2026-09-29: the 3D ruler's candidate label grew to
 * "body_3d:shoulderWidth:reference_corrected:longest_projection" (62 characters), the schema
 * capped `source` at 40, the insert answered 400, the client filed it as permanent, and the set
 * -- ten reps counted right for the first time -- was lost. This parses the longest label every
 * ruler can produce through the real schema, so the next longer one fails here and not on a
 * phone.
 */
const calibrationSchema = trackingDiagnosticsSchema.shape.calibration;

const LONGEST_LABELS = [
  "body_3d:shoulderWidth:reference_uncorrected:longest_projection",
  "body_3d:shoulderWidth:reference_corrected:in_plane",
  "shoulder_width",
  "grip_width",
  "body_model",
  "plate",
  "height",
];

describe("every scale-source label the client can produce survives the schema", () => {
  it.each(LONGEST_LABELS)("%s", (source) => {
    const parsed = calibrationSchema.safeParse({
        scaleFactor: 0.002,
        scaleSource: "body_3d",
        scaleCandidates: [{ source, scale: 0.002, measured: 0.5, samples: 30 }],
        scaleOutliers: [{ source, ratioToChosen: 1.5 }],
        scalesRejectedAsImplausible: [{ source, impliedHeightIn: 33.3 }],
        noseToAnkleFrames: 0,
        shoulderToAnkleFrames: 0,
        unresolvedFrames: 0,
    });
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
  });
});
