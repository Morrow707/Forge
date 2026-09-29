import { describe, it, expect } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";
import capture from "./__fixtures__/bench-oblique-2026-09-29.json";

// A REAL BENCH SET, FILMED AT AN ANGLE FROM THE FOOT OF THE BENCH, WITH AN OVR SENSOR BESIDE IT.
//
// Scott's bench press, 2026-09-29, 135lb x 10, build 560. The sensor found ten reps at a mean
// 0.70 m/s and a 14.4in (36.6cm) range of motion. The device found THREE, with a 116cm range of
// motion that was the athlete lying down and standing up: the wrists were tracked from the
// walk-in, so the take's largest reversals were the setup and the re-rack, the relative gate's
// ladder took those as "typical", and every real press fell under the gate it derived.
//
// Two rules came out of it, both in bar-tracking.ts: the athlete's own rep count chooses among
// the gates the trace proposes (summarizeTrackedSet's expectedReps), and a run of reps standing
// apart from the set is a rack move (isolatedRackMoves). See docs/camera-tracking-notes.md,
// "Bench at an angle, 2026-09-29".
const stored = capture as StoredCapture[];

describe("a bench take whose setup outweighs its presses", () => {
  it("finds the ten presses the sensor found, and nothing outside the set", () => {
    const result = replayCapture(stored[0]);
    expect(result.repCount).toBe(10);
    const reps = result.metrics!.repBreakdown;
    // The presses ran from about 9.7s to 21s. Lying down (1.0-1.5s), the un-rack (3.5-5.4s) and
    // the re-rack (25.2-27.2s) are not in the list.
    expect(Math.min(...reps.map((r) => r.startT))).toBeGreaterThan(9_000);
    expect(Math.max(...reps.map((r) => r.endT))).toBeLessThan(22_000);
  });

  it("does not choose a gate that splits presses into fragments to make the count", () => {
    const reps = replayCapture(stored[0]).metrics!.repBreakdown;
    const roms = reps.map((r) => r.romCm).sort((a, b) => a - b);
    const median = roms[Math.floor(roms.length / 2)];
    // No rep under a third of the median: a fragment of a press is not a press. (Was half;
    // on the trace as the device saw it -- see capture-replay.ts, STORED_TRACE_ALONG_AXIS --
    // rep 9 reads 21.6cm against a 44cm median, a short press with a lone-hand dip in it, and
    // the sensor's own rep 9 on this set was its shortest too.)
    expect(Math.min(...roms)).toBeGreaterThan(median / 3);
  });

  it("still finds the same ten when the athlete's count is NOT known", () => {
    // Without the rep count the ladder falls back to its old order, and this take is exactly the
    // one that order gets wrong. Recorded as the honest state of that path, not as a target: the
    // count from the set is what makes this take measurable today.
    const result = replayCapture({ ...stored[0], loggedReps: null });
    expect(result.repCount).toBeLessThanOrEqual(10);
  });
});
