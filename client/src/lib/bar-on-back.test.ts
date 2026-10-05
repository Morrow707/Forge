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

  it("leaves a set alone with too few box reps, no box, or a scale already right -- AND SAYS WHICH", () => {
    // These three used to return a bare null, and that is what made the 2026-10-04 box jump
    // undiagnosable: it read 28% low, boxRise came back null, and null is produced by all three
    // of these situations plus a fourth. "Leaves the set alone" is still what is asserted
    // (applied false in every case); what is added is the reason and its evidence.
    const tooFew = applyBoxRiseCorrection([rep(61)], 60.96);
    expect(tooFew.applied).toBe(false);
    expect(tooFew.outcome).toBe("too_few_box_reps");
    expect(tooFew.repsUsed).toBe(1);
    expect(tooFew.minRiseCm).toBeCloseTo(30.5, 1);
    expect(tooFew.netRisesCm).toEqual([61]);

    const noBox = applyBoxRiseCorrection([rep(61), rep(62)], null);
    expect(noBox.applied).toBe(false);
    expect(noBox.outcome).toBe("no_box_height");
    expect(noBox.boxHeightCm).toBeNull();

    const agreed = applyBoxRiseCorrection([rep(61), rep(62)], 60.96);
    expect(agreed.applied).toBe(false);
    expect(agreed.outcome).toBe("within_tolerance");
    expect(agreed.scaleErrorRatio).toBeCloseTo(1.0, 1);
  });

  it("names the branch the 2026-10-04 box jump landed in", () => {
    // THE SUSPECTED CAUSE, AS A TEST. That take found 2 jumps on a 24in (61cm) box and read
    // 28% low. If the landing was assigned to the floor rather than the box top -- Scott: "if
    // the object detector doesn't know where the box is then it thinks I'm doing a broad jump"
    // -- the net rises come in near zero, every rep is filtered out by BOX_RISE_MIN_SHARE, and
    // the one ruler that could have caught the 28% refuses to run. The worse the error, the
    // more certain the ruler is to stand down, which is why it has to say so out loud.
    const v = applyBoxRiseCorrection([rep(3.1), rep(2.8)], 60.96);
    expect(v.outcome).toBe("too_few_box_reps");
    expect(v.repsRejected).toBe(2);
    expect(v.netRisesCm).toEqual([3.1, 2.8]);
    expect(v.minRiseCm).toBeCloseTo(30.5, 1);
  });
});
