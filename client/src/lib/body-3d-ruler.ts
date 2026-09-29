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
 */
import type { PoseFrame as NativePoseFrame } from "./native-av-preview";
import type { LimbKey } from "@shared/athlete-body-model";

export type Body3DScaleReading = {
  /** Metres per pixel-space unit, or null when the take carried no usable 3D pose. */
  scale: number | null;
  uncertaintyFraction: number;
  /** Frames that carried a 3D pose with the limb that decided the number. */
  framesUsed: number;
  /** Which bone set the scale (the longest one measured, for the same reason as the limb model). */
  limb: LimbKey | null;
  /** That bone's length in metres, after any height correction. */
  metres: number | null;
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
export const BODY_3D_CORRECTED_UNCERTAINTY = 0.08;
/** A reference skeleton with nothing to correct it: the athlete's real stature could be a tenth
 *  away from Vision's reference either way, which is the same class of error the shoulder ruler
 *  carries. Kept as a candidate anyway (Rule #1) and ranked by its stated uncertainty. */
export const BODY_3D_UNCORRECTED_UNCERTAINTY = 0.12;

/** Fewer 3D frames than this and a median is not a median. A bar take runs the 3D request every
 *  120th raw frame, so a 20-second set at 120fps gives about twenty; five is a two-second take. */
export const MIN_BODY_3D_FRAMES = 5;

/** A height correction outside this band means the reference stature or the height on file is
 *  not what it claims to be (a height typed in cm as inches, a skeleton Vision scaled to nothing).
 *  Refused as a correction, not as a ruler: the uncorrected reading is still offered. */
export const MAX_HEIGHT_CORRECTION_RATIO = 1.35;

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

  // The longest bone that was measured both ways wins: a longer bone is a smaller fractional
  // error for the same landmark noise.
  let best: { limb: LimbKey; metres: number; scale: number } | null = null;
  for (const bone of BONES) {
    const m = bones[bone.key];
    const span = spansUnits[bone.key];
    if (m == null || span == null || !(span > 0)) continue;
    const metres = m * correction;
    if (!best || metres > best.metres) best = { limb: bone.key, metres, scale: metres / span };
  }
  if (!best) return { ...empty, framesUsed: bones.framesWithPose, referenceHeightM, rejectedBecause: "no_2d_span" };
  return {
    scale: best.scale,
    uncertaintyFraction,
    framesUsed: bones.framesWithPose,
    limb: best.limb,
    metres: Math.round(best.metres * 10000) / 10000,
    heightSource,
    referenceHeightM,
    rejectedBecause,
  };
}
