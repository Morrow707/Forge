import { describe, it, expect } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";
import capture from "./__fixtures__/bench-settle-2026-09-29.json";

// Scott's bench, 2026-09-29, set 3, build 566, 135lb x 10 beside an OVR sensor, phone at the
// foot of the bench. The device reported TWELVE reps: the ten presses (12.1s to 23.0s, one a
// second) and before them two "reps" at 7.5-9.9s and 9.9-12.1s -- the bar settling over the
// chest after the un-rack. Neither was short, slow, overlong or isolated, and no timing rule
// separates them from a squat's careful first descent (set 11945 in walkout-captures.json). The
// athlete's count does: every gate over-counts, so the surplus is trimmed from the ends of the
// set, least rep-like first -- see the count-trim rule in bar-tracking.ts.
//
// The trace is scaled about 1.9x too small on this take (the 3D ruler's longest-projection
// method, see body-3d-ruler.ts) -- this fixture pins the count; the scale is the other fix.
const stored = capture as StoredCapture[];

describe("the settle after the un-rack is not a rep", () => {
  it("counts the ten presses and drops the two settles before them", () => {
    const result = replayCapture(stored[0]);
    expect(result.repCount).toBe(10);
    const reps = result.metrics!.repBreakdown;
    expect(Math.min(...reps.map((r) => r.startT))).toBeGreaterThan(12_000);
    expect(Math.max(...reps.map((r) => r.endT))).toBeLessThan(23_500);
  });
});
