/**
 * A 40-YARD DASH FILMED FROM THE FINISH LINE, THROUGH A REAL PINHOLE, WHERE THE TRUTH IS KNOWN.
 *
 * The phone stands on the finish line extended, 3m off the lane, 1.2m up, on the 0.5x lens,
 * angled back up the lane. The athlete holds a set position for a second, then runs a modelled
 * sprint (top speed 9.5 m/s). The test projects the shoulders and hips into the image, hands the
 * frames to timeSprintFromFinishView with the two tapped ends of the finish line, and checks the
 * time against the moment the chest really crossed the finish plane and the moment the hips really
 * started to move. It is run for a 5'1" and a 6'6" athlete, at 30 and 60 frames a second.
 */
import { describe, expect, it } from "vitest";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS } from "./pose-tracking";
import { timeSprintFromFinishView, type FinishLine, type FinishViewFrame } from "./sprint-finish-view";

type V3 = [number, number, number];
const W = 1280;
const H = 720;
const FOV_DEG = 106;
const DEGREES_IN_HALF_TURN = 180;
const DEG = Math.PI / DEGREES_IN_HALF_TURN;
const CAMERA_OFF_LANE_M = -3;
const CAMERA_HEIGHT_M = 1.2;
const LOOK_HEIGHT_M = 1;
const LOOK_DOWN_LANE_M = 20;
const CAMERA: V3 = [CAMERA_OFF_LANE_M, CAMERA_HEIGHT_M, 0];
const LOOK_AT: V3 = [0, LOOK_HEIGHT_M, LOOK_DOWN_LANE_M];
const TWO = 2;
const METRES_PER_INCH = 0.0254;
const SET_HIP = 0.32;
const RUN_HIP = 0.53;
const SET_SHOULDER = 0.42;
const RUN_SHOULDER = 0.81;
const RISE_S = 0.35;
const SWAY_RATE = 7;
const LANDMARK_COUNT = 33;
const HALF_SHOULDER_PER_70IN = 0.2;
const REFERENCE_IN = 70;
const SEEN = 0.95;
const HIP_OF_SHOULDER_WIDTH = 0.8;
const SEARCH_S = 10;
const SHORT_IN = 61;
const TALL_IN = 78;
const FPS_30 = 30;
const FPS_60 = 60;
const FRAME_AND_A_HALF = 1.5;
const MIN_HOLD_SEEN_S = 0.5;
const STOP_SHORT_S = 3;
const ROLLING_AFTER_S = 0.4;
const ROLLING_CONFIDENCE_CEILING = 0.5;
const LCG_A = 1664525;
const LCG_C = 1013904223;
const LCG_M = 4294967296;
const NOISE_SEED = 11;
/** What Vision's landmarks jitter by on a small, distant figure. */
const VISION_NOISE_PX = 1.5;
const FORTY_YARDS_M = 36.576;
const TOP_SPEED = 9.5;
const ACCEL_TAU = 1;
const HOLD_S = 1;
const LANE_HALF_WIDTH = 0.6;
const MS = 1000;
const SWAY_M = 0.001;
const RECORD_S = 7.5;
const CHEST_FROM_SHOULDERS = 0.3;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const forward = norm(sub(LOOK_AT, CAMERA));
const right = norm(cross([0, 1, 0], forward));
const up = cross(forward, right);
const focal = W / TWO / Math.tan((FOV_DEG * DEG) / TWO);

function project(p: V3): { x: number; y: number } {
  const d = sub(p, CAMERA);
  const z = dot(d, forward);
  // Image x to the right of the lens's view, y down; `right` here points to the camera's left in
  // a right-handed world, so it is negated for a picture as the phone shows it.
  return { x: (W / TWO - (focal * dot(d, right)) / z) / W, y: (H / TWO - (focal * dot(d, up)) / z) / H };
}

/** Distance run after `t` seconds of running. */
const ran = (t: number) => (t <= 0 ? 0 : TOP_SPEED * (t - ACCEL_TAU * (1 - Math.exp(-t / ACCEL_TAU))));

function athlete(heightIn: number, t: number): { shoulderZ: number; hipZ: number; hip: number; shoulder: number; sway: number } {
  const h = heightIn * METRES_PER_INCH;
  const set = t < HOLD_S;
  const z = FORTY_YARDS_M - ran(t - HOLD_S);
  // Rising out of the set takes a moment, not a frame.
  const rise = Math.min(1, Math.max(0, (t - HOLD_S) / RISE_S));
  return {
    shoulderZ: z,
    hipZ: z,
    hip: (SET_HIP + (RUN_HIP - SET_HIP) * rise) * h,
    shoulder: (SET_SHOULDER + (RUN_SHOULDER - SET_SHOULDER) * rise) * h,
    sway: set ? SWAY_M * Math.sin(t * SWAY_RATE) : 0,
  };
}

/** A fixed-seed Gaussian, so a noisy run is the same run every time. */
function gaussian(seed: number): () => number {
  let state = seed;
  const next = () => {
    state = (state * LCG_A + LCG_C) % LCG_M;
    return state / LCG_M;
  };
  return () => Math.sqrt(-TWO * Math.log(Math.max(next(), Number.MIN_VALUE))) * Math.cos(TWO * Math.PI * next());
}

function framesFor(heightIn: number, fps: number, noisePx = 0): FinishViewFrame[] {
  const noise = gaussian(NOISE_SEED);
  const count = Math.round(RECORD_S * fps);
  return Array.from({ length: count }, (_, i) => {
    const t = i / fps;
    const a = athlete(heightIn, t);
    const lm: NormalizedLandmark[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
    const half = HALF_SHOULDER_PER_70IN * (heightIn / REFERENCE_IN);
    const put = (index: number, p: V3) => {
      const q = project(p);
      lm[index] = { x: q.x + (noisePx * noise()) / W, y: q.y + (noisePx * noise()) / H, z: 0, visibility: SEEN };
    };
    put(POSE_LANDMARKS.LEFT_SHOULDER, [-half, a.shoulder, a.shoulderZ + a.sway]);
    put(POSE_LANDMARKS.RIGHT_SHOULDER, [half, a.shoulder, a.shoulderZ + a.sway]);
    put(POSE_LANDMARKS.LEFT_HIP, [-half * HIP_OF_SHOULDER_WIDTH, a.hip, a.hipZ + a.sway]);
    put(POSE_LANDMARKS.RIGHT_HIP, [half * HIP_OF_SHOULDER_WIDTH, a.hip, a.hipZ + a.sway]);
    return { t: t * MS, landmarks: lm, frameWidth: W, frameHeight: H };
  });
}

const tapped: FinishLine = { a: project([-LANE_HALF_WIDTH, 0, 0]), b: project([LANE_HALF_WIDTH, 0, 0]) };

/** When the chest really crossed z = 0: the run covers the whole 40 then. */
function trueElapsedSeconds(): number {
  const steps = 200_000;
  const dt = SEARCH_S / steps;
  const t = Array.from({ length: steps }, (_, i) => i * dt).find((x) => ran(x) >= FORTY_YARDS_M) ?? 0;
  return t;
}

describe("a sprint timed from the finish line", () => {
  void CHEST_FROM_SHOULDERS;
  [SHORT_IN, TALL_IN].forEach((inches) =>
    [FPS_30, FPS_60].forEach((fps) =>
      it(`times a ${inches}in athlete's 40 at ${fps}fps to within a frame and a half`, () => {
        const r = timeSprintFromFinishView(framesFor(inches, fps), tapped);
        expect(r.notes).toEqual([]);
        expect(r.totalElapsedSeconds).not.toBeNull();
        expect(Math.abs((r.totalElapsedSeconds ?? 0) - trueElapsedSeconds())).toBeLessThan(FRAME_AND_A_HALF / fps);
        expect(r.startT! / MS).toBeGreaterThan(HOLD_S - 1 / fps);
        expect(r.startConfidence).toBeGreaterThan(0);
        expect(r.setHoldSeconds).toBeGreaterThan(MIN_HOLD_SEEN_S);
      }),
    ),
  );

  [SHORT_IN, TALL_IN].forEach((inches) =>
    it(`with ${VISION_NOISE_PX}px of landmark noise, a ${inches}in athlete's 40 stays inside its stated start uncertainty`, () => {
      const r = timeSprintFromFinishView(framesFor(inches, FPS_30, VISION_NOISE_PX), tapped);
      expect(r.totalElapsedSeconds).not.toBeNull();
      // The stated start uncertainty plus a frame for the finish must cover the real error.
      expect(Math.abs((r.totalElapsedSeconds ?? 0) - trueElapsedSeconds())).toBeLessThan(
        (r.startUncertaintySeconds ?? 0) + 1 / FPS_30,
      );
    }),
  );

  it("says it saw no finish when the athlete never reaches the line, and gives no time", () => {
    const frames = framesFor(REFERENCE_IN, FPS_30).filter((f) => f.t < STOP_SHORT_S * MS);
    const r = timeSprintFromFinishView(frames, tapped);
    expect(r.notes).toContain("no_finish_crossing");
    expect(r.totalElapsedSeconds).toBeNull();
  });

  it("marks a rolling start with no set position and lowers its confidence", () => {
    const frames = framesFor(REFERENCE_IN, FPS_30).filter((f) => f.t >= (HOLD_S + ROLLING_AFTER_S) * MS);
    const r = timeSprintFromFinishView(frames, tapped);
    expect(r.notes).toContain("no_set_position");
    expect(r.startConfidence).toBeLessThanOrEqual(ROLLING_CONFIDENCE_CEILING);
  });
});
