import { describe, it, expect } from "vitest";
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
});
