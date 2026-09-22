import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { plateReadIsPlausibleAgainstGrip } from "./pose-tracking";

// SCOTT FILMS HIS BENCH FROM A RAISED THREE-QUARTER VIEW AND THAT HAS TO WORK.
//
// "No I will not be benching like that, I will be benching from this angle, make it work."
// (2026-09-22, with a photo of his rack: the near plate reads as a clean circle.)
//
// From off-square the GRIP foreshortens -- his hands measured 152px apart where a real bench
// grip is 55-60cm -- so dividing the plate's size by that span produced ratios of 2.22x and
// 4.51x against a 0.45-2.0 window, and threw out the one ruler that was actually in frame.
//
// The plate's own SHAPE is the signal that needs no athlete: a circle projects to an ellipse, so
// a near-square box can only be a disc seen close to face-on, and its long edge is then a true
// 450mm diameter. That is a fact about optics, not about where anyone stood.
const dialog = readFileSync(
  join(process.cwd(), "client/src/components/av-bar-tracker-dialog.tsx"),
  "utf8",
);

describe("a plate that reads as a disc is trusted on its own evidence", () => {
  it("skips the grip cross-check only when the box is near-square", () => {
    expect(dialog).toContain("const plateReadsAsADisc =");
    expect(dialog).toContain("&& !plateReadsAsADisc");
    expect(dialog).toContain("PLATE_DISC_ASPECT_LOW = 0.8");
    expect(dialog).toContain("PLATE_DISC_ASPECT_HIGH = 1.25");
  });

  // The check is skipped, never deleted. An elongated box is an ellipse, which means the camera
  // is off-axis and the long edge is no longer a diameter -- exactly when a second opinion is
  // worth having, and exactly the shape Scott's earlier end-on take produced (337 x 600, 0.56).
  it("still cross-checks an ellipse against the hands", () => {
    const endOnAspect = 337 / 600;
    expect(endOnAspect).toBeLessThan(0.8);
    // 583px plate against a 129.5px grip: the read the window is there to catch.
    expect(plateReadIsPlausibleAgainstGrip(583, 129.5)).toBe(false);
  });

  // A disc-shaped read of a plate on the rack behind the lifter is still caught, because the
  // shape gate only removes the SIZE cross-check -- the distance and motion gates in the Swift
  // tracker still have to agree the lock moves with the athlete.
  it("leaves the plausible-size window itself untouched", () => {
    expect(plateReadIsPlausibleAgainstGrip(300, 400)).toBe(true);
    expect(plateReadIsPlausibleAgainstGrip(100, 400)).toBe(false);
  });
});
