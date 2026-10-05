/* THE ANKLE'S OWN HEIGHT, IN METRES, FROM APPLE'S 3D POSE.
 *
 * Scott, 2026-10-05, on the box jump that read 44cm onto a 24 inch box: "We have apples 3d built
 * in, is it detecting the difference between the floor and box? The change in height?"
 *
 * It was not. `jump-tracking.ts` read the 3D pose NOWHERE. On a jump the 3D pose ran (36 frames
 * across that 33-second take) and its only use was as one scale candidate; the trace the jump
 * is actually measured from is 2D image-space landmarks multiplied by a pixel ruler, and
 * av-jump-tracker-dialog.tsx says so outright -- "Deliberately NOT `body3DLm ?? ...`" -- because
 * the 3D bridge's scene coordinates are hip-relative while the 2D ones are absolute image space,
 * and mixing them per frame put a sawtooth in the trace at a third of the frame rate.
 *
 * That reasoning is right about the SCENE coordinates and does not apply to the CAMERA-space
 * ones. The native plugin emits `cx`/`cy`/`cz` per 3D joint -- metres in the lens's own frame,
 * x and y in the image plane -- so the ankle's height is a metre measurement that needs no pixel
 * scale, no object detection, and no typed box height. The floor-to-box-top step is a difference
 * of two of them.
 *
 * WHAT THIS MEASURES, AND WHAT IT DOES NOT. The 3D request runs on a stride of 120 raw frames --
 * about once a second -- which is far too sparse to catch the peak of a 300-600ms flight. So this
 * does NOT measure jump height and must never be read as if it does. What a once-a-second sensor
 * measures well is a STATIC state, and a box jump has two of them: the athlete standing on the
 * floor, and the athlete standing on the box. The step between those two levels is the box
 * height, which is a distance that is known independently -- so this ruler can
 *
 *   - say whether the pipeline found the box at all, in metres, from the body alone;
 *   - give the scale error directly, as (3D metres) / (the 2D-derived rise), which is the number
 *     the 2026-10-04 take needed and had no way to produce;
 *   - stand in as the box height when nothing was typed.
 *
 * RULE #2 AND RULE #4: THIS IS A PEER. It owns no decision. It reports, it offers a candidate
 * with an honest uncertainty, and overwatch and reconcileScaleEstimates do what they do with it.
 * It never overrides the 2D trace, never vetoes a take, and never withholds a number -- a take
 * it cannot read returns a reason, not a refusal (Rule #1).
 */
import type { PoseFrame as NativePoseFrame } from "./native-av-preview";
import { MAX_HEIGHT_CORRECTION_RATIO } from "./body-3d-ruler";

/** Fewer frames at a level than this and it is not a level, it is a sample. At a ~1Hz stride a
 *  box jump set gives a couple of seconds standing on the floor and a second or two on the box,
 *  so two is the floor of what a real set produces and three is comfortable. Deliberately low:
 *  the alternative to a thin reading here is no reading at all. */
export const MIN_ANKLE_LEVEL_FRAMES = 2;

/** Two ankle heights are the same LEVEL when they sit within this many metres of each other.
 *  5cm: a standing athlete's ankle wanders by a centimetre or two of landmark noise, and the
 *  smallest box anybody jumps onto is far more than 5cm, so this separates floor from box
 *  without splitting one level in two. */
export const ANKLE_LEVEL_TOLERANCE_M = 0.05;

/** The two levels have to differ by at least this much to be a step rather than noise. 10cm is
 *  below any box in a gym and well above the noise. */
export const MIN_ANKLE_STEP_M = 0.1;

/** How wrong this ruler may be even when it is working.
 *
 *  UNCALIBRATED, and stated at the same figure as every other reading off Vision's 3D pose
 *  (BODY_3D_CORRECTED_UNCERTAINTY): the metres come from the same skeleton, so they inherit the
 *  same reference-stature correction and the same drift that moved a wrist's depth from 2.8m to
 *  1.7m at one framing in an afternoon. The first sensor-paired box jump revises this, and until
 *  one does, a tighter number here would be the exact mistake HEIGHT_RULER_UNCERTAINTY's 0.05
 *  was. */
export const ANKLE_3D_RULER_UNCERTAINTY = 0.2;

export type Ankle3DReading = {
  /** The step between the two ankle levels, metres -- the box height as the body measured it.
   *  Null whenever `outcome` is not "measured". */
  stepM: number | null;
  /** The lower level (the floor) and the upper level (the box top), metres in camera space.
   *  Camera space, so the absolute values mean nothing on their own; only the difference does. */
  floorLevelM: number | null;
  boxLevelM: number | null;
  framesAtFloor: number;
  framesAtBox: number;
  /** 3D frames that carried a usable ankle at all. */
  framesUsed: number;
  /** How the skeleton's metres were arrived at, and what they were multiplied by. */
  heightSource: "measured" | "reference_corrected" | "reference_uncorrected" | null;
  correction: number;
  uncertaintyFraction: number;
  outcome:
    | "measured"
    | "no_3d_frames"
    | "no_camera_space"
    | "no_second_level"
    | "step_too_small";
};

const EMPTY: Ankle3DReading = {
  stepM: null,
  floorLevelM: null,
  boxLevelM: null,
  framesAtFloor: 0,
  framesAtBox: 0,
  framesUsed: 0,
  heightSource: null,
  correction: 1,
  uncertaintyFraction: ANKLE_3D_RULER_UNCERTAINTY,
  outcome: "no_3d_frames",
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Reads the ankle's height per 3D frame and finds the two levels it rested at.
 *
 * The clustering is deliberately the simplest thing that works at this sample count: sort the
 * per-frame ankle heights, then take the LOWEST cluster and the HIGHEST cluster, where a cluster
 * is a run of heights within ANKLE_LEVEL_TOLERANCE_M of its own first member. Anything in the
 * middle -- the athlete mid-flight, mid-step-down -- belongs to neither and is simply not part of
 * either level, which is correct: a frame caught in the air is not a state the athlete rested in.
 *
 * k-means would be the textbook answer and is the wrong tool here: at twenty to forty samples it
 * is sensitive to its own initialisation, it insists on exactly k clusters whether or not the
 * take has them, and it would make a thin take produce two levels out of one. A take with one
 * level has to be able to SAY it had one level, which is what "no_second_level" is for.
 */
export function ankleRiseFrom3D(
  frames: NativePoseFrame[],
  heightIn: number | null | undefined,
): Ankle3DReading {
  const withJoints = frames.filter((f) => (f.body3DJoints?.length ?? 0) > 0);
  if (withJoints.length === 0) return { ...EMPTY, outcome: "no_3d_frames" };

  // The skeleton's metres are scaled to a reference stature unless a depth sensor measured them;
  // the same correction body-3d-ruler.ts applies, for the same reason, so the two readings of one
  // take cannot disagree about how long a metre is.
  const referenceHeights = withJoints
    .map((f) => f.body3DHeightM)
    .filter((h): h is number => typeof h === "number" && h > 0);
  const anyMeasured = withJoints.some((f) => f.body3DHeightSource === "measured");
  const referenceHeightM = referenceHeights.length > 0 ? median(referenceHeights) : null;
  let correction = 1;
  let heightSource: Ankle3DReading["heightSource"] = null;
  if (anyMeasured) {
    heightSource = "measured";
  } else if (referenceHeightM != null && heightIn && heightIn > 0) {
    const ratio = (heightIn * 0.0254) / referenceHeightM;
    if (ratio >= 1 / MAX_HEIGHT_CORRECTION_RATIO && ratio <= MAX_HEIGHT_CORRECTION_RATIO) {
      correction = ratio;
      heightSource = "reference_corrected";
    } else {
      heightSource = "reference_uncorrected";
    }
  } else if (referenceHeightM != null) {
    heightSource = "reference_uncorrected";
  }

  // Both ankles averaged where both resolved: in 3D neither side foreshortens, so a difference
  // between them is estimate noise and the mean is the better number (the same argument
  // body-3d-ruler.ts's BONES makes for reading both sides).
  const heights: number[] = [];
  for (const f of withJoints) {
    const ankles = (f.body3DJoints ?? []).filter(
      (j) => (j.name === "leftAnkle" || j.name === "rightAnkle") && Number.isFinite(j.cy),
    );
    if (ankles.length === 0) continue;
    const cy = ankles.reduce((sum, j) => sum + (j.cy as number), 0) / ankles.length;
    heights.push(cy * correction);
  }
  if (heights.length === 0) {
    return { ...EMPTY, outcome: "no_camera_space", framesUsed: 0, heightSource, correction };
  }

  const base = {
    framesUsed: heights.length,
    heightSource,
    correction: Math.round(correction * 1000) / 1000,
    uncertaintyFraction: ANKLE_3D_RULER_UNCERTAINTY,
  };

  // CAMERA-SPACE Y SIGN IS NOT ASSUMED. Vision's camera space has +y up, but a take is filmed
  // through an orientation transform and this ruler has never been checked against a sensor, so
  // relying on the sign would be exactly the kind of untested assumption that produced the
  // bar-path axis bugs. The two levels are the EXTREMES of the sorted heights either way, and
  // the step is their absolute difference; which one is the floor is then decided by the fact
  // that the athlete starts on the floor, not by the sign of an axis.
  const sorted = [...heights].sort((a, b) => a - b);
  const lowCluster = sorted.filter((h) => h - sorted[0] <= ANKLE_LEVEL_TOLERANCE_M);
  const top = sorted[sorted.length - 1];
  const highCluster = sorted.filter((h) => top - h <= ANKLE_LEVEL_TOLERANCE_M);

  if (lowCluster.length < MIN_ANKLE_LEVEL_FRAMES || highCluster.length < MIN_ANKLE_LEVEL_FRAMES) {
    return { ...EMPTY, ...base, outcome: "no_second_level", framesAtFloor: lowCluster.length, framesAtBox: highCluster.length };
  }

  const lowLevel = median(lowCluster);
  const highLevel = median(highCluster);
  const stepM = Math.abs(highLevel - lowLevel);
  if (stepM < MIN_ANKLE_STEP_M) {
    return {
      ...EMPTY, ...base,
      outcome: "step_too_small",
      framesAtFloor: lowCluster.length,
      framesAtBox: highCluster.length,
      floorLevelM: Math.round(lowLevel * 1000) / 1000,
      boxLevelM: Math.round(highLevel * 1000) / 1000,
    };
  }

  // The athlete begins the set standing on the floor, so whichever level the EARLY frames sit in
  // is the floor -- read from the take rather than from the axis sign. Falls back to the lower
  // level if the first frames belong to neither (the athlete already on the box when recording
  // started), which is a guess the diagnostics expose rather than hide.
  const firstFew = heights.slice(0, Math.min(3, heights.length));
  const nearLow = firstFew.filter((h) => Math.abs(h - lowLevel) <= Math.abs(h - highLevel)).length;
  const floorIsLow = nearLow >= firstFew.length - nearLow;

  return {
    ...base,
    stepM: Math.round(stepM * 1000) / 1000,
    floorLevelM: Math.round((floorIsLow ? lowLevel : highLevel) * 1000) / 1000,
    boxLevelM: Math.round((floorIsLow ? highLevel : lowLevel) * 1000) / 1000,
    framesAtFloor: floorIsLow ? lowCluster.length : highCluster.length,
    framesAtBox: floorIsLow ? highCluster.length : lowCluster.length,
    outcome: "measured",
  };
}

/**
 * The scale error the 3D ankle ruler implies, by comparing its metres against the rise the 2D
 * trace measured for the same step.
 *
 * This is the number the 2026-10-04 box jump could not produce. It is a RATIO, so it is immune
 * to the thing that made that take unreadable: it does not care what the pixel scale was, only
 * that the two witnesses disagree and by how much. Returns null when either side is missing --
 * never a 1.0, which would read as agreement.
 */
export function ankle3DScaleErrorRatio(
  reading: Ankle3DReading,
  twoDimensionalRiseCm: number | null,
): number | null {
  if (reading.outcome !== "measured" || reading.stepM == null) return null;
  if (twoDimensionalRiseCm == null || !(twoDimensionalRiseCm > 0)) return null;
  return Math.round((twoDimensionalRiseCm / (reading.stepM * 100)) * 1000) / 1000;
}
