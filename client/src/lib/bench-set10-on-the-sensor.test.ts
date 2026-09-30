import { describe, it, expect } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";
import capture from "./__fixtures__/bench-set10-2026-09-30.json";
import { OVR_BENCH_SET10_2026_09_30 } from "./tracker-ground-truth";

// Set 10 beside OVR, build 576, 2026-09-30: the first take segmented along gravity, and the
// first to land on the sensor. Device 10 reps, 0.80 m/s, 38.9cm; sensor 10, 0.78, 37.6cm.
// Pinned at the sensor's tolerance so a later change that moves it off is a failure, not a
// footnote.
describe("set 10 lands on the sensor", () => {
  it("ten reps, mean velocity and range of motion within 10% of the sensor", () => {
    const result = replayCapture((capture as StoredCapture[])[0]);
    const sensor = OVR_BENCH_SET10_2026_09_30.sensor.reported;
    // The harness also returns the un-rack settle (8.6-10.3s) as a phase: the device dropped it
    // on the velocity-rejection events of that second, which a stored trace does not carry
    // (see capture-replay.ts). The ten presses after it are the device's ten, rep for rep.
    const presses = result.metrics!.repBreakdown.filter((r) => r.startT >= 10_000);
    expect(presses.length).toBe(10);
    const mean = presses.reduce((a, r) => a + r.meanVelocityMps, 0) / presses.length;
    const roms = presses.map((r) => r.romCm).sort((a, b) => a - b);
    const medianRom = roms[Math.floor(roms.length / 2)];
    expect(mean / sensor.meanVelocityMps).toBeGreaterThan(0.9);
    expect(mean / sensor.meanVelocityMps).toBeLessThan(1.1);
    expect(medianRom / (sensor.romIn * 2.54)).toBeGreaterThan(0.9);
    expect(medianRom / (sensor.romIn * 2.54)).toBeLessThan(1.1);
    // What the device itself reported, so the harness and the phone are held to the same line.
    const device = OVR_BENCH_SET10_2026_09_30.forgeOnDevice;
    expect(device.repCount).toBe(10);
    expect(device.meanVelocityMps / sensor.meanVelocityMps).toBeLessThan(1.05);
    expect(device.medianRomCm / (sensor.romIn * 2.54)).toBeLessThan(1.05);
  });
});
