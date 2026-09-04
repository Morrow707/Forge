import { describe, it, expect } from "vitest";
import { implausibleRangeOfMotion } from "./bar-tracking";

// The real set this check was written for: a 5'10" athlete benching 135lb, camera at the foot
// of the bench. Calibration reported success on 121 of 639 frames and produced these numbers.
const HEIGHT_IN = 70;

describe("implausibleRangeOfMotion", () => {
  it("rejects the 180.5cm bench range of motion a real broken calibration produced", () => {
    const reason = implausibleRangeOfMotion(180.5, HEIGHT_IN, "horizontal_press_or_row");
    expect(reason).not.toBeNull();
    expect(reason).toContain("181cm");
  });

  it("rejects the earlier 154cm bench reading from the same setup", () => {
    expect(implausibleRangeOfMotion(154, HEIGHT_IN, "horizontal_press_or_row")).not.toBeNull();
  });

  it("accepts the true bench range of motion a bar sensor measured on that set", () => {
    // OVR reported 15.3in = 38.9cm.
    expect(implausibleRangeOfMotion(38.9, HEIGHT_IN, "horizontal_press_or_row")).toBeNull();
  });

  it("accepts a generously deep bench for a long-armed athlete", () => {
    expect(implausibleRangeOfMotion(60, HEIGHT_IN, "horizontal_press_or_row")).toBeNull();
  });

  it("accepts a deep squat but rejects one four times too large", () => {
    expect(implausibleRangeOfMotion(75, HEIGHT_IN, "squat")).toBeNull();
    expect(implausibleRangeOfMotion(300, HEIGHT_IN, "squat")).not.toBeNull();
  });

  it("accepts a full deadlift", () => {
    expect(implausibleRangeOfMotion(110, HEIGHT_IN, "deadlift")).toBeNull();
  });

  it("does not reject an Olympic lift, whose bar can travel past the athlete's own height", () => {
    // Floor to overhead lockout for a 70in (178cm) athlete. The catch-all ceiling has to sit
    // above 1.0x height or a correct snatch would be thrown away.
    expect(implausibleRangeOfMotion(200, HEIGHT_IN, null)).toBeNull();
  });

  it("stays silent when it cannot judge", () => {
    expect(implausibleRangeOfMotion(180.5, null, "horizontal_press_or_row")).toBeNull();
    expect(implausibleRangeOfMotion(0, HEIGHT_IN, "horizontal_press_or_row")).toBeNull();
    expect(implausibleRangeOfMotion(NaN, HEIGHT_IN, "horizontal_press_or_row")).toBeNull();
  });

  it("scales with the athlete, not an absolute limit", () => {
    // 90cm is fine for a very tall athlete's bench and impossible for a small child's.
    expect(implausibleRangeOfMotion(90, 84, "horizontal_press_or_row")).toBeNull();
    expect(implausibleRangeOfMotion(90, 48, "horizontal_press_or_row")).not.toBeNull();
  });
});
