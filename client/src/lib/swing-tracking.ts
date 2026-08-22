// Golf/baseball swing-phase detection and tempo -- built entirely off
// body joints already tracked for every other mode. The "implement" here
// is the midpoint of both wrists (the grip proxy), same "hands closed
// around it" reasoning already used for barbell tracking elsewhere in
// this app -- not a new object-tracking pipeline. Actual club/bat-relative
// data (via a retuned ArImplementTracker.swift) is a deliberately separate,
// harder piece that needs real on-device validation against real swings
// before it ships -- this module only ever reasons about where the
// athlete's hands were, which is enough for tempo, rotation, and head
// sway, not for clubhead-specific numbers. See this session's own scoping
// of that boundary.
import type { Landmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS, type PoseFrame } from "./pose-tracking";
import { movingAverage, framesForDuration, type TrackedPoint } from "./bar-tracking";

const MIN_VISIBILITY = 0.5;

// First-pass constants, not yet validated against real swings on a real
// device -- a golf/baseball swing's speed profile is far faster and more
// abrupt than a lift rep's, so these deliberately aren't bar-tracking.ts's
// own thresholds. Expect these to need real tuning once this is actually
// tested against footage, the same way jump-tracking.ts's amplitude
// thresholds were tuned from real jump data.
const TARGET_SMOOTHING_MS = 80;
const TAKEAWAY_TRIGGER_MPS = 0.3;
const TOP_SETTLE_MPS = 0.25;

function gripPoint(frame: PoseFrame): TrackedPoint | null {
  const lw = frame.worldLandmarks[POSE_LANDMARKS.LEFT_WRIST];
  const rw = frame.worldLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
  if (!lw || !rw) return null;
  if ((lw.visibility ?? 1) < MIN_VISIBILITY || (rw.visibility ?? 1) < MIN_VISIBILITY) return null;
  return {
    t: frame.t,
    x: (lw.x + rw.x) / 2,
    y: (lw.y + rw.y) / 2,
    z: (lw.z + rw.z) / 2,
  };
}

function speedsMps(points: TrackedPoint[]): number[] {
  const speeds = [0];
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].t - points[i - 1].t) / 1000;
    if (dt <= 0) {
      speeds.push(0);
      continue;
    }
    const dist = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
      points[i].z - points[i - 1].z,
    );
    speeds.push(dist / dt);
  }
  return speeds;
}

export type SwingPhases = {
  takeawayT: number;
  topT: number;
  impactT: number;
  backswingMs: number;
  downswingMs: number;
  // backswing : downswing -- the well-known ~3:1 benchmark in golf
  // instruction. E.g. 3 means the backswing took 3x as long as the
  // downswing.
  tempoRatio: number;
};

// Address -> takeaway (speed crosses above threshold) -> backswing ->
// top (speed falls back near zero -- the real physical direction change,
// not just elapsed time) -> downswing -> impact (peak speed, since grip
// speed is highest right around striking the ball, then decelerates into
// follow-through). Level-crossing on a derived speed signal, the same
// state-machine shape jump-tracking.ts uses on position -- a single swing
// per tracked set, not a rep-counting loop.
function detectPhases(points: TrackedPoint[]): SwingPhases | null {
  if (points.length < 6) return null;
  const smoothWindow = framesForDuration(points, TARGET_SMOOTHING_MS);
  const speeds = movingAverage(speedsMps(points), smoothWindow);

  let state: "address" | "backswing" | "downswing" = "address";
  let takeawayIdx = -1;
  let topIdx = -1;
  let impactIdx = -1;
  let peakSpeedSoFar = 0;

  for (let i = 1; i < speeds.length; i++) {
    if (state === "address") {
      if (speeds[i] >= TAKEAWAY_TRIGGER_MPS) {
        state = "backswing";
        takeawayIdx = i;
      }
    } else if (state === "backswing") {
      if (speeds[i] <= TOP_SETTLE_MPS) {
        state = "downswing";
        topIdx = i;
        peakSpeedSoFar = 0;
      }
    } else {
      if (speeds[i] > peakSpeedSoFar) {
        peakSpeedSoFar = speeds[i];
        impactIdx = i;
      } else if (impactIdx !== -1 && i - impactIdx > smoothWindow && speeds[i] < peakSpeedSoFar * 0.6) {
        // Clearly decelerating past the peak -- into follow-through, done.
        break;
      }
    }
  }

  if (takeawayIdx === -1 || topIdx === -1 || impactIdx === -1) return null;

  const takeawayT = points[takeawayIdx].t;
  const topT = points[topIdx].t;
  const impactT = points[impactIdx].t;
  const backswingMs = topT - takeawayT;
  const downswingMs = impactT - topT;
  if (backswingMs <= 0 || downswingMs <= 0) return null;

  return {
    takeawayT,
    topT,
    impactT,
    backswingMs,
    downswingMs,
    tempoRatio: Math.round((backswingMs / downswingMs) * 100) / 100,
  };
}

// Total horizontal (not vertical -- a golfer's head naturally rises
// slightly through the swing, that's not the fault this flags) head
// displacement across the swing window -- a coaching staple: excessive
// head movement is one of the most commonly flagged faults in both golf
// and baseball hitting mechanics.
function computeHeadSwayCm(frames: PoseFrame[], startT: number, endT: number): number | null {
  const noses = frames
    .filter((f) => f.t >= startT && f.t <= endT)
    .map((f) => f.worldLandmarks[POSE_LANDMARKS.NOSE])
    .filter((n): n is Landmark => !!n && (n.visibility ?? 1) >= MIN_VISIBILITY);
  if (noses.length < 3) return null;
  const xs = noses.map((n) => n.x);
  const zs = noses.map((n) => n.z);
  const rangeX = Math.max(...xs) - Math.min(...xs);
  const rangeZ = Math.max(...zs) - Math.min(...zs);
  return Math.round(Math.hypot(rangeX, rangeZ) * 100 * 10) / 10;
}

export type SwingSummary = {
  phases: SwingPhases | null;
  headSwayCm: number | null;
  gripTrace: TrackedPoint[];
};

export function summarizeSwing(frames: PoseFrame[]): SwingSummary {
  const gripTrace = frames.map(gripPoint).filter((p): p is TrackedPoint => p != null);
  const phases = detectPhases(gripTrace);
  const headSwayCm = phases ? computeHeadSwayCm(frames, phases.takeawayT, phases.impactT) : null;
  return { phases, headSwayCm, gripTrace };
}
