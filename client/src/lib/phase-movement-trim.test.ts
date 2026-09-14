import { describe, expect, it } from "vitest";
import { trimPhaseToMovement } from "./bar-tracking";

// THE PAUSE BETWEEN REPS WAS BEING COUNTED AS PART OF THE LIFT.
//
// A 135lb five-rep back squat measured against a calibrated reference device came back with
// range of motion 73.6cm against 74.2cm -- within a centimetre -- while its concentric read
// 2.97s against a real ~0.9s. Both are computed from the same pair of phase indices, so distance
// was right and time was 3.3x too long. That is the signature of the standing time between reps
// sitting inside the phase: segmentPhases splits at turning points, and the running extreme
// creeps forward through a noisy plateau, so the top of a rep lands somewhere in the hold.
//
// It dragged mean velocity to 0.45x and mean power to 0.46x of the reference, because both are
// distance over that time.
describe("trimPhaseToMovement", () => {
  // A rep shaped like a real one: standing still, then a fast concentric, then standing again.
  const pausedRep = (holdSamples: number, moveSamples: number) => [
    ...Array<number>(holdSamples).fill(0.01),
    ...Array.from({ length: moveSamples }, (_, i) => 0.2 + Math.sin((i / moveSamples) * Math.PI)),
    ...Array<number>(holdSamples).fill(0.01),
  ];

  it("trims the standing time off both ends", () => {
    const speeds = pausedRep(40, 30);
    const { startIdx, endIdx } = trimPhaseToMovement(speeds, 0, speeds.length - 1);
    expect(startIdx).toBe(40);
    expect(endIdx).toBe(69);
  });

  it("cuts a 3.3x-too-long phase back to roughly the moving part", () => {
    // 60 samples of hold either side of 30 moving: untrimmed is 150 samples for a 30-sample
    // lift, five times too long. The real take's ratio was 3.3x.
    const speeds = pausedRep(60, 30);
    const { startIdx, endIdx } = trimPhaseToMovement(speeds, 0, speeds.length - 1);
    expect(endIdx - startIdx + 1).toBe(30);
  });

  it("leaves a phase that is moving throughout alone", () => {
    const speeds = Array.from({ length: 30 }, (_, i) => 0.5 + Math.sin((i / 30) * Math.PI));
    expect(trimPhaseToMovement(speeds, 0, 29)).toEqual({ startIdx: 0, endIdx: 29 });
  });

  it("does not trim the slow start of a grind away", () => {
    // A near-limit rep accelerates from genuinely slow. The gate is a share of this phase's own
    // peak, so a rep whose peak is low keeps its slow samples -- a fixed m/s gate would not.
    const speeds = Array.from({ length: 30 }, (_, i) => 0.08 + (i / 30) * 0.12);
    const { startIdx, endIdx } = trimPhaseToMovement(speeds, 0, 29);
    expect(startIdx).toBe(0);
    expect(endIdx).toBe(29);
  });

  it("never collapses the window when the peak is a lone spike in noise", () => {
    const speeds = Array<number>(30).fill(0.001);
    speeds[15] = 5;
    expect(trimPhaseToMovement(speeds, 0, 29)).toEqual({ startIdx: 0, endIdx: 29 });
  });

  it("returns the range untouched when the phase is too short to judge", () => {
    expect(trimPhaseToMovement([0, 1, 2], 0, 1)).toEqual({ startIdx: 0, endIdx: 1 });
  });
});
