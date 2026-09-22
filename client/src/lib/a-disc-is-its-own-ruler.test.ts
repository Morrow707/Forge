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

// AND THE SHAPE BYPASS NEEDS A SIZE BOUND, WHICH IT SHIPPED WITHOUT.
//
// Scott's bench, 2026-09-22, set 2, from his own capture export: the detector boxed something
// 582.8 x 567.4px -- aspect 1.03, 42 samples, 0.7-1.0 confidence, centred at 0.43/0.46. As
// square a read as the detector produces, so the shape bypass above would have skipped the grip
// check and handed that 583px long edge over as a 450mm diameter. His grip in that same take
// measured 129.5px: a ratio of 4.51, which is a plate two metres across. The scale it implies is
// wrong by about five, and every number on the set inherits that.
//
// No camera angle makes a plate 4.5x a man's bench grip, so at that extreme the disagreement is
// not evidence of foreshortening and the grip keeps its veto. Inside the band where
// foreshortening IS a plausible explanation, the bypass still applies -- that is the whole point
// of it and Scott's angle still has to work.
describe("a disc still has to be plate-sized", () => {
  it("bounds the shape bypass by the grip span", () => {
    expect(dialog).toContain("PLATE_DISC_MAX_GRIP_RATIO = 2.6");
    expect(dialog).toContain("plateToGripRatio <= PLATE_DISC_MAX_GRIP_RATIO");
  });

  it("refuses the 583px box from that take on size, whatever its shape", () => {
    const measured = 582.79;
    const gripPx = 129.5;
    const aspect = 582.79 / 567.41;
    // Shape alone says disc...
    expect(aspect).toBeGreaterThan(0.8);
    expect(aspect).toBeLessThan(1.25);
    // ...and the size says it cannot be one.
    expect(measured / gripPx).toBeGreaterThan(2.6);
  });

  it("still lets the disc through at the ratios his angle actually produces", () => {
    // The two reads the bypass was built for: 2.22x and (on the earlier take) well inside it.
    expect(2.22).toBeLessThanOrEqual(2.6);
    // And that ratio is outside the grip window, which is why the bypass has to exist at all.
    expect(plateReadIsPlausibleAgainstGrip(2.22 * 129.5, 129.5)).toBe(false);
  });
});
