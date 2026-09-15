import { describe, it, expect } from "vitest";
import { replayCapture, isJumpCapture, type StoredCapture } from "./capture-replay";
import captures from "./__fixtures__/walkout-captures.json";

// JUMP MODE STORES ITS TRACE IN THE SAME COLUMN AS A BARBELL LIFT.
//
// workoutSetEntries.barPathTrace is reused for the ankle-height trace in jump mode rather than
// adding a second trace column, so a jump capture and a barbell capture are the same shape and
// nothing in the points tells them apart. The replay ran the barbell model over both.
//
// That does not produce a worse number, it produces a number of a different KIND wearing the
// same field name: a peak BAR velocity for a movement with no bar, a range of motion that is
// really an ankle excursion, a velocity loss computed across jumps. Every box-jump figure this
// harness reported came from the wrong pipeline.
const real = captures as StoredCapture[];
const boxJump = (): StoredCapture => ({
  ...real.find((c) => c.setId === 11948)!,
  trackingLevel: "jump",
});

describe("a jump capture is not run through the barbell model", () => {
  it("recognises jump mode from the tracking level, not the exercise name", () => {
    expect(isJumpCapture(boxJump())).toBe(true);
    // The name is not the signal. A coach can call a box jump anything, and an exercise named
    // "Box Jump" that was filmed in bar_path mode really did produce a bar-path trace.
    expect(isJumpCapture({ ...boxJump(), trackingLevel: "bar_path" })).toBe(false);
  });

  it("withholds every barbell metric and reports jump metrics instead", () => {
    const result = replayCapture(boxJump());
    expect(result.metrics).toBeNull();
    expect(result.jumpMetrics).not.toBeNull();
    expect(result.jumpMetrics!.bestJumpHeightCm).toBeGreaterThan(0);
  });

  // Both plausibility gates are anthropometric limits on a BAR's travel, so neither has anything
  // honest to say about an ankle trace. summarizeJumpSet has its own outlier check.
  it("does not judge a jump against the bar-travel gates", () => {
    expect(replayCapture(boxJump()).romProblem).toBeNull();
  });

  it("still counts reps, which is the one thing both pipelines answer", () => {
    const result = replayCapture(boxJump());
    expect(result.repCount).toBeGreaterThan(0);
    expect(result.repCountError).toBe(result.repCount - result.loggedReps!);
  });

  // Exports written before trackingLevel existed do not carry it. Absent means "assume barbell",
  // which is what the harness did for its whole life -- wrong for jumps, and no more wrong than
  // it already was.
  it("falls back to the barbell model when the tracking level is missing", () => {
    const { trackingLevel: _omitted, ...withoutLevel } = boxJump();
    const result = replayCapture(withoutLevel);
    expect(result.metrics).not.toBeNull();
    expect(result.jumpMetrics).toBeNull();
  });

  it("leaves a real barbell capture alone", () => {
    const squat = real.find((c) => c.setId === 11945)!;
    const result = replayCapture({ ...squat, trackingLevel: "bar_path" });
    expect(result.metrics).not.toBeNull();
    expect(result.jumpMetrics).toBeNull();
  });
});
