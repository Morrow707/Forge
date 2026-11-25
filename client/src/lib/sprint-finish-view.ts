/**
 * A SPRINT FILMED FROM THE FINISH LINE (2026-11-24).
 *
 * Scott: a 40 filmed side-on at 0.5x needs the phone about 13 metres off the lane, "a mile
 * away". So the phone can stand at the FINISH, in line with the finish line and off to the side,
 * angled back up the lane. Two things are then measured, and neither needs the start line in view
 * or anything typed but the distance:
 *
 *  - THE FINISH: the chest crossing the finish line. The athlete taps the two ends of the line on
 *    the screen. Because the phone stands in line with it, the vertical plane through the finish
 *    line contains the lens, and a plane through the lens projects to a LINE in the image -- the
 *    line through the two tapped ends. So the chest is over the line exactly when its image point
 *    crosses that image line, at any height and any distance from the phone. No size of anything
 *    is assumed.
 *  - THE START: the athlete's first movement out of their set position. The run is found by
 *    walking back from the finish through continuous movement to the last still hold before it,
 *    and the start is the first frame that leaves that hold. A start seen from 40 yards is a
 *    small figure, so it carries a confidence (startConfidence) and its own uncertainty in
 *    seconds, recorded beside the time.
 *
 * Rule #1: anything this cannot find is a reason on the result, never a refusal; the dialog falls
 * back to timing by eye on the video exactly as the side-on mode does.
 */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS } from "./pose-tracking";

export type FinishLine = { a: { x: number; y: number }; b: { x: number; y: number } };

export type FinishViewFrame = {
  /** Milliseconds on the recording's clock. */
  t: number;
  landmarks: NormalizedLandmark[];
  frameWidth: number;
  frameHeight: number;
};

export type FinishViewResult = {
  startT: number | null;
  finishT: number | null;
  totalElapsedSeconds: number | null;
  /** 0-1: how sure the start is. Low when the athlete is small in frame, the frames are far
   *  apart at the start, or no still set position was seen before the run. */
  startConfidence: number;
  /** How far either side of startT the real first movement can be, in seconds. */
  startUncertaintySeconds: number | null;
  /** The athlete's torso length at the start, in pixels -- how big they were to read. */
  startTorsoPx: number | null;
  /** How long the athlete held still before the start, in seconds (0 for a rolling start). */
  setHoldSeconds: number;
  startGapMs: number | null;
  finishGapMs: number | null;
  /** Why a part is missing, never a refusal. */
  notes: ("no_finish_crossing" | "no_set_position" | "too_few_frames")[];
};

const MIN_VISIBILITY = 0.4;
const CHEST_FROM_SHOULDERS = 0.3;
/** A set position: the hip stays within this share of the torso of its own average. A real set
 *  sways by millimetres; the first stride of a run is a sixth of a torso or more. */
const STILL_EXCURSION = 0.04;
/** "Near the start line": no more than this much bigger in the image than the athlete's smallest. */
const NEAR_START_SIZE = 1.25;
/** How far after a hold to look for the drive out of it. */
const DEPARTURE_LOOKAHEAD_SECONDS = 0.5;
/** A hold counts as a set when the departure after it is at least this share of the biggest. */
const DRIVE_SHARE_OF_BIGGEST = 0.5;
/** A set position is a hold of at least this long. */
const MIN_SET_HOLD_SECONDS = 0.3;
/** Leaving the hold: the hip has moved this many torso lengths from where it was held. */
const START_DISPLACEMENT = 0.08;
const MIN_FRAMES = 6;
/** The hip track is smoothed over this long before the start is looked for. */
const SMOOTH_SECONDS = 0.2;
/** A smoothed hold may wander this many times the take's own smoothed noise. */
const NOISE_MARGIN = 3;
/** With no set position seen, the start is a guess this wide either way. */
const NO_SET_UNCERTAINTY_SECONDS = 0.5;
/** The hinge fit reads from this long before the end of the hold to this long after it, in
 *  steps of FIT_STEP_MS: the hold, the rise out of it, and not yet the accelerating run. */
const FIT_BEFORE_SECONDS = 0.4;
const FIT_AFTER_SECONDS = 0.45;
const FIT_STEP_MS = 2;
const MS_PER_SECOND = 1000;
const HALF = 0.5;
const TWO = 2;
/** A torso this many pixels long reads well; smaller is a less certain start. */
const WELL_READ_TORSO_PX = 60;
/** Frames 1/30s apart time the start to a frame; wider gaps make it less certain. */
const GOOD_FRAME_GAP_MS = 34;
const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;
const TWO_PLACES = 2;
const THREE_PLACES = 3;
const ONE_PLACE = 1;

/** `torso` is the athlete's yardstick in pixels: the larger of the shoulder-to-hip span and the
 *  shoulder width. A crouch facing the lens foreshortens the torso to a few pixels; the shoulders
 *  stay square to it, so the larger of the two is the one that tracks distance. */
type Body = { t: number; hip: [number, number]; chest: [number, number]; torso: number };

function bodyAt(f: FinishViewFrame): Body | null {
  const lm = f.landmarks;
  const parts = [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP].map(
    (i) => lm[i],
  );
  if (parts.some((p) => !p || (p.visibility ?? 1) < MIN_VISIBILITY)) return null;
  const [ls, rs, lh, rh] = parts.map((p) => [p.x * f.frameWidth, p.y * f.frameHeight] as [number, number]);
  const shoulder: [number, number] = [(ls[0] + rs[0]) * HALF, (ls[1] + rs[1]) * HALF];
  const hip: [number, number] = [(lh[0] + rh[0]) * HALF, (lh[1] + rh[1]) * HALF];
  const torso = Math.max(Math.hypot(shoulder[0] - hip[0], shoulder[1] - hip[1]), Math.hypot(ls[0] - rs[0], ls[1] - rs[1]));
  if (!(torso > 0)) return null;
  const chest: [number, number] = [
    shoulder[0] + (hip[0] - shoulder[0]) * CHEST_FROM_SHOULDERS,
    shoulder[1] + (hip[1] - shoulder[1]) * CHEST_FROM_SHOULDERS,
  ];
  return { t: f.t, hip, chest, torso };
}

/** Signed distance of a pixel from the finish line (positive on one side, negative on the other). */
export function sideOfLine(line: FinishLine, frameWidth: number, frameHeight: number, p: [number, number]): number {
  const ax = line.a.x * frameWidth;
  const ay = line.a.y * frameHeight;
  const dx = line.b.x * frameWidth - ax;
  const dy = line.b.y * frameHeight - ay;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return 0;
  return (dx * (p[1] - ay) - dy * (p[0] - ax)) / length;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function timeSprintFromFinishView(frames: FinishViewFrame[], line: FinishLine): FinishViewResult {
  const empty: FinishViewResult = {
    startT: null,
    finishT: null,
    totalElapsedSeconds: null,
    startConfidence: 0,
    startUncertaintySeconds: null,
    startTorsoPx: null,
    setHoldSeconds: 0,
    startGapMs: null,
    finishGapMs: null,
    notes: [],
  };
  const tracked = frames
    .map((f) => ({ f, body: bodyAt(f) }))
    .filter((x): x is { f: FinishViewFrame; body: Body } => x.body != null);
  if (tracked.length < MIN_FRAMES) return { ...empty, notes: ["too_few_frames"] };

  // THE FINISH: the chest's side of the line flips from where it started.
  const sides = tracked.map(({ f, body }) => sideOfLine(line, f.frameWidth, f.frameHeight, body.chest));
  const startSide = Math.sign(sides.find((s) => s !== 0) ?? 0);
  const finishIdx = sides.findIndex((s, i) => i > 0 && Math.sign(s) === -startSide && Math.sign(sides[i - 1]) !== -startSide);
  if (startSide === 0 || finishIdx < 1) return { ...empty, notes: ["no_finish_crossing"] };
  const before = tracked[finishIdx - 1].body;
  const after = tracked[finishIdx].body;
  const frac = sides[finishIdx - 1] / (sides[finishIdx - 1] - sides[finishIdx]);
  const finishT = before.t + frac * (after.t - before.t);
  const finishGapMs = after.t - before.t;

  // THE START. Read on the hip track smoothed over SMOOTH_SECONDS: on a five-pixel figure Vision's
  // jitter is a third of the athlete's size, so the raw track never looks still. The smoothing is
  // symmetric, which would pull a threshold crossing early by up to half its width, so the start
  // is not a threshold crossing: it is where the tangent at the steepest point of the drive meets
  // the hold's level (the standard onset estimate), which smoothing leaves where it is.
  const smoothHip = tracked.map(({ body }) => {
    const near = tracked.filter((x) => Math.abs(x.body.t - body.t) <= SMOOTH_SECONDS * HALF * MS_PER_SECOND).map((x) => x.body);
    return [near.reduce((a, b) => a + b.hip[0], 0) / near.length, near.reduce((a, b) => a + b.hip[1], 0) / near.length] as [number, number];
  });
  const hipAt = (i: number) => smoothHip[i];
  const framesPerWindow = Math.max(1, tracked.filter((x) => x.body.t - tracked[0].body.t <= SMOOTH_SECONDS * MS_PER_SECOND).length);
  const residuals = tracked
    .slice(0, finishIdx)
    .map(({ body }, i) => Math.hypot(body.hip[0] - smoothHip[i][0], body.hip[1] - smoothHip[i][1]) / body.torso)
    .sort((a, b) => a - b);
  const jitter = residuals.length > 0 ? residuals[Math.floor(residuals.length * HALF)] : 0;
  // Still is whatever the take's own noise allows after smoothing, never tighter than a real sway.
  const stillLimit = Math.max(STILL_EXCURSION, (NOISE_MARGIN * jitter) / Math.sqrt(framesPerWindow));
  const excursion = (from: number, to: number) => {
    const idx = Array.from({ length: to - from + 1 }, (_, k) => from + k);
    const mx = idx.reduce((a, i) => a + hipAt(i)[0], 0) / idx.length;
    const my = idx.reduce((a, i) => a + hipAt(i)[1], 0) / idx.length;
    const torso = idx.reduce((a, i) => a + tracked[i].body.torso, 0) / idx.length;
    return Math.max(...idx.map((i) => Math.hypot(hipAt(i)[0] - mx, hipAt(i)[1] - my))) / torso;
  };
  const windowStartFor = (end: number) => {
    const target = tracked[end].body.t - MIN_SET_HOLD_SECONDS * MS_PER_SECOND;
    const from = tracked.findIndex((x) => x.body.t >= target);
    return from >= 0 && from < end ? from : null;
  };
  // Only frames near the start line (the athlete at most a quarter bigger than their smallest)
  // can hold the set, and among the holds there the SET is the latest one followed by a big
  // departure -- the drive out of it. A walk-up stand also departs (into the crouch), and comes
  // earlier; the first strides drift toward the lens and barely move in the image, so they can
  // look still but are never followed by a departure like a drive.
  const smallest = Math.min(...tracked.slice(0, finishIdx).map((x) => x.body.torso));
  const nearStart = (i: number) => tracked[i].body.torso <= smallest * NEAR_START_SIZE;
  const holdLevel = (from: number, end: number): [number, number] => {
    const idx = Array.from({ length: end - from + 1 }, (_, k) => from + k);
    return [idx.reduce((a, i) => a + hipAt(i)[0], 0) / idx.length, idx.reduce((a, i) => a + hipAt(i)[1], 0) / idx.length];
  };
  const stillEnds = tracked
    .slice(0, finishIdx)
    .map((_, end) => {
      const from = windowStartFor(end);
      return from != null && nearStart(end) && excursion(from, end) <= stillLimit ? end : -1;
    })
    .filter((end) => end >= 0);
  const departureAfter = (end: number) => {
    const from = windowStartFor(end) ?? end;
    const [mx, my] = holdLevel(from, end);
    const until = tracked[end].body.t + DEPARTURE_LOOKAHEAD_SECONDS * MS_PER_SECOND;
    const after = tracked
      .map((x, i) => ({ x, i }))
      .filter(({ x, i }) => i > end && i <= finishIdx && x.body.t <= until);
    return after.length === 0
      ? 0
      : Math.max(...after.map(({ x, i }) => Math.hypot(hipAt(i)[0] - mx, hipAt(i)[1] - my) / x.body.torso));
  };
  const departures = stillEnds.map((end) => ({ end, departure: departureAfter(end) }));
  const biggest = Math.max(0, ...departures.map((d) => d.departure));
  const drives = departures.filter((d) => d.departure >= biggest * DRIVE_SHARE_OF_BIGGEST && d.departure >= START_DISPLACEMENT);
  const holdEnd = drives.length > 0 ? drives[drives.length - 1].end : null;
  // The hold reaches back as far as the stillness lasts.
  const holdStart =
    holdEnd == null
      ? null
      : (() => {
          const earliest = tracked
            .slice(0, holdEnd)
            .map((_, from) => (excursion(from, holdEnd) <= stillLimit ? from : -1))
            .filter((from) => from >= 0);
          return earliest.length > 0 ? earliest[0] : windowStartFor(holdEnd);
        })();
  const setHoldSeconds =
    holdEnd != null && holdStart != null ? (tracked[holdEnd].body.t - tracked[holdStart].body.t) / MS_PER_SECOND : 0;
  const hasSet = holdEnd != null && holdStart != null && setHoldSeconds >= MIN_SET_HOLD_SECONDS;
  const anchorIdx = hasSet ? holdEnd! : 0;
  const heldFrom = hasSet ? holdStart! : 0;
  const held = tracked.slice(heldFrom, anchorIdx + 1).map((x) => x.body);
  const heldTorso = held.reduce((a, b) => a + b.torso, 0) / held.length;
  const [hx, hy] = holdLevel(heldFrom, anchorIdx);
  const displacementAt = (i: number) => Math.hypot(hipAt(i)[0] - hx, hipAt(i)[1] - hy) / heldTorso;
  // THE ONSET, FITTED: a hinge -- flat at the hold, then rising linearly -- fitted by least squares
  // to the RAW hip's movement projected on the drive's direction. Projected, the jitter averages
  // to zero instead of piling up as a positive distance, and the fit's hinge is the start; the
  // smoothing above only found where to look.
  const anchorT = tracked[anchorIdx].body.t;
  const driveEnd = tracked.findIndex((x) => x.body.t > anchorT + DEPARTURE_LOOKAHEAD_SECONDS * MS_PER_SECOND);
  const driveEndIdx = Math.min(driveEnd > 0 ? driveEnd - 1 : finishIdx, finishIdx);
  const toward = [hipAt(driveEndIdx)[0] - hx, hipAt(driveEndIdx)[1] - hy];
  const towardLength = Math.hypot(toward[0], toward[1]);
  const fitFromT = Math.max(tracked[heldFrom].body.t, anchorT - FIT_BEFORE_SECONDS * MS_PER_SECOND);
  const fitToT = anchorT + FIT_AFTER_SECONDS * MS_PER_SECOND;
  const samples =
    towardLength > 0
      ? tracked
          .filter((x) => x.body.t >= fitFromT && x.body.t <= fitToT)
          .map((x) => ({
            t: x.body.t,
            y: ((x.body.hip[0] - hx) * toward[0] + (x.body.hip[1] - hy) * toward[1]) / towardLength / heldTorso,
          }))
      : [];
  const candidates = Array.from(
    { length: Math.max(0, Math.floor((fitToT - fitFromT) / FIT_STEP_MS)) },
    (_, k) => fitFromT + k * FIT_STEP_MS,
  );
  const hinge = candidates
    .map((t0) => {
      const xs = samples.map((p) => Math.max(0, p.t - t0) / MS_PER_SECOND);
      const sxx = xs.reduce((a, x) => a + x * x, 0);
      const k = sxx > 0 ? xs.reduce((a, x, i) => a + x * samples[i].y, 0) / sxx : 0;
      const sse = samples.reduce((a, p, i) => a + (p.y - k * xs[i]) ** TWO, 0);
      return { t0, k, sse };
    })
    .filter((h) => h.k > 0)
    .reduce<{ t0: number; k: number; sse: number } | null>((best, h) => (best == null || h.sse < best.sse ? h : best), null);
  const fallbackIdx = Math.min(anchorIdx + 1, finishIdx);
  const startT = hinge ? hinge.t0 : tracked[fallbackIdx].body.t;
  const startGapMs = tracked[fallbackIdx].body.t - tracked[fallbackIdx - 1 >= 0 ? fallbackIdx - 1 : 0].body.t;
  const sizeConfidence = clamp01(heldTorso / WELL_READ_TORSO_PX);
  const gapConfidence = clamp01(GOOD_FRAME_GAP_MS / Math.max(startGapMs, GOOD_FRAME_GAP_MS));
  const setConfidence = hasSet ? 1 : HALF;
  const startConfidence = round(sizeConfidence * gapConfidence * setConfidence, TWO_PLACES);
  // A frame either side, widened when the athlete is too small to read a first step cleanly.
  // A frame either side (widened on a figure too small to read), and the hinge fit's own scatter:
  // the residual noise over the drive's slope, shrunk by the samples on the rise -- times two,
  // a two-sigma bound. On a clean take the frame term is all of it; on a noisy one the fit says so.
  const frameTerm = (startGapMs / MS_PER_SECOND) * (TWO - sizeConfidence);
  const fitTerm = (() => {
    if (!hinge) return 0;
    const rising = samples.filter((p) => p.t > hinge.t0);
    const resid = samples.map((p) => p.y - hinge.k * (Math.max(0, p.t - hinge.t0) / MS_PER_SECOND));
    const sigma = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / Math.max(1, resid.length - TWO));
    return rising.length > 0 ? (TWO * sigma) / (hinge.k * Math.sqrt(rising.length)) : 0;
  })();
  const startUncertaintySeconds = hasSet
    ? round(Math.hypot(frameTerm, fitTerm), THREE_PLACES)
    : NO_SET_UNCERTAINTY_SECONDS;

  return {
    startT,
    finishT,
    totalElapsedSeconds: finishT > startT ? round((finishT - startT) / MS_PER_SECOND, THREE_PLACES) : null,
    startConfidence,
    startUncertaintySeconds,
    startTorsoPx: round(heldTorso, ONE_PLACE),
    setHoldSeconds: round(setHoldSeconds, TWO_PLACES),
    startGapMs,
    finishGapMs,
    notes: hasSet ? [] : ["no_set_position"],
  };
}
