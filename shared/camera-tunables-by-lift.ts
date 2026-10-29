// ONE SET OF NUMBERS PER FILMABLE THING. 54 exercises, 216 skill drills, 270 in all.
//
// Scott, 2026-10-06, having been told that bench and squat share one code path and that a
// constant fitted on one moves the other:
//
//   "give each 54 exercises, and while you're at it all of the speed/agility, and skills that
//   can be filmed too ... every single thing that can be filmed needs its own system, because
//   again, if we're testing let's say a 40 yard dash, it shouldn't change any bench press
//   numbers."
//
// And on what the numbers start as: "Don't change the numbers that are already there, just make
// sure they are their own separate individual numbers" / "So copy and paste."
//
// THAT IS EXACTLY WHAT THIS IS. Every identity below gets its OWN record, carrying the values
// the pipeline uses today, copied -- not shared, not referenced, not inherited at read time. So
// today every lift reads what it read before (`camera-tunables-are-a-copy.test.ts` proves it
// against the real constants), and tomorrow a number fitted on the 40-yard dash is written into
// the dash's own record and cannot reach the bench press, because there is no longer one object
// for both to read.
//
// WHY A FACTORY AND NOT 270 HAND-TYPED BLOCKS. "Copy and paste" is the semantics, and the
// semantics is what matters: one independent, separately writable record per identity. Typing
// the same fifteen numbers out 270 times would be 4,000 lines nobody can review, and the first
// typo in it would be a per-lift calibration nobody intended -- the exact failure mode this file
// exists to prevent. `freshTunables()` returns a new object every call, so the records are as
// separate as if they had been typed out, and the values are in ONE place to read rather than
// 270 places to compare. A fitted number is then written as an override beside the name, which
// is the line a reviewer actually needs to see.
//
// WHAT IS NOT IN HERE, and why. Only the constants that a sensor comparison has ever moved, or
// could plausibly move, are per-lift. The plausibility gates (a frame implying an impossible
// velocity), the occlusion windows and the arbiter's grip-width threshold stay shared on
// purpose: those are statements about physics and about the camera, not about the lift, and
// splitting them 270 ways would mean 270 uncalibrated guesses where today there is one
// considered number. Rule #2 applies to constants as much as to sensors -- a number nobody can
// fit is not made better by having more copies of it.
//
// HOW A NUMBER GETS INTO HERE. It is fitted from a take filmed beside the OVR sensor, the
// comparison is written up in docs/camera-tracking-notes.md with the before and after, and the
// override is added below with the date and the measured error beside it. Never from reasoning
// alone, and never on more than the one identity it was measured on.

/** The numbers a calibration session can move. One copy per filmable thing. */
export type CameraTunables = {
  // --- the rep gate: what counts as a rep at all -------------------------------------------
  /** Floor on a rep's range of motion, as a fraction of the athlete's standing height. */
  minRomFractionOfHeight: number;
  /** Ceiling on the same, which is what catches a scale several times too large. */
  maxRomFractionOfHeight: number;
  /** How far the bar must leave its start before travel counts, in metres. */
  travelOnsetMarginM: number;
  // --- the set's headline numbers ------------------------------------------------------------
  /** A rep's peak may not exceed its own mean by more than this (build 577). */
  maxPeakToMeanRatio: number;
  /** The reported concentric window starts at this fraction of the rep's own peak speed. */
  driveOnsetFraction: number;
  /** Ceiling on bar-path deviation, as a fraction of standing height. */
  maxDeviationFractionOfHeight: number;
  // --- segmentation: the un-rack, the settle, the re-rack ------------------------------------
  /** How many reps the count-trim may remove from either end of a set (build 622). */
  maxCountTrimPerEdge: number;
  /** How odd a rep must score before the trim will remove it. */
  minCountTrimOddness: number;
  // --- scale: which ruler is believed how much ----------------------------------------------
  /** The height ruler's uncertainty, which sets its weight in the inverse-variance blend. */
  heightRulerUncertainty: number;
  /** The 3D depth ruler's zero, fitted from sets 5, 6 and 7 (build 574). */
  depthRulerBias: number;
  /** The 3D depth ruler's uncertainty. */
  depthRulerUncertainty: number;
  /** The 3D ankle ruler's uncertainty. */
  ankle3DRulerUncertainty: number;
  /** How far a shoulder span may disagree with ITSELF across one set before the shoulder ruler
   *  refuses to vote at all -- median absolute deviation as a fraction of the span.
   *
   *  HERE BECAUSE IT WAS FITTED ON ONE LIFT. 0.4 was chosen 2026-10-06 as the one value that
   *  refuses build 632's Pendlay Row (0.464, and reinstating that ruler costs the row 17.5%)
   *  while keeping the standing press (0.063) and the bench (0.21). The author checked it
   *  against two other lifts, which is the discipline this repo requires -- but checking a
   *  number against other lifts is not the same as it BELONGING to them, and as a shared module
   *  constant one take's 0.464 decided whether the shoulder ruler votes on all 269 identities.
   *  The shoulder ruler is the highest-weight voter on most takes, so that is the most
   *  consequential thing in the registry to have left outside it.
   *
   *  Contrast DRIVE_ONSET_FRACTION, which stays SHARED on purpose: it was fitted across five
   *  movements on thirteen sets, so it describes the pipeline rather than a lift. The test of a
   *  split is not "is it a number" but "could somebody fit it from one take" -- and this one
   *  already was. */
  maxShoulderSpanSpread: number;
  // --- the scale blend's own numbers -------------------------------------------------------
  //
  // MOVED IN 2026-10-20, AND THE AUDIT THAT FOUND THEM IS WHY. Scott: "I want everything
  // separate, everything needs its own place." A sixteen-agent pass over every numeric constant
  // the Back Squat, the Romanian Deadlift and the Box Jump read -- each claim challenged once on
  // its provenance and once on whether those three lifts actually reach it -- found SEVEN shared
  // FITTED numbers whose evidence is a lift he was not filming. Six of the seven are a BENCH
  // PRESS and one is a Pendlay Row, which is why an earlier search for "Pendlay" found almost
  // nothing and reported two.
  //
  // Three of the seven already had their own place (depthRulerBias, maxPeakToMeanRatio,
  // maxPlateSizeInYardsticks). These are the four that did not, plus the one derived from them.
  // EVERY RECORD HOLDS THE SAME VALUE and FITTED_OVERRIDES stays empty, so this moves no number
  // on any lift -- it is the same copy-and-paste the first twelve were, and
  // camera-tunables-are-a-copy.test.ts asserts each against the constant it came from.

  /** The floor on the shoulder ruler's stated uncertainty.
   *
   *  FITTED ON NINE TAKES ACROSS THREE LIFTS, 2026-10-06 (`e70cc096`): bench, Pendlay row and
   *  push press, same athlete, same room, NONE of them one of the three now being filmed. Here
   *  because it is the floor on the highest-weight voter: replayed on the 2026-10-19 candidates
   *  it moves the BOX JUMP +4.3% at 0.1 and -1.8% at 0.4, and the Back Squat -1.7% / +0.7%. The
   *  RDL is inert to it (±0.04%) only because that take's two voters agree to 0.146%. */
  biacromialToleranceFraction: number;
  /** The widest an agreement test may be before it stops being a test -- a CEILING that can only
   *  ever make the test stricter.
   *
   *  IT IS HERE BECAUSE IT IS DERIVED FROM THE FIELD ABOVE, and separating one without the other
   *  breaks the link. Its value is written `0.2 * SCALE_AGREEMENT_MULTIPLE` in pose-tracking.ts
   *  -- a hardcoded literal whose comment claims it is `BIACROMIAL_TOLERANCE_FRACTION x the
   *  multiple`. Identical today, linked only by that sentence, so the day the floor is fitted on
   *  one lift this silently stops tracking it. The 2026-10-09 Pendlay row DIAGNOSED the pathology
   *  it exists for (a floored ruler's doubled tolerance reached 1.174 and vouched for a plate 3.5x
   *  away); it did not choose the number, which is the width every take used before any floor
   *  existed. Verified inert on all four 2026-10-19 takes -- each sat at the natural tolerance. */
  maxScaleAgreementTolerance: number;
  /** The 3D body ruler's uncertainty once the skeleton has been corrected by a stated height.
   *
   *  FITTED ON SEVEN SENSOR-PAIRED BENCHES, 2026-09-30 (`260d479b`), and named in CLAUDE.md as
   *  "the one to watch ... Next candidate to move" since 2026-10-16. The BOX JUMP is the lift it
   *  is live on: +3.3% at 0.1, +7.0% at 0.05. The Back Squat is one-sided (-1.6% at 0.3 and
   *  exactly 0.00% at or below 0.2, because the 3D-pose collapse takes `Math.max` of the pair's
   *  uncertainties and depth's own 0.2 masks it) and the RDL moves under 0.05%. */
  body3DCorrectedUncertainty: number;
  /** How long the position trace is smoothed over before velocity is differenced from it, in ms.
   *
   *  FITTED ON ONE BENCH TAKE, 2026-09-23 (`59c95751`), and the file says so in its own words:
   *  "Untuned against more than one paired set." It sets the reported PEAK and its peak index
   *  anchors BOTH window trims, so it also moves the window the mean is measured over -- and no
   *  sweep of it exists, so its effect on a squat or a hinge is unmeasured rather than small. */
  velocitySmoothingMs: number;
  /** How much larger than the set's own median a first or last concentric may be before it is
   *  read as a rack move rather than a rep.
   *
   *  TWO-SIDED, AND ONLY THE UPPER BOUND IS A PENDLAY ROW: that take's pickup was 1.79x its set's
   *  median (`7df011e0`), and the lower bound is the deepest genuine edge rep across fourteen
   *  sensor-paired sets spanning movements (1.3x). 1.6 sits in the gap. It deletes a rep when it
   *  fires, so it changes the rep count and every set mean with it; edge reps only, and it needs
   *  at least three concentrics to be consulted at all. */
  edgeOversizedAmplitudeRatio: number;
  /** The box ruler's uncertainty: the typed box height over the measured pixel gap between the
   *  athlete's own ankle floor and the box top Vision found.
   *
   *  HERE BECAUSE IT WAS A BARE `0.05` IN av-jump-tracker-dialog.tsx WITH NO NAME AND NO
   *  COMMENT, found by the 2026-10-20 plumbing pass. It is the most confident uncertainty any
   *  ruler in this pipeline states -- four times tighter than a body ruler's 0.2 and tighter
   *  than COREML_BOX_LONG_EDGE_UNCERTAINTY's measured 0.056 -- so it decides the box jump's
   *  scale almost by itself whenever the box is found at all. Nothing is recorded about where
   *  0.05 came from, and the only lift it has ever reached is the Box Jump, which is one of the
   *  three now being filmed.
   *
   *  NOT the same thing as COREML_BOX_LONG_EDGE_UNCERTAINTY, which is a property of the CoreML
   *  detector and is correctly shared: this ruler's denominator is a Vision box-top read plus a
   *  tenth-percentile ankle floor, two different measurements with their own error. Unmeasured
   *  either way -- a jump filmed beside the sensor with the box ruler's own error written down
   *  is what would let it be fitted, and until then it keeps the value it has always had. */
  boxRulerUncertainty: number;
  // --- the gates: what the pipeline will believe about one frame ----------------------------
  //
  // SPLIT ON SCOTT'S SECOND INSTRUCTION, 2026-10-06: "Split those too, every single thing should
  // be the same but separate, if we change the gate on med ball throws it might change the gate
  // on a golf swing and yes they are similar but very different."
  //
  // The first version of this file left these shared, on the argument that they describe physics
  // and the camera rather than the lift. He overruled it, and he is right about the thing the
  // argument missed: a gate is only "physics" once you have fixed WHICH movement you are talking
  // about. 3 m/s is impossible for a bar and ordinary for a thrown med ball; 15 m/s is a sane
  // ceiling for a golf club head and nonsense for a kettlebell. The constants were ALREADY
  // per-tracker for exactly that reason -- they just shared one value across every lift inside a
  // tracker, so the 46 bar lifts shared one and the 8 jumps shared another.
  /** Ceiling on a single frame's speed for THIS movement, m/s. */
  maxPlausibleSpeedMps: number;
  /** Ceiling on a frame-to-frame acceleration, in g. */
  maxPlausibleAccelG: number;
  /** The most a set's velocity may change across it before the fatigue number is withheld, %. */
  maxPlausibleVelocityChangePct: number;
  /** How confident a landmark or an object box must be before its position is used. */
  minTrackingConfidence: number;
  /** The gap either side of which an occlusion is NOT interpolated across, ms. */
  occlusionMinGapMs: number;
  occlusionMaxGapMs: number;
  // --- overwatch's gates, per movement -------------------------------------------------------
  //
  // THE SWIFT PORT STILL USES ONE VALUE EACH, and that is recorded rather than hidden: overwatch
  // has to act mid-clip, so it runs natively (`AvTrackerArbiter`), and the native side is handed
  // a tracking mode, not a tunables record. These four are per-lift on the TypeScript side today
  // -- which is what the replay harness and every test read -- and the Swift copy keeps the
  // shared default until the record is plumbed through the plugin. `tracker-arbiter.test.ts`
  // compares Swift against the DEFAULT, so the two cannot drift on the value they do share, and
  // a fitted per-lift arbiter number would be inert on the phone until that plumbing lands.
  // Do not fit one before then; it would read as applied and not be.
  maxLockDistanceInYardsticks: number;
  maxPlateAspectRatio: number;
  maxPlateSizeInYardsticks: number;
  maxYardstickDeviationRatio: number;
};

/** TODAY'S VALUES, and the only place they are written down. Read off the constants they came
 *  from -- `camera-tunables-are-a-copy.test.ts` asserts each against its source, so a change to
 *  one of those files that is not mirrored here fails rather than drifting. */
export const SHARED_CAMERA_TUNABLES: Readonly<CameraTunables> = Object.freeze({
  minRomFractionOfHeight: 0.05, // DEFAULT_MIN_ROM_FRACTION
  maxRomFractionOfHeight: 1.3, // DEFAULT_MAX_ROM_FRACTION
  travelOnsetMarginM: 0.01, // TRAVEL_ONSET_MARGIN_M
  maxPeakToMeanRatio: 2.0, // MAX_PEAK_TO_MEAN_RATIO
  driveOnsetFraction: 0.04, // DRIVE_ONSET_FRACTION
  maxDeviationFractionOfHeight: 0.2, // DEFAULT_MAX_DEVIATION_FRACTION
  maxCountTrimPerEdge: 4, // bar-tracking.ts, build 622
  minCountTrimOddness: 1,
  heightRulerUncertainty: 0.1, // HEIGHT_RULER_UNCERTAINTY
  depthRulerBias: 0.9, // DEPTH_RULER_BIAS
  depthRulerUncertainty: 0.2, // DEPTH_RULER_UNCERTAINTY
  ankle3DRulerUncertainty: 0.2, // ANKLE_3D_RULER_UNCERTAINTY
  maxShoulderSpanSpread: 0.4, // MAX_SHOULDER_SPAN_SPREAD
  biacromialToleranceFraction: 0.2, // BIACROMIAL_TOLERANCE_FRACTION
  maxScaleAgreementTolerance: 0.4, // MAX_SCALE_AGREEMENT_TOLERANCE
  body3DCorrectedUncertainty: 0.2, // BODY_3D_CORRECTED_UNCERTAINTY
  velocitySmoothingMs: 165, // VELOCITY_SMOOTHING_MS
  edgeOversizedAmplitudeRatio: 1.6, // EDGE_OVERSIZED_AMPLITUDE_RATIO
  boxRulerUncertainty: 0.05, // av-jump-tracker-dialog.tsx's box scale, a bare literal until 10-20
  maxPlausibleSpeedMps: 3, // MAX_PLAUSIBLE_LIFT_VELOCITY_MPS -- the bar's, overridden per tracker
  maxPlausibleAccelG: 6, // MAX_PLAUSIBLE_ACCEL_G
  maxPlausibleVelocityChangePct: 100, // MAX_PLAUSIBLE_VELOCITY_CHANGE_PCT
  minTrackingConfidence: 0.5, // MIN_TRACKING_CONFIDENCE
  occlusionMinGapMs: 70, // OCCLUSION_MIN_GAP_MS
  occlusionMaxGapMs: 200, // OCCLUSION_MAX_GAP_MS
  maxLockDistanceInYardsticks: 2.5, // MAX_LOCK_DISTANCE_IN_YARDSTICKS
  maxPlateAspectRatio: 1.7, // MAX_PLATE_ASPECT_RATIO
  maxPlateSizeInYardsticks: 2.0, // MAX_PLATE_SIZE_IN_YARDSTICKS
  maxYardstickDeviationRatio: 2.0, // MAX_YARDSTICK_DEVIATION_RATIO
});

/** Which tracker films an identity. The caller knows it -- every tracker dialog names its own
 *  mode already (see resolve-tracking-mode.ts), and a skill drill is mechanics or sprint-timed by
 *  its skillType -- so it is passed in rather than re-derived here, which would put a client
 *  module's name patterns into shared/. */
export type FilmingTracker =
  | "bar"
  | "jump"
  | "med_ball"
  | "kb_swing"
  | "golf_swing"
  | "baseball_swing"
  | "sprint"
  | "mechanics"
  | "horizontal_load";

/** The `trackingLevel` a set is saved with, which is what every tracker dialog branches on.
 *  Written out here rather than imported from shared/schema.ts because this module is in the
 *  CLIENT bundle and the schema is deliberately kept out of it (CLAUDE.md, "Speed and
 *  findability"). `every-tracker-reads-its-own-numbers.test.ts` holds this union against the real
 *  pgEnum, so a level added to the database cannot stay missing from here. */
export type CaptureTrackingLevel =
  | "none"
  | "bar_path"
  | "full"
  | "jump"
  | "sprint"
  | "mechanics"
  | "golf_swing"
  | "baseball_swing"
  | "med_ball"
  | "kb_swing"
  | "horizontal_load";

/** WHICH RECORD A SAVED TRACKING LEVEL READS. Exhaustive on purpose, and the reason is the
 *  defect this mapping was written to stop: `cameraTunablesFor`'s third parameter DEFAULTS to
 *  "bar", so a dialog that resolves a record without naming its tracker silently gets the bar's
 *  gates -- a 3 m/s frame ceiling on a thrown med ball, which is Scott's own example of what
 *  must never happen ("if we change the gate on med ball throws it might change the gate on a
 *  golf swing"). A `Record` over the whole union means a new level is a type error here instead
 *  of a quiet default, and `null` says "this level never films" rather than leaving it to a
 *  falsy check.
 *
 *  `bar_path` and `full` are the two GENERIC levels -- see resolve-tracking-mode.ts, which
 *  resolves them against the exercise's name and equipment before a dialog is chosen -- so by
 *  the time a dialog is on screen they mean the bar tracker. */
export const TRACKER_FOR_TRACKING_LEVEL: Record<CaptureTrackingLevel, FilmingTracker | null> = {
  none: null,
  bar_path: "bar",
  full: "bar",
  jump: "jump",
  sprint: "sprint",
  mechanics: "mechanics",
  golf_swing: "golf_swing",
  baseball_swing: "baseball_swing",
  med_ball: "med_ball",
  kb_swing: "kb_swing",
  horizontal_load: "horizontal_load",
};

/** THE GATES EACH TRACKER USES TODAY, copied from the tracker's own constant. These are the
 *  numbers that were already per-tracker; copying them in is what makes an identity's record
 *  complete, so no lift reads half its numbers from its own record and half from somewhere
 *  else. A tracker absent from a field keeps the shared value above. */
const GATES_BY_TRACKER: Record<FilmingTracker, Partial<CameraTunables>> = {
  // MAX_PLAUSIBLE_LIFT_VELOCITY_MPS, bar-tracking.ts.
  bar: {},
  // A jump's gates are flight-time bounded rather than speed bounded (jump-tracking.ts), so the
  // speed ceiling is the bar's until a jump take says otherwise.
  jump: {},
  // MAX_PLAUSIBLE_BALL_SPEED_MPS, av-medball-tracker-dialog.tsx. A thrown ball leaves the hand
  // far faster than any bar moves, which is the whole of Scott's point.
  //
  // AND `heightRulerUncertainty: 0.05` IS NOT A CHOICE ANYBODY MADE -- it is what these two
  // dialogs have hardcoded since `2436110b` (2026-09-29), when the shared constant was also
  // 0.05. `HEIGHT_RULER_UNCERTAINTY` was refit to 0.1 on 2026-10-05 (`812becb7`, the stopgap
  // over the failing object system) and the refit could not reach a LITERAL, so for six weeks
  // the med ball and kettlebell trackers have stated their height ruler as twice as confident
  // as the pipeline believes -- which in an inverse-variance blend is FOUR TIMES the weight.
  // Sixth instance of the class CLAUDE.md keeps naming: a correction wired to one path,
  // invisible because the path that IS taken looks like it worked.
  //
  // IT IS COPIED HERE AT TODAY'S VALUE, NOT CORRECTED, and the distinction is the whole point of
  // this file. Setting it to 0.1 would move a number on two trackers inside a commit whose
  // claim is that it moves none -- and 0.1 was fitted on a BENCH and a SQUAT, so applying it to
  // a thrown ball is the leak this registry exists to stop, just pointing the other way. Nobody
  // has filmed a med ball throw or a kettlebell swing beside the sensor with the height ruler's
  // own error written down, so neither value has evidence behind it on these two movements.
  // What settles it is one paired take; until then the separation is recorded and visible,
  // which is the thing that was missing.
  med_ball: { maxPlausibleSpeedMps: 25, heightRulerUncertainty: 0.05 },
  // MAX_PLAUSIBLE_KB_SWING_SPEED_MPS, kb-swing-tracking.ts.
  kb_swing: { maxPlausibleSpeedMps: 8, heightRulerUncertainty: 0.05 },
  // MAX_PLAUSIBLE_GRIP_SPEED_MPS, swing-tracking.ts -- the GRIP, not the club head.
  golf_swing: { maxPlausibleSpeedMps: 15 },
  baseball_swing: { maxPlausibleSpeedMps: 15 },
  // MAX_PLAUSIBLE_SPRINT_SPEED_YARDS_PER_SEC is in yards per second and stays in its own file;
  // a sprint has no metre-per-second frame gate to copy.
  sprint: {},
  // MAX_PLAUSIBLE_WRIST_SPEED_MPS, mechanics-tracking.ts.
  mechanics: { maxPlausibleSpeedMps: 20 },
  horizontal_load: {},
};

/** A NEW record every call. This is the "copy and paste": nothing below holds a reference to
 *  the object above, so writing to one identity's record is invisible to every other. */
export function freshTunables(): CameraTunables {
  return { ...SHARED_CAMERA_TUNABLES };
}

// THE ROM BUCKETS ARE THE ONE PLACE A PER-LIFT NUMBER ALREADY EXISTED, so they are copied into
// the per-lift records rather than left as a lookup beside them -- otherwise half of each lift's
// numbers would be its own and half would still be shared, which is the thing being fixed.
// Values are exactly bar-tracking.ts's MIN_ROM_FRACTION_OF_HEIGHT / MAX_ROM_FRACTION_OF_HEIGHT /
// MAX_DEVIATION_FRACTION_OF_HEIGHT / TRAVEL_ONSET_MARGIN_BY_ROM_KIND_M.
const BY_ROM_BUCKET: Record<string, Partial<CameraTunables>> = {
  horizontal_press_or_row: { minRomFractionOfHeight: 0.08, maxRomFractionOfHeight: 0.5, travelOnsetMarginM: 0.0075 },
  squat: { minRomFractionOfHeight: 0.10, maxRomFractionOfHeight: 0.6 },
  deadlift: { minRomFractionOfHeight: 0.12, maxRomFractionOfHeight: 0.7 },
  overhead_press: { minRomFractionOfHeight: 0.10, maxRomFractionOfHeight: 0.7 },
  olympic: { minRomFractionOfHeight: 0.15, maxRomFractionOfHeight: 1.35, maxDeviationFractionOfHeight: 0.3 },
  vertical_pull: { minRomFractionOfHeight: 0.08, maxRomFractionOfHeight: 0.55 },
  elbow_flexion_extension: { minRomFractionOfHeight: 0.04, maxRomFractionOfHeight: 0.45 },
  ankle_or_shrug: { minRomFractionOfHeight: 0.01, maxRomFractionOfHeight: 0.2 },
  lunge_or_step: { minRomFractionOfHeight: 0.06, maxRomFractionOfHeight: 0.55 },
  dip_or_pushup: { minRomFractionOfHeight: 0.05, maxRomFractionOfHeight: 0.45 },
};

/** A FITTED NUMBER GOES HERE, against the one identity it was measured on, with the date and
 *  the measured error in a comment. Empty today, and that is the correct state: not one constant
 *  in this file has been fitted on a single lift in isolation. The RDL, the box jump and the
 *  bench were all fixed by changing a LABEL or a RULE, never by giving one lift its own number,
 *  and the 10-06 bias sweep is on the record as evidence against doing so blind. */
export const FITTED_OVERRIDES: Record<string, Partial<CameraTunables>> = {
  // e.g. "Bench Press": { driveOnsetFraction: 0.09 }, // 2026-10-__, +4.3% -> 0.0% against OVR
  "Romanian Deadlift": { maxPeakToMeanRatio: 2.5, depthRulerUncertainty: 0.6 },
};

/** WHY EACH OVERRIDE EXISTS, in the sentence a reader needs to decide whether it still should.
 *  One entry per identity in FITTED_OVERRIDES, held equal by camera-tunables-are-a-copy.test.ts;
 *  an override with no evidence here is a number somebody guessed, and the test refuses it. */
export const FITTED_OVERRIDE_EVIDENCE: Record<string, string> = {
  "Romanian Deadlift":
    "2026-10-29. maxPeakToMeanRatio 2.0 -> 2.5 on this lift only. The 2.0 was fitted on 60 BENCH " +
    "reps whose sensor ratio is 1.35-1.5; the OVR's own peak/mean on this athlete's RDL is 1.57-1.78 " +
    "on 16 of 16 reps across 10-19 and 10-29, and Forge's mean reads LOW on a hinge (0.74 against " +
    "0.89 on 10-19), so a correctly-read peak reaches 2.1-2.2x the mean here and the cap cut it: " +
    "on 10-19 set 2 raw peaks of 1.575 and 1.624 (sensor 1.59 set average) were written down as " +
    "1.53 and 1.49. 2.5 still catches the un-rack the cap exists for (3.5x on the 10-06 bench). " +
    "Replayed on the three RDL traces in the export; the squat traces are untouched by construction. " +
    "depthRulerUncertainty 0.2 -> 0.6 on this lift only: the depth ruler read HIGH against the sensor " +
    "on five of five RDL takes (+10, +8, +35, +27, +44% on 10-04, 10-05, 10-19 x2, 10-29) while the " +
    "in-plane bone read -9, -17, -1, -1, +16, and the collapse averaged them equally, so the pair's " +
    "witness carried half the depth ruler's error into every hinge. 0.6 states it as the instrument " +
    "it has measured as on a hinge (three times the bone's 0.2, a ninth of the weight), which is a " +
    "judgement about an uncertainty and not a fit of a bias; replayed on all five ledger rows it takes " +
    "the RDL's median error from 12.0% to under 8% and moves no squat row, since the squat's record " +
    "still states 0.2 for both.",
};

/** Where each of an identity's numbers came from. The report prints this, so a reader can tell
 *  a number fitted on this lift from one that is still the shared starting value -- the
 *  distinction Rule #4 makes about corroboration, applied to constants. */
export type TunableSource = "shared" | "tracker" | "rom_bucket" | "fitted";

export type ResolvedCameraTunables = {
  /** This identity's own record. Mutating it affects nothing else. */
  values: CameraTunables;
  sources: Record<keyof CameraTunables, TunableSource>;
  /** The name the record was resolved for, as the capture recorded it. */
  identity: string;
  /** Which tracker's gates it was built from. */
  tracker: FilmingTracker;
};

/** THIS IDENTITY'S OWN NUMBERS. A fresh record every call, so two lifts analysed in one session
 *  can never share one. `romBucket` is the exercise's bucket where it has one (the caller
 *  already has it from `romBucketForExercise`); a skill drill passes null. */
export function cameraTunablesFor(
  identity: string | null | undefined,
  romBucket?: string | null,
  tracker: FilmingTracker = "bar",
): ResolvedCameraTunables {
  const values = freshTunables();
  const sources = {} as Record<keyof CameraTunables, TunableSource>;
  for (const key of Object.keys(values) as (keyof CameraTunables)[]) sources[key] = "shared";

  for (const [key, value] of Object.entries(GATES_BY_TRACKER[tracker]) as [keyof CameraTunables, number][]) {
    values[key] = value;
    sources[key] = "tracker";
  }

  const bucket = romBucket ? BY_ROM_BUCKET[romBucket] : undefined;
  if (bucket) {
    for (const [key, value] of Object.entries(bucket) as [keyof CameraTunables, number][]) {
      values[key] = value;
      sources[key] = "rom_bucket";
    }
  }

  const fitted = identity ? FITTED_OVERRIDES[identity] : undefined;
  if (fitted) {
    for (const [key, value] of Object.entries(fitted) as [keyof CameraTunables, number][]) {
      values[key] = value;
      sources[key] = "fitted";
    }
  }

  return { values, sources, identity: identity ?? "(unnamed)", tracker };
}
