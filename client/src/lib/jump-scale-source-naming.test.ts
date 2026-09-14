import { describe, expect, it } from "vitest";
import { trackingDiagnosticsSchema } from "@shared/schema";

// A BOX IS NOT A PLATE, AND THE REPORT SAID IT WAS.
//
// The jump tracker borrows the "plate" slot for its known-size reference object, and renamed it
// to "box" in the candidate, outlier and rejected lists -- but not in `scaleSource`, the field
// the report's headline sentence is built from. A real box-jump take came back saying "plate was
// used because it is the most trustworthy of them" with no plate anywhere in frame, one line
// above a source list that called the same measurement "box".
//
// The rename alone is not enough: this enum is what the diagnostics are validated against on the
// way into the database, so a value it does not list is dropped on insert and the report falls
// back to "none" -- a different wrong answer, and a quieter one. Both halves are pinned here.
describe("jump scale source naming", () => {
  const calibration = (scaleSource: string) =>
    trackingDiagnosticsSchema.shape.calibration.safeParse({
      scaleFactor: 0.0028,
      scaleSource,
      scaleCandidates: [{ source: "box", scale: 0.0028 }],
      noseToAnkleFrames: 47,
      shoulderToAnkleFrames: 444,
      unresolvedFrames: 60,
    });

  it("accepts box as a scale source so it survives the insert", () => {
    const parsed = calibration("box");
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data?.scaleSource).toBe("box");
  });

  it("still accepts the barbell tracker's own sources", () => {
    for (const source of ["height", "plate", "both", "shoulder_width"]) {
      expect(calibration(source).success).toBe(true);
    }
  });

  it("rejects a source name nothing produces", () => {
    expect(calibration("furniture").success).toBe(false);
  });
});
