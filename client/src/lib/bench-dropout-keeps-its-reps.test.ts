import { describe, it, expect } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";
import capture from "./__fixtures__/bench-dropout-2026-09-29.json";

// Scott's bench, 2026-09-29, set 5, build 571, 135lb x 10 beside an OVR sensor. The first take
// on which the in-plane 3D ruler and the shoulder ruler AGREED (37.9cm ROM against the sensor's
// 36.1) -- and the device reported eight reps at 1.11 m/s against the sensor's ten at 0.77.
// Hand tracking was poor (270 of 629 points carried from a lone hand, 79 side flips), and two
// things followed: four real reps read as "overlong" because jitter at lockout kept the travel
// trim from ever reaching the top, and a 70cm-in-0.2s jump before the set survived as rep 3.
// Three fixes: a phase faster than any lift can be is a phantom (isImplausiblyFast), a long
// phase with a half-rep reversal inside it is split back into two (splitMergedPhases), and a
// run standing apart from the set goes first when the athlete's count says there are too many
// (the count-informed isolation rule).
const stored = capture as StoredCapture[];

describe("a take with hand dropouts keeps its reps", () => {
  it("reports the set's own presses and nothing before the un-rack", () => {
    const result = replayCapture(stored[0]);
    // Eleven, not the sensor's ten: two of these are one press split by lone-hand jitter
    // (21.9cm and 23.1cm against a 30cm median) and two real presses after 19.3s were lost to
    // a frozen carried point. What this pins is that nothing before the un-rack at 8.5s is
    // counted and the set's own presses are not deleted as "overlong".
    expect(result.repCount).toBe(11);
    const reps = result.metrics!.repBreakdown;
    expect(Math.min(...reps.map((r) => r.startT))).toBeGreaterThan(8_000);
    expect(Math.max(...reps.map((r) => r.endT))).toBeLessThan(24_500);
    // Sensor: 0.77 mean. Inside a tenth, where the eight-rep read was 1.11.
    expect(result.metrics!.meanVelocityMps).toBeGreaterThan(0.65);
    expect(result.metrics!.meanVelocityMps).toBeLessThan(0.85);
  });
});
