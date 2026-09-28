import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyGravityCorrection, bestEffortJump, summarizeJumpSet, type JumpRep } from "./jump-tracking";
import type { TrackedPoint } from "./pose-tracking";

// RULE #1 FOR THE JUMP. Scott, 2026-09-28, after build 553 reported "Couldn't get a clean read"
// on a box jump: "Same rejected my jump which is the one thing I told you shouldn't happen."

function trace(ys: number[], dtMs = 33): TrackedPoint[] {
  return ys.map((y, i) => ({ t: i * dtMs, x: 0, y, z: 0, confidence: 0.9 }));
}

describe("a jump the state machine cannot vouch for is still reported", () => {
  it("returns the best-effort read instead of null when no rep settles", () => {
    // The ankle rises 40cm and the clip ends before it comes down -- Stop was tapped mid-air,
    // so there is no landing for the state machine to settle on.
    const ys = [
      ...Array(20).fill(0),
      ...Array.from({ length: 8 }, (_, i) => -0.4 * Math.sin(((i + 1) / 16) * Math.PI)),
    ];
    const metrics = summarizeJumpSet(trace(ys), 75, 35, null, 0.033);
    expect(metrics).not.toBeNull();
    expect(metrics!.bestEffort).toBe(true);
    expect(metrics!.repBreakdown).toHaveLength(1);
    expect(metrics!.repBreakdown[0].bestEffort).toBe(true);
    expect(metrics!.bestJumpHeightCm).toBeGreaterThan(0);
  });

  it("measures the best effort from standing height to the peak", () => {
    const ys = [...Array(10).fill(0.5), 0.4, 0.2, 0.1, 0.2, 0.4, ...Array(10).fill(0.5)];
    const rep = bestEffortJump(trace(ys), ys, 0.05, 5);
    expect(rep).not.toBeNull();
    expect(rep!.peakHeightCm).toBeCloseTo(40, 0);
    expect(rep!.likelyTrackingGlitch).toBe(true);
  });

  it("the dialog tells the athlete it is a best-effort read, and never the refusal", () => {
    const dialog = readFileSync(join(process.cwd(), "client/src/components/av-jump-tracker-dialog.tsx"), "utf8");
    expect(dialog).toMatch(/metrics\?\.bestEffort/);
    expect(dialog).toMatch(/usesBox: usesBox === true/);
  });
});

describe("the gravity ruler corrects the scale it measured", () => {
  const rep = (): JumpRep => ({
    repNumber: 1,
    flightSeconds: 0.5,
    netRiseCm: 0,
    jumpHeightCm: 44.6,
    peakHeightCm: 44.6,
    horizontalDistanceCm: 20,
    groundContactSeconds: null,
    likelyTrackingGlitch: false,
    takeoffT: 0,
    landingT: 500,
    boxClearanceCm: 10,
  });

  it("divides the scaled numbers by the ratio and rebuilds height from flight time", () => {
    const reps = [rep()];
    const applied = applyGravityCorrection(reps, { scaleErrorRatio: 1.453, uncertaintyFraction: 0.125, repsUsed: 1 });
    expect(applied).toBe(true);
    expect(reps[0].uncorrectedJumpHeightCm).toBe(44.6);
    expect(reps[0].peakHeightCm).toBeCloseTo(30.7, 0);
    expect(reps[0].horizontalDistanceCm).toBeCloseTo(13.8, 0);
    // A flat half-second flight is g*t^2/8 = 30.7cm whatever the scale said.
    expect(reps[0].jumpHeightCm).toBeCloseTo(30.7, 0);
  });

  it("leaves a take alone when the ruler is not confident, or says the scale is right", () => {
    expect(applyGravityCorrection([rep()], { scaleErrorRatio: 1.45, uncertaintyFraction: 0.3, repsUsed: 1 })).toBe(false);
    expect(applyGravityCorrection([rep()], { scaleErrorRatio: 1.02, uncertaintyFraction: 0.1, repsUsed: 2 })).toBe(false);
    expect(applyGravityCorrection([rep()], null)).toBe(false);
  });
});

describe("a box jump's contact time is a reset, not a reactive contact", () => {
  it("withholds the set-level contact and RSI on a box jump and keeps the per-rep times", () => {
    const flat = (n: number) => Array(n).fill(0);
    const hop = Array.from({ length: 12 }, (_, i) => -0.35 * Math.sin((i / 12) * Math.PI));
    const ys = [...flat(20), ...hop, ...flat(60), ...hop, ...flat(20)];
    const withBox = summarizeJumpSet(trace(ys), 75, 35, null, 0.033, undefined, { usesBox: true });
    const without = summarizeJumpSet(trace(ys), 75, 35, null, 0.033, undefined, { usesBox: false });
    expect(without?.repBreakdown.length).toBeGreaterThanOrEqual(2);
    expect(without?.avgGroundContactSeconds).not.toBeNull();
    expect(withBox?.groundContactIsBoxReset).toBe(true);
    expect(withBox?.avgGroundContactSeconds).toBeNull();
    expect(withBox?.reactiveStrengthIndex).toBeNull();
    expect(withBox?.repBreakdown[1].groundContactSeconds).not.toBeNull();
  });
});
