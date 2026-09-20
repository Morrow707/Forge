/**
 * THE REFEREE THAT DOES NOT WORK FOR EITHER TEAM.
 *
 * Forge points two independent trackers at the same lift. The body tracker (Vision's
 * VNDetectHumanBodyPoseRequest) finds the athlete's joints. The object tracker
 * (AvCoreMlImplementDetector: one VNCoreMLRequest classification, then VNTrackObjectRequest
 * following that pixel region) finds the equipment. Between them they should be able to catch
 * each other's mistakes, because the two fail in completely different ways -- and until this
 * file existed, they never once compared notes.
 *
 * WHAT WAS ACTUALLY WRONG, AND WHY IT SURVIVED THREE AUDITS.
 *
 * The object tracker already had checks on its own lock. It broke the lock on an implausible
 * jump, on disagreement with a physics trajectory fit, and it re-asked the classifier every
 * thirty frames whether the region was still the right class. Every one of those is a question
 * the object tracker asks about the object tracker. Not one of them asks the question that
 * actually defines the right answer: IS THIS THING ANYWHERE NEAR THE ATHLETE?
 *
 * That gap has a specific, expensive consequence, and it is not hypothetical -- it is the
 * mechanism behind the rep counts. A barbell lift tracks the PLATE (see
 * COREML_TRACKING_MODE_BY_EQUIPMENT: Barbell maps to "plate", because a disc of known diameter
 * states real-world scale from any camera angle and a body does not). A plate is also the single
 * most duplicated object in a gym. The re-classification pass deliberately searches the whole
 * frame -- correctly, since the entire point is to find out whether the right object is somewhere
 * other than where the tracker is looking -- and then takes the MOST CONFIDENT plate in the
 * image. A plate on the rack behind the lifter is frequently the better detection: square to the
 * lens, unoccluded, evenly lit, while the loaded plate is foreshortened and half-hidden behind
 * the athlete. So the correction step could hand the lock to furniture, and then
 * `seedTracking` cleared the box history, which switched off the one guard that might have
 * noticed.
 *
 * A plate further from the camera measures fewer pixels across. The scale is metres per pixel.
 * Fewer pixels for the same 0.45m disc means a LARGER scale, means every distance in the take
 * inflated, means ordinary settling wobble clearing the rep-amplitude gate. Eleven bench reps
 * became eighteen. The tracker was never lying about what it saw; it was looking at the wrong
 * plate, and nothing in the pipeline was in a position to say so.
 *
 * WHAT THIS FILE ADDS.
 *
 * One rule, applied in three places, which is what makes it a unification rather than three
 * patches:
 *
 *   1. Continuously, on every tracked frame (ported into Swift, see below): a lock whose box sits
 *      implausibly far from the athlete's hands is dropped THAT FRAME. This is what actually
 *      fixes drift-to-the-rack, because a rack plate fails this on every single frame rather
 *      than only at a re-classification boundary.
 *   2. At re-classification: candidates are filtered by the same rule BEFORE the most confident
 *      one is chosen, so the correction step can no longer be the thing that breaks the take.
 *   3. After the take, on the client: the same rule decides whether a reference-object scale read
 *      is allowed to set the scale at all, instead of that being reported and ignored.
 *
 * THE YARDSTICK IS THE BODY, AND THAT IS THE WHOLE TRICK.
 *
 * Distance is measured in multiples of the athlete's own wrist separation, not in pixels and not
 * as a fraction of the frame. Grip width is a real-world length the body tracker measures on
 * every frame, needs no calibration, and shrinks and grows with camera distance and zoom exactly
 * as the scene does. So a threshold expressed in grip widths means the same physical thing whether
 * the phone is three feet away or thirty, in portrait or landscape, at 1x or 2x. A threshold in
 * pixels or frame fractions does not, which is why every previous attempt at this needed
 * per-setup tuning and never got it.
 *
 * It is also, deliberately, the body tracker judging the object tracker with a measurement the
 * object tracker cannot influence. That is what a referee is.
 *
 * THIS FILE IS THE SOURCE OF TRUTH; SWIFT MIRRORS IT.
 *
 * The continuous gate has to run natively, in real time, mid-clip -- correcting a take after the
 * fact is not correcting it. So `AvCoreMlImplementDetector` in AvBodyTrackingPlugin.swift carries
 * a port of `lockDistanceVerdict` and of the constants below, with a comment naming this file.
 * Same arrangement implement-tracking.ts already has with AvImplementTracker's constants, and for
 * the same reason: the rule gets stated once, tested once, here, where there is a test runner.
 * If you change a number here, change it there. `shared/tracker-arbiter.test.ts` reads the
 * Swift source and fails if the two drift apart, so this is enforced rather than hoped for.
 * (It named `tracker-arbiter-parity.test.ts`, which has never existed -- a pointer to a file
 * nobody can open reads as "the parity check was dropped", which is the one conclusion that
 * would license changing a number in one place.)
 *
 * EVERY THRESHOLD BELOW IS A REASONED STARTING VALUE, NOT A MEASURED ONE -- the same caveat
 * every other constant in this pipeline carries. The difference is that this is the first
 * version of any of it that reports what it did: the lock telemetry these decisions now emit
 * (AvAnalysisResult.objectLock -> TrackingDiagnostics.objectLock) is what will make them
 * tunable against real takes instead of re-reasoned from scratch every few months.
 */

export type ArbiterPoint = { x: number; y: number };

/** How far from the athlete a tracked object may sit, in multiples of the body's own yardstick.
 *
 * A loaded plate's centre sits roughly 1.2 grip widths from the midpoint between the wrists: the
 * hands are about 0.55m apart on a bench grip, and the inner plate rides about 0.65m out from the
 * centre of the bar. 2.5 is a little over double that, which is the margin a gate this consequential
 * should carry -- it must never be the reason a good lock on a real lift gets dropped.
 *
 * It still comfortably excludes the failure it exists for. A plate on a rack two metres behind a
 * lifter with a 0.55m grip is 3.6 yardsticks away and fails. So does anything across the room.
 *
 * This is a gross-error gate and not a precision filter, on purpose. Asking it to distinguish a
 * slightly-off lock from a good one would make it a second, worse copy of the drift scoring
 * AvImplementTracker already does properly; asking it to tell equipment from furniture is a
 * question nothing else in the pipeline can answer at all.
 */
export const MAX_LOCK_DISTANCE_IN_YARDSTICKS = 2.5;

/** The gate when the body gave no usable yardstick this frame, as a fraction of the frame diagonal.
 *
 * Deliberately loose. With no body measurement there is no way to convert a screen distance into a
 * real one, so this cannot be a meaningful judgement -- it is only here so the check degrades to
 * "obviously not in this half of the room" rather than switching off entirely. A frame with no
 * wrists and no shoulders is usually a frame with no athlete in it, and the right answer to an
 * unanswerable question is a wide gate, not a confident one.
 */
export const FALLBACK_LOCK_DISTANCE_FRAME_FRACTION = 0.45;

/** Below this many pixels, a body measurement is too small to divide by.
 *
 * A wrist pair a dozen pixels apart is either an athlete filmed from very far away or, far more
 * often, two low-confidence joints that landed near each other. Dividing by it turns a modest
 * screen distance into an enormous number of "yardsticks" and rejects every lock in the take.
 * Falling back to the frame fraction is the honest answer: the body did not supply a scale here.
 */
export const MIN_YARDSTICK_PX = 24;

/** Widest a real plate's bounding box may be relative to its height, either way round.
 *
 * A plate is a disc, so face-on it boxes square. Viewed off-axis it foreshortens along one axis
 * only, and since the scale read takes the LARGER axis as the diameter, an oblique view shows up
 * here as a ratio above 1. 2.5 corresponds to roughly 66 degrees off square, past which the
 * foreshortened read is not worth trusting anyway.
 *
 * What this really excludes is a box that is not a disc at all: the rack upright, the bench end,
 * the shadow under the bar. The read that prompted all of this boxed at 3.12, which is a post.
 */
export const MAX_PLATE_ASPECT_RATIO = 2.5;

export type YardstickSource = "grip" | "shoulders";

export type BodyYardstick = {
  /** The measured span, in this frame's own pixels. */
  px: number;
  source: YardstickSource;
};

/** Convert a normalized (0-1) Vision point to this frame's pixels.
 *
 * Everything here works in pixels rather than normalized units on purpose. Normalized space is
 * anisotropic on any frame that is not square -- 0.1 across is a different real distance from 0.1
 * up -- so a distance computed in it depends on which way the movement happened to point, and a
 * 4:3 clip and a 16:9 clip of the same lift would score differently. The frame's own pixels are
 * isotropic, the body yardstick is measured in them too, and the ratio of the two is what the
 * threshold is actually expressed in. `AvCoreMlImplementDetector.boxDelta` predates this and does
 * work in normalized space; it is comparing a box against its own recent history over one frame
 * rather than against a body measurement, so the anisotropy mostly cancels there.
 */
function toPx(p: ArbiterPoint, frameWidth: number, frameHeight: number): ArbiterPoint {
  return { x: p.x * frameWidth, y: p.y * frameHeight };
}

function distancePx(
  a: ArbiterPoint,
  b: ArbiterPoint,
  frameWidth: number,
  frameHeight: number,
): number {
  const pa = toPx(a, frameWidth, frameHeight);
  const pb = toPx(b, frameWidth, frameHeight);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/**
 * The body's own measuring stick for this frame, in pixels, or null when the body did not supply
 * one.
 *
 * Wrists first, because the equipment is in the hands and grip width is the span that actually
 * relates to where it can be. Shoulders are the fallback -- a lift where one wrist drops out is
 * ordinary, and shoulder breadth is roughly a grip width on most athletes and is available in
 * exactly the framing (lying supine, filmed from the foot of the bench) where length measurements
 * fail. See shoulderWidthScaleFromFrames in av-bar-tracker-dialog.tsx, which reaches for the same
 * span for the same reason.
 *
 * A span under MIN_YARDSTICK_PX is reported as no yardstick at all rather than as a very small
 * one, since dividing by it does more harm than having nothing.
 */
export function bodyYardstickPx(opts: {
  leftWrist?: ArbiterPoint | null;
  rightWrist?: ArbiterPoint | null;
  leftShoulder?: ArbiterPoint | null;
  rightShoulder?: ArbiterPoint | null;
  frameWidth: number;
  frameHeight: number;
}): BodyYardstick | null {
  const { leftWrist, rightWrist, leftShoulder, rightShoulder, frameWidth, frameHeight } = opts;
  if (!(frameWidth > 0) || !(frameHeight > 0)) return null;
  if (leftWrist && rightWrist) {
    const px = distancePx(leftWrist, rightWrist, frameWidth, frameHeight);
    if (px >= MIN_YARDSTICK_PX) return { px, source: "grip" };
  }
  if (leftShoulder && rightShoulder) {
    const px = distancePx(leftShoulder, rightShoulder, frameWidth, frameHeight);
    if (px >= MIN_YARDSTICK_PX) return { px, source: "shoulders" };
  }
  return null;
}

/** Where on the athlete a tracked object is measured FROM.
 *
 * The midpoint of the wrists when both are seen, the single wrist when only one is, null when
 * neither is. Not the shoulders even when the shoulder span is supplying the yardstick: the
 * yardstick answers "how big is a metre here" and the anchor answers "where are the hands", and
 * on a bench press those are half a body apart. Mixing them would move the gate's centre down the
 * athlete's torso and start rejecting real plates.
 */
export function handAnchor(
  leftWrist?: ArbiterPoint | null,
  rightWrist?: ArbiterPoint | null,
): ArbiterPoint | null {
  if (leftWrist && rightWrist) {
    return { x: (leftWrist.x + rightWrist.x) / 2, y: (leftWrist.y + rightWrist.y) / 2 };
  }
  return leftWrist ?? rightWrist ?? null;
}

export type LockVerdict = {
  /** False only when the body actually supplied enough to judge and the object failed it. */
  plausible: boolean;
  /** How far the object sat from the hands, in yardsticks -- null when there was no yardstick. */
  distanceInYardsticks: number | null;
  distancePx: number | null;
  /** What the judgement was actually made on, so telemetry can separate a real pass from an abstention. */
  basis: "yardstick" | "frame_fraction" | "no_anchor";
};

/**
 * THE RULE. Is this object plausibly the one in the athlete's hands?
 *
 * Returns plausible: true when it cannot tell, and that asymmetry is deliberate and load-bearing.
 * A frame with no athlete visible is ordinary -- the lifter walks out of shot, the camera is
 * bumped, a single frame's pose read fails -- and dropping a good lock on every such frame would
 * reproduce, in a new place, exactly the over-eagerness this is meant to cure. Absence of a body
 * reading is not evidence that the object is wrong. The gate only ever fires on a positive
 * finding: the athlete was RIGHT THERE, measurably, and the object was not near them.
 */
export function lockDistanceVerdict(opts: {
  objectCenter: ArbiterPoint;
  anchor: ArbiterPoint | null;
  yardstick: BodyYardstick | null;
  frameWidth: number;
  frameHeight: number;
}): LockVerdict {
  const { objectCenter, anchor, yardstick, frameWidth, frameHeight } = opts;
  if (!anchor || !(frameWidth > 0) || !(frameHeight > 0)) {
    return { plausible: true, distanceInYardsticks: null, distancePx: null, basis: "no_anchor" };
  }
  const gap = distancePx(objectCenter, anchor, frameWidth, frameHeight);
  if (yardstick) {
    const inYardsticks = gap / yardstick.px;
    return {
      plausible: inYardsticks <= MAX_LOCK_DISTANCE_IN_YARDSTICKS,
      distanceInYardsticks: inYardsticks,
      distancePx: gap,
      basis: "yardstick",
    };
  }
  const diagonalPx = Math.hypot(frameWidth, frameHeight);
  return {
    plausible: gap <= diagonalPx * FALLBACK_LOCK_DISTANCE_FRAME_FRACTION,
    distanceInYardsticks: null,
    distancePx: gap,
    basis: "frame_fraction",
  };
}

/** The shape of a reference-object read, as plateScaleFromFrames measures it over a whole take. */
export type ReferenceObjectShape = {
  medianWidthPx: number;
  medianHeightPx: number;
  medianCenterXNorm: number;
  medianCenterYNorm: number;
};

export type ReferenceObjectVerdict = {
  usable: boolean;
  /** Every reason it failed, not just the first -- a read can be both the wrong shape and in the
   * wrong place, and knowing it was both is what tells a bad detection from a bad camera angle. */
  reasons: ("aspect_ratio" | "too_far_from_athlete")[];
  aspectRatio: number | null;
  distanceInYardsticks: number | null;
};

/**
 * Whether a reference-object read is allowed to set the take's real-world scale.
 *
 * Both halves of this were already being COMPUTED and written into the diagnostics blob --
 * aspect ratio, centre position, and the grip span to hold them against -- and then nothing read
 * them. The scale went through on the strength of the detector's confidence alone, and the shape
 * data existed only so a human could work out afterwards why the numbers had been wrong. The
 * measurements were never the missing piece; using them was.
 *
 * Kept separate from lockDistanceVerdict's per-frame job even though it leans on it, because this
 * one is answered ONCE for a take, off medians over the whole clip. A handful of bad frames should
 * not veto a take's scale, and a median read that is the wrong shape in the wrong place is not a
 * handful of bad frames.
 */
export function referenceObjectVerdict(opts: {
  shape: ReferenceObjectShape;
  anchor: ArbiterPoint | null;
  yardstick: BodyYardstick | null;
  frameWidth: number;
  frameHeight: number;
}): ReferenceObjectVerdict {
  const { shape, anchor, yardstick, frameWidth, frameHeight } = opts;
  const reasons: ReferenceObjectVerdict["reasons"] = [];

  const aspectRatio =
    shape.medianWidthPx > 0 && shape.medianHeightPx > 0
      ? Math.max(shape.medianWidthPx, shape.medianHeightPx) /
        Math.min(shape.medianWidthPx, shape.medianHeightPx)
      : null;
  if (aspectRatio != null && aspectRatio > MAX_PLATE_ASPECT_RATIO) reasons.push("aspect_ratio");

  const distance = lockDistanceVerdict({
    objectCenter: { x: shape.medianCenterXNorm, y: shape.medianCenterYNorm },
    anchor,
    yardstick,
    frameWidth,
    frameHeight,
  });
  if (!distance.plausible) reasons.push("too_far_from_athlete");

  return {
    usable: reasons.length === 0,
    reasons,
    aspectRatio,
    distanceInYardsticks: distance.distanceInYardsticks,
  };
}

// ===========================================================================================
// THE THIRD LEG: WHO REFEREES THE REFEREE'S RULER.
//
// Everything above judges the object tracker against the body tracker, and that was the hole
// the audit found. It also opens a new one, and it is worth stating plainly rather than
// discovering later: by making the body the ruler, a bad BODY read can now break a good OBJECT
// lock. The hierarchy runs one way, and a one-way hierarchy is not three parts working
// together -- it is two parts and a referee that only ever blows the whistle on one team.
//
// The body tracker fails in its own characteristic way, and it is not subtle: a wrist landmark
// jumps to a spectator, to the athlete's own knee, or to the other side of the frame. Vision
// reports it with ordinary confidence, because the landmark is confidently somewhere, just not
// on a wrist. A single such frame moves the hand anchor metres, and every object lock in view
// is suddenly "nowhere near the athlete".
//
// WHAT CATCHES IT IS THE RULER'S OWN LENGTH. The distance between an athlete's wrists is a
// physical constant for the duration of a set -- they are holding a bar. Its APPARENT length
// changes only as fast as the athlete rotates relative to the lens, which is slow. So a grip
// span that doubles or halves between two sampled frames is not a lift; it is a landmark that
// moved somewhere a wrist cannot go. The object tracker needs no part in detecting that, which
// is exactly why it is trustworthy as a check on the body.
//
// AND THE RESPONSE IS NOT SYMMETRIC, DELIBERATELY. When the object looks wrong, the lock is
// broken -- there is a better answer available, which is to re-detect. When the BODY looks
// wrong there is no better body available, so the arbiter ABSTAINS for that frame: it declines
// to judge the object at all and leaves the lock alone. Breaking a good lock on the strength of
// a measurement we have just decided not to trust would be the worst of both, and it is the
// specific regression this section exists to prevent.
// ===========================================================================================

/** How far this frame's grip span may sit from the take's recent typical one before the BODY,
 * not the object, is the thing under suspicion.
 *
 * The span is a fixed real length -- hands on a bar -- so all it can legitimately do is
 * foreshorten as the athlete turns relative to the lens. A bar rotated 60 degrees off square
 * reads half its true width, which is the largest honest change available, so 2.0 covers the
 * whole of it with nothing left over for a landmark that has jumped.
 *
 * Above that there is no camera geometry that explains it. Two frames 16ms apart cannot show an
 * athlete's hands at twice the separation unless one of the two readings is not a hand.
 */
export const MAX_YARDSTICK_DEVIATION_RATIO = 2.0;

/** Recent spans needed before "typical" means anything.
 *
 * Under this the arbiter has no basis for calling the body unstable and says so, rather than
 * electing the first reading it saw as the truth -- the same mistake the rep-amplitude gate made
 * when it took the median of every reversal including the noise. */
export const MIN_YARDSTICK_SAMPLES_FOR_STABILITY = 5;

export type BodyStability = {
  /** False only when there was enough history to judge AND this frame failed it. */
  stable: boolean;
  /** This frame's span over the recent typical one, always >= 1 so one threshold covers a jump
   * in either direction. Null when there was not enough history to compare against. */
  deviationRatio: number | null;
};

/**
 * Is the body tracker's own measurement behaving like a body?
 *
 * Median rather than mean over the recent window, for the reason medians are used everywhere
 * else in this pipeline: the failure being looked for is a single wild value, and a mean walks
 * toward the very thing it is supposed to notice.
 */
export function bodyReadIsStable(
  currentPx: number,
  recentPx: number[],
): BodyStability {
  const usable = recentPx.filter((p) => p > 0);
  if (!(currentPx > 0) || usable.length < MIN_YARDSTICK_SAMPLES_FOR_STABILITY) {
    return { stable: true, deviationRatio: null };
  }
  const sorted = [...usable].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length / 2)];
  if (!(typical > 0)) return { stable: true, deviationRatio: null };
  const ratio = Math.max(currentPx, typical) / Math.min(currentPx, typical);
  return { stable: ratio <= MAX_YARDSTICK_DEVIATION_RATIO, deviationRatio: ratio };
}

export type ArbitrationOutcome =
  /** Both trackers look right and they agree about where the equipment is. */
  | "agree"
  /** The body is steady and the object is somewhere the athlete is not. Break the lock. */
  | "object_suspect"
  /** The body's own ruler changed length. Judge nothing this frame; leave the lock alone. */
  | "body_suspect"
  /** Not enough to go on -- no athlete visible, or no yardstick yet. Leave the lock alone. */
  | "cannot_judge";

export type Arbitration = {
  outcome: ArbitrationOutcome;
  /** True exactly when the caller should drop the object lock. Never true for a body fault. */
  breakLock: boolean;
  distanceInYardsticks: number | null;
  bodyDeviationRatio: number | null;
};

/**
 * THE WHOLE REFEREE, IN ONE CALL. Body, object, and the judgement between them.
 *
 * The order is the design. The body is checked FIRST, because every statement the arbiter can
 * make about the object is measured with the body's ruler, and a ruler that just changed length
 * cannot be used to convict anybody. Checking the object first and the body afterwards would
 * mean a jumped wrist landmark had already thrown away a perfectly good lock by the time the
 * jump was noticed.
 */
export function arbitrate(opts: {
  objectCenter: ArbiterPoint;
  anchor: ArbiterPoint | null;
  yardstick: BodyYardstick | null;
  /** Spans from recent frames, for judging whether THIS frame's body read can be trusted. */
  recentYardstickPx: number[];
  frameWidth: number;
  frameHeight: number;
}): Arbitration {
  const { objectCenter, anchor, yardstick, recentYardstickPx, frameWidth, frameHeight } = opts;

  if (yardstick) {
    const body = bodyReadIsStable(yardstick.px, recentYardstickPx);
    if (!body.stable) {
      return {
        outcome: "body_suspect",
        breakLock: false,
        distanceInYardsticks: null,
        bodyDeviationRatio: body.deviationRatio,
      };
    }
  }

  const verdict = lockDistanceVerdict({ objectCenter, anchor, yardstick, frameWidth, frameHeight });
  if (verdict.basis === "no_anchor") {
    return {
      outcome: "cannot_judge",
      breakLock: false,
      distanceInYardsticks: null,
      bodyDeviationRatio: null,
    };
  }
  return {
    outcome: verdict.plausible ? "agree" : "object_suspect",
    breakLock: !verdict.plausible,
    distanceInYardsticks: verdict.distanceInYardsticks,
    bodyDeviationRatio: null,
  };
}
