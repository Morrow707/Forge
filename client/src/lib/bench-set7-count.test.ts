import { describe, it, expect } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";
import capture from "./__fixtures__/bench-set7-2026-09-29.json";

// Set 7, build 573, 2026-09-29: ten of ten on the device with the set 5 rules in place, both
// body rulers within 5% of the sensor. Pinned so a later segmentation change cannot lose it.
describe("set 7 keeps its ten", () => {
  it("counts ten presses after the un-rack", () => {
    const result = replayCapture((capture as StoredCapture[])[0]);
    expect(result.repCount).toBe(10);
    // The un-rack and the settle (trace starts at 1.5s, first press tops out past 12s) fold
    // into rep 1's window rather than becoming a rep of their own.
    const reps = result.metrics!.repBreakdown;
    expect(Math.min(...reps.map((r) => r.endT))).toBeGreaterThan(11_000);
    for (const r of reps.slice(1)) expect(r.endT - r.startT).toBeLessThan(1_200);
  });
});
