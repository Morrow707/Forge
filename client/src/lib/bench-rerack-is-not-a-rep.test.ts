import { describe, it, expect } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";
import capture from "./__fixtures__/bench-rerack-2026-09-29.json";

// Scott's bench, 2026-09-29, set 2, build 564, 135lb x 10 beside an OVR sensor. The device
// reported ELEVEN reps: ten presses and, at 20.1-21.6s, the re-rack -- 12.4cm against a set
// median near 19, 1.9x slower than the median rep. Under the movement's own floor for this
// athlete (MIN_ROM_FRACTION_OF_HEIGHT, bench 0.08 of 190.5cm = 15.2cm) and at the edge of the
// set, which is what isEdgeRackArtifact now reads. Scott: "doesn't the camera know a bench
// press will move a certain amount of inches per rep?"
//
// The trace itself is scaled about 1.8x too small on this take (the first 3D-ruler build took
// the longest bone; see body-3d-ruler.ts) -- which is why the presses read 14 to 24cm here
// against the sensor's 34 to 43. The rep count is what this fixture pins; the scale is the
// other fix in the same change.
const stored = capture as StoredCapture[];

describe("the re-rack at the end of a bench set is not a rep", () => {
  /* CLOSED 2026-10-06, by the concentric-speed term in the count-trim's oddness score.
   *
   * This stood as `it.fails` from build 575, with the note "the day it drops the re-rack this
   * test fails the other way and gets rewritten as a plain assertion". That day is today, and
   * the fix is the one the old note was already describing without naming: the re-rack is
   * 12.4cm at 0.13 m/s against a set median of 18.7cm at 0.36 -- an AMPLITUDE outlier the edge
   * rule could not read (its floor is in centimetres and this take's scale is 1.8x too small,
   * so 12.4cm here IS the floor's 15.2cm through the wrong ruler) and a SPEED outlier, which
   * nothing scored. The oddness score weighed amplitude, the whole window and the eccentric's
   * speed, and never the concentric's own. A ratio is scale-free, which is why it works on a
   * take whose ruler is wrong by 1.8x where the centimetre floor does not.
   *
   * Found on the 10-06 bench beside the OVR, where the SAME blind spot let an un-rack at
   * 2.48 m/s (3.5x the set median) stand as rep 1 and push the set mean 15.7% above the sensor.
   * One term fixes both ends of the same set. */
  it("counts the ten presses and drops the re-rack", () => {
    const result = replayCapture(stored[0]);
    expect(result.repCount).toBe(10);
    const reps = result.metrics!.repBreakdown;
    expect(Math.max(...reps.map((r) => r.endT))).toBeLessThan(20_500);
  });

  it("finds the ten presses, whatever it makes of the re-rack", () => {
    const result = replayCapture(stored[0]);
    expect(result.repCount).toBeGreaterThanOrEqual(10);
    expect(result.repCount).toBeLessThanOrEqual(11);
    const reps = result.metrics!.repBreakdown;
    expect(Math.min(...reps.map((r) => r.startT))).toBeGreaterThan(9_000);
  });
});
