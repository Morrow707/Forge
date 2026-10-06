/* HOW MUCH OF THE MOVEMENT THE IMAGE PLANE COULD NOT SEE.
 *
 * Measured 2026-10-06, from the bench press filmed beside the OVR on build 632
 * (docs/camera-tracking-notes.md, "Three lifts beside OVR, build 632"). That take read range of
 * motion 21.6cm against the sensor's 35.6 -- 39.3% low -- and the export says plainly that it is
 * NOT a scale error: getting 21.6 to 35.6 needs 5.942e-3 m/unit, and the highest candidate the
 * take produced was the shoulder ruler's 3.881e-3, with the best 3D bone at 3.497e-3. No blend
 * of what that take measured can reach the sensor's number, which is the same shape as the box
 * jump's 28% (build 619) and means the error is in the geometry, not the rulers.
 *
 * Camera pitch is ruled out and the ruling-out is worth keeping: cameraPitchDeg was 7.5 degrees,
 * and cos 7.5 is 0.991, so the phone's tilt accounts for one per cent of a thirty-nine per cent
 * error.
 *
 * WHAT IT IS NOT: THE TAKE WAS FILMED FROM THE SIDE, like every bench press Scott has ever
 * filmed. This file first said it was filmed from the head end, on the strength of
 * `cameraView.subjectFacing: "facing_camera"` -- which was the pipeline misreading its own
 * geometry, see assessSubjectFacing, fixed the same day. Do not reason from that field's old
 * verdicts; a supine athlete read as head-on on every bench before this fix.
 *
 * So the question this measures is open rather than answered: on a side-on bench the bar's
 * travel SHOULD be fully in the image plane, and if it is, this reads about 1 and the 39% is
 * somewhere else entirely. The 3D pose is already running on every take (Rule #2), and
 * `body3DJoints` carry camera-space metres, so the wrist's displacement between the extremes of
 * the take has a full 3D magnitude AND an in-image component; the ratio of the two settles it
 * either way. That is the point of recording it: it is the one number that distinguishes "the
 * camera could not see the movement" from "the movement was seen and mis-scaled", and nothing
 * in the export could tell those apart.
 *
 * IT CORRECTS NOTHING. Same discipline as `measuredPosture` (build 623): one sensor-paired take
 * is not evidence enough to let a new number move every reported distance in the app, and a
 * correction that fired on a take it had misread would move the scale blend, the rep gate and
 * the headline velocity at once. Read it on the next bench before anything acts on it.
 */
import type { PoseFrame as NativePoseFrame } from "./native-av-preview";

export type AxisForeshortening = {
  /** 3D displacement magnitude over the in-image component, >= 1. Null without 3D frames. */
  ratio: number | null;
  /** The two components, metres, so the ratio can be checked rather than taken. */
  displacement3DM: number | null;
  displacementInImageM: number | null;
  /** The component along the lens axis alone, metres -- what the image could not see. */
  displacementAlongLensM: number | null;
  framesUsed: number;
  /** Always false today. See the file comment: this is measured, never applied. */
  appliedCorrection: false;
  rejectedBecause: "no_3d_frames" | "no_movement" | null;
};

/** Fewer than this and the extremes are noise rather than the ends of a movement. */
export const MIN_FORESHORTENING_FRAMES = 5;

const EMPTY: AxisForeshortening = {
  ratio: null,
  displacement3DM: null,
  displacementInImageM: null,
  displacementAlongLensM: null,
  framesUsed: 0,
  appliedCorrection: false,
  rejectedBecause: "no_3d_frames",
};

/** The wrist midpoint in CAMERA-space metres (cx/cy/cz: the plugin's own camera frame, the same
 *  coordinates body-3d-ruler.ts measures a bone's visible length in). The plugin's x/y/z are
 *  body-centred, so they cannot say anything about where the lens is. */
function wristMidpoints(frames: NativePoseFrame[]) {
  const out: { x: number; y: number; z: number }[] = [];
  for (const f of frames) {
    if (!f.body3DJoints || f.body3DJoints.length === 0) continue;
    const pts: { x: number; y: number; z: number }[] = [];
    for (const j of f.body3DJoints) {
      if (j.name !== "leftWrist" && j.name !== "rightWrist") continue;
      if (!Number.isFinite(j.cx) || !Number.isFinite(j.cy) || !Number.isFinite(j.cz)) continue;
      pts.push({ x: j.cx as number, y: j.cy as number, z: j.cz as number });
    }
    // One hand carries the point when the other is hidden -- the same rule the bar point follows.
    if (pts.length === 0) continue;
    out.push({
      x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
      y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
      z: pts.reduce((a, p) => a + p.z, 0) / pts.length,
    });
  }
  return out;
}

export function measureAxisForeshortening(frames: NativePoseFrame[]): AxisForeshortening {
  const pts = wristMidpoints(frames);
  if (pts.length < MIN_FORESHORTENING_FRAMES) {
    return { ...EMPTY, framesUsed: pts.length };
  }
  // The extremes of the take along the camera's own vertical. A rep's own extremes would be the
  // better window and there are not enough 3D frames in a take to find them; the whole take's
  // excursion is the same geometry measured over a longer baseline, which is the safer of the
  // two when the number is only being recorded.
  let lo = pts[0];
  let hi = pts[0];
  for (const p of pts) {
    if (p.y < lo.y) lo = p;
    if (p.y > hi.y) hi = p;
  }
  const dx = hi.x - lo.x;
  const dy = hi.y - lo.y;
  const dz = hi.z - lo.z;
  const inImage = Math.hypot(dx, dy);
  const full = Math.hypot(dx, dy, dz);
  if (!(inImage > 0) || !(full > 0)) {
    return { ...EMPTY, framesUsed: pts.length, rejectedBecause: "no_movement" };
  }
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return {
    ratio: Math.round((full / inImage) * 1000) / 1000,
    displacement3DM: round(full),
    displacementInImageM: round(inImage),
    displacementAlongLensM: round(Math.abs(dz)),
    framesUsed: pts.length,
    appliedCorrection: false,
    rejectedBecause: null,
  };
}
