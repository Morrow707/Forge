import { describe, expect, it } from "vitest";
import { measureBodyLoss } from "./body-loss";
import type { PoseFrame } from "./native-av-preview";

const FPS = 30;
const HIGH = 0.9;
const FADING = 0.2;
const GAP_START = 10;
const GAP_END = 25;
const NO_WRIST_START = 30;
const NO_WRIST_END = 35;
const TOTAL = 60;

function frame(i: number): PoseFrame {
  const inGap = i >= GAP_START && i < GAP_END;
  const noWrists = i >= NO_WRIST_START && i < NO_WRIST_END;
  const edge = i === GAP_START - 1 || i === GAP_END;
  const joints = [
    { name: "leftShoulder", x: 0.4, y: 0.6, confidence: HIGH },
    ...(noWrists ? [] : [{ name: "leftWrist", x: 0.4, y: 0.5, confidence: HIGH }]),
  ];
  return {
    frameIndex: i,
    timestamp: i / FPS,
    tracked: !inGap,
    joints: inGap ? [] : joints,
    frameWidth: 1280,
    frameHeight: 720,
    bodyConfidence: inGap ? undefined : edge ? FADING : HIGH,
  } as unknown as PoseFrame;
}

describe("where the body went", () => {
  const loss = measureBodyLoss(Array.from({ length: TOTAL }, (_, i) => frame(i)));

  it("separates no body at all from a body missing its wrists", () => {
    expect(loss.noBody).toBe(GAP_END - GAP_START);
    expect(loss.bodyNoWrists).toBe(NO_WRIST_END - NO_WRIST_START);
    expect(loss.bodyNoShoulders).toBe(0);
  });

  it("times the longest hole and reads the confidence at its edges", () => {
    expect(loss.longestNoBodySeconds).toBeCloseTo((GAP_END - GAP_START) / FPS, 2);
    expect(loss.medianBodyConfidence).toBe(HIGH);
    expect(loss.medianBodyConfidenceAtEdges).toBe(FADING);
  });
});
