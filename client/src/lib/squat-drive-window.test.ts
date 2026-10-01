import { describe, it, expect } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";
import { trimPhaseToDrive, DRIVE_ONSET_FRACTION } from "./bar-tracking";
import capture from "./__fixtures__/squat-set1-2026-10-01.json";
import capture2 from "./__fixtures__/squat-set2-2026-10-01.json";
import { OVR_SQUAT_SET1_2026_10_01, OVR_SQUAT_SET2_2026_10_01 } from "./tracker-ground-truth";

// Back squat beside OVR, 2026-10-01, filmed head-on from the front of the rack. The first
// sensor-paired squat since the concentric window was fitted on a single rep on 09-28, and the
// take that replaced the travel margin with the drive window for everything REPORTED.
describe("the squat's concentric is the drive, not the sit in the hole", () => {
  it("five reps, range of motion and mean velocity within 10% of the sensor", () => {
    const m = replayCapture((capture as StoredCapture[])[0]).metrics!;
    const sensor = OVR_SQUAT_SET1_2026_10_01.sensor.reported;
    expect(m.repBreakdown.length).toBe(5);
    expect(m.romCm! / (sensor.romIn * 2.54)).toBeGreaterThan(0.9);
    expect(m.romCm! / (sensor.romIn * 2.54)).toBeLessThan(1.1);
    // 0.65 on the device under the travel margin; 0.95 here.
    expect(m.meanVelocityMps! / sensor.meanVelocityMps).toBeGreaterThan(0.9);
    expect(m.meanVelocityMps! / sensor.meanVelocityMps).toBeLessThan(1.1);
    // Set window 0.75 against the sensor's 0.73 (range over mean).
    expect(m.concentricSeconds).toBeGreaterThan(0.65);
    expect(m.concentricSeconds).toBeLessThan(0.85);
  });

  it("opens at the last sample under the fraction of the peak and closes at the first after it", () => {
    //                 0    1    2    3    4    5    6    7    8    9    10   11
    const speeds = [0.0, 0.02, 0.03, 0.05, 0.4, 0.9, 1.2, 1.0, 0.5, 0.06, 0.02, 0.0];
    const w = trimPhaseToDrive(speeds, 0, 11, 6, 0.07)!;
    expect(w.startIdx).toBe(4); // 0.05 < 0.084, 0.4 >= 0.084
    expect(w.endIdx).toBe(8); // 0.5 >= 0.084, 0.06 < 0.084
    expect(DRIVE_ONSET_FRACTION).toBe(0.07);
  });

  it("never collapses: a flat phase or a peak on the edge hands back to the travel margin", () => {
    expect(trimPhaseToDrive(new Array(10).fill(0), 0, 9, 5)).toBeNull();
    expect(trimPhaseToDrive([0, 1, 1, 1, 0], 0, 4, 0)).toBeNull();
    expect(trimPhaseToDrive([0, 1, 0], 0, 2, 1)).toBeNull();
  });

  // Set 2 of the same session, oblique. Count and range of motion land; the mean sits at 0.83
  // of the sensor because every concentric window is ~0.15s wide, and the drive window does not
  // narrow it. Pinned at what it IS so the next change that moves it is seen moving it.
  it("set 2 counts and measures range of motion; its mean is the open 0.83", () => {
    const m = replayCapture((capture2 as StoredCapture[])[0]).metrics!;
    const sensor = OVR_SQUAT_SET2_2026_10_01.sensor.reported;
    expect(m.repBreakdown.length).toBe(5);
    expect(m.romCm! / (sensor.romIn * 2.54)).toBeGreaterThan(0.95);
    expect(m.romCm! / (sensor.romIn * 2.54)).toBeLessThan(1.05);
    expect(m.meanVelocityMps! / sensor.meanVelocityMps).toBeGreaterThan(0.8);
  });
  it.fails("set 2's mean within 10% of the sensor (open: the window is 0.15s wide)", () => {
    const m = replayCapture((capture2 as StoredCapture[])[0]).metrics!;
    expect(m.meanVelocityMps! / OVR_SQUAT_SET2_2026_10_01.sensor.reported.meanVelocityMps).toBeGreaterThan(0.9);
  });
});
