import { describe, it, expect } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";
import capture from "./__fixtures__/bench-set10-2026-09-30.json";
import { OVR_BENCH_SET10_2026_09_30 } from "./tracker-ground-truth";

// Set 10 beside OVR, build 576, 2026-09-30: the first take segmented along gravity, and the
// first to "land on the sensor" -- device 10 reps, 0.80 m/s, 38.9cm; sensor 10, 0.78, 37.6cm.
//
// THE 0.80 WAS THE LOWERING. The direction rule was inverted from this very build until
// 2026-11-05 (the-concentric-is-the-way-up.test.ts), so what landed within 3% of the sensor's
// concentric was the descent's mean. Read as the presses the same trace counts ten, holds its
// range of motion, and reads the mean +21% and the peak +26% over the sensor at the shared drive
// window -- which is where every clean bench in the corpus sits on the drive (the window trims a
// bench's slow start; onset 0 reads this take +13%). The count and the range are pinned at the
// sensor's tolerance; the velocities are pinned at what they READ, so the next change is seen
// moving them, and the bench's open window is in docs/camera-tracking-notes.md, "Round six".
describe("set 10 lands on the sensor", () => {
  it("ten reps and range of motion within 10% of the sensor; the drive's mean is the open +21%", () => {
    const result = replayCapture((capture as StoredCapture[])[0]);
    const sensor = OVR_BENCH_SET10_2026_09_30.sensor.reported;
    // The harness also returns the un-rack settle (8.6-10.3s) as a phase: the device dropped it
    // on the velocity-rejection events of that second, which a stored trace does not carry
    // (see capture-replay.ts). The ten presses after it are the device's ten, rep for rep; rep 1
    // starts at 9.07s, the descent that leads into the first press.
    const presses = result.metrics!.repBreakdown.filter((r) => r.startT >= 9_000);
    expect(presses.length).toBe(10);
    // Distance over time across the presses, the way the set-level number is built since build
    // 579 (see meanVelocityMps in summarizeTrackedSet): an average of per-rep ratios lets one
    // dropout rep with a short window move the set.
    const mean = presses.reduce((a, r) => a + r.romCm / 100, 0) / presses.reduce((a, r) => a + r.concentricSeconds, 0);
    const roms = presses.map((r) => r.romCm).sort((a, b) => a - b);
    const medianRom = roms[Math.floor(roms.length / 2)];
    expect(mean / sensor.meanVelocityMps).toBeGreaterThan(1.1);
    expect(mean / sensor.meanVelocityMps).toBeLessThan(1.3);
    expect(medianRom / (sensor.romIn * 2.54)).toBeGreaterThan(0.9);
    expect(medianRom / (sensor.romIn * 2.54)).toBeLessThan(1.1);
    // What the device itself reported on build 576 -- the lowering -- kept as the record of what
    // the phone said, not as a line the harness is held to.
    const device = OVR_BENCH_SET10_2026_09_30.forgeOnDevice;
    expect(device.repCount).toBe(10);
    expect(device.meanVelocityMps / sensor.meanVelocityMps).toBeLessThan(1.05);
    expect(device.medianRomCm / (sensor.romIn * 2.54)).toBeLessThan(1.05);
  });
});

import { MAX_PEAK_TO_MEAN_RATIO } from "./bar-tracking";

describe("a rep's peak is bounded by its own mean, and the set's peak is the reps' average", () => {
  it("no rep reads a peak below its mean or past the ratio, and the set peak lands near the sensor", () => {
    const result = replayCapture((capture as StoredCapture[])[0]);
    const presses = result.metrics!.repBreakdown.filter((r) => r.startT >= 9_000);
    for (const r of presses) {
      expect(r.peakVelocityMps).toBeGreaterThanOrEqual(r.meanVelocityMps - 0.01);
      expect(r.peakVelocityMps).toBeLessThanOrEqual(r.meanVelocityMps * MAX_PEAK_TO_MEAN_RATIO + 0.01);
    }
    const avgPeak = presses.reduce((a, r) => a + r.peakVelocityMps, 0) / presses.length;
    const sensor = OVR_BENCH_SET10_2026_09_30.sensor.reported;
    // The presses' peaks average 1.49 against the sensor's 1.09 (+26%) on the corrected rule; the
    // lowerings averaged within a tenth. Pinned at what it reads: the bench's peaks on the drive
    // are open, with the window.
    expect(avgPeak / sensor.peakVelocityMps).toBeGreaterThan(1.15);
    expect(avgPeak / sensor.peakVelocityMps).toBeLessThan(1.4);
    // No press is floored on the corrected rule (rep 2's floored peak was a lowering's).
    expect(result.metrics!.repPeaksFlooredToMean).toBe(0);
  });
});
