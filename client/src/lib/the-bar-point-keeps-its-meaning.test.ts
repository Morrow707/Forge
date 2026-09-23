import { describe, it, expect } from "vitest";
import { barPointFromSides, medianHalfSpan } from "./bar-tracking";
import { readFileSync } from "fs";
import { resolve } from "path";

const dialog = readFileSync(
  resolve(__dirname, "../components/av-bar-tracker-dialog.tsx"),
  "utf8",
);

/** The 2026-09-23 bench take logged 10 reps and found 3. Its trace held 27 steps over 25cm,
 *  most at 8-17 m/s across a single 33ms frame, and the take reported "0 thrown out by the
 *  speed filter" -- because the filter only ever saw the two SIDES, each of which moves
 *  smoothly on its own. What teleports is the point built from them, when which sides exist
 *  changes frame to frame. */
describe("the bar point keeps its meaning", () => {
  it("gates the combined point, not only the two sides", () => {
    expect(dialog).toContain("isPlausibleVelocity(prevCombined");
    expect(dialog).toContain("combinedRejectionEvents.push(t)");
  });

  it("keeps the two gates' counters apart, so the report can say which one fired", () => {
    expect(dialog).toContain("combinedVelocityRejections: combinedRejectionEvents.length");
    expect(dialog).toContain("velocityRejections: rejectionEvents.length");
  });

  it("drops a SAMPLE, never the take -- rule #1", () => {
    // The gate sets the point to null for that frame and the loop carries on; nothing in it
    // returns, throws, or refuses the capture.
    const gate = dialog.slice(
      dialog.indexOf("isPlausibleVelocity(prevCombined"),
      dialog.indexOf("if (combined) framesUsable++"),
    );
    expect(gate).toContain("combined = null");
    expect(gate).not.toMatch(/\breturn\b|\bthrow\b/);
  });

  it("counts which branch built each point", () => {
    for (const counter of [
      "barPointFromBothHands",
      "barPointFromLoneHandCarried",
      "barPointFromBareLoneHand",
    ]) {
      expect(dialog).toContain(`${counter}++`);
      expect(dialog).toContain(`${counter},`);
    }
  });

  it("counts the flips", () => {
    expect(dialog).toContain("barPointSideFlipped++");
  });
});

/** The 533 take answered the question the counters were added for: bare-single-hand was ZERO,
 *  so the lone hand was always being carried back -- and the trace was STILL bimodal, two
 *  clouds about 40cm apart where half that athlete's grip is 33.5cm. The carry was running and
 *  landing in the wrong place. */
describe("carrying a lone hand back to the middle of the bar", () => {
  const halfSpan = { x: 0.3, y: 0 };

  it("overrules a swapped left/right label using the last point", () => {
    // The athlete's real bar middle is near x = 0. Vision calls this the LEFT hand, which would
    // put the middle at +0.3 -- a whole grip width from where the bar was a frame ago.
    const out = barPointFromSides(
      { x: 0.3, y: 1, confidence: 0.9 },
      null,
      halfSpan,
      { x: 0, y: 1 },
    );
    expect(out.point!.x).toBeCloseTo(0, 5);
    expect(out.sideFlipped).toBe(true);
  });

  it("leaves a correct label alone", () => {
    const out = barPointFromSides(
      { x: -0.3, y: 1, confidence: 0.9 },
      null,
      halfSpan,
      { x: 0, y: 1 },
    );
    expect(out.point!.x).toBeCloseTo(0, 5);
    expect(out.sideFlipped).toBe(false);
  });

  it("behaves exactly as before when there is no previous point", () => {
    const out = barPointFromSides({ x: -0.3, y: 1, confidence: 0.9 }, null, halfSpan);
    expect(out.point!.x).toBeCloseTo(0, 5);
    expect(out.sideFlipped).toBe(false);
  });

  it("carries by the median span, so one foreshortened frame cannot set the offset", () => {
    // Four honest readings of a fixed grip and one collapsed frame (both 'hands' found on one).
    const history = [
      { x: 0.3, y: 0 },
      { x: 0.31, y: 0 },
      { x: 0.29, y: 0 },
      { x: 0.3, y: 0 },
      { x: 0.01, y: 0 },
    ];
    expect(medianHalfSpan(history)!.x).toBeCloseTo(0.3, 2);
    expect(medianHalfSpan([])).toBeNull();
  });
});
