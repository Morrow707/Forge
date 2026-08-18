// Swing/throw mechanics analysis for the Skills camera tracker. Deliberately
// scoped to body mechanics only -- there is no bat/ball/implement detection
// here (see the module-level non-goal noted in SprintTracking's sibling
// design), just what MediaPipe's pose landmarks can tell you about how the
// body itself moved. Two real, well-established kinetic-chain concepts drive
// everything below:
//
// 1. Hip-shoulder separation ("X-factor"): the rotational differential
//    between the hips and shoulders during the load/rotation phase --  more
//    separation generally means more stored rotational torque.
// 2. Proximal-to-distal sequencing: in an efficient swing or throw, the hips
//    rotate first, the torso/shoulders follow, and the arm fires last --
//    each segment's peak rotational speed should happen in that order.
//
// Both need rotation-in-the-horizontal-plane, which normalized 2D landmarks
// can't give (they only see the camera's own image plane). worldLandmarks
// can: they're real-world-scale and hip-centered per frame, so the x/z
// distances between two landmarks in the same frame are meaningful even
// though (as with sprint tracking) the hip center's own position across
// frames is not -- every metric below only ever compares landmarks within a
// single frame, or angles derived that way across frames, never absolute
// position.
import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS, percentile } from "./pose-tracking";
import {
  DEFAULT_SKILL_FAULT_THRESHOLDS,
  type SkillFaultThresholds,
} from "@shared/skill-fault-thresholds";

export type MechanicsFrame = { t: number; worldLandmarks: Landmark[] };

// Hitting and throwing are both rotational kinetic-chain movements, so
// hip-shoulder separation/sequencing/weight-transfer apply to either --
// only arm slot is throw-specific (a bat swing doesn't have one). The
// caller derives this from the skill drill's skillType (Hitting -> "swing",
// Throwing/Pitching -> "throw"); baseball/softball is the only sport in
// scope so no other mode exists yet.
export type MechanicsMode = "swing" | "throw";

// Which metrics are even measurable depends on camera angle, the same
// concrete reason the sprint tracker requires an every-time angle choice:
// face-on sees the body opening up toward the camera (weight shift, hip
// rotation), down-the-line sees the rotation itself edge-on (separation,
// sequencing, arm path) -- each is close to blind to the other's signal.
export type MechanicsCameraAngle = "face_on" | "down_the_line";

// atan2(dz, dx) of the vector between two hip-centered world points gives
// that segment's orientation in the horizontal (x-z) plane -- i.e. how far
// it's rotated around the vertical axis, regardless of which way the
// athlete is facing the camera.
function segmentAngleDeg(worldLandmarks: Landmark[], leftIdx: number, rightIdx: number): number | null {
  const left = worldLandmarks[leftIdx];
  const right = worldLandmarks[rightIdx];
  if (!left || !right) return null;
  return (Math.atan2(right.z - left.z, right.x - left.x) * 180) / Math.PI;
}

// atan2 wraps at +-180deg; a rotating segment crossing that boundary mid-
// motion would otherwise register as a huge fake jump instead of a smooth
// turn. Standard unwrap: nudge each angle by +-360 until it's within 180deg
// of the previous one.
function unwrapDegrees(angles: (number | null)[]): (number | null)[] {
  const result: (number | null)[] = [];
  let prev: number | null = null;
  for (const raw of angles) {
    if (raw == null) {
      result.push(null);
      continue;
    }
    let curr = raw;
    if (prev != null) {
      while (curr - prev > 180) curr -= 360;
      while (curr - prev < -180) curr += 360;
    }
    result.push(curr);
    prev = curr;
  }
  return result;
}

// The frame index (and time) where |angle| is changing fastest -- i.e. when
// that body segment is rotating at peak speed. That timestamp, compared
// across segments, is what "sequencing" actually means.
function peakAngularVelocityTime(times: number[], angles: (number | null)[]): number | null {
  let best: { speed: number; t: number } | null = null;
  for (let i = 1; i < angles.length; i++) {
    const a0 = angles[i - 1];
    const a1 = angles[i];
    if (a0 == null || a1 == null) continue;
    const dt = times[i] - times[i - 1];
    if (dt <= 0) continue;
    const speed = Math.abs(a1 - a0) / dt;
    if (!best || speed > best.speed) best = { speed, t: (times[i] + times[i - 1]) / 2 };
  }
  return best?.t ?? null;
}

export type SequencingResult = {
  hipPeakTimeMs: number | null;
  shoulderPeakTimeMs: number | null;
  // Only populated in "throw" mode.
  armPeakTimeMs: number | null;
  // Hips before shoulders before arm (proximal to distal), within a small
  // tolerance for frame-rate discretization noise -- not a knife's-edge
  // ordering check.
  wellSequenced: boolean;
};

export type ArmSlot = {
  angleDeg: number;
  label: "overhand" | "three-quarter" | "sidearm";
};

export type MechanicsResult = {
  hipShoulderSeparationDeg: number | null;
  // % of stance width the ankle-midpoint shifted between the first and
  // last third of the capture -- see the comment above weightTransferPct's
  // computation for why this is used instead of trying to label a "front"
  // and "back" foot.
  weightTransferPct: number | null;
  hipRotationDeg: number | null;
  sequencing: SequencingResult;
  armSlot: ArmSlot | null;
  // "throw" mode only -- peak real-world speed of the throwing-side wrist
  // (whichever one travels further, same detection armSlot already uses)
  // across the whole capture. Not the thrown object's own exit velocity --
  // there's no ball/implement detection here (see the module comment) --
  // but wrist speed at release is an established, reasonable proxy for it,
  // and needs nothing beyond body joints this tracker already has.
  peakWristSpeedMps: number | null;
  // Real-world ankle-to-ankle separation at its peak during the capture --
  // the "stride out" moment in a throwing or hitting motion, in meters.
  // Applies to both modes (a batter strides the same way a QB does).
  // Meaningful as a same-frame measurement the same way
  // hipShoulderSeparationDeg is (see the module comment): world landmarks
  // are hip-centered per frame, so a same-frame ankle-to-ankle distance is
  // real-world scale even though the hip center's own position across
  // frames isn't. Ground-plane (x/z) only, not y, so a foot briefly higher
  // off the ground mid-stride doesn't inflate the reading.
  strideLengthM: number | null;
};

export function analyzeMechanics(
  frames: MechanicsFrame[],
  mode: MechanicsMode,
  thresholds: SkillFaultThresholds = DEFAULT_SKILL_FAULT_THRESHOLDS,
): MechanicsResult {
  const times = frames.map((f) => f.t);
  const hipAnglesRaw = frames.map((f) => segmentAngleDeg(f.worldLandmarks, POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP));
  const shoulderAnglesRaw = frames.map((f) =>
    segmentAngleDeg(f.worldLandmarks, POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER),
  );
  const hipAngles = unwrapDegrees(hipAnglesRaw);
  const shoulderAngles = unwrapDegrees(shoulderAnglesRaw);

  const separations = hipAngles
    .map((h, i) => {
      const s = shoulderAngles[i];
      return h != null && s != null ? Math.abs(s - h) : null;
    })
    .filter((v): v is number => v != null);
  // 95th percentile, not a raw max -- see percentile's own comment in
  // pose-tracking.ts. This is the headline X-factor number a coach reads
  // off the swing, not just a pass/fail fault threshold, so a single
  // misdetected frame distorting it directly is worse here than almost
  // anywhere else in the app -- the same single-bad-frame vulnerability
  // detectFormFaults' bar-tilt/valgus checks were already protected from.
  const hipShoulderSeparationDeg = separations.length > 0 ? percentile(separations, 0.95) : null;

  const validHipAngles = hipAngles.filter((v): v is number => v != null);
  // Trims both ends (95th minus 5th percentile) rather than raw max minus
  // min -- a spike on EITHER end corrupts a plain range the same way, so
  // both need the same protection.
  const hipRotationDeg =
    validHipAngles.length > 0 ? percentile(validHipAngles, 0.95) - percentile(validHipAngles, 0.05) : null;

  const hipPeakTimeMs0 = peakAngularVelocityTime(times, hipAngles);
  const shoulderPeakTimeMs0 = peakAngularVelocityTime(times, shoulderAngles);

  let armPeakTimeMs: number | null = null;
  let armSlot: ArmSlot | null = null;
  let peakWristSpeedMps: number | null = null;
  if (mode === "throw") {
    // The throwing arm is whichever wrist travels the most during the
    // capture -- the glove-side arm barely moves by comparison, so this
    // reliably picks the right one regardless of handedness.
    const wristPathLength = (idx: number) => {
      let total = 0;
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1].worldLandmarks[idx];
        const b = frames[i].worldLandmarks[idx];
        if (!a || !b) continue;
        total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      }
      return total;
    };
    const leftPath = wristPathLength(POSE_LANDMARKS.LEFT_WRIST);
    const rightPath = wristPathLength(POSE_LANDMARKS.RIGHT_WRIST);
    const throwingSide = leftPath >= rightPath ? "left" : "right";
    const shoulderIdx = throwingSide === "left" ? POSE_LANDMARKS.LEFT_SHOULDER : POSE_LANDMARKS.RIGHT_SHOULDER;
    const elbowIdx = throwingSide === "left" ? POSE_LANDMARKS.LEFT_ELBOW : POSE_LANDMARKS.RIGHT_ELBOW;
    const wristIdx = throwingSide === "left" ? POSE_LANDMARKS.LEFT_WRIST : POSE_LANDMARKS.RIGHT_WRIST;

    // Frame-to-frame speed of the throwing wrist, real-world m/s -- same
    // "95th percentile, not a raw max" protection hipShoulderSeparationDeg
    // above uses, since a single noisy frame (a brief tracking jitter)
    // would otherwise spike a max reading the same way it would there.
    const wristSpeeds: number[] = [];
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1].worldLandmarks[wristIdx];
      const b = frames[i].worldLandmarks[wristIdx];
      const dtSeconds = (frames[i].t - frames[i - 1].t) / 1000;
      if (!a || !b || dtSeconds <= 0) continue;
      wristSpeeds.push(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dtSeconds);
    }
    peakWristSpeedMps = wristSpeeds.length > 0 ? Math.round(percentile(wristSpeeds, 0.95) * 100) / 100 : null;

    const armAnglesRaw = frames.map((f) => {
      const shoulder = f.worldLandmarks[shoulderIdx];
      const elbow = f.worldLandmarks[elbowIdx];
      if (!shoulder || !elbow) return null;
      // Elevation above horizontal (0 = arm straight out to the side, 90 =
      // straight up), independent of which way the athlete faces the
      // camera or which arm is throwing.
      return (Math.atan2(Math.abs(shoulder.y - elbow.y), Math.abs(elbow.x - shoulder.x)) * 180) / Math.PI;
    });
    armPeakTimeMs = peakAngularVelocityTime(times, unwrapDegrees(armAnglesRaw));

    if (armPeakTimeMs != null) {
      let closestIdx = 0;
      let closestDist = Infinity;
      for (let i = 0; i < times.length; i++) {
        const dist = Math.abs(times[i] - armPeakTimeMs);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }
      const angleAtRelease = armAnglesRaw[closestIdx];
      if (angleAtRelease != null) {
        armSlot = {
          angleDeg: Math.round(angleAtRelease),
          label: angleAtRelease >= 60 ? "overhand" : angleAtRelease >= 30 ? "three-quarter" : "sidearm",
        };
      }
    }
  }

  const wellSequenced =
    hipPeakTimeMs0 != null &&
    shoulderPeakTimeMs0 != null &&
    shoulderPeakTimeMs0 >= hipPeakTimeMs0 - thresholds.sequencingToleranceMs &&
    (armPeakTimeMs == null || armPeakTimeMs >= shoulderPeakTimeMs0 - thresholds.sequencingToleranceMs);

  // Ankle x-positions are meaningful within a single (hip-centered) frame
  // even though the hip center's own position across frames isn't -- see
  // the module comment. Normalizing the shift by stance width avoids ever
  // having to label a "front" and "back" foot, which would need a
  // reliable facing-direction assumption this tracker doesn't make.
  const ankleMidX = (f: MechanicsFrame) => {
    const left = f.worldLandmarks[POSE_LANDMARKS.LEFT_ANKLE];
    const right = f.worldLandmarks[POSE_LANDMARKS.RIGHT_ANKLE];
    if (!left || !right) return null;
    return { mid: (left.x + right.x) / 2, width: Math.abs(left.x - right.x) };
  };
  const ankleSamples = frames.map(ankleMidX).filter((v): v is { mid: number; width: number } => v != null);
  let weightTransferPct: number | null = null;
  if (ankleSamples.length >= 3) {
    const third = Math.max(1, Math.floor(ankleSamples.length / 3));
    const startAvg = ankleSamples.slice(0, third).reduce((a, s) => a + s.mid, 0) / third;
    const endSamples = ankleSamples.slice(-third);
    const endAvg = endSamples.reduce((a, s) => a + s.mid, 0) / endSamples.length;
    const stanceWidth = ankleSamples.reduce((a, s) => a + s.width, 0) / ankleSamples.length;
    if (stanceWidth > 0.02) {
      weightTransferPct = Math.max(0, Math.min(100, Math.round((Math.abs(endAvg - startAvg) / stanceWidth) * 100)));
    }
  }

  const ankleSeparations = frames
    .map((f) => {
      const left = f.worldLandmarks[POSE_LANDMARKS.LEFT_ANKLE];
      const right = f.worldLandmarks[POSE_LANDMARKS.RIGHT_ANKLE];
      if (!left || !right) return null;
      return Math.hypot(left.x - right.x, left.z - right.z);
    })
    .filter((v): v is number => v != null);
  // 95th percentile, not a raw max -- same noise protection as
  // hipShoulderSeparationDeg above.
  const strideLengthM =
    ankleSeparations.length > 0 ? Math.round(percentile(ankleSeparations, 0.95) * 100) / 100 : null;

  return {
    hipShoulderSeparationDeg: hipShoulderSeparationDeg != null ? Math.round(hipShoulderSeparationDeg) : null,
    weightTransferPct,
    hipRotationDeg: hipRotationDeg != null ? Math.round(hipRotationDeg) : null,
    sequencing: {
      hipPeakTimeMs: hipPeakTimeMs0,
      shoulderPeakTimeMs: shoulderPeakTimeMs0,
      armPeakTimeMs,
      wellSequenced,
    },
    armSlot,
    peakWristSpeedMps,
    strideLengthM,
  };
}

export type MechanicsFault = { code: string; label: string };

// Cutoffs are coach-adjustable (see shared/skill-fault-thresholds.ts) --
// they started as fixed values picked from general hitting/throwing
// mechanics coaching knowledge, not calibrated against any real athlete's
// data.
export function detectMechanicsFaults(
  result: MechanicsResult,
  cameraAngle: MechanicsCameraAngle,
  thresholds: SkillFaultThresholds = DEFAULT_SKILL_FAULT_THRESHOLDS,
): MechanicsFault[] {
  const faults: MechanicsFault[] = [];

  if (cameraAngle === "face_on") {
    if (result.weightTransferPct != null && result.weightTransferPct < thresholds.lowWeightTransferPct) {
      faults.push({
        code: "low_weight_transfer",
        label: "Weight staying back -- work on shifting into your front side",
      });
    }
    if (result.hipRotationDeg != null && result.hipRotationDeg < thresholds.lowHipRotationDeg) {
      faults.push({
        code: "low_hip_rotation",
        label: "Hips aren't rotating through -- work on clearing your hips fully",
      });
    }
  } else {
    if (result.hipShoulderSeparationDeg != null && result.hipShoulderSeparationDeg < thresholds.lowSeparationDeg) {
      faults.push({
        code: "low_hip_shoulder_separation",
        label: "Limited hip-shoulder separation -- work on delaying your upper body to build more torque",
      });
    }
    if (!result.sequencing.wellSequenced) {
      faults.push({
        code: "poor_sequencing",
        label: "Upper body firing before the hips -- work on sequencing from the ground up",
      });
    }
  }

  return faults;
}
