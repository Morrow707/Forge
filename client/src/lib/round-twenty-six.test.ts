/**
 * ROUND TWENTY-SIX, 2026-11-24: rows (both sides), dumbbell shoulder press and bench on build 834,
 * filmed in a jacket on purpose to hide the wrists. The fixes, each read with comments stripped.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FITTED_OVERRIDES } from "@shared/camera-tunables-by-lift";
import { implausibleRangeOfMotion } from "./bar-tracking";

function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => (/^\s*\/\//.test(line) ? "" : line.replace(/\s\/\/.*$/, "")))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

const dialog = stripComments(readFileSync(join(__dirname, "../components/av-bar-tracker-dialog.tsx"), "utf8"));

describe("round twenty-six", () => {
  it("never sends null over a skeleton the server holds as a file", () => {
    const workout = stripComments(readFileSync(join(__dirname, "../pages/workout.tsx"), "utf8"));
    // Hydration marks a set whose trace is a file on the server...
    expect(workout).toMatch(/skeletonHeldOnServer:\s*\n?\s*!Array\.isArray\(existingSet\?\.skeletonFrames\)/);
    // ...a new take clears the mark...
    expect(workout).toMatch(/if \("skeletonFrames" in patch\) updated\.skeletonHeldOnServer = false;/);
    // ...and the payload omits the key rather than sending the null that deletes the file.
    expect(workout).toMatch(/s\.skeletonFrames == null && s\.skeletonHeldOnServer \? \{\} : \{ skeletonFrames: s\.skeletonFrames \}/);
  });

  it("keeps a one-arm lift's working shoulder out of the torso-stillness anchor", () => {
    const at = dialog.indexOf("const torsoAnchor = torsoAnchorFrom(");
    expect(at).toBeGreaterThan(-1);
    const call = dialog.slice(at, dialog.indexOf(");", at));
    expect(call).toMatch(/unilateralWorkingHand === "left" \? null : lm\(POSE_LANDMARKS\.LEFT_SHOULDER\)/);
    expect(call).toMatch(/unilateralWorkingHand === "right" \? null : lm\(POSE_LANDMARKS\.RIGHT_SHOULDER\)/);
  });

  it("raises no popup when the count differs from the prescription", () => {
    expect(dialog).not.toMatch(/prescribed at \{targetReps\}/);
  });

  it("says a near-miss range of motion as a percentage, never 'about 1x'", () => {
    const reason = implausibleRangeOfMotion(18.2, 75, "overhead_press");
    expect(reason).toContain("% SHORTER");
    expect(reason).not.toMatch(/about 1x/);
  });

  it("takes one step per lift", () => {
    expect(FITTED_OVERRIDES["Single-Arm Dumbbell Row"]?.biacromialToleranceFraction).toBe(0.25);
    expect(FITTED_OVERRIDES["Bench Press"]?.depthRulerUncertainty).toBe(0.105);
    expect(FITTED_OVERRIDES["Dumbbell Shoulder Press"]?.body3DCorrectedUncertainty).toBe(0.065);
  });
});
