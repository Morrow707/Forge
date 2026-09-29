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
  // OPEN, since build 575. Until then the harness rotated a stored trace onto its axis a second
  // time (capture-replay.ts, STORED_TRACE_ALONG_AXIS) and this passed at ten. On the trace as
  // the device saw it the re-rack at 20.1-21.6s (12.4cm, 0.13 m/s against a 18.7cm / 0.36
  // median) is still counted: the edge rule's floor is stated in centimetres, and this take's
  // scale is 1.8x too small, so 12.4cm here is the floor's 15.2cm read through the wrong ruler
  // and the ratio tests do not catch it either. `it.fails` so the suite says the rule is not
  // yet right on this take rather than pretending it is; the day it drops the re-rack this
  // test fails the other way and gets rewritten as a plain assertion.
  it.fails("counts the ten presses and drops the re-rack", () => {
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
