/* HIP-SHOULDER SEPARATION, FROM REAL DEPTH.
 *
 * av-swing-tracker-dialog.tsx has carried this warning since it was written: "This is the
 * highest-value dialog for this swap: without real z, computeSeparationDeg's atan2(z-difference,
 * x-difference) degenerates to reading almost pure x -- a rotating athlete's shoulder/hip line
 * barely changes its OWN x-span, so peakSeparationDeg's whole premise depends on genuine z
 * variation existing at all."
 *
 * It is worse than "degenerates". On the native iOS path the 2D landmarks carry z: 0 for EVERY
 * joint (vision-body-landmarks.ts builds them that way -- Vision's 2D body pose has no depth to
 * give), so rotation-tracking.ts's lineAngleDeg computes atan2(0 - 0, dx), which is exactly 0 or
 * 180 degrees on every frame. The separation between those two constants is a constant. The
 * swing tracker's headline number has not been measuring rotation on iPhone at all.
 *
 * Apple's 3D body pose does have depth: the native plugin emits cx/cy/cz per joint, metres in
 * the lens's own frame. Shoulder and hip lines in the camera's horizontal plane (cx, cz) give a
 * real rotation angle -- the thing the metric was always meant to be.
 *
 * RULE #2: THIS IS A PEER AND DOES NOT TAKE OVER. It is recorded beside the 2D reading, with
 * the 2D reading's degeneracy recorded too, and the next sensor-paired swing decides whether it
 * becomes the reported number. Appointing it here on the strength of one code reading would be
 * exactly the "a sensor takes over by rule" move Rule #2 refuses -- even though the sensor it
 * would replace is provably constant. A metric nobody has checked against a real swing is a
 * candidate, not an answer.
 *
 * SAMPLING. The 3D request runs on a stride, so this is tens of samples across a take rather
 * than every frame. A golf or baseball swing's x-factor peaks at the top of the backswing and
 * holds for a meaningful fraction of a second, so a sparse sampler can find it; the DOWNSWING's
 * instantaneous peak it cannot, and `framesUsed` is published so a reader can tell how thin the
 * evidence is. Never interpolated into something denser than it is.
 */
import type { PoseFrame as NativePoseFrame } from "./native-av-preview";

/** Below this many 3D frames with all four joints, a peak is one sample's noise. */
export const MIN_ROTATION_3D_FRAMES = 4;

/** Both lines must have some real horizontal extent or their angle is noise over noise. A
 *  shoulder line squarely edge-on to the lens still spans more than this in metres; below it the
 *  joints are effectively one point and atan2 is reading estimate jitter. */
export const MIN_LINE_EXTENT_M = 0.08;

export type Rotation3DReading = {
  /** The largest hip-shoulder separation the take showed, degrees. */
  peakSeparationDeg: number | null;
  /** Separation at every usable 3D frame, in take order -- the evidence for the peak. */
  separationsDeg: number[];
  framesUsed: number;
  /** Frames dropped because a line had no usable horizontal extent. */
  framesWithoutExtent: number;
  outcome: "measured" | "no_3d_frames" | "no_camera_space" | "too_few_frames" | "no_line_extent";
};

const EMPTY: Rotation3DReading = {
  peakSeparationDeg: null,
  separationsDeg: [],
  framesUsed: 0,
  framesWithoutExtent: 0,
  outcome: "no_3d_frames",
};

function lineAngleDeg(
  a: { cx: number; cz: number },
  b: { cx: number; cz: number },
): number {
  // The camera's horizontal plane, looking down from above: cx across the image, cz into it.
  // Vertical (cy) is deliberately excluded -- this is rotation, not lean, the same choice
  // rotation-tracking.ts's own lineAngleDeg makes and the only part of it that was ever right.
  return (Math.atan2(b.cz - a.cz, b.cx - a.cx) * 180) / Math.PI;
}

function angleDiffDeg(a: number, b: number): number {
  let diff = a - b;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

const extentM = (a: { cx: number; cz: number }, b: { cx: number; cz: number }) =>
  Math.hypot(b.cx - a.cx, b.cz - a.cz);

/**
 * Hip-shoulder separation per 3D frame, and the take's peak.
 *
 * Unsigned: the peak is the largest MAGNITUDE of separation, because a right-handed and a
 * left-handed athlete separate in opposite directions and the number is about how much, not
 * which way. The signed per-frame values are published so a direction can still be read off
 * them if a later comparison wants one.
 *
 * No height correction. A separation is a ratio of two lengths in the same space, so the
 * reference-stature scaling that body-3d-ruler.ts has to correct for divides out here -- which
 * is the one way this reading is BETTER placed than every other 3D measurement in the app.
 */
export function separationFrom3D(frames: NativePoseFrame[]): Rotation3DReading {
  const withJoints = frames.filter((f) => (f.body3DJoints?.length ?? 0) > 0);
  if (withJoints.length === 0) return { ...EMPTY, outcome: "no_3d_frames" };

  const separationsDeg: number[] = [];
  let framesWithoutExtent = 0;
  let sawCameraSpace = false;

  for (const f of withJoints) {
    const byName = new Map((f.body3DJoints ?? []).map((j) => [j.name, j] as const));
    const ls = byName.get("leftShoulder");
    const rs = byName.get("rightShoulder");
    const lh = byName.get("leftHip");
    const rh = byName.get("rightHip");
    if (!ls || !rs || !lh || !rh) continue;
    const pts = [ls, rs, lh, rh];
    if (!pts.every((p) => Number.isFinite(p.cx) && Number.isFinite(p.cz))) continue;
    sawCameraSpace = true;
    const shoulders = { a: ls as { cx: number; cz: number }, b: rs as { cx: number; cz: number } };
    const hips = { a: lh as { cx: number; cz: number }, b: rh as { cx: number; cz: number } };
    if (extentM(shoulders.a, shoulders.b) < MIN_LINE_EXTENT_M || extentM(hips.a, hips.b) < MIN_LINE_EXTENT_M) {
      framesWithoutExtent += 1;
      continue;
    }
    separationsDeg.push(
      Math.round(angleDiffDeg(lineAngleDeg(shoulders.a, shoulders.b), lineAngleDeg(hips.a, hips.b)) * 10) / 10,
    );
  }

  if (!sawCameraSpace) {
    return { ...EMPTY, outcome: "no_camera_space", framesWithoutExtent };
  }
  if (separationsDeg.length === 0) {
    return { ...EMPTY, outcome: "no_line_extent", framesWithoutExtent };
  }
  if (separationsDeg.length < MIN_ROTATION_3D_FRAMES) {
    return {
      ...EMPTY,
      outcome: "too_few_frames",
      separationsDeg,
      framesUsed: separationsDeg.length,
      framesWithoutExtent,
    };
  }

  const peak = separationsDeg.reduce((best, s) => (Math.abs(s) > Math.abs(best) ? s : best), separationsDeg[0]);
  return {
    peakSeparationDeg: Math.abs(Math.round(peak * 10) / 10),
    separationsDeg,
    framesUsed: separationsDeg.length,
    framesWithoutExtent,
    outcome: "measured",
  };
}

/**
 * Whether a 2D separation trace is the structurally-constant one described in this file's
 * header -- every sample at 0 or 180 because every landmark's z is 0.
 *
 * Recorded rather than acted on. It is the evidence that the 3D reading is needed at all, and on
 * a platform whose 2D pose DOES carry depth (the MediaPipe web path) it will read false, which is
 * exactly the distinction a single hardcoded "iOS is broken" flag would lose.
 */
export function twoDSeparationIsDegenerate(separationsDeg: (number | null)[]): boolean {
  const real = separationsDeg.filter((s): s is number => s != null);
  if (real.length === 0) return false;
  return real.every((s) => Math.abs(s) < 0.5 || Math.abs(Math.abs(s) - 180) < 0.5);
}
