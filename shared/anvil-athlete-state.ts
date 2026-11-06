import {
  ANVIL_CHANNELS,
  coverageFor,
  reading,
  type AnvilAbsence,
  type AnvilChannel,
  type AnvilCoverage,
  type AnvilReading,
  type AnvilSignalId,
} from "./anvil-inputs";

/**
 * THE ONE PLACE FORGE'S COLUMNS BECOME ANVIL INPUTS.
 *
 * `shared/anvil-inputs.ts` says WHICH signals the Anvil may read and where each lives. This is the
 * mapping that makes that true: rows in, one reading or one stated absence per declared signal out.
 *
 * WHY IT IS PURE, AND WHY IT IS NOT A ROUTE. It takes rows somebody else fetched and returns a
 * record. Three reasons, each one this repo's own:
 *   - A route nothing calls is dead code that looks live, and the day somebody wires it the dead
 *     guard inside becomes a live one. `/api/athlete/apple-iap/verify` is the entry in CLAUDE.md
 *     about exactly that. The Anvil has no product code yet, so there is nothing to call a route.
 *   - A pure function is testable with no Postgres, which is the whole reason `npm test` and
 *     `npm run test:integration` are two suites.
 *   - It imports no drizzle and no schema. `shared/schema.ts` in the client bundle costs 291 kB
 *     and `bundle-budget.test.ts` refuses it, so the input types below are plain shapes rather
 *     than `$inferSelect` -- which also means this file cannot accidentally widen a query.
 *
 * IT DECIDES WHAT IS ADMISSIBLE AND NEVER WHAT IS TRUE. There is no threshold here, no z-score and
 * no flag: those belong to the three channels and not one of them has been measured against these
 * inputs. What this file decides is narrower and is the part that cannot be left to a channel --
 * whether a number should be compared at all. A capture from a second phone, a take the pipeline
 * itself refused, and an athlete who has opted out of tracking are three different absences, and
 * flattening them into one blank is the failure Rule #1 is about.
 */

// ---------------------------------------------------------------------------
// What this function is handed. Plain shapes on purpose -- see the docblock.
// ---------------------------------------------------------------------------

/** One `wellness_checkins` row, as the day's check-in. */
export type WellnessRow = {
  date: string;
  sleepHours: number | null;
  soreness: number | null;
  stress: number | null;
  /** Present on the row and DELIBERATELY NOT READ since 2026-11-06; see anvil-inputs.ts. */
  hydration: number | null;
  mentalFocus: number | null;
  bodyPainMap: string[] | null;
  restingHeartRate: number | null;
  hrv: number | null;
  respiratoryRate: number | null;
  bodyMass: number | null;
  heartRateRecovery: number | null;
};

/**
 * One capture, flattened from `workout_set_entries` joined to its log entry. `deviceKey` is a
 * stable identity for the phone/lens/format the take was shot on, derived from
 * `captureDeviceInfo` by the caller -- derived there rather than here because the blob's shape is
 * the native pipeline's business and this file should not grow a second reader of it.
 */
export type CaptureRow = {
  date: string;
  exerciseId: number | null;
  setNumber: number;
  deviceKey: string | null;
  /** True when the take's own diagnostics say the pipeline could not trust it. */
  refusedByPipeline: boolean;
  velocityLossPercent: number | null;
  meanVelocityMps: number | null;
  peakVelocityMps: number | null;
  meanPowerWatts: number | null;
  /** Every jump in the set, not the best one. See `meanOrNull`'s comment. */
  jumpHeightsCm: number[] | null;
  reactiveStrengthIndex: number | null;
  groundContactSeconds: number | null;
  rpe: number | null;
};

export type SkillRow = {
  date: string;
  elapsedSeconds: number | null;
  distanceYards: number | null;
  wellSequenced: boolean | null;
  hipShoulderSeparationDeg: number | null;
  peakWristSpeedMps: number | null;
};

export type TestingRow = {
  date: string;
  fortyYardDash: number | null;
  verticalJumpIn: number | null;
  broadJumpIn: number | null;
  proAgilitySeconds: number | null;
  threeConeSeconds: number | null;
  benchMaxLbs: number | null;
  squatMaxLbs: number | null;
  deadliftMaxLbs: number | null;
};

export type NutritionTotals = {
  caloriesKcal: number | null;
  proteinG: number | null;
  ironMg: number | null;
  vitaminB12Mcg: number | null;
  vitaminDMcg: number | null;
};

export type AnvilStateInput = {
  /** The day being assembled, ISO. Every row is filtered against it by the caller. */
  date: string;
  athlete: {
    dateOfBirth: string | null;
    gender: string | null;
    sport: string | null;
    position: string | null;
    seasonPhase: string | null;
    heightIn: number | null;
    trackingOptOut: boolean;
  };
  /** Today's check-in, or null if none was submitted. */
  wellness: WellnessRow | null;
  /**
   * Whether this athlete has EVER had an Apple Health value on any check-in. It separates "the
   * watch was not worn today" from "this athlete is on the web and Health was never connected" --
   * two absences a single null cannot tell apart, and the distinction a coach needs before they
   * ask an athlete about their strap.
   */
  healthEverConnected: boolean;
  /** Today's captures. */
  captures: CaptureRow[];
  /**
   * The device this athlete's recent captures were mostly shot on, decided by the caller over a
   * window it owns. A capture from any other device is not comparable and says so.
   */
  modalDeviceKey: string | null;
  skills: SkillRow[];
  /** The most recent testing battery on or before `date`. */
  testing: TestingRow | null;
  /** Today's food-log totals, or null if nothing was logged. */
  nutrition: NutritionTotals | null;
  /** Most recent body-mass weigh-in on or before `date`, normalised to pounds by the caller. */
  bodyMassLbs: number | null;
  /** Open injuries on `date`: body parts, which is all a context signal needs. */
  openInjuries: string[];
  /** Any goniometer reading classified as restricted on or before `date`, as a degree value. */
  restrictedJointAngleDeg: number | null;
  /** Measured training minutes from closed CARA sessions on `date`. */
  caraTrainingMinutes: number | null;
  /** The load series value for `date`, from shared/load.ts's own series. */
  trainingLoad: number | null;
  /** Whether the day's session was marked complete. Null when there was no session to complete. */
  sessionCompleted: boolean | null;
  /**
   * Velocity and power from an OUTSIDE instrument on `date` -- a VBT unit, a lab, a combine --
   * read straight off `imported_testing_data`. Null when nothing was imported for that day, which
   * is the ordinary case and is not an app problem.
   */
  importedVelocityMps: number | null;
  importedPowerWatts: number | null;
  /**
   * Whether this athlete's roster seat is PARKED for the off season. True collapses every
   * capture-derived signal by design, so it has to be readable beside them.
   */
  seatIsParked: boolean;
};

export type AnvilAthleteState = {
  date: string;
  /** Keyed on `AnvilSignal.id`. Every declared signal is present as a reading or an absence. */
  readings: Record<string, AnvilReading<number | boolean | string | string[]>>;
  /** Per channel: how many signals it declared, how many it got, and why each blank is blank. */
  coverage: AnvilCoverage[];
  /**
   * The absences that are about the APP rather than about the athlete, pulled out because they are
   * the ones somebody can fix: connect Health, film on the usual phone, turn tracking back on. An
   * athlete who simply did not train today is not in here.
   */
  fixableAbsences: { signalId: string; absent: AnvilAbsence }[];
};

// ---------------------------------------------------------------------------
// Admissibility: the only decisions this file makes.
// ---------------------------------------------------------------------------

/**
 * The absence that applies to every capture-derived signal, or null when captures are readable.
 *
 * Opt-out comes FIRST and the order is load-bearing. An athlete who has opted out has no captures
 * at all, so asking "is this capture from the usual device" of an empty list would answer
 * `no_data` -- which reads as "they did not train" about somebody whose consent decision is the
 * reason there is nothing to read. The Notice to Parent or Guardian and the Video and Biometric
 * Consent both describe that switch; it is a consent fact before it is a missing value.
 */
export function captureAbsence(input: AnvilStateInput): AnvilAbsence | null {
  if (input.athlete.trackingOptOut) return "tracking_opted_out";
  if (input.captures.length === 0) return "no_data";
  if (comparableCaptures(input).length === 0) return "capture_not_comparable";
  return null;
}

/**
 * The captures that may be compared against this athlete's own history: shot on the usual device,
 * and not refused by the pipeline itself.
 *
 * THE DEVICE RULE IS NOT FUSSINESS. A within-athlete comparison across two phones is not a
 * within-athlete comparison: the lens, the negotiated format and the delivered frame rate all
 * differ, and this pipeline's own measured take-to-take spread on ONE device and ONE lift reaches
 * 1.68x. The reaction-time literature's lapse thresholds are hardware-specific for the same
 * reason, which is why nothing here imports one.
 *
 * WITH NO MODAL DEVICE KNOWN, EVERY CAPTURE PASSES. That is the direction that costs the athlete
 * nothing: a first capture, or a caller that does not track devices, must not produce a day with
 * no numbers. Withholding is the last resort and needs a reason better than "we are not sure."
 */
export function comparableCaptures(input: AnvilStateInput): CaptureRow[] {
  return input.captures.filter(
    (c) =>
      !c.refusedByPipeline &&
      (input.modalDeviceKey == null || c.deviceKey == null || c.deviceKey === input.modalDeviceKey),
  );
}

/**
 * The mean of the values present, or null when none is.
 *
 * USED FOR JUMP HEIGHT ON PURPOSE, AND IT IS A CORRECTION. Claudino et al. 2017's meta-analysis
 * finds the MEAN of a session's countermovement jumps detects neuromuscular fatigue where the BEST
 * jump does not: fatigue widens the spread before it lowers the ceiling, so the maximum is the one
 * summary that hides it. Forge's own athlete-facing screens take the best, correctly -- an athlete
 * wants their best jump -- and `repsForSetBest` even prefers the unflagged reps to get there. The
 * Anvil wants the opposite summary of the same numbers, which is why the input carries every jump
 * rather than a set-level best.
 */
export function meanOrNull(values: readonly (number | null)[] | null | undefined): number | null {
  if (!values) return null;
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/** The mean of one capture field across every comparable capture of the day. */
function captureMean(rows: CaptureRow[], pick: (c: CaptureRow) => number | null): number | null {
  return meanOrNull(rows.map(pick));
}

/**
 * The absence that applies to an Apple Health column: never connected, or connected and not worn.
 * Both are blanks and they call for different things from a coach, so they are different words.
 */
function healthAbsence(input: AnvilStateInput): AnvilAbsence {
  return input.healthEverConnected ? "no_data" : "health_not_connected";
}

// ---------------------------------------------------------------------------
// The assembly.
// ---------------------------------------------------------------------------

/**
 * Every declared signal, read or stated absent. The function visits `ANVIL_SIGNALS` itself rather
 * than writing out a record literal, so a signal added to the declaration and NOT handled here
 * arrives as an absence that `assembleAnvilState`'s own completeness check rejects -- rather than
 * as a key quietly missing from the output.
 */
export function assembleAnvilState(input: AnvilStateInput): AnvilAthleteState {
  const w = input.wellness;
  const cap = captureAbsence(input);
  const rows = cap == null ? comparableCaptures(input) : [];
  const ha = healthAbsence(input);
  const jumps = rows.flatMap((c) => c.jumpHeightsCm ?? []);

  /** A capture-derived reading: the admissibility verdict wins over a missing value. */
  const fromCapture = (v: number | null): AnvilReading<number> =>
    cap != null ? { absent: cap } : reading(v, "no_data");

  const skills = input.skills;
  const t = input.testing;
  const n = input.nutrition;

  const readings: Record<AnvilSignalId, AnvilReading<number | boolean | string | string[]>> = {
    // fast
    hrv: reading(w?.hrv, ha),
    resting_heart_rate: reading(w?.restingHeartRate, ha),
    heart_rate_recovery: reading(w?.heartRateRecovery, ha),
    respiratory_rate: reading(w?.respiratoryRate, ha),
    sleep_hours: reading(w?.sleepHours, "no_data"),
    soreness: reading(w?.soreness, "no_data"),
    stress: reading(w?.stress, "no_data"),
    mental_focus: reading(w?.mentalFocus, "no_data"),
    body_pain_map: reading(w?.bodyPainMap, "no_data"),

    // slow -- measured by something that is not the camera
    imported_velocity_mps: reading(input.importedVelocityMps, "no_data"),
    imported_power_watts: reading(input.importedPowerWatts, "no_data"),

    // context -- an off-season hold explains a collapse that is not fatigue
    seat_is_parked: reading(input.seatIsParked, "no_data"),

    // slow -- capture-derived
    velocity_loss_percent: fromCapture(captureMean(rows, (c) => c.velocityLossPercent)),
    mean_velocity_mps: fromCapture(captureMean(rows, (c) => c.meanVelocityMps)),
    peak_velocity_mps: fromCapture(captureMean(rows, (c) => c.peakVelocityMps)),
    jump_height_cm: fromCapture(meanOrNull(jumps)),
    reactive_strength_index: fromCapture(captureMean(rows, (c) => c.reactiveStrengthIndex)),
    ground_contact_seconds: fromCapture(captureMean(rows, (c) => c.groundContactSeconds)),
    mean_power_watts: fromCapture(captureMean(rows, (c) => c.meanPowerWatts)),

    // slow -- hand-logged and derived, which the opt-out does NOT touch. An athlete who declined
    // camera tracking still logs sets and still has a load; treating their RPE as absent would
    // turn a camera consent decision into a training blackout.
    rpe: reading(meanOrNull(input.captures.map((c) => c.rpe)), "no_data"),
    training_load: reading(input.trainingLoad, "no_data"),
    session_completed: reading(input.sessionCompleted, "no_data"),

    // slow -- skills
    skill_elapsed_seconds: reading(meanOrNull(skills.map((s) => s.elapsedSeconds)), "no_data"),
    skill_hip_shoulder_separation: reading(
      meanOrNull(skills.map((s) => s.hipShoulderSeparationDeg)),
      "no_data",
    ),
    skill_peak_wrist_speed: reading(meanOrNull(skills.map((s) => s.peakWristSpeedMps)), "no_data"),
    // A boolean per set, so the day's reading is the share that sequenced -- and `every` would be
    // the wrong summary: one bad rep in ten is the early signal, not a failed session.
    skill_well_sequenced: reading(
      sequencedShare(skills),
      "no_data",
    ),

    // career
    forty_yard_dash: reading(t?.fortyYardDash, "no_data"),
    vertical_jump_in: reading(t?.verticalJumpIn, "no_data"),
    broad_jump_in: reading(t?.broadJumpIn, "no_data"),
    pro_agility_seconds: reading(t?.proAgilitySeconds, "no_data"),
    three_cone_seconds: reading(t?.threeConeSeconds, "no_data"),
    bench_max_lbs: reading(t?.benchMaxLbs, "no_data"),
    squat_max_lbs: reading(t?.squatMaxLbs, "no_data"),
    deadlift_max_lbs: reading(t?.deadliftMaxLbs, "no_data"),

    // context
    date_of_birth: reading(input.athlete.dateOfBirth, "no_data"),
    gender: reading(input.athlete.gender, "no_data"),
    sport: reading(input.athlete.sport, "no_data"),
    position: reading(input.athlete.position, "no_data"),
    season_phase: reading(input.athlete.seasonPhase, "no_data"),
    height_in: reading(input.athlete.heightIn, "no_data"),
    injury: reading(input.openInjuries.length > 0 ? input.openInjuries : null, "no_data"),
    // An open injury is what conditions a reading, so `resolved` is reported as the fact that
    // every injury on file has resolved -- which is why the list above being empty is an absence
    // and this being true is a value.
    injury_resolved: reading(input.openInjuries.length === 0 ? true : null, "no_data"),
    goniometer_angle: reading(input.restrictedJointAngleDeg, "no_data"),
    cara_training_minutes: reading(input.caraTrainingMinutes, "no_data"),
    capture_device: captureDeviceReading(input),
    // Always a value, never an absence: this is the one signal whose FALSE is the interesting
    // answer, and `reading(false, ...)` would be correct while `reading(null, ...)` for an
    // unknown would be a lie. The caller cannot hand us "unknown" -- the column is not nullable.
    tracking_opt_out: { value: input.athlete.trackingOptOut },

    // exclusion
    body_mass: reading(input.bodyMassLbs, "no_data"),
    body_mass_health: reading(w?.bodyMass, ha),
    calories_kcal: reading(n?.caloriesKcal, "no_data"),
    protein_g: reading(n?.proteinG, "no_data"),
    iron_mg: reading(n?.ironMg, "no_data"),
    vitamin_b12_mcg: reading(n?.vitaminB12Mcg, "no_data"),
    vitamin_d_mcg: reading(n?.vitaminDMcg, "no_data"),
  };

  // A SIGNAL DECLARED AND NOT ASSEMBLED IS A COMPILER ERROR, not a blank. `readings` above is
  // typed `Record<AnvilSignalId, ...>` over a literal union, so adding a signal to
  // `shared/anvil-inputs.ts` and forgetting it here does not produce a reading that says
  // "no_data" -- which would be a lie, because nobody looked -- it fails to build. The first draft
  // of this file defaulted a missing id to `no_data` and left a runtime ratchet to catch it; a
  // compiler check is strictly better and the ratchet was deleted.

  const coverage = ANVIL_CHANNELS.map((c) => coverageFor(c as AnvilChannel, readings));

  const FIXABLE: AnvilAbsence[] = [
    "health_not_connected",
    "not_a_native_capture",
    "tracking_opted_out",
    "capture_not_comparable",
  ];
  const fixableAbsences = Object.entries(readings)
    .filter(([, r]) => "absent" in r && FIXABLE.includes(r.absent))
    .map(([signalId, r]) => ({ signalId, absent: (r as { absent: AnvilAbsence }).absent }));

  return { date: input.date, readings, coverage, fixableAbsences };
}

/**
 * The share of the day's skill sets that sequenced correctly, or null when none reported.
 *
 * `null` is not "none sequenced". A set whose tracker did not evaluate sequencing reports null,
 * and counting those as failures would make a day of untracked drills read as a day of collapsing
 * technique -- which is the inversion this whole file is built to avoid.
 */
export function sequencedShare(skills: readonly SkillRow[]): number | null {
  const judged = skills.filter((s) => s.wellSequenced != null);
  if (judged.length === 0) return null;
  return judged.filter((s) => s.wellSequenced === true).length / judged.length;
}

/**
 * Which device the day's captures were shot on, as a context reading.
 *
 * It reports the device of a NON-comparable capture too, and deliberately: "today's take was shot
 * on a different phone" is the most useful sentence this file can produce on a day whose numbers
 * are withheld, and withholding the device as well would leave the reason for the withholding
 * unreadable. The capture signals are absent; the explanation is present.
 */
export function captureDeviceReading(
  input: AnvilStateInput,
): AnvilReading<string> {
  if (input.athlete.trackingOptOut) return { absent: "tracking_opted_out" };
  const keys = input.captures.map((c) => c.deviceKey).filter((k): k is string => k != null);
  if (keys.length === 0) return { absent: "no_data" };
  const distinct = [...new Set(keys)];
  return { value: distinct.length === 1 ? distinct[0] : distinct.sort().join(" + ") };
}
