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
  med_ball: { maxPlausibleSpeedMps: 25 },
  // MAX_PLAUSIBLE_KB_SWING_SPEED_MPS, kb-swing-tracking.ts.
  kb_swing: { maxPlausibleSpeedMps: 8 },
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
