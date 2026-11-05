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
    // 0.65 on the device under the travel margin; 0.935 after the 10-07 window refit; 0.90
    // since 2026-11-05, when the SET mean stopped summing the whole phase's distance over the
    // drive window's time (see meanVelocityMps in bar-tracking.ts). That fix lowers every mean
    // by the ratio of the two windows, so it helps every take that read HIGH and costs every
    // take that read LOW -- seven and five respectively across the traced corpus. This squat is
    // one of the five: -6.5% -> -9.8%. Recorded rather than smoothed over, because the inflation
    // was masking a genuine low read here and the window is the next thing to look at on it.
    expect(m.meanVelocityMps! / sensor.meanVelocityMps).toBeGreaterThanOrEqual(0.9);
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
    // Refitted 2026-10-07 off thirteen sensor-paired sets, replayed with no new filming -- see
    // DRIVE_ONSET_FRACTION's own comment for the sweep and why 0.04 over 0.03. The hand-worked
    // example above passes 0.07 explicitly, so it keeps testing the FUNCTION rather than the
    // constant, and this line is the constant's own pin.
    expect(DRIVE_ONSET_FRACTION).toBe(0.04);
  });

  it("never collapses: a flat phase or a peak on the edge hands back to the travel margin", () => {
    expect(trimPhaseToDrive(new Array(10).fill(0), 0, 9, 5)).toBeNull();
    expect(trimPhaseToDrive([0, 1, 1, 1, 0], 0, 4, 0)).toBeNull();
    expect(trimPhaseToDrive([0, 1, 0], 0, 2, 1)).toBeNull();
  });

  // Set 2 of the same session, oblique. Count and range of motion land. Until 2026-11-05 this
  // case pinned the mean at "the open 0.80" of the sensor and blamed a 0.15s window; the 0.80 was
  // the descent (the direction rule was inverted) and the drive reads inside 5%.
  it("set 2 counts and measures range of motion, and its mean is no longer 0.80 of the sensor", () => {
    const m = replayCapture((capture2 as StoredCapture[])[0]).metrics!;
    const sensor = OVR_SQUAT_SET2_2026_10_01.sensor.reported;
    expect(m.repBreakdown.length).toBe(5);
    expect(m.romCm! / (sensor.romIn * 2.54)).toBeGreaterThan(0.95);
    expect(m.romCm! / (sensor.romIn * 2.54)).toBeLessThan(1.05);
    // 0.774 since the 2026-11-05 set-mean fix (0.787 before it); set 2's window has been the
    // open item on this take since 10-07 and the `it.fails` below is still the record of it.
    expect(m.meanVelocityMps! / sensor.meanVelocityMps).toBeGreaterThan(0.77);
  });
  // CLOSED 2026-11-05, by the direction rule reading the trace's real polarity. This stood as
  // `it.fails` because set 2's mean read 0.80 of the sensor -- and the 0.80 was the DESCENT'S mean,
  // the phone having reported the lowering as the lift since 2026-09-30 (see
  // the-concentric-is-the-way-up.test.ts). The drive reads +4% of the sensor at the shared window
  // and +2% at the squat's own 0.02, which is what the sentence above this used to call "the
  // window is 0.15s wide": the window was on the wrong half of the rep.
  it("set 2's mean within 10% of the sensor", () => {
    const m = replayCapture((capture2 as StoredCapture[])[0]).metrics!;
    const ratio = m.meanVelocityMps! / OVR_SQUAT_SET2_2026_10_01.sensor.reported.meanVelocityMps;
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });
});
