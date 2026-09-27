import { POSE_LANDMARKS } from "./pose-tracking";
import type { Landmark } from "@mediapipe/tasks-vision";
import type { LimbKey } from "@shared/athlete-body-model";
import { LIMB_SPAN_PERCENTILE, MIN_LIMB_SAMPLES } from "@shared/athlete-body-model";

/**
 * MEASURING THE ATHLETE'S OWN BONES OFF A TAKE THAT HAD A REAL RULER.
 *
 * This is the half that turns users.bodyModel from a column into a ruler. When a take's scale
 * came from something the body had no hand in -- a plate measured in frame, the gravity ruler off
 * a flat jump, a tape-measured grip -- every limb in that take is measurable in real metres. And
 * a bone does not change, so those numbers stay true for every later take at any angle, including
 * the ones where the plate is out of shot and the athlete's feet are off the bottom of the frame.
 *
 * THE MAXIMUM, NOT THE MEAN OR THE MEDIAN.
 *
 * A limb seen at an angle projects SHORT. It can never project long. So across several hundred
 * frames, the largest reading is the one closest to square-on and it is the true length -- the
 * same argument the grip ruler and movementAxisFromGrip already run on. A mean or a median sits
 * among the foreshortened readings and reports a bone shorter than the athlete's, which inflates
 * metres-per-pixel and every distance downstream. Getting this backwards would make the body
 * model a machine for manufacturing the exact error it exists to remove.
 *
 * A high percentile rather than the literal maximum, because one landmark that flew off the
 * athlete would otherwise define a bone forever.
 *
 * MEASURED IN THE IMAGE PLANE, NOT IN 3D. Vision's z is the least trustworthy axis it produces
 * (CLAUDE.md says so, and rejectImplausibleScales was written around it). Including it would add
 * depth noise to a measurement whose whole virtue is the maximum defeating foreshortening --
 * and a noisy z inflates a span, which is the one direction the maximum cannot protect against.
 */

/** Both sides of the paired limbs are measured and the LONGER taken. An athlete is roughly
 *  symmetric, so the side that reads longer is simply the one the camera saw more squarely --
 *  the same logic as the percentile, applied across the body rather than across time. */
const LIMB_SEGMENTS: { key: LimbKey; pairs: [number, number][] }[] = [
  {
    key: "upperArm",
    pairs: [
      [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_ELBOW],
      [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_ELBOW],
    ],
  },
  {
    key: "forearm",
    pairs: [
      [POSE_LANDMARKS.LEFT_ELBOW, POSE_LANDMARKS.LEFT_WRIST],
      [POSE_LANDMARKS.RIGHT_ELBOW, POSE_LANDMARKS.RIGHT_WRIST],
    ],
  },
  {
    key: "femur",
    pairs: [
      [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_KNEE],
      [POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_KNEE],
    ],
  },
  {
    key: "shin",
    pairs: [
      [POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.LEFT_ANKLE],
      [POSE_LANDMARKS.RIGHT_KNEE, POSE_LANDMARKS.RIGHT_ANKLE],
    ],
  },
  {
    key: "torso",
    pairs: [
      [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_HIP],
      [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_HIP],
    ],
  },
  {
    key: "shoulderWidth",
    pairs: [[POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER]],
  },
  {
    key: "gripWidth",
    pairs: [[POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.RIGHT_WRIST]],
  },
];

const visible = (p: Landmark | undefined): p is Landmark =>
  p != null && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) > 0.5;

/**
 * Limb lengths in METRES, for a take whose scale is trustworthy.
 *
 * `scaleMetresPerUnit` must come from a ruler the body had no part in -- the caller gates that,
 * and server/body-model-learning.ts refuses anything else again on the way in. Two gates on
 * purpose: this is the one path that can write a wrong number into an athlete's permanent record
 * and have every future take inherit it wearing the authority of a measurement.
 */
/** The same spans, in the tracker's own units, for a take that has NO trustworthy scale.
 *
 *  This is the other direction: rather than learning a bone, it measures the bone the camera can
 *  see right now so a length already known in metres can supply the scale. Sharing the geometry
 *  matters more than it looks -- the maximum-over-frames rule has to be identical in both
 *  directions or a bone learned one way is read back another, and the difference lands silently
 *  in every distance the take reports. */
export function measureLimbSpansInUnits(
  frames: { worldLandmarks: Landmark[] }[],
): Partial<Record<LimbKey, number>> {
  // Scale of 1 leaves the spans in units. Same code path, by construction.
  return measureLimbsInMetres(frames, 1);
}

export function measureLimbsInMetres(
  frames: { worldLandmarks: Landmark[] }[],
  scaleMetresPerUnit: number | null | undefined,
): Partial<Record<LimbKey, number>> {
  const out: Partial<Record<LimbKey, number>> = {};
  if (!scaleMetresPerUnit || !(scaleMetresPerUnit > 0)) return out;

  for (const segment of LIMB_SEGMENTS) {
    const spans: number[] = [];
    for (const f of frames) {
      let longestThisFrame = 0;
      for (const [a, b] of segment.pairs) {
        const pa = f.worldLandmarks[a];
        const pb = f.worldLandmarks[b];
        if (!visible(pa) || !visible(pb)) continue;
        // Image plane only -- see the file comment on why z stays out of this.
        const span = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (span > longestThisFrame) longestThisFrame = span;
      }
      if (longestThisFrame > 0) spans.push(longestThisFrame);
    }
    if (spans.length < MIN_LIMB_SAMPLES) continue;
    spans.sort((a, b) => a - b);
    const trueSpanUnits =
      spans[Math.min(spans.length - 1, Math.floor(spans.length * LIMB_SPAN_PERCENTILE))];
    if (trueSpanUnits > 0) {
      out[segment.key] = Math.round(trueSpanUnits * scaleMetresPerUnit * 10000) / 10000;
    }
  }
  return out;
}
