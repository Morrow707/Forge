import { describe, it, expect } from "vitest";
import { analyzeMechanics } from "./mechanics-tracking";
import { summarizeKbSwingSet } from "./kb-swing-tracking";
import { detectSprintCrossings } from "./sprint-tracking";
import type { PoseFrame } from "./pose-tracking";
import type { Landmark } from "@mediapipe/tasks-vision";

const LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12, LEFT_HIP = 23, RIGHT_HIP = 24;

function poseFrame(t: number, hipDeg: number, shoulderDeg: number): PoseFrame {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  const place = (li: number, ri: number, deg: number, y: number) => {
    const r = 0.2;
    const rad = (deg * Math.PI) / 180;
    lm[li] = { x: -r * Math.cos(rad), y, z: -r * Math.sin(rad), visibility: 1 };
    lm[ri] = { x: r * Math.cos(rad), y, z: r * Math.sin(rad), visibility: 1 };
  };
  place(LEFT_HIP, RIGHT_HIP, hipDeg, 0.4);
  place(LEFT_SHOULDER, RIGHT_SHOULDER, shoulderDeg, 0);
  return { t, landmarks: lm, worldLandmarks: lm };
}

describe("hip-shoulder separation across the plus/minus 180 boundary", () => {
  // The failure: the hip and shoulder angle series are unwrapped independently, so differencing
  // them directly reported a near-zero separation as near-360 -- which reads as elite X-factor
  // and clears every "not enough separation" threshold.
  it("reports a small separation as small, not as its 360 complement", () => {
    const frames = Array.from({ length: 30 }, (_, i) => poseFrame(i * 33, 176, -178));
    const result = analyzeMechanics(frames, "swing");
    expect(result).not.toBeNull();
    const sep = result!.hipShoulderSeparationDeg;
    expect(sep).not.toBeNull();
    // True separation is 6 degrees. The bug reported 354.
    expect(sep!).toBeLessThan(20);
  });

  it("still measures a genuinely large separation", () => {
    const frames = Array.from({ length: 30 }, (_, i) => poseFrame(i * 33, 0, 45));
    const sep = analyzeMechanics(frames, "swing")!.hipShoulderSeparationDeg;
    expect(sep!).toBeGreaterThan(30);
    expect(sep!).toBeLessThanOrEqual(180);
  });

  it("never exceeds 180, which is the largest angle between two directions", () => {
    for (const [hip, shoulder] of [[179, -179], [-90, 90], [0, 359], [10, 200]]) {
      const frames = Array.from({ length: 20 }, (_, i) => poseFrame(i * 33, hip, shoulder));
      const sep = analyzeMechanics(frames, "swing")!.hipShoulderSeparationDeg;
      expect(sep!, `${hip}/${shoulder}`).toBeLessThanOrEqual(180);
    }
  });
});

describe("kettlebell swing rep counting", () => {
  // segmentPhases splits at every reversal, so a swing is two phases: the bell falling and the
  // bell driving up. Counting both reported a 10-swing set as 20 reps.
  it("counts swings, not half-swings", () => {
    const points = [];
    let t = 0;
    const swings = 8;
    for (let s = 0; s < swings; s++) {
      const amp = 0.9 * (1 - s * 0.02);
      for (let i = 0; i < 40; i++) {
        const phase = i / 40;
        // Fast up, slower down, so the concentric half is distinguishable by speed.
        const y = phase < 0.35 ? (phase / 0.35) * amp : (1 - (phase - 0.35) / 0.65) * amp;
        points.push({ t, x: 0, y, z: 0, confidence: 1 });
        t += 25;
      }
    }
    const result = summarizeKbSwingSet(points, 70);
    expect(result).not.toBeNull();
    // Allow a rep either side for boundary phases; the bug produced roughly double.
    expect(result!.repBreakdown.length).toBeLessThanOrEqual(swings + 1);
    expect(result!.repBreakdown.length).toBeGreaterThanOrEqual(swings - 2);
  });

  it("numbers reps consecutively from one", () => {
    const points = [];
    let t = 0;
    for (let s = 0; s < 5; s++) {
      for (let i = 0; i < 40; i++) {
        const phase = i / 40;
        const y = phase < 0.35 ? (phase / 0.35) * 0.9 : (1 - (phase - 0.35) / 0.65) * 0.9;
        points.push({ t, x: 0, y, z: 0, confidence: 1 });
        t += 25;
      }
    }
    const reps = summarizeKbSwingSet(points, 70)!.repBreakdown;
    expect(reps.map((r) => r.repNumber)).toEqual(reps.map((_, i) => i + 1));
  });
});

describe("an incomplete sprint drill", () => {
  // A 5-10-5 whose return legs never registered used to report as a finished drill carrying one
  // split. The arithmetic was right for the ground measured; the label was wrong.
  const shuttle = [
    { x: 0.5, segmentDistanceYards: undefined },
    { x: 0.8, segmentDistanceYards: 5 },
    { x: 0.2, segmentDistanceYards: 10 },
    { x: 0.5, segmentDistanceYards: 5 },
  ];

  function run(xs: number[]) {
    return xs.map((x, i) => ({ t: i * 33, x }));
  }

  it("flags a run that only crossed some of the checkpoints", () => {
    // Out to the first cone and stops.
    const result = detectSprintCrossings(run([0.4, 0.5, 0.6, 0.7, 0.85]), { checkpoints: shuttle });
    expect(result).not.toBeNull();
    expect(result!.incompleteDrill).toBe(true);
    expect(result!.crossingsExpected).toBe(4);
    expect(result!.crossingsFound).toBeLessThan(4);
  });

  it("does not flag a straight two-checkpoint dash that crossed both", () => {
    const dash = [
      { x: 0.2, segmentDistanceYards: undefined },
      { x: 0.8, segmentDistanceYards: 40 },
    ];
    const result = detectSprintCrossings(run([0.1, 0.3, 0.5, 0.7, 0.9]), { checkpoints: dash });
    expect(result).not.toBeNull();
    expect(result!.incompleteDrill).toBe(false);
    expect(result!.crossingsFound).toBe(2);
  });
});
