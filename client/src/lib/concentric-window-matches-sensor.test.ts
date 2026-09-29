import { describe, expect, it } from "vitest";
import { trimPhaseToTravel, TRAVEL_ONSET_MARGIN_M } from "./bar-tracking";

/**
 * THE CONCENTRIC WINDOW, FITTED TO A BAR SENSOR ON A REAL REP.
 *
 * Scott's back squat, 2026-09-28, 135lb, rep 1, filmed beside an OVR sensor. The sensor read
 * 0.82 m/s mean over a 74cm range, which is a 0.9s window. Forge read 0.28 m/s over 1.4s: its
 * window started on a wobble at the bottom (the bar rose 1.7cm, sank back to 1.0cm, sat for
 * half a second, then drove) and counted the sit as lifting.
 *
 * Below is that rep's own velocity curve as the app stored it, 38 samples at 30Hz, integrated
 * into positions. The window a 1cm margin finds starts at the sample where the bar was last
 * within 1cm of the bottom and ends where it first came within 1cm of the top -- and that is
 * 0.9s, the sensor's window, to the sample.
 */
const REP_1_VELOCITY_MPS = [
  0.04, 0.06, 0.11, 0.16, 0.13, 0.06, 0.01, 0.05, 0.04, 0.02, 0.02, 0.05, 0.05, 0.03, 0.01, 0.01,
  0.01, 0.02, 0.08, 0.15, 0.23, 0.36, 0.52, 0.68, 0.86, 1.02, 0.83, 0.58, 1.08, 1.05, 0.23, 0.35,
  0.39, 0.26, 0.18, 0.12, 0.05, 0.02,
];
const DT = 1 / 30;

/** The same rep's positions as the app stored them beside those speeds, in cm above the bottom
 *  (the app writes them negative-up). The bar rose 1.7cm, sank back to 0.7-1.0cm, sat there
 *  for half a second, then drove. Metres, up positive. */
const REP_1_POSITION_CM = [
  0, -0.2, -0.7, -1.2, -1.6, -1.7, -1.4, -1.1, -0.7, -0.8, -1, -1.4, -1.4, -1.6, -1.7, -1.5, -1.3,
  -1.3, -1.4, -1.9, -2.8, -3.7, -4.4, -6.7, -9.6, -13.3, -16.7, -20.7, -24.5, -51.4, -55.2, -56,
  -57.1, -58.5, -59, -59.6, -59.9, -60,
];
function positions(): number[] {
  return REP_1_POSITION_CM.map((cm) => -cm / 100);
}

describe("the concentric window starts where the sensor starts it", () => {
  const pos = positions();
  const peakIdx = REP_1_VELOCITY_MPS.indexOf(Math.max(...REP_1_VELOCITY_MPS));

  it("skips the bottom wobble and the half-second sit, not the drive", () => {
    const { startIdx, endIdx } = trimPhaseToTravel(pos, 0, pos.length - 1, peakIdx);
    const seconds = (endIdx - startIdx) * DT;
    // The sensor's window is 0.9s. Anything under 0.75 has cut into the drive; anything over
    // 1.1 is counting the sit again. The old speed trim read 1.27s here.
    expect(seconds).toBeGreaterThanOrEqual(0.75);
    expect(seconds).toBeLessThanOrEqual(1.1);
    expect(startIdx).toBe(10); // the last sample within 1cm of the bottom before the drive
    // And the mean the way a sensor defines it, at the scale the app had that day (60cm; the
    // sensor's 74cm is the scale question, kept separate on purpose).
    const mean = 0.6 / seconds;
    expect(mean).toBeGreaterThan(0.55);
    expect(mean).toBeLessThan(0.8);
  });

  it("is a centimetre, fixed, because a share of range lands on the drive instead", () => {
    expect(TRAVEL_ONSET_MARGIN_M).toBe(0.01);
  });

  it("never collapses a window and never extends past the phase", () => {
    const flat = new Array(20).fill(0);
    expect(trimPhaseToTravel(flat, 0, 19, 10)).toEqual({ startIdx: 0, endIdx: 19 });
    const { startIdx, endIdx } = trimPhaseToTravel(pos, 0, pos.length - 1, peakIdx);
    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeLessThanOrEqual(pos.length - 1);
  });
});

import { travelOnsetMarginFor, TRAVEL_ONSET_MARGIN_BY_ROM_KIND_M } from "./bar-tracking";

// The margin knows the lift -- see TRAVEL_ONSET_MARGIN_BY_ROM_KIND_M. The squat keeps the
// centimetre this file fitted; a press takes three quarters, fitted on the three sensor-paired
// benches of 2026-09-29.
describe("the travel margin is keyed by movement", () => {
  it("keeps the centimetre for a squat and anything unlisted", () => {
    expect(travelOnsetMarginFor("squat")).toBe(TRAVEL_ONSET_MARGIN_M);
    expect(travelOnsetMarginFor(null)).toBe(TRAVEL_ONSET_MARGIN_M);
    expect(travelOnsetMarginFor("deadlift")).toBe(TRAVEL_ONSET_MARGIN_M);
  });
  it("trims a press by three quarters of a centimetre", () => {
    expect(travelOnsetMarginFor("horizontal_press_or_row")).toBe(0.0075);
    expect(TRAVEL_ONSET_MARGIN_BY_ROM_KIND_M.horizontal_press_or_row).toBeLessThan(TRAVEL_ONSET_MARGIN_M);
  });
});
