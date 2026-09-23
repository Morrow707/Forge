import { describe, it, expect } from "vitest";
import { gripWidthScaleFromFrames, reconcileScaleEstimates } from "./pose-tracking";
import { POSE_LANDMARKS } from "./pose-tracking";

/** A frame with the wrists a given span apart, everything else absent. */
function frame(spanUnits: number) {
  const worldLandmarks: any[] = Array.from({ length: 40 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  worldLandmarks[POSE_LANDMARKS.LEFT_WRIST] = { x: -spanUnits / 2, y: 1, z: 0, visibility: 1 };
  worldLandmarks[POSE_LANDMARKS.RIGHT_WRIST] = { x: spanUnits / 2, y: 1, z: 0, visibility: 1 };
  return { worldLandmarks };
}

describe("the grip the athlete measured", () => {
  it("is not used at all when they have not given one", () => {
    // Optional forever. Without it nothing changes and the existing rulers answer as before.
    expect(gripWidthScaleFromFrames(Array.from({ length: 50 }, () => frame(1)), null)).toBeNull();
    expect(gripWidthScaleFromFrames(Array.from({ length: 50 }, () => frame(1)), 0)).toBeNull();
  });

  it("claims nothing from a handful of frames", () => {
    expect(gripWidthScaleFromFrames([frame(1), frame(1)], 22)).toBeNull();
  });

  it("converts a measured grip into metres per unit", () => {
    const out = gripWidthScaleFromFrames(Array.from({ length: 50 }, () => frame(100)), 22)!;
    expect(out.source).toBe("grip_width");
    // 22in = 0.5588m across 100 units.
    expect(out.scale).toBeCloseTo(0.005588, 6);
  });

  it("TAKES THE WIDEST READING, because foreshortening can only shorten", () => {
    // A bar angled to the lens reads short. The true span is the squarest frame in the set, so
    // the widest reading is the honest one -- a median would sit among the foreshortened reads
    // and report a grip narrower than the athlete's, inflating every distance downstream.
    const frames = [
      ...Array.from({ length: 40 }, () => frame(60)), // foreshortened, the majority
      ...Array.from({ length: 10 }, () => frame(100)), // square to the lens
    ];
    const out = gripWidthScaleFromFrames(frames, 22)!;
    expect(out.scale).toBeCloseTo(0.005588, 5);
  });

  it("ignores a single flown-off landmark rather than letting it set the ruler", () => {
    const frames = [...Array.from({ length: 60 }, () => frame(100)), frame(100000)];
    const out = gripWidthScaleFromFrames(frames, 22)!;
    expect(out.scale).toBeCloseTo(0.005588, 5);
  });

  it("outranks height and shoulder breadth when nothing agrees", () => {
    // It is the only ruler here that is neither a population average nor dependent on the
    // camera being somewhere particular.
    const verdict = reconcileScaleEstimates([
      { source: "shoulder_width", scale: 0.004, uncertaintyFraction: 0.1 },
      { source: "height", scale: 0.003, uncertaintyFraction: 0.05 },
      { source: "grip_width", scale: 0.0056, uncertaintyFraction: 0.04 },
    ]);
    expect(verdict.agreedSources).toEqual(["grip_width"]);
    expect(verdict.corroborated).toBe(false);
  });

  it("still loses to a plate, which needs no athlete data at all", () => {
    const verdict = reconcileScaleEstimates([
      { source: "grip_width", scale: 0.0056, uncertaintyFraction: 0.04 },
      { source: "plate", scale: 0.003, uncertaintyFraction: 0.05 },
    ]);
    expect(verdict.agreedSources).toEqual(["plate"]);
  });
});
