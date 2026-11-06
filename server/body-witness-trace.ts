/**
 * THE BODY BESIDE THE BAR, IN THE EXPORT.
 *
 * Scott, 2026-11-05: "Look at the export too, can you add anything to it to help?" The question
 * that round could not answer was whether the RDL's hands moved faster than the athlete did --
 * the bar trace is the WRISTS, and the sensor disagreed with it by 1.4x in time on two reps with
 * the distance right. The shoulders, hips and ankles were on the same frames, stored in the
 * skeleton file on this server, and reached no export. This derives a compact per-frame series
 * of the four from those frames so a replay can hold the hands against the body on the same
 * clock, without the 2-10MB of frames riding along in every download.
 *
 * Units are the frames' own: analysis-frame pixels on the y axis with y DOWN (vision-body-landmarks
 * writes y = -(joint.y * frameHeight), so the top of the frame is the most negative value); the
 * capture's calibration.scaleFactor turns them into metres. Timing is the frames' own clock, the
 * same one the bar trace carries. A pair's midpoint where both joints are present, the one that
 * is where only one is, null where neither. Records and gates nothing (Rule #1).
 */

// POSE_LANDMARKS indices (client/src/lib/pose-tracking.ts); the server cannot import the client.
const LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12, LEFT_WRIST = 15, RIGHT_WRIST = 16;
const LEFT_HIP = 23, RIGHT_HIP = 24, LEFT_ANKLE = 27, RIGHT_ANKLE = 28;

/** At most this many points per capture; longer traces are thinned evenly. */
export const BODY_WITNESS_MAX_POINTS = 2000;

export type BodyWitnessPoint = {
  t: number;
  /** Shoulder, hip, wrist and ankle midpoint y, in the frames' pixels, y down. */
  sh: number | null;
  hp: number | null;
  wr: number | null;
  an: number | null;
  /** The lowest visibility among the joints that produced this point's four values. */
  c: number | null;
};

export type BodyWitnessTrace = {
  units: "analysis_frame_px_y_down";
  points: BodyWitnessPoint[];
  framesRead: number;
};

type Lm = { x?: unknown; y?: unknown; visibility?: unknown } | null | undefined;

function joint(lms: unknown, idx: number): { y: number; v: number } | null {
  if (!Array.isArray(lms)) return null;
  const lm = lms[idx] as Lm;
  if (!lm || typeof lm.y !== "number" || !Number.isFinite(lm.y)) return null;
  const v = typeof lm.visibility === "number" ? lm.visibility : 1;
  // An absent joint is written as a zeroed landmark with no visibility -- see emptyLandmarks.
  if (v <= 0 && lm.x === 0 && lm.y === 0) return null;
  return { y: lm.y, v };
}

function pairMid(lms: unknown, a: number, b: number): { y: number; v: number } | null {
  const l = joint(lms, a);
  const r = joint(lms, b);
  if (l && r) return { y: (l.y + r.y) / 2, v: Math.min(l.v, r.v) };
  return l ?? r ?? null;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Pure: frames in, a compact series out. Frames that are not objects with a numeric `t` are
 *  skipped; a frame with no usable joint still yields a point of nulls, so a gap in the body is
 *  as visible as a gap in the bar. */
export function deriveBodyWitnessTrace(frames: unknown): BodyWitnessTrace | null {
  if (!Array.isArray(frames) || frames.length === 0) return null;
  const points: BodyWitnessPoint[] = [];
  for (const f of frames as Array<{ t?: unknown; worldLandmarks?: unknown; landmarks?: unknown }>) {
    if (!f || typeof f !== "object" || typeof f.t !== "number" || !Number.isFinite(f.t)) continue;
    const lms = Array.isArray(f.worldLandmarks) ? f.worldLandmarks : f.landmarks;
    const sh = pairMid(lms, LEFT_SHOULDER, RIGHT_SHOULDER);
    const hp = pairMid(lms, LEFT_HIP, RIGHT_HIP);
    const wr = pairMid(lms, LEFT_WRIST, RIGHT_WRIST);
    const an = pairMid(lms, LEFT_ANKLE, RIGHT_ANKLE);
    const used = [sh, hp, wr, an].filter((j): j is { y: number; v: number } => j != null);
    points.push({
      t: Math.round(f.t),
      sh: sh ? r1(sh.y) : null,
      hp: hp ? r1(hp.y) : null,
      wr: wr ? r1(wr.y) : null,
      an: an ? r1(an.y) : null,
      c: used.length ? Math.round(Math.min(...used.map((j) => j.v)) * 100) / 100 : null,
    });
  }
  if (points.length === 0) return null;
  let kept = points;
  if (points.length > BODY_WITNESS_MAX_POINTS) {
    const step = points.length / BODY_WITNESS_MAX_POINTS;
    kept = [];
    for (let i = 0; i < BODY_WITNESS_MAX_POINTS; i++) kept.push(points[Math.floor(i * step)]);
  }
  return { units: "analysis_frame_px_y_down", points: kept, framesRead: frames.length };
}
