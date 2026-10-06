import { describe, it, expect } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";
import capture from "./__fixtures__/bench-2026-10-06.json";

/* THE 10-06 BENCH BESIDE THE OVR: AN UN-RACK AT 2.48 M/S STOOD AS REP 1.
 *
 * Build 621, 135lb x 10, filmed beside the sensor. The scale on this take was the best the
 * pipeline has produced -- range of motion 37.4cm against the sensor's 37.1, +0.9% -- and the
 * set mean still read 0.81 against 0.70, +15.7%. None of that was scale. The segmenter returned
 * TWELVE reps for a ten-rep set, and the first three were the bar coming off the hooks:
 *
 *   rep 1  44.4cm  2.48 m/s  concentric 0.20s  eccentric 0.13s   <- the un-rack
 *   rep 2  20.1cm  0.49 m/s  concentric 0.40s  eccentric 1.67s   <- the settle
 *   rep 3  39.2cm  1.42 m/s  concentric 0.30s  eccentric 5.40s   <- the hold before the first press
 *   reps 4-12: nine presses, 0.60-1.01 m/s, mean 0.741
 *
 * repConsistency flagged rep 2 (its 20.1cm is half the set median) and could not flag rep 1,
 * whose 44.4cm sits 13% off a median of 39.2 -- perfectly ordinary. Rep 1 is only impossible in
 * SPEED: 2.48 m/s is 3.5x the set median, and the count-trim's oddness score weighed amplitude,
 * the whole window and the ECCENTRIC's speed, never the concentric's own. So the bar coming off
 * the hooks looked like a rep to every term that was scored.
 *
 * Two changes, and they are coupled: the concentric-speed term, and MAX_COUNT_TRIM_PER_EDGE
 * 2 -> 4. The cap alone takes set 10 (which landed on the sensor) from ten reps to nine, because
 * without the speed term the scorer cannot tell that set's real last press from this set's
 * un-rack -- their oddness scores are 1.34/1.61 against 1.39/1.61. With the term the two
 * separate, and the trim stops on the oddness floor rather than on the cap.
 */
const stored = capture as StoredCapture[];
// OVR set 1, 2026-10-06, 135lb x 10: mean 0.70, peak 0.98, ROM 14.6in.
const SENSOR = { meanVelocityMps: 0.7, peakVelocityMps: 0.98, romCm: 14.6 * 2.54 };

describe("the 10-06 bench: the un-rack is not rep 1", () => {
  it("counts the athlete's ten presses, not twelve", () => {
    expect(replayCapture(stored[0]).repCount).toBe(10);
  });

  it("drops the un-rack, so no rep reads anywhere near 2.48 m/s", () => {
    const reps = replayCapture(stored[0]).metrics!.repBreakdown;
    // The fastest surviving rep is a press. The un-rack was 3.5x the set median.
    const fastest = Math.max(...reps.map((r) => r.meanVelocityMps));
    expect(fastest).toBeLessThan(1.5);
    // And the set starts at the first real press, not at the rack.
    expect(Math.min(...reps.map((r) => r.startT))).toBeGreaterThan(5_000);
  });

  it("lands the set mean on the sensor, where twelve reps put it 15.7% high", () => {
    const m = replayCapture(stored[0]).metrics!;
    const err = Math.abs(m.meanVelocityMps! / SENSOR.meanVelocityMps - 1);
    expect(err).toBeLessThan(0.08);
  });

  /* The scale was already right on this take, and the point of saying so here is that a later
   * change which "fixes" the velocity by moving the ruler would break this. */
  it("keeps the range of motion on the sensor, which it already was", () => {
    const reps = replayCapture(stored[0]).metrics!.repBreakdown;
    const roms = reps.map((r) => r.romCm).sort((a, b) => a - b);
    const medianRom = roms[Math.floor(roms.length / 2)];
    expect(Math.abs(medianRom / SENSOR.romCm - 1)).toBeLessThan(0.12);
  });
});
