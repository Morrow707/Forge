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
    // Ranked ahead of the 16:9 choice, not merely available -- and ahead of the 16:9 choice at
    // ANY rate. See "shape before rate" below.
    expect(plugin).toMatch(/fastChoice \?\? fourThreeAtSixty \?\? bestFormat\(exact\)/);
  });

  it("does not trade resolution away to get there", () => {
    // A device with an odd format list must not hand back a 640x480 that happens to be 4:3.
    const filter = plugin.slice(plugin.indexOf("let fourThree = device.formats.filter"));
    expect(filter.slice(0, 200)).toContain("dims(f).height >= targetHeight");
    expect(filter.slice(0, 200)).toContain("canRun60(f)");
  });

  it("still falls back to what every earlier build used", () => {
    // Aspect is a preference. A device that cannot hold 60fps at 4:3 keeps the 16:9 path.
    // Whitespace-tolerant: the chain is the invariant, not how it happens to wrap.
    expect(plugin).toMatch(
      /bestFormat\(exact\)\s*\?\?\s*largest\(underBudget\)\s*\?\?\s*largest\(anySixty\)/,
    );
  });

  it("ranks RATE first, and keeps the 4:3 shape at 120 through a binned readout when that is the only way", () => {
    // Scott, 2026-09-29, two previews side by side: "Fix the ratio on the camera. Ours is
    // obviously the more zoomed in one." The phone publishes no clean 120fps format at 4:3,
    // and `bestFormat(fourThreeFast) ?? bestFormat(exactFast)` walked straight past every 4:3
    // format to a 16:9 one at 120 -- "16:9 fallback" on every take since 120 was asked for,
    // a third less picture down each side in portrait. The 4:3 preference was written to be
    // preferred-never-required; the high-rate preference has to rank under it.
    // Scott, same day, after one set at 4:3-and-60: "keeping the fps higher is better ... We
    // should go back." Clean 4:3 at 120, then BINNED 4:3 at 120 (a softer readout is thinning,
    // not cutting), then the 16:9 crop at 120, and only then 4:3 at 60.
    expect(plugin).toContain("let fastChoice = bestFormat(fourThreeFast) ?? bestFormat(fourThreeFastBinned) ?? bestFormat(exactFast)");
    expect(plugin).toContain("let fourThreeAtSixty = bestFormat(fourThree)");
    expect(plugin).toContain("let fourThreeFastBinned = fourThree.filter { isHighRateWithFocus($0) && !isAcceptableHighRate($0) }");
    // Still preferred, never required: a device with no high-rate format at all falls through
    // to exactly the 60fps selection it used before.
    expect(plugin).toMatch(/fastChoice \?\? fourThreeAtSixty \?\? bestFormat\(exact\)/);
    // The fast candidates are the SAME shape filters with eligibility on top, so asking for
    // 120 can only pick between formats that were already acceptable.
    expect(plugin).toContain("let fourThreeFast = fourThree.filter(isAcceptableHighRate)");
    expect(plugin).toContain("let exactFast = exact.filter(isAcceptableHighRate)");
  });

  it("refuses the formats that reach a high rate by degrading the frame", () => {
    // Binned readout and a non-converging autofocus are what the plugin comment has always
    // warned about, and they cost landmark precision -- which is what the OVR comparison
    // showed to be short, so buying rate with precision would be the wrong trade.
    const fn = plugin.slice(plugin.indexOf("func isAcceptableHighRate"));
    expect(fn.slice(0, 500)).toContain("format.isVideoBinned");
    expect(fn.slice(0, 500)).toContain("format.autoFocusSystem == .none");
    // A format whose range tops out above the ceiling is a slow-motion format even when the
    // rate we want sits inside it.
    expect(fn.slice(0, 500)).toContain("maxAcceptableFrameRate");
    expect(plugin).toMatch(/maxAcceptableFrameRate: Double = 120/);
  });

  it("does not let a higher capture rate become a longer wait", () => {
    // THE FIRST VERSION OF THIS GOT IT WRONG AND SHIPPED. It only supplied a DEFAULT stride,
    // and the app passes an explicit one (ANALYSIS_SAMPLE_STRIDE = 2), so the default never
    // fired: at 120fps that 2 became 60Hz, double the Vision work it had always done, and a
    // 25.6s clip went from ~19s of analysis to 66s on a real phone.
    //
    // The caller's number means a RATE -- its own comment says "30fps-equivalent on a 60fps
    // recording" -- so it is scaled against that baseline rather than used as a frame count.
    //
    // It now lives in one helper rather than inline, because the live path (Phase 5b) has to
    // arrive at the SAME number -- two feeders sampling different frames are two different
    // measurements, and the native side refuses a live trace whose stride does not match.
    expect(plugin).toContain("private func effectiveSampleStride(baseline: Int) -> Int");
    expect(plugin).toContain("let rateRatio = max(1.0, activeCaptureFrameRate / 60.0)");
    expect(plugin).toContain("Double(max(1, baseline)) * rateRatio");
  });

  it("reports the rate it actually got, not the one it wanted", () => {
    expect(plugin).toContain("let highRate = fastChoice != nil");
    expect(plugin).toContain("let chosenRate = highRate ? preferredFrameRate : targetFrameRate");
    expect(plugin).toContain("CMTimeScale(chosenRate)");
  });

  it("says which shape it ended up with", () => {
    // The complaint was unanswerable for two builds for want of exactly this line.
    expect(plugin).toContain("matches Camera app");
    expect(plugin).toContain("16:9 fallback");
  });
});
