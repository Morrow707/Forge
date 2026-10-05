import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repsForSetBest } from "./jump-tracking";

/* A 61CM BOX JUMP REPORTED 238.4CM. See docs/camera-tracking-notes.md, "Four lifts beside OVR,
 * 2026-10-05".
 *
 * Build 620, Box Jump set 1. The seven reps and their net rises, straight off
 * trackingDiagnostics.boxRise.netRisesCm. Five of them agree to 1.6cm; the 2.4 and the 265.5
 * each follow a baseline_reanchored event (-42.4cm and -70.0cm), so each was measured from a
 * baseline that had walked off. Both were already flagged by summarizeJumpSet's own
 * outlierAgainstSet check; bestJumpHeightCm just did not read the flag, and Math.max then
 * handed the set the single worst rep it had.
 */
const RISES = [70.6, 71.5, 2.4, 71.7, 70.3, 67.5, 265.5];
const MEDIAN = 70.6;
const OUTLIER_PERCENT = 35;
const flagged = RISES.map((r) => (Math.abs(r - MEDIAN) / MEDIAN) * 100 > OUTLIER_PERCENT);
// The box-rise correction this take applied, trackingDiagnostics.boxRise.scaleErrorRatio.
const BOX_RISE_RATIO = 1.173;
const BOX_HEIGHT_CM = 61;

describe("a set's best is never a rep the pipeline has already called a glitch", () => {
  it("flags exactly the two reps that followed a baseline re-anchor", () => {
    expect(flagged).toEqual([false, false, true, false, false, false, true]);
  });

  it("reports the box jump at the box it was jumped onto, not 238cm", () => {
    const best = Math.max(...repsForSetBest(RISES, flagged));
    expect(best).toBe(71.7);
    const corrected = best / BOX_RISE_RATIO;
    // Inside 2% of the 61cm box. The number this line produced before was 265.5 -- 335% high.
    expect(Math.abs(corrected / BOX_HEIGHT_CM - 1)).toBeLessThan(0.02);
    expect(Math.max(...RISES) / BOX_RISE_RATIO).toBeGreaterThan(200);
  });

  /* RULE #1. A take where every rep is suspect still gets a number -- the one this line gave
   * before the fix. Nothing is withheld; the flags travel on repBreakdown either way. */
  it("falls back to every rep when every rep is flagged, so a number always comes out", () => {
    expect(repsForSetBest(RISES, RISES.map(() => true))).toEqual(RISES);
    expect(repsForSetBest([], [])).toEqual([]);
  });

  it("is what the set-level bests actually read -- height, distance, clearance and RSI", () => {
    const src = readFileSync(join(process.cwd(), "client/src/lib/jump-tracking.ts"), "utf8");
    expect(src).toContain("const forBest = repsForSetBest(reps, outlierAgainstSet);");
    for (const line of [
      "const bestJumpHeightCm = Math.max(...forBest.map((r) => r.jumpHeightCm));",
      "const distances = forBest.map((r) => r.horizontalDistanceCm)",
      "const boxClearances = forBest.map((r) => r.boxClearanceCm)",
      "bestReactiveStrengthIndex(forBest)",
    ]) {
      expect(src, line).toContain(line);
    }
    // And the per-rep record still carries every rep, flagged ones included.
    expect(src).toContain("repBreakdown: reps,");
  });
});
