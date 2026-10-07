import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// THE COACH'S COPY RAN AT 6FPS FOR AS LONG AS IT HAS EXISTED, AND NOTHING COULD SEE IT.
//
// AvUploadCopyWriter kept one DELIVERED frame in `stride`, with stride = round(captureRate / 30)
// -- 4 at 120fps. That arithmetic is only right if the delegate receives all 120, and it does
// not: AVCaptureVideoDataOutput discards a frame that arrives while liveAnalysisQueue is busy
// with Vision, which is exactly what liveDropRate near 3.0 has been recording (90 of every 120
// dropped as late, so didOutput fires about 30 times a second). The stride landed twice and the
// saved clip ran at 6.0fps -- measured 2026-10-07 off a screen recording of the real player,
// where 75% of the frames in the video region were pixel-identical to the one before.
//
// There is no Swift test target, so this is a source scan, the same shape as
// tracker-arbiter.test.ts's check on the ported constants. It pins the two things that would
// bring the bug back: a cadence keyed on a COUNT of callbacks, and a divisor taken from the
// camera's nominal rate.
const SWIFT = readFileSync(
  join(process.cwd(), "ios/App/App/AvBodyTrackingPlugin.swift"),
  "utf8",
);

function uploadWriterSource(): string {
  const start = SWIFT.indexOf("private final class AvUploadCopyWriter");
  expect(start, "AvUploadCopyWriter has been renamed").toBeGreaterThan(-1);
  const end = SWIFT.indexOf("\nprivate final class ", start + 1);
  return SWIFT.slice(start, end === -1 ? undefined : end);
}

describe("the coach's copy is sampled on time, not on a count of callbacks", () => {
  it("takes a target frame rate, never a stride", () => {
    const writer = uploadWriterSource();
    expect(writer).toContain("init(url: URL, targetFrameRate: Double");
    // The exact shape of the old bug: an integer divisor applied to a delivered-frame counter.
    expect(writer).not.toMatch(/index % stride/);
    expect(writer).not.toMatch(/private let stride: Int/);
  });

  it("decides on the presentation timestamp, with the analysis path's own slack", () => {
    const writer = uploadWriterSource();
    expect(writer).toContain("CMSampleBufferGetPresentationTimeStamp");
    expect(writer).toContain("targetInterval * 0.75");
    // The cadence must be compared against the LAST KEPT frame's time. Comparing against the
    // previous delivered frame would keep every frame on a feed slower than the target.
    expect(writer).toMatch(/lastKeptSeconds.*seconds - last < targetInterval/s);
  });

  it("never derives the cadence from the camera's nominal capture rate", () => {
    // copyStride = max(1, Int((activeCaptureFrameRate / 30.0).rounded())) was the bug.
    expect(SWIFT).not.toMatch(/activeCaptureFrameRate \/ 30/);
    expect(SWIFT).toContain("uploadCopyTargetFrameRate: Double = 30");
  });

  it("counts both ways a frame can be lost, and reports them", () => {
    const writer = uploadWriterSource();
    // Off-cadence is intended; not-ready is the encoder refusing and is the one that was
    // invisible. Both are counted, neither is acted on.
    expect(writer).toContain("skippedForCadence");
    expect(writer).toContain("skippedNotReady");
    expect(writer).toContain("measuredFrameRate");
    expect(writer).toContain("framesDelivered");
  });

  it("still falls back rather than failing the take (Rule #1)", () => {
    const writer = uploadWriterSource();
    // A copy that cannot be made finishes with nil and compressForUpload runs instead. Nothing
    // in this class may reject a take.
    expect(writer).toContain("the export runs instead");
    expect(writer).not.toMatch(/\breject\(/);
  });
});

describe("the saved clip's telemetry reaches the export", () => {
  it("is emitted on both analysis paths", () => {
    // A take that fell back to the file read still wrote a copy, and that is exactly the take
    // whose video is worth asking about.
    const emissions = SWIFT.match(/result\["videoAsset"\]/g) ?? [];
    expect(emissions.length).toBe(2);
  });

  it("is declared in the zod schema, which strips what it does not declare", () => {
    const schema = readFileSync(join(process.cwd(), "shared/schema.ts"), "utf8");
    expect(schema).toMatch(/videoAsset: z\s*\n?\s*\.object\(\{/);
    for (const field of [
      "framesDelivered",
      "framesAppended",
      "skippedForCadence",
      "skippedNotReady",
      "targetFrameRate",
      "measuredFrameRate",
      "largestGapSeconds",
      "spanSeconds",
    ]) {
      expect(schema, `videoAsset.${field} is not declared`).toContain(`${field}: z.number().optional()`);
    }
  });
});
