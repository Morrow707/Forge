/**
 * THE ATHLETE'S OWN BONES, IN METRES, MEASURED ON THIS TAKE -- THE RULER THAT DOES NOT CARE
 * WHERE THE PHONE STOOD.
 *
 * Scott, 2026-09-29: "The camera has a 3d scanner and should be able to measure real world
 * accurately based off of the data I've uploaded, and the known height of the athlete." And:
 * "I'm not measuring anything the camera should know. Everything should be remote."
 *
 * Every ruler before this one was a 2D guess: pixels, and an assumed size for the thing in
 * them. Height needs the whole body in frame and standing; shoulder breadth is a population
 * fraction of stature; the plate needs a detector to find it. All three pay for the camera angle
 * because a 2D span foreshortens. Vision's 3D body pose (VNDetectHumanBodyPose3DRequest, already
 * running on every take on a stride since build 560, Rule #2) reports each joint in METRES
 * relative to the hip, and a bone's length in that space is the same whichever way the athlete
 * is turned. That is the ruler: bone length in metres over the same bone's longest projection in
 * pixels.
 *
 * TWO KINDS OF METRE. On a phone with a depth sensor Vision MEASURES the skeleton
 * (`heightEstimation == .measured`); on every other phone it scales the skeleton to a REFERENCE
 * stature (`.reference`) and reports that stature in `bodyHeight`. A reference skeleton is the
 * athlete's proportions at somebody else's size. The athlete's known height fixes that in one
 * multiplication: every 3D length is scaled by (real height / reference height). A measured
 * skeleton is taken as it is. With no height on file the reference skeleton is still used, at a
 * wider stated uncertainty -- Rule #1: a number with a caveat beats no number.
 *
 * THE 3D LENGTH IS A MEDIAN, THE 2D SPAN IS THE LONGEST. A bone's length in metres does not
 * change, so across the frames that carry a 3D pose the median rejects the odd bad estimate. Its
 * projection in pixels only ever reads SHORT of the truth (it foreshortens), so the longest
 * projection across the take is the one closest to square-on -- the same rule the grip ruler,
 * the limb model and movementAxisFromGrip already run on. Dividing a true length by the least
 * foreshortened projection is what makes this hold at any angle.
 *
 * A PEER, NOT A LEADER. This is one more candidate handed to reconcileScaleEstimates and held
 * against the plate, the grip, the learned bone, height and shoulder breadth. It decides
 * nothing on its own and switches nothing off.
 *
 * TWO METHODS, AND THE SECOND EXISTS BECAUSE THE FIRST WAS WRONG TWICE.
 *
 * "Longest projection" (above) was the first method, and on both of its real takes -- Scott's
 * bench sets 2 and 3, 2026-09-29, phone at the foot of the bench, OVR sensor on the bar -- it
 * scaled the set 1.8-1.9x too SMALL, while the shoulder ruler beside it was within a tenth. Not
 * one bone: every bone. Set 3's 95th-percentile 2D spans put the upper arm at 176 units and the
 * shin at 208 against a grip of 173, which at the sensor's scale is an 0.8m upper arm and a 1m
 * shin. The "longest projection" of a bone across 900 frames is not its square-on view; on a
 * take where a tenth of the frames carry a jumped landmark (framesBodySuspect was 82) it is one
 * of those, and a percentile that high lands squarely in them. The legs are also NEARER the lens
 * than the bar from the foot of a bench, so they project large per metre for a reason that has
 * nothing to do with foreshortening. Both failures come from asking a percentile of 2D spans to
 * stand in for the bone's orientation.
 *
 * "In plane" is the method the 3D skeleton was always for. The native plugin now emits every
 * joint in the CAMERA's frame as well (cx, cy, cz -- the observation's cameraOriginMatrix
 * inverted), so on each 3D frame a bone's visible length is known directly: hypot(dcx, dcy) in
 * metres is the part of the bone that lies in the image plane, and the same bone's 2D span on
 * the same frame is that length in units. Their ratio is the scale, per bone, per frame, with
 * no maximum and no percentile to be captured by a bad frame -- a MEDIAN over every (frame,
 * bone) sample, then across bones. A bone pointing at the lens is skipped (its in-plane part is
 * too small a fraction of its length to divide by), and the frames a landmark jumped on are
 * outvoted rather than chosen.
 *
 * The longest-projection method stays for a frame set with no camera-space joints (a native
 * build older than the one that emits them), flagged as such and DEMOTED below the shoulder
 * ruler in reconcileScaleEstimates: two takes say that is where it belongs until one says
 * otherwise. Both methods record every bone. The median wrist depth is recorded too, because
 * with the lens's field of view it is a third ruler (metres per unit at the bar's own depth =
 * depth x 2 tan(fov/2) / frame width) and the next comparison can say whether it is any good.
 */
import type { PoseFrame as NativePoseFrame } from "./native-av-preview";
import type { LimbKey } from "@shared/athlete-body-model";
import type { Landmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS } from "./pose-tracking";
import { visionJointsToWorldLandmarks } from "./vision-body-landmarks";

export type Body3DScaleReading = {
  /** Metres per pixel-space unit, or null when the take carried no usable 3D pose. */
  scale: number | null;
  uncertaintyFraction: number;
  /** Frames that carried a 3D pose with the limb that decided the number. */
  framesUsed: number;
  /** The bone whose implied scale is the median across the bones measured both ways. */
  limb: LimbKey | null;
  /** That bone's length in metres, after any height correction. */
  metres: number | null;
  /** Every bone measured both ways, with the scale each implies, so a wrong number can be
   *  traced to the bone that produced it. Recorded in the diagnostics. Under the in-plane
   *  method `metres` is the median visible (in-plane) length, `spanUnits` the median 2D span on
   *  the same frames and `samples` the (frame, side) pairs behind them; under the
   *  longest-projection method they are the full 3D length and the 95th-percentile span. */
  limbs: { limb: LimbKey; metres: number; spanUnits: number; scale: number; samples?: number }[];
  /** Which of the two methods produced the number -- see the file comment. */
  method: "in_plane" | "longest_projection" | null;
  /** How far the wrists sat from the lens, metres, median over the 3D frames (after the
   *  height correction). Null without camera-space joints. Recorded for the depth ruler. */
  medianWristDepthM: number | null;
  /** How the 3D skeleton's scale was arrived at: measured by a depth sensor, scaled to a
   *  reference stature and then corrected by the athlete's height, or reference alone. */
  heightSource: "measured" | "reference_corrected" | "reference_uncorrected" | null;
  /** The reference stature Vision scaled to, when it did (median across frames). */
  referenceHeightM: number | null;
  rejectedBecause: "no_3d_frames" | "no_2d_span" | "implausible_correction" | null;
};

/** How wrong a bone length from a depth-measured skeleton may be even when it is working. Apple
 *  publishes no figure; a twentieth is the working assumption until the OVR comparisons say
 *  otherwise, and every take records what this ruler read so they can. */
export const BODY_3D_MEASURED_UNCERTAINTY = 0.05;
/** A reference skeleton corrected by the athlete's stated height: the model's own proportion
 *  error plus whatever the height on file is off by. */
// Was 0.08. Across seven sensor-paired benches the in-plane, height-corrected ruler read 0.94,
// 0.74, 1.04, 0.85, 1.23, 0.98 and 0.75 of the sensor: a 20% instrument, weighted as one in
// reconcileScaleEstimates. The shoulder ruler beside it read 1.16, 1.00, 1.05, 1.00, 1.07 and
// 1.00 (BIACROMIAL_TOLERANCE_FRACTION), which is why the weights have to come from evidence.
export const BODY_3D_CORRECTED_UNCERTAINTY = 0.2;
/** A reference skeleton with nothing to correct it: the athlete's real stature could be a tenth
 *  away from Vision's reference either way, which is the same class of error the shoulder ruler
 *  carries. Kept as a candidate anyway (Rule #1) and ranked by its stated uncertainty. */
// Wider than the corrected ruler's 0.2 by the same margin it was before: a skeleton nobody
// scaled to the athlete is worse than one that was.
export const BODY_3D_UNCORRECTED_UNCERTAINTY = 0.3;

/** Fewer 3D frames than this and a median is not a median. A bar take runs the 3D request every
 *  120th raw frame, so a 20-second set at 120fps gives about twenty; five is a two-second take. */
export const MIN_BODY_3D_FRAMES = 5;

/** A height correction outside this band means the reference stature or the height on file is
 *  not what it claims to be (a height typed in cm as inches, a skeleton Vision scaled to nothing).
 *  Refused as a correction, not as a ruler: the uncorrected reading is still offered. */
export const MAX_HEIGHT_CORRECTION_RATIO = 1.35;

/** Under the in-plane method a bone whose visible part is less than this fraction of its length
 *  is pointing at the lens: its 2D span is a few units of landmark noise and the ratio would be
 *  noise over noise. Skipped for that frame, never for the take. */
export const MIN_IN_PLANE_FRACTION = 0.5;

/** The same bones the limb model measures, by the 3D joint names the native plugin emits. Both
 *  sides are read and averaged: in 3D neither side foreshortens, so a difference between them
 *  is estimate noise rather than angle, and the mean is the better number. */
const BONES: { key: LimbKey; pairs: [string, string][] }[] = [
  { key: "upperArm", pairs: [["leftShoulder", "leftElbow"], ["rightShoulder", "rightElbow"]] },
  { key: "forearm", pairs: [["leftElbow", "leftWrist"], ["rightElbow", "rightWrist"]] },
  { key: "femur", pairs: [["leftHip", "leftKnee"], ["rightHip", "rightKnee"]] },
  { key: "shin", pairs: [["leftKnee", "leftAnkle"], ["rightKnee", "rightAnkle"]] },
  { key: "torso", pairs: [["leftShoulder", "leftHip"], ["rightShoulder", "rightHip"]] },
  { key: "shoulderWidth", pairs: [["leftShoulder", "rightShoulder"]] },
];

/** The 2D landmark each 3D joint name maps to, so a bone's span can be read off the SAME frame's
 *  2D pose in the tracker's own units. */
const LANDMARK_FOR_JOINT: Record<string, number> = {
  leftShoulder: POSE_LANDMARKS.LEFT_SHOULDER,
  rightShoulder: POSE_LANDMARKS.RIGHT_SHOULDER,
  leftElbow: POSE_LANDMARKS.LEFT_ELBOW,
  rightElbow: POSE_LANDMARKS.RIGHT_ELBOW,
  leftWrist: POSE_LANDMARKS.LEFT_WRIST,
  rightWrist: POSE_LANDMARKS.RIGHT_WRIST,
  leftHip: POSE_LANDMARKS.LEFT_HIP,
  rightHip: POSE_LANDMARKS.RIGHT_HIP,
  leftKnee: POSE_LANDMARKS.LEFT_KNEE,
  rightKnee: POSE_LANDMARKS.RIGHT_KNEE,
  leftAnkle: POSE_LANDMARKS.LEFT_ANKLE,
  rightAnkle: POSE_LANDMARKS.RIGHT_ANKLE,
};

const hasCameraSpace = (j: { cx?: number; cy?: number; cz?: number } | undefined): j is { cx: number; cy: number; cz: number } =>
  j != null && Number.isFinite(j.cx) && Number.isFinite(j.cy) && Number.isFinite(j.cz);

const visible2D = (p: Landmark | undefined): p is Landmark =>
  p != null && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) > 0.5;

/**
 * THE DEPTH RULER: metres per unit at the wrists' own distance from the lens.
 *
 * A pinhole camera's scale at depth Z is Z x 2 tan(fov/2) / (the frame's length in units along
 * the axis the field of view is stated for). The wrists' depth comes from the camera-space 3D
 * joints (height-corrected like every other 3D length), the field of view from the active
 * format the plugin logs, and the frame length from the pose frames. It needs no bone
 * proportion and no population fraction, which is what the two body rulers cannot say.
 *
 * Sets 5 and 6, 2026-09-29, at 2.80m and 3.18m: computed against the 1280-unit long axis this
 * read 0.00334 and 0.00379 against sensor-implied truths of 0.00365 and 0.00410 -- 8% low on
 * both, at two distances, while the in-plane ruler was 6% and 26% low and the shoulder ruler
 * 16% and 0% high. A constant bias is what calibration removes; a wandering one is not. It is
 * RECORDED here, as `depthRuler` in the diagnostics, and not yet a candidate: two takes say
 * "promising", not "ruler". The next sensor-paired take decides.
 */
/** What the depth ruler read against the sensor-implied scale on sets 5, 6 and 7, 2026-09-29
 *  (0.92, 0.92 and 0.87 of it): the zero it is corrected by when offered as a candidate, the
 *  mean of the three. Set 7 was the first out-of-sample take and moved it from 0.92: the bias
 *  is not the constant two takes suggested, and 5% either way is what three say. This number
 *  moves with the evidence, never by hand. */
export const DEPTH_RULER_BIAS = 0.9;
/** How wrong the zeroed depth ruler may be even when working: two takes agree to a percent, and
 *  a percent is not an uncertainty. Held at the corrected 3D ruler's figure until more takes. */
// Was 0.08 after two takes at 0.92. Seven sensor-paired benches later its zeroed reading has
// been 1.02, 1.03, 0.97, 0.95, 1.16, 0.64 and about 0.78 of the sensor: a 20% instrument, and
// weighted as one in reconcileScaleEstimates. The wrist depth it reads shortened over one
// afternoon from 2.8m to 1.7m at the same framing, so the drift is in Vision's 3D pose.
export const DEPTH_RULER_UNCERTAINTY = 0.2;

export function depthRulerScale(
  wristDepthM: number | null | undefined,
  fovDeg: number | null | undefined,
  longAxisUnits: number | null | undefined,
): number | null {
  if (!wristDepthM || !(wristDepthM > 0) || !fovDeg || !(fovDeg > 0) || !longAxisUnits || !(longAxisUnits > 0)) return null;
  return (wristDepthM * 2 * Math.tan((fovDeg * Math.PI) / 360)) / longAxisUnits;
}

/** The field of view the plugin wrote into its "activeFormat set:" line, or null. */
export function fovDegFromActiveFormat(activeFormat: string | null | undefined): number | null {
  const m = activeFormat?.match(/fov ([0-9.]+)deg/);
  return m ? Number(m[1]) : null;
}

/** Does any frame carry the camera-space joints the in-plane method needs? */
export function framesCarryCameraSpace(frames: NativePoseFrame[]): boolean {
  return frames.some((f) => f.body3DJoints?.some((j) => hasCameraSpace(j)) ?? false);
}

/**
 * The in-plane method -- see the file comment. One sample per (frame, bone, side): the bone's
 * visible length in metres (camera-space x/y, already height-corrected by the caller) over its
 * 2D span in units on the same frame. Per bone a median; the reading is the median across bones.
 */
function inPlaneSamples(
  frames: NativePoseFrame[],
  correction: number,
): { perBone: Map<LimbKey, { scales: number[]; metres: number[]; spans: number[] }>; framesUsed: number; wristDepths: number[] } {
  const perBone = new Map<LimbKey, { scales: number[]; metres: number[]; spans: number[] }>();
  const wristDepths: number[] = [];
  let framesUsed = 0;
  for (const f of frames) {
    const joints = f.body3DJoints;
    if (!joints || joints.length === 0) continue;
    const byName = new Map(joints.map((j) => [j.name, j] as const));
    const landmarks = visionJointsToWorldLandmarks(f);
    let usedThisFrame = false;
    for (const bone of BONES) {
      for (const [a, b] of bone.pairs) {
        const pa = byName.get(a);
        const pb = byName.get(b);
        if (!hasCameraSpace(pa) || !hasCameraSpace(pb)) continue;
        const full = Math.hypot(pa.cx - pb.cx, pa.cy - pb.cy, pa.cz - pb.cz);
        const inPlane = Math.hypot(pa.cx - pb.cx, pa.cy - pb.cy);
        if (!(full > 0) || inPlane / full < MIN_IN_PLANE_FRACTION) continue;
        const la = landmarks[LANDMARK_FOR_JOINT[a]];
        const lb = landmarks[LANDMARK_FOR_JOINT[b]];
        if (!visible2D(la) || !visible2D(lb)) continue;
        const span = Math.hypot(la.x - lb.x, la.y - lb.y);
        if (!(span > 0)) continue;
        const metres = inPlane * correction;
        if (!perBone.has(bone.key)) perBone.set(bone.key, { scales: [], metres: [], spans: [] });
        const row = perBone.get(bone.key)!;
        row.scales.push(metres / span);
        row.metres.push(metres);
        row.spans.push(span);
        usedThisFrame = true;
      }
    }
    const lw = byName.get("leftWrist");
    const rw = byName.get("rightWrist");
    const depths: number[] = [];
    for (const wrist of [lw, rw]) if (hasCameraSpace(wrist)) depths.push(Math.abs(wrist.cz) * correction);
    if (depths.length > 0) wristDepths.push(depths.reduce((s, v) => s + v, 0) / depths.length);
    if (usedThisFrame) framesUsed++;
  }
  return { perBone, framesUsed, wristDepths };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Bone lengths in metres from the 3D skeleton alone, uncorrected: the median over frames of
 *  each bone's mean-of-sides 3D length. Exported so the replay harness and the tests can read
 *  the raw measurement without the correction. */
export function body3DBoneLengthsM(frames: NativePoseFrame[]): Partial<Record<LimbKey, number>> & {
  framesWithPose: number;
} {
  const perBone = new Map<LimbKey, number[]>();
  let framesWithPose = 0;
  for (const f of frames) {
    const joints = f.body3DJoints;
    if (!joints || joints.length === 0) continue;
    const byName = new Map(joints.map((j) => [j.name, j] as const));
    let usedThisFrame = false;
    for (const bone of BONES) {
      const lengths: number[] = [];
      for (const [a, b] of bone.pairs) {
        const pa = byName.get(a);
        const pb = byName.get(b);
        if (!pa || !pb) continue;
        const len = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
        if (Number.isFinite(len) && len > 0) lengths.push(len);
      }
      if (lengths.length === 0) continue;
      const mean = lengths.reduce((s, v) => s + v, 0) / lengths.length;
      if (!perBone.has(bone.key)) perBone.set(bone.key, []);
      perBone.get(bone.key)!.push(mean);
      usedThisFrame = true;
    }
    if (usedThisFrame) framesWithPose++;
  }
  const out: Partial<Record<LimbKey, number>> & { framesWithPose: number } = { framesWithPose };
  for (const [key, values] of perBone) {
    if (values.length >= MIN_BODY_3D_FRAMES) out[key] = median(values);
  }
  return out;
}

/**
 * Real-world scale from the 3D skeleton: metres per pixel-space unit.
 *
 * `spansUnits` is each bone's longest projection in the tracker's own units, as
 * measureLimbSpansInUnits already computes for the limb model -- the caller passes it so the two
 * rulers read the same 2D measurement and cannot drift apart.
 */
export function body3DScaleFromFrames(
  frames: NativePoseFrame[],
  heightIn: number | null | undefined,
  spansUnits: Partial<Record<LimbKey, number>>,
): Body3DScaleReading {
  const empty: Body3DScaleReading = {
    scale: null,
    uncertaintyFraction: BODY_3D_UNCORRECTED_UNCERTAINTY,
    framesUsed: 0,
    limb: null,
    metres: null,
    limbs: [],
    method: null,
    medianWristDepthM: null,
    heightSource: null,
    referenceHeightM: null,
    rejectedBecause: null,
  };
  const bones = body3DBoneLengthsM(frames);
  if (bones.framesWithPose < MIN_BODY_3D_FRAMES) return { ...empty, rejectedBecause: "no_3d_frames" };

  // How Vision arrived at the skeleton's scale, from the frames that said.
  const measuredFrames = frames.filter((f) => f.body3DHeightSource === "measured").length;
  const referenceHeights = frames
    .filter((f) => f.body3DHeightSource === "reference" && f.body3DHeightM != null && f.body3DHeightM > 0)
    .map((f) => f.body3DHeightM as number);
  const measured = measuredFrames > 0 && measuredFrames >= referenceHeights.length;
  const referenceHeightM = referenceHeights.length > 0 ? median(referenceHeights) : null;

  let correction = 1;
  let heightSource: Body3DScaleReading["heightSource"] = "reference_uncorrected";
  let uncertaintyFraction = BODY_3D_UNCORRECTED_UNCERTAINTY;
  let rejectedBecause: Body3DScaleReading["rejectedBecause"] = null;
  if (measured) {
    heightSource = "measured";
    uncertaintyFraction = BODY_3D_MEASURED_UNCERTAINTY;
  } else if (referenceHeightM != null && heightIn && heightIn > 0) {
    const ratio = (heightIn * 0.0254) / referenceHeightM;
    if (ratio >= 1 / MAX_HEIGHT_CORRECTION_RATIO && ratio <= MAX_HEIGHT_CORRECTION_RATIO) {
      correction = ratio;
      heightSource = "reference_corrected";
      uncertaintyFraction = BODY_3D_CORRECTED_UNCERTAINTY;
    } else {
      rejectedBecause = "implausible_correction";
    }
  }

  // THE IN-PLANE METHOD, WHEN THE FRAMES CARRY CAMERA-SPACE JOINTS -- see the file comment.
  if (framesCarryCameraSpace(frames)) {
    const { perBone, framesUsed, wristDepths } = inPlaneSamples(frames, correction);
    const limbs: Body3DScaleReading["limbs"] = [];
    for (const bone of BONES) {
      const row = perBone.get(bone.key);
      if (!row || row.scales.length < MIN_BODY_3D_FRAMES) continue;
      limbs.push({
        limb: bone.key,
        metres: Math.round(median(row.metres) * 10000) / 10000,
        spanUnits: Math.round(median(row.spans) * 100) / 100,
        scale: median(row.scales),
        samples: row.scales.length,
      });
    }
    const medianWristDepthM = wristDepths.length > 0 ? Math.round(median(wristDepths) * 1000) / 1000 : null;
    if (limbs.length === 0 || framesUsed < MIN_BODY_3D_FRAMES) {
      return { ...empty, method: "in_plane", medianWristDepthM, framesUsed, referenceHeightM, heightSource, rejectedBecause: "no_2d_span" };
    }
    const byScale = [...limbs].sort((a, b) => a.scale - b.scale);
    const chosen = byScale[Math.floor(byScale.length / 2)];
    return {
      scale: chosen.scale,
      uncertaintyFraction,
      framesUsed,
      limb: chosen.limb,
      metres: chosen.metres,
      limbs,
      method: "in_plane",
      medianWristDepthM,
      heightSource,
      referenceHeightM,
      rejectedBecause,
    };
  }

  // THE LONGEST-PROJECTION METHOD, for frames with no camera-space joints. Wrong by 1.8-1.9x on
  // both of its real takes (see the file comment), so it reports the widest uncertainty this
  // ruler has and the caller demotes it below the shoulder ruler.
  //
  // THE MEDIAN ACROSS BONES, NOT THE LONGEST BONE. The first version took the longest bone,
  // and on its first real take (Scott's bench, 2026-09-29, phone at the foot of the bench) the
  // torso's 2D span came out at 272 units against a 119-unit shoulder span -- a hip landmark
  // that was not on the hip -- and the whole set was scaled 1.8x too small off that one bone.
  // Each bone measured both ways implies a scale; a bone whose 2D read is wrong is an outlier
  // among the others, and the median does not follow it. Every bone is recorded.
  const limbs: Body3DScaleReading["limbs"] = [];
  for (const bone of BONES) {
    const m = bones[bone.key];
    const span = spansUnits[bone.key];
    if (m == null || span == null || !(span > 0)) continue;
    const metres = m * correction;
    limbs.push({ limb: bone.key, metres: Math.round(metres * 10000) / 10000, spanUnits: Math.round(span * 100) / 100, scale: metres / span });
  }
  if (limbs.length === 0) {
    return { ...empty, method: "longest_projection", framesUsed: bones.framesWithPose, referenceHeightM, rejectedBecause: "no_2d_span" };
  }
  const byScale = [...limbs].sort((a, b) => a.scale - b.scale);
  const chosen = byScale[Math.floor(byScale.length / 2)];
  return {
    scale: chosen.scale,
    uncertaintyFraction: Math.max(uncertaintyFraction, BODY_3D_UNCORRECTED_UNCERTAINTY),
    framesUsed: bones.framesWithPose,
    limb: chosen.limb,
    metres: chosen.metres,
    limbs,
    method: "longest_projection",
    medianWristDepthM: null,
    heightSource,
    referenceHeightM,
    rejectedBecause,
  };
}
