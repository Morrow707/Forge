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
  it("counts the ten presses and drops the re-rack", () => {
    const result = replayCapture(stored[0]);
    expect(result.repCount).toBe(10);
    const reps = result.metrics!.repBreakdown;
    expect(Math.max(...reps.map((r) => r.endT))).toBeLessThan(20_500);
  });
});
