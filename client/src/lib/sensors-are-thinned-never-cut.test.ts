import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// CLAUDE.md RULE #2: a camera sensor is thinned, never switched off, and analysis time is cut
// by speeding up, never by cutting. Both sensors were switched off on 2026-09-28 and reversed
// the same day; this keeps the reversal.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("sensors are thinned, never cut", () => {
  it("no tracker dialog switches a sensor off", () => {
    for (const f of ["client/src/components/av-bar-tracker-dialog.tsx", "client/src/components/av-jump-tracker-dialog.tsx"]) {
      const src = read(f);
      expect(src).not.toMatch(/body3D:\s*false/);
      expect(src).not.toMatch(/handPose:\s*false/);
      expect(src).toMatch(/body3DStride:\s*\d+/);
      expect(src).toMatch(/handPoseStride:\s*\d+/);
    }
  });

  it("the native context takes strides, not switches, and runs each sensor on its stride", () => {
    const swift = read("ios/App/App/AvBodyTrackingPlugin.swift");
    expect(swift).toMatch(/body3DStride: Int = 9/);
    expect(swift).toMatch(/handPoseStride: Int = 1/);
    expect(swift).not.toMatch(/call\.getBool\("body3D"\)/);
    expect(swift).not.toMatch(/call\.getBool\("handPose"\)/);
    expect(swift).toMatch(/strideIndex % ctx\.handPoseStride == 0/);
    // The strides are in delivered frames on BOTH feeders: the live path's processed-frame index
    // is scaled back up by the sample stride before a sensor's stride reads it (2026-10-02, the
    // row that went live ran the 3D pose once every four seconds instead of once a second).
    expect(swift).toMatch(/let strideIndex = bypassStrideGuard \? thisFrameIndex \* ctx\.sampleEveryNthFrame : thisFrameIndex/);
    expect(swift).toMatch(/strideIndex % ctx\.body3DDetectionStride == 0/);
  });

  it("the live path scales the frame before any sensor sees it, and the detector re-searches on a cadence", () => {
    const swift = read("ios/App/App/AvBodyTrackingPlugin.swift");
    const delegate = swift.slice(swift.indexOf("didOutput sampleBuffer: CMSampleBuffer"));
    expect(delegate.slice(0, 3000)).toMatch(/liveFrameScaler\.scale\(/);
    expect(delegate.slice(0, 3000)).toMatch(/pixelBufferOverride: scaled/);
    expect(swift).toMatch(/private final class AvLiveFrameScaler/);
    expect(swift).toMatch(/searchesSkippedForCadence \+= 1/);
  });
});
