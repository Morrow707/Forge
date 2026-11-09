import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inferMovementType, heightCalibrationUnreliable, postureForExercise, postureAllowsHeightCalibration } from "./exercise-camera-profile";
import { MAX_PLATE_ASPECT_RATIO, referenceObjectVerdict } from "@shared/tracker-arbiter";

/** THREE LIFTS BESIDE OVR, 2026-10-02 (bench 135x10, Pendlay row 135x10, push press 95x10).
 * Each rule below is one fault those three takes showed, pinned so it cannot come back. See
 * docs/camera-tracking-notes.md, "Three lifts beside OVR, 2026-10-02". Rule #1 throughout: every
 * one of these filters a ruler or a sample; none refuses a take. */

describe("a hinged body is a posture of its own", () => {
  it("rows are bent over, and neither the height ruler nor the stature check runs on them", () => {
    for (const name of ["Pendlay Row", "Barbell Row", "Bent-Over Row", "T-Bar Row", "Good Morning"]) {
      expect(postureForExercise(name), name).toBe("bent_over");
      expect(heightCalibrationUnreliable(name), name).toBe(true);
    }
    // Rows done lying, seated or standing are not.
    expect(postureForExercise("Inverted Row")).toBe("lying");
    expect(postureForExercise("Seated Cable Row")).toBe("seated");
    expect(postureForExercise("Upright Row")).toBe("standing");
    expect(postureForExercise("Back Squat")).toBe("standing");
  });
  it("the dialog withholds the body span from the plausibility check for that posture", () => {
    // Since 2026-11-06 the stature yardstick runs exactly where the height RULER may vote
    // (postureAllowsHeightCalibration), which refuses bent_over along with lying, seated and
    // supported -- the 11-06 bench's supine span convicted its shoulder ruler the same way the
    // 10-02 row's hinged span convicted its plate. See a-supine-span-is-not-a-stature.test.ts.
    const src = readFileSync(join(__dirname, "..", "components", "av-bar-tracker-dialog.tsx"), "utf8");
    expect(src).toContain("const bodySpanUnits = postureAllowsHeightCalibration(posture) ? impliedBodyLengthUnits(calibrationInput) : null;");
    expect(postureAllowsHeightCalibration("bent_over")).toBe(false);
  });
});

describe("a program row with no movement type is read by its name", () => {
  it("maps the barbell families and says nothing it does not know", () => {
    expect(inferMovementType("Bench Press")).toBe("Push");
    expect(inferMovementType("Barbell Shoulder Press")).toBe("Push");
    expect(inferMovementType("Pendlay Row")).toBe("Pull");
    expect(inferMovementType("Back Squat")).toBe("Squat");
    expect(inferMovementType("Bulgarian Split Squat")).toBe("Lunge");
    expect(inferMovementType("Romanian Deadlift")).toBe("Hinge");
    expect(inferMovementType("Medicine Ball Rotational Throw")).toBeNull();
    expect(inferMovementType(null)).toBeNull();
  });
  it("is a fallback, never an override", () => {
    const src = readFileSync(join(__dirname, "..", "components", "av-bar-tracker-dialog.tsx"), "utf8");
    expect(src).toContain("const movementType = movementTypeProp ?? inferMovementType(exerciseName);");
  });
});

describe("a box twice as tall as it is wide is not a plate", () => {
  const verdict = (w: number, h: number) =>
    referenceObjectVerdict({
      shape: { medianWidthPx: w, medianHeightPx: h, medianCenterXNorm: 0.5, medianCenterYNorm: 0.5 },
      anchor: null,
      yardstick: null,
      frameWidth: 720,
      frameHeight: 1280,
    });
  it("refuses the two torsos the detector called plates and keeps a real oblique plate", () => {
    expect(MAX_PLATE_ASPECT_RATIO).toBe(1.7);
    expect(verdict(102.85, 213.79).reasons).toContain("aspect_ratio"); // push press, 2026-10-02
    expect(verdict(190.7, 344.4).reasons).toContain("aspect_ratio"); // Pendlay row, 2026-10-02
    expect(verdict(100, 140).reasons).not.toContain("aspect_ratio"); // a plate seen at an angle
  });
});

describe("the live path samples by time and is judged by its largest gap", () => {
  const swift = readFileSync(join(__dirname, "..", "..", "..", "ios", "App", "App", "AvBodyTrackingPlugin.swift"), "utf8");
  it("skips frames by cadence before scaling them, and bypasses the file path's every-Nth guard", () => {
    expect(swift).toContain("presentationSeconds - last < targetInterval * 0.75");
    expect(swift).toContain("bypassStrideGuard: true");
    expect(swift).toContain("guard bypassStrideGuard || thisFrameIndex % ctx.sampleEveryNthFrame == 0 else { return }");
  });
  /* 2026-11-09 ADDED THE SECOND GAP, and the two are not the same measurement.
   *
   * `maxInterFrameGapSeconds` is the gap between frames the sampler PROCESSED; it says whether
   * the sampler kept up and nothing about whether the TRACE has a hole, because a frame can be
   * processed and still yield no pose. Measured on the stored corpus: the 2026-11-06 single-arm
   * row ran LIVE with a 2.302s hole in its final trace and the 11-06 bench with a 0.759s one,
   * both under a gate asking about a quarter of a second.
   *
   * What a hole costs, replayed on a clean take with one punched into it: a 0.76s hole moves the
   * set mean up to 12.9%, and a 2.3s hole DELETES REPS (a five-rep squat reads three). Nineteen
   * scattered two-sample dropouts -- the live path's whole measured profile otherwise -- move it
   * 1-6% and never change the count. The reps are the damage, so the trace's own gap is gated. */
  it("gates on coverage AND both gaps -- the sampler's and the trace's -- not on the drop rate", () => {
    expect(swift).toContain("guard coverage >= Self.minLiveCoverage,");
    expect(swift).toContain("maxGapSeconds <= Self.maxLiveInterFrameGapSeconds,");
    expect(swift).toContain("maxTracedGapSeconds <= Self.maxLiveInterFrameGapSeconds else {");
    expect(swift).toMatch(/minLiveCoverage = 0\.5/);
    expect(swift).toMatch(/maxLiveInterFrameGapSeconds = 0\.25/);
    expect(swift).not.toContain("guard coverage >= 0.9, dropRate <= 0.05 else {");
    // the traced gap is measured ONLY where a body was found -- the whole point of the second
    // number. Measuring it beside the processed one would make it the same number twice.
    expect(swift).toContain("state.previousTracedTimestamp = timestampSeconds");
    const tracedAt = swift.indexOf("state.previousTracedTimestamp = timestampSeconds");
    const trackedAt = swift.indexOf("state.trackedCount += 1");
    expect(trackedAt).toBeGreaterThan(0);
    expect(tracedAt - trackedAt, "the traced gap is updated inside the body-found branch").toBeGreaterThan(0);
    expect(tracedAt - trackedAt).toBeLessThan(400);
    // and it reaches the export, because zod strips what it does not declare
    expect(swift).toContain('result["maxTracedGapSeconds"] = maxTracedGapSeconds');
  });
});

describe("a plate nobody agrees with is not a plate", () => {
  it("the Pendlay row's rulers, with the posture fix, land near the sensor instead of on the torso", async () => {
    const { reconcileScaleEstimates } = await import("./pose-tracking");
    // What the row offered once the stature check stood down: the torso-as-plate, the two
    // 3D-pose rulers and the shoulder ruler. Sensor-implied scale 0.003992.
    const v = reconcileScaleEstimates([
      { source: "plate", scale: 0.001307, uncertaintyFraction: 0.1 },
      { source: "body_3d", scale: 0.003764, uncertaintyFraction: 0.2 },
      { source: "depth", scale: 0.002609, uncertaintyFraction: 0.2 },
      { source: "shoulder_width", scale: 0.00475, uncertaintyFraction: 0.1 },
    ]);
    expect(v.scale! / 0.003992).toBeGreaterThan(0.9);
    expect(v.scale! / 0.003992).toBeLessThan(1.2);
    expect(v.outliers.map((o) => o.source)).toContain("plate");
  });
  it("a plate the body corroborates keeps its rank, and one against one still goes to the plate", async () => {
    const { reconcileScaleEstimates } = await import("./pose-tracking");
    const agreed = reconcileScaleEstimates([
      { source: "plate", scale: 0.004, uncertaintyFraction: 0.1 },
      { source: "body_3d", scale: 0.0042, uncertaintyFraction: 0.2 },
      { source: "shoulder_width", scale: 0.0065, uncertaintyFraction: 0.1 },
    ]);
    expect(agreed.agreedSources).toContain("plate");
    expect(agreed.scale!).toBeCloseTo(0.00404, 4);
    const oneOnOne = reconcileScaleEstimates([
      { source: "plate", scale: 0.0013, uncertaintyFraction: 0.1 },
      { source: "shoulder_width", scale: 0.0047, uncertaintyFraction: 0.1 },
    ]);
    expect(oneOnOne.agreedSources).toEqual(["plate"]);
  });
});
