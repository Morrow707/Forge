import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { barRidesOnShoulders } from "./bar-on-back";
import { applyBoxRiseCorrection, type JumpRep } from "./jump-tracking";

describe("the shoulders carry the bar on a back squat", () => {
  it("names the lifts where the bar rides on the shoulders, and not the ones where it does not", () => {
    expect(barRidesOnShoulders("Back Squat", "Barbell")).toBe(true);
    expect(barRidesOnShoulders("High-Bar Back Squat", "Barbell")).toBe(true);
    expect(barRidesOnShoulders("Good Morning", "Barbell")).toBe(true);
    expect(barRidesOnShoulders("Front Squat", "Barbell")).toBe(false);
    expect(barRidesOnShoulders("Overhead Squat", "Barbell")).toBe(false);
    expect(barRidesOnShoulders("Bench Press", "Barbell")).toBe(false);
    expect(barRidesOnShoulders("Back Squat", "Dumbbell")).toBe(false);
    expect(barRidesOnShoulders(null)).toBe(false);
  });

  it("the dialog substitutes the shoulder midpoint before the combined speed gate", () => {
    const dialog = readFileSync(join(process.cwd(), "client/src/components/av-bar-tracker-dialog.tsx"), "utf8");
    const sub = dialog.indexOf("if (barOnBack) {");
    const gate = dialog.indexOf("combinedRejectionEvents.push(t);");
    expect(sub).toBeGreaterThan(0);
    expect(sub).toBeLessThan(gate);
    expect(dialog).toMatch(/barPointFromShoulders\+\+/);
  });
});

describe("the box is a ruler", () => {
  const rep = (netRiseCm: number): JumpRep => ({
    repNumber: 1,
    flightSeconds: 0.4,
    netRiseCm,
    jumpHeightCm: 80,
    peakHeightCm: 90,
    horizontalDistanceCm: null,
    groundContactSeconds: null,
    likelyTrackingGlitch: false,
    takeoffT: 0,
    landingT: 400,
    boxClearanceCm: null,
  });

  it("corrects a set whose box reps rose 25% more than the box is tall", () => {
    // Build 555 set 3: 73-77cm of rise onto a 61cm box.
    const reps = [rep(77.1), rep(5.6), rep(77), rep(4.2), rep(73), rep(76.3)];
    const v = applyBoxRiseCorrection(reps, 60.96);
    expect(v?.applied).toBe(true);
    expect(v?.repsUsed).toBe(4);
    expect(v?.scaleErrorRatio).toBeCloseTo(1.26, 1);
    expect(reps[0].netRiseCm).toBeCloseTo(61, 0);
    expect(reps[0].uncorrectedJumpHeightCm).toBe(80);
  });

  it("leaves a set alone with too few box reps, no box, or a scale already right", () => {
    expect(applyBoxRiseCorrection([rep(61)], 60.96)).toBeNull();
    expect(applyBoxRiseCorrection([rep(61), rep(62)], null)).toBeNull();
    expect(applyBoxRiseCorrection([rep(61), rep(62)], 60.96)?.applied).toBe(false);
  });
});
