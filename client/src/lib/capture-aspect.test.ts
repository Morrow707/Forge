import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// THE PREVIEW LOOKED TIGHTER THAN THE CAMERA APP BECAUSE IT IS A DIFFERENT SHAPE.
//
// An iPhone's sensor is natively 4:3, which is what the stock Camera app shows in photo mode. A
// 1920x1080 video format is a 16:9 SLICE of that sensor: same lens, same nominal 1x, less
// picture -- the top and bottom are gone before zoom or field of view enter into it. Two rounds
// of field-of-view work did not close the gap because the gap was never field of view.
//
// It matters past appearance. Scale calibration measures nose to ankle (calibrateFromFrames),
// and a bar-path take framed to include the bar is exactly where a 16:9 crop takes off the head
// or the feet. Every implausible-scale refusal this pipeline has produced is that measurement
// failing, so the taller frame is aimed at the cause rather than at the complaint.
const plugin = readFileSync(
  join(__dirname, "..", "..", "..", "ios", "App", "App", "AvBodyTrackingPlugin.swift"),
  "utf8",
);

describe("the capture format", () => {
  it("prefers the sensor's own 4:3 shape", () => {
    expect(plugin).toMatch(/targetAspect: Double = 4\.0 \/ 3\.0/);
    // Ranked ahead of the 16:9 choice, not merely available.
    expect(plugin).toMatch(/bestFormat\(fourThree\) \?\? bestFormat\(exact\)/);
  });

  it("does not trade resolution away to get there", () => {
    // A device with an odd format list must not hand back a 640x480 that happens to be 4:3.
    const filter = plugin.slice(plugin.indexOf("let fourThree = device.formats.filter"));
    expect(filter.slice(0, 200)).toContain("dims(f).height >= targetHeight");
    expect(filter.slice(0, 200)).toContain("canRun60(f)");
  });

  it("still falls back to what every earlier build used", () => {
    // Aspect is a preference. A device that cannot hold 60fps at 4:3 keeps the 16:9 path.
    expect(plugin).toMatch(/bestFormat\(exact\) \?\? largest\(underBudget\) \?\? largest\(anySixty\)/);
  });

  it("says which shape it ended up with", () => {
    // The complaint was unanswerable for two builds for want of exactly this line.
    expect(plugin).toContain("matches Camera app");
    expect(plugin).toContain("16:9 fallback");
  });
});
