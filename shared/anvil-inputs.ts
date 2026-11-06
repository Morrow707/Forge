/**
 * WHAT THE ANVIL IS ALLOWED TO READ, AND WHERE EACH SIGNAL COMES FROM.
 *
 * Scott, 2026-11-05: "make sure anvil can read everything else on the app. We gather a lot of
 * information through the profiles and our lifts. Does anvil read this? ... Anvil isn't just a
 * neural fatigue game per say, it is the tip of the iceberg of what is forge in neural fatigue."
 *
 * HE ASKED BECAUSE THE ANSWER WAS NO. As designed through 2026-11-04 the Anvil read four things:
 * its own tap timings, jump height, bar velocity, and training load, plus sleep hours as a
 * leakage control in the simulations. Everything in the table below that is marked `collected`
 * was already in a Forge column, already written by a real code path, and read by nothing in the
 * Anvil. This file is the declaration that closes that gap, and it lands BEFORE the Anvil's
 * product code so the implementation cannot read three signals and call itself integrated --
 * the same reason `PUBLIC_LEGAL_DOC_TYPES` is held equal to `LEGAL_DOC_TYPES` rather than
 * iterated, and the reason `NOT_PLUMBED_YET` in the camera registry has to shrink.
 *
 * THREE RULES THIS FILE OBEYS, EACH ONE ALREADY PAID FOR ELSEWHERE IN THIS REPO.
 *
 * 1. IT DECLARES PROVENANCE AND NEVER A NUMBER. Not one signal here has been measured against an
 *    Anvil flag -- the blind-shock work of 2026-11-05 established that the Anvil's own slow
 *    channel is the only channel with a measured detection rate, and it established it by
 *    FALSIFYING the predict-then-check design that would have weighted these signals. So there is
 *    no threshold, no weight and no uncertainty in this file. Rule #5: measure the scatter before
 *    fitting the bias. A signal arrives as an input; the three channels decide.
 *
 * 2. AN ABSENCE IS A RECORDED FACT. `readAnvilSignal` returns a value or a REASON, never
 *    undefined, because "this athlete has no HRV" and "nobody asked for HRV" are the same blank
 *    otherwise -- which is `objectLock: null` on the 2026-10-04 box jump, and the twelve optional
 *    flags on `PublicUser` that made "not applicable to you" and "not computed on this response"
 *    indistinguishable. Rule #1's shape applied to inputs.
 *
 * 3. IT READS AND NEVER WRITES. Every column below has an owner already. A fact with two writers
 *    is the billing sweep's whole lesson, and `users.freeAgentTier` beside the `subscriptions`
 *    row is what it cost. The Anvil's own captures are its own table; everything here is
 *    somebody else's column, borrowed.
 *
 * WHAT `populated` MEANS, AND WHY IT IS NOT A GUESS. Each value below was established by reading
 * the write path on 2026-11-05, not by reading the schema:
 *   - `always`         a column every row of its table carries.
 *   - `when_logged`    written whenever the athlete does the thing (logs a set, eats, weighs in).
 *   - `ios_health_only` wired end to end -- `READ_TYPES` in client/src/lib/native-health.ts ->
 *                      `WellnessGate` state -> POST /api/athlete/wellness ->
 *                      `submitWellnessCheckinSchema` -> `storage.upsertWellnessCheckin` -- and
 *                      null on the web and on any phone that declined Health.
 *   - `native_capture_only` computed by the iOS AV trackers; null on the web/MediaPipe halves.
 *   - `never_yet`      declared and never written. There are none today; the field exists so a
 *                      future column cannot be classified as live by omission.
 *
 * THE LIMIT OF THE RATCHET BESIDE THIS FILE, SAID RATHER THAN IMPLIED. It discovers every COLUMN
 * of the tables in `ANVIL_SIGNAL_TABLES` and refuses an unclassified one, so a column added to
 * `wellness_checkins` or `workout_set_entries` next year fails the day it is added. It cannot
 * discover a whole new TABLE of athlete signal. That is the weaker half and it is the weaker half
 * on purpose: a new signal table is a schema event a person is present for, where a new column on
 * an existing one is a one-line diff that reads as housekeeping.
 */

/**
 * The four timescales the Anvil reasons on, plus the one that is not a timescale.
 *
 * `fast`, `slow` and `career` are the three channels: own rolling last-20 captures, fixed
 * early-season anchor with load regressed out, and year-over-year same-age cohort. Their windows
 * are DISJOINT, which is the one structural thing the Anvil has over ACWR, whose acute week sits
 * inside its own chronic window.
 *
 * `context` conditions how a flag is read without entering any channel's arithmetic.
 *
 * `exclusion` is separate from `context` because it is a different act. A context signal explains
 * a flag; an exclusion signal says the flag is not about training at all. Iron, B12 and vitamin D
 * intake and a falling body mass are on the overtraining differential-diagnosis list, and an
 * athlete flagged by all three channels with a month of under-eating is a medical referral rather
 * than a deload. Collapsing the two would make the Anvil answer "train less" to a question about
 * nutrition.
 */
export type AnvilChannel = "fast" | "slow" | "career" | "context" | "exclusion";

/**
 * Where a number came from, which decides what may be claimed about it and nothing else.
 *
 * `self_report` is not weaker than `measured` -- soreness and stress are the two things no sensor
 * in this app can see -- but it is gameable in a way a wrist sensor is not, and the Anvil's whole
 * compliance problem is that an athlete who wants a light day can type one.
 *
 * `measured_device` carries the camera caveat (`shared/camera-accuracy-copy.ts`) wherever a reader
 * sees it, and `measured_health` does not: an Apple Watch's HRV is somebody else's calibrated
 * instrument, Forge's bar velocity is not yet.
 */
export type AnvilSignalKind =
  | "self_report"
  | "measured_health"
  | "measured_device"
  | "measured_manual"
  | "derived";

export type AnvilSignalPopulated =
  | "always"
  | "when_logged"
  | "ios_health_only"
  | "native_capture_only"
  | "never_yet";

export type AnvilSignal = {
  /** Stable key. The state record is keyed on this, so renaming one is a breaking change. */
  id: string;
  /** The table the value is read from, exactly as `pgTable` names it. */
  table: string;
  /** The column, exactly as the TypeScript field is spelled, or a derived name for `derived`. */
  column: string;
  channel: AnvilChannel;
  kind: AnvilSignalKind;
  /** The unit as stored. A signal with no unit (a flag, a list) says so. */
  unit: string;
  populated: AnvilSignalPopulated;
  /**
   * What this contributes to the channel it sits in, in one sentence, and -- where there is one --
   * the published reason it belongs there. No sentence here is evidence about the Anvil: not one
   * of these has been measured against an Anvil flag on a real athlete.
   */
  why: string;
};

/**
 * THE TABLES WHOSE EVERY COLUMN MUST BE CLASSIFIED. Each one holds something about an athlete's
 * state rather than about the app's plumbing, which is a judgement, so each carries its reason.
 * The ratchet reads this list, reads those tables out of `shared/schema.ts`, and refuses a column
 * that is in neither `ANVIL_SIGNALS` nor `NOT_AN_ANVIL_SIGNAL`.
 */
export const ANVIL_SIGNAL_TABLES: Record<string, string> = {
  wellness_checkins:
    "The daily check-in. Five self-report fields plus six Apple Health columns, and computeReadiness reads only the five.",
  workout_set_entries:
    "Every logged set, hand-logged and camera-derived alike. The only table in Forge that holds a neuromuscular measurement.",
  workout_log_entries: "Carries RPE, which is the load side of every slow-channel regression.",
  workout_logs: "Whether the session was finished, which is the exposure the load is divided by.",
  skill_session_logs: "Sprint times and technical quality -- the same measurement at a different task.",
  testing_results: "The combine battery, which is the career channel's only same-athlete anchor.",
  body_metrics: "Body mass over time, which is how low energy availability shows up without asking.",
  food_log_entries:
    "Energy and micronutrient intake, which is the overtraining differential-diagnosis exclusion list.",
  goniometer_readings: "Joint range of motion, which explains a mechanics change that is not fatigue.",
  injury_history: "An injured athlete's decline is explained, and must not read as a new finding.",
  cara_sessions: "Measured training time, which is an exposure denominator nothing else in Forge provides.",
};

/**
 * TABLES THE ANVIL READS FROM AND DOES NOT FULLY CLASSIFY, each with the reason it is exempt from
 * the column-by-column rule above. There is one, and the exemption is narrow by construction: the
 * rule exists to catch a new SIGNAL column arriving unconsidered, and `users` is not a signal
 * table -- it is the account.
 */
export const PARTIALLY_CLASSIFIED_TABLES: Record<string, string> = {
  users:
    "The account row: a hundred-odd columns of authentication, billing, branding, consent snapshots, " +
    "entitlements and notification preferences, almost none of which is about an athlete's physical " +
    "state. Classifying every one would put ninety refusals reading 'this is a billing column' in " +
    "front of the eight that matter, and a list nobody reads is worse than no list. The eight read " +
    "here are named individually; a new column on `users` is far likelier to be a payment flag than " +
    "a fatigue signal, and the day one is a fatigue signal it belongs in a signal table anyway.",
};

/**
 * Every Forge signal the Anvil may read. Ordered by channel, then by how much the session that
 * wrote this file could establish about it.
 */
export const ANVIL_SIGNALS = [
  // ---------- fast: today against this athlete's own recent captures ----------
  {
    id: "hrv",
    table: "wellness_checkins",
    column: "hrv",
    channel: "fast",
    kind: "measured_health",
    unit: "ms",
    populated: "ios_health_only",
    why:
      "The most-validated daily autonomic marker there is, and the one signal in this app with a " +
      "FIXED anchor rather than a rolling one -- which matters more here than its pedigree does. " +
      "The fast channel's measured defect is that it self-clears under sustained fatigue (16.3% of " +
      "days flagged on days 1-3, 0.0% by days 16-18) because its baseline is a mean AND an SD over " +
      "the same twenty captures, so a slow decline teaches the baseline to accept itself. A signal " +
      "that does not re-baseline cannot do that.",
  },
  {
    id: "resting_heart_rate",
    table: "wellness_checkins",
    column: "restingHeartRate",
    channel: "fast",
    kind: "measured_health",
    unit: "bpm",
    populated: "ios_health_only",
    why: "Rises with accumulated load and with illness, and is the half of the autonomic pair that moves when HRV is noisy.",
  },
  {
    id: "heart_rate_recovery",
    table: "wellness_checkins",
    column: "heartRateRecovery",
    channel: "fast",
    kind: "measured_health",
    unit: "bpm drop",
    populated: "ios_health_only",
    why: "Post-exercise parasympathetic reactivation. Collected and read by nothing in Forge today, including computeReadiness.",
  },
  {
    id: "respiratory_rate",
    table: "wellness_checkins",
    column: "respiratoryRate",
    channel: "fast",
    kind: "measured_health",
    unit: "breaths/min",
    populated: "ios_health_only",
    why: "Moves early with illness, which is the commonest non-training explanation for a bad day and the one the Anvil must not call fatigue.",
  },
  {
    id: "sleep_hours",
    table: "wellness_checkins",
    column: "sleepHours",
    channel: "fast",
    kind: "self_report",
    unit: "hours",
    populated: "always",
    why:
      "The one input whose relationship to the Anvil has been measured, and it is a warning rather " +
      "than a recommendation: as sleep leakage rose, a sleep-only detector went 13% -> 71% while the " +
      "predict-then-check design fell 55% -> 21%, because a residual deletes whatever its predictors " +
      "explain. So sleep enters as a channel of its own and is never regressed out of another.",
  },
  {
    id: "soreness",
    table: "wellness_checkins",
    column: "soreness",
    channel: "fast",
    kind: "self_report",
    unit: "1-5",
    populated: "always",
    why: "Peripheral rather than central, so it is the thing a neural finding has to be separated FROM. A sore athlete who taps clean is the case that makes the Anvil worth having.",
  },
  {
    id: "stress",
    table: "wellness_checkins",
    column: "stress",
    channel: "fast",
    kind: "self_report",
    unit: "1-5",
    populated: "always",
    why: "Life load. The Anvil measures a central cost and cannot tell a hard week of training from a hard week of school; this is the only thing in the app that can.",
  },
  {
    id: "mental_focus",
    table: "wellness_checkins",
    column: "mentalFocus",
    channel: "fast",
    kind: "self_report",
    unit: "1-5",
    populated: "always",
    why: "The athlete's own read on the thing the drill claims to measure, which makes it the cheapest available check on whether the drill measures anything.",
  },
  {
    id: "body_pain_map",
    table: "wellness_checkins",
    column: "bodyPainMap",
    channel: "context",
    kind: "self_report",
    unit: "body parts",
    populated: "always",
    why: "Localises a complaint. A central finding is body-wide by definition, so pain in one named part argues against this being the Anvil's business.",
  },

  // ---------- slow: against a fixed early-season anchor, load regressed out ----------
  {
    id: "velocity_loss_percent",
    table: "workout_set_entries",
    column: "velocityLossPercent",
    channel: "slow",
    kind: "measured_device",
    unit: "%",
    populated: "native_capture_only",
    why:
      "Within-set velocity loss is the established neuromuscular-fatigue measure in resistance " +
      "training, and Forge has computed it per set since the bar tracker shipped. Carries the camera " +
      "caveat: it is a RATIO of two velocities from one take, so it survives a scale error that would " +
      "ruin either velocity alone -- which is the one thing about the camera pipeline that makes this " +
      "usable before calibration lands.",
  },
  {
    id: "mean_velocity_mps",
    table: "workout_set_entries",
    column: "meanVelocityMps",
    channel: "slow",
    kind: "measured_device",
    unit: "m/s",
    populated: "native_capture_only",
    why: "Mean concentric velocity at a known load is the load-velocity profile, whose downward shift is the classic fatigued-athlete signature. Scale-dependent, so it is read against this athlete's own history and never across athletes.",
  },
  {
    id: "peak_velocity_mps",
    table: "workout_set_entries",
    column: "peakVelocityMps",
    channel: "slow",
    kind: "measured_device",
    unit: "m/s",
    populated: "native_capture_only",
    why: "The rate-of-force-development end of the same measurement, and the one that moves first. Scale-dependent on the same terms.",
  },
  {
    id: "jump_height_cm",
    table: "workout_set_entries",
    column: "jumpHeightCm",
    channel: "slow",
    kind: "measured_device",
    unit: "cm",
    populated: "native_capture_only",
    why:
      "Countermovement jump height, the most-used neuromuscular-readiness field test. Claudino 2017 " +
      "is explicit that the MEAN of the session's jumps detects fatigue where the BEST does not, " +
      "because fatigue shows up as a widening spread before it shows up as a lower ceiling -- which " +
      "is the opposite of how `repsForSetBest` picks a headline number for the athlete's own screen.",
  },
  {
    id: "reactive_strength_index",
    table: "workout_set_entries",
    column: "reactiveStrengthIndex",
    channel: "slow",
    kind: "measured_device",
    unit: "ratio",
    populated: "native_capture_only",
    why: "Jump height over ground contact time. More sensitive than height alone because a fatigued athlete buys height back with a longer contact, which the ratio catches and the height hides.",
  },
  {
    id: "ground_contact_seconds",
    table: "workout_set_entries",
    column: "groundContactSeconds",
    channel: "slow",
    kind: "measured_device",
    unit: "s",
    populated: "native_capture_only",
    why: "The denominator of the above, carried separately so a change in the ratio can be attributed to one side of it rather than reported as a ratio nobody can read.",
  },
  {
    id: "mean_power_watts",
    table: "workout_set_entries",
    column: "meanPowerWatts",
    channel: "slow",
    kind: "measured_device",
    unit: "W",
    populated: "native_capture_only",
    why: "Load times velocity over the drive window. Carries every scale error in the pipeline twice, so it is the weakest of the capture signals and is here for corroboration rather than as a finding of its own.",
  },
  {
    id: "rpe",
    table: "workout_log_entries",
    column: "rpe",
    channel: "slow",
    kind: "self_report",
    unit: "1-10",
    populated: "when_logged",
    why:
      "Session RPE is the load side of the slow channel's regression, and the Forge surface that " +
      "already reads it is the Free-Agent autoregulation rule. A mismatch -- ordinary load, rising " +
      "RPE -- is the textbook early sign, and is the one thing in this list that is a RATIO of a " +
      "self-report to a measurement rather than either alone.",
  },
  {
    id: "training_load",
    table: "workout_set_entries",
    column: "derived: DailyTrainingLoad.volume",
    channel: "slow",
    kind: "derived",
    unit: "load units",
    populated: "when_logged",
    why:
      "The load the slow channel regresses out, and it is NOT a new computation: `buildWeeklyLoadSeries` " +
      "and `buildAcwrSeries` in shared/load.ts already build it, and `computeAcwrRisk`'s own comment " +
      "states the limit this whole file exists to close -- 'it only reflects logged training volume -- " +
      "it has no idea about sleep, soreness, outside stressors, or actual injury history.' The Anvil " +
      "reads that series rather than defining a second one, because two load definitions that drift " +
      "is the billing sweep's lesson in a new table.",
  },
  {
    id: "session_completed",
    table: "workout_logs",
    column: "completed",
    channel: "slow",
    kind: "derived",
    unit: "boolean",
    populated: "always",
    why: "An abandoned session is both a load that did not land and an outcome worth predicting. Without it a missed week reads as a light week.",
  },
  {
    id: "body_mass",
    table: "body_metrics",
    column: "weight",
    channel: "exclusion",
    kind: "measured_manual",
    unit: "lb or kg",
    populated: "when_logged",
    why:
      "A falling body mass over weeks is how low energy availability presents without anybody being " +
      "asked about it, and it is on the overtraining differential-diagnosis list. An exclusion rather " +
      "than a channel input: it does not make a flag larger, it changes what the flag is about.",
  },
  {
    id: "body_mass_health",
    table: "wellness_checkins",
    column: "bodyMass",
    channel: "exclusion",
    kind: "measured_health",
    unit: "kg",
    populated: "ios_health_only",
    why: "The same fact from the watch rather than from a coach's scale. Kept as its own signal because the two have different units, different cadences and different reliability, and averaging them would hide which one moved.",
  },

  // ---------- career: this age against the same age in earlier years ----------
  {
    id: "forty_yard_dash",
    table: "testing_results",
    column: "fortyYardDash",
    channel: "career",
    kind: "measured_manual",
    unit: "s",
    populated: "when_logged",
    why:
      "The career channel compares an athlete at sixteen against sixteen-year-olds in earlier years, " +
      "and this battery is the only measurement in Forge taken on the same terms across seasons. " +
      "Hand-timed or camera-timed and there is no provenance column to tell them apart, which is the " +
      "known weakness and is why the career channel is the slowest of the three to say anything.",
  },
  {
    id: "vertical_jump_in",
    table: "testing_results",
    column: "verticalJumpIn",
    channel: "career",
    kind: "measured_manual",
    unit: "in",
    populated: "when_logged",
    why: "The same quantity as the camera's jump height, measured another way. The two disagreeing on one athlete is information about the camera, not about the athlete.",
  },
  {
    id: "broad_jump_in",
    table: "testing_results",
    column: "broadJumpIn",
    channel: "career",
    kind: "measured_manual",
    unit: "in",
    populated: "when_logged",
    why: "Horizontal power, which the camera pipeline measures least well, so it is the career channel's least redundant entry.",
  },
  {
    id: "pro_agility_seconds",
    table: "testing_results",
    column: "proAgilitySeconds",
    channel: "career",
    kind: "measured_manual",
    unit: "s",
    populated: "when_logged",
    why: "A change-of-direction test, so it carries a decision cost the straight sprint does not -- which is the nearest thing in the battery to what the Anvil's own drill measures.",
  },
  {
    id: "three_cone_seconds",
    table: "testing_results",
    column: "threeConeSeconds",
    channel: "career",
    kind: "measured_manual",
    unit: "s",
    populated: "when_logged",
    why: "The same argument as pro agility, over a longer course, so the two together separate a decision cost from a mechanical one.",
  },
  {
    id: "bench_max_lbs",
    table: "testing_results",
    column: "benchMaxLbs",
    channel: "career",
    kind: "measured_manual",
    unit: "lb",
    populated: "when_logged",
    why:
      "Maximal strength, and it is here as a CONTROL rather than as a fatigue signal. The literature " +
      "is consistent that mental fatigue has no established effect on maximal strength or power, so a " +
      "central finding with an intact bench is the expected pattern and an unexplained drop in the " +
      "bench argues the finding is not central at all.",
  },
  {
    id: "squat_max_lbs",
    table: "testing_results",
    column: "squatMaxLbs",
    channel: "career",
    kind: "measured_manual",
    unit: "lb",
    populated: "when_logged",
    why: "The same control at the lower body, where the camera's own velocity signals are strongest, so the two can be held against each other.",
  },
  {
    id: "deadlift_max_lbs",
    table: "testing_results",
    column: "deadliftMaxLbs",
    channel: "career",
    kind: "measured_manual",
    unit: "lb",
    populated: "when_logged",
    why: "The third of the control trio. A hinge, so it is the one whose camera-side numbers this repo has measured most and trusts least.",
  },

  // ---------- skills: the same measurement at a different task ----------
  {
    id: "skill_elapsed_seconds",
    table: "skill_session_logs",
    column: "elapsedSeconds",
    channel: "slow",
    kind: "measured_device",
    unit: "s",
    populated: "when_logged",
    why: "A camera-timed sprint. The same quantity the career channel gets once a season, at a weekly cadence, which is what makes it a slow-channel entry rather than a career one.",
  },
  {
    id: "skill_well_sequenced",
    table: "skill_session_logs",
    column: "wellSequenced",
    channel: "slow",
    kind: "measured_device",
    unit: "boolean",
    populated: "when_logged",
    why:
      "Whether a throw or swing sequenced correctly. Technical breakdown under fatigue is the thing " +
      "coaches actually report noticing first, and it is the only signal in this app that is about " +
      "ORDER rather than magnitude -- so it cannot be explained by a scale error in any ruler.",
  },
  {
    id: "skill_hip_shoulder_separation",
    table: "skill_session_logs",
    column: "hipShoulderSeparationDeg",
    channel: "slow",
    kind: "measured_device",
    unit: "deg",
    populated: "when_logged",
    why: "An angle, so it needs no scale and survives every calibration problem this repo has. Narrows under fatigue in the throwing literature.",
  },
  {
    id: "skill_peak_wrist_speed",
    table: "skill_session_logs",
    column: "peakWristSpeedMps",
    channel: "slow",
    kind: "measured_device",
    unit: "m/s",
    populated: "when_logged",
    why: "The output end of the same chain, carried beside the angle so a drop can be attributed to sequencing or to effort rather than to one of them by assumption.",
  },

  // ---------- context: conditions the reading, enters no arithmetic ----------
  {
    id: "date_of_birth",
    table: "users",
    column: "dateOfBirth",
    channel: "context",
    kind: "self_report",
    unit: "date",
    populated: "always",
    why:
      "Decides the career channel's cohort, and decides whether the athlete is a minor -- which is " +
      "the one place a channel is turned down rather than read differently. A developing athlete's " +
      "year-over-year change is mostly growth, so the career channel's claim on a fourteen-year-old " +
      "is weaker than on a nineteen-year-old and has to say so.",
  },
  {
    id: "gender",
    table: "users",
    column: "gender",
    channel: "context",
    kind: "self_report",
    unit: "enum",
    populated: "always",
    why: "A cohort dimension for the career channel only, on the same terms the strength profile already uses -- it narrows for male and female and never for an answer that is a privacy choice.",
  },
  {
    id: "sport",
    table: "users",
    column: "sport",
    channel: "context",
    kind: "self_report",
    unit: "text",
    populated: "always",
    why: "Selects the fatigue time constants (acute, chronic, wear). A thrower and a distance runner do not share a recovery curve and the per-sport lookup is the only place that is expressed.",
  },
  {
    id: "position",
    table: "users",
    column: "position",
    channel: "context",
    kind: "self_report",
    unit: "text",
    populated: "always",
    why: "Narrows the cohort further where there are enough athletes to narrow it, and explains a load pattern that would otherwise read as a spike.",
  },
  {
    id: "season_phase",
    table: "users",
    column: "seasonPhase",
    channel: "context",
    kind: "self_report",
    unit: "enum",
    populated: "always",
    why:
      "The slow channel's anchor is an EARLY-SEASON window, so this is what decides where the anchor " +
      "sits. Measured on the Anvil's own simulation: a shuffled, random or absent anchor collapses " +
      "detection from 16-23% to 7-12%, which is ACWR's killer test run on the Anvil and passed. The " +
      "anchor is the channel, so the column that places it is not optional context.",
  },
  {
    id: "height_in",
    table: "users",
    column: "heightIn",
    channel: "context",
    kind: "self_report",
    unit: "in",
    populated: "always",
    why:
      "Scales every body ruler in the camera pipeline, so it silently moves every capture signal in " +
      "this file. Recorded as context because of what it did on 2026-10-19: a height arriving on the " +
      "athlete row for the first time moved an RDL from -3.7% to +12.0% with no code change between " +
      "them, and moved eight things at once. A capture taken before and after a height was typed is " +
      "not the same measurement.",
  },
  {
    id: "injury",
    table: "injury_history",
    column: "bodyPart",
    channel: "context",
    kind: "self_report",
    unit: "body part",
    populated: "when_logged",
    why: "An injured athlete's decline is explained. Reporting it as a new central finding would be the Anvil claiming credit for something a coach already knows and a physio is already treating.",
  },
  {
    id: "injury_resolved",
    table: "injury_history",
    column: "resolved",
    channel: "context",
    kind: "self_report",
    unit: "boolean",
    populated: "when_logged",
    why: "A healed injury on file is history and must not keep explaining away a finding. Without this the context signal above never expires.",
  },
  {
    id: "goniometer_angle",
    table: "goniometer_readings",
    column: "angleDegrees",
    channel: "context",
    kind: "measured_manual",
    unit: "deg",
    populated: "when_logged",
    why: "A restricted joint changes mechanics, and a mechanics change is one of the things the slow channel reads. This is how that gets attributed to range of motion rather than to the nervous system.",
  },
  {
    id: "cara_training_minutes",
    table: "cara_sessions",
    column: "derived: startedAt..endedAt",
    channel: "context",
    kind: "derived",
    unit: "minutes",
    populated: "when_logged",
    why:
      "Measured time under training, which is an exposure denominator nothing else in Forge provides " +
      "-- volume says how much was lifted and this says how long it took. Server-closed, so it " +
      "survives a phone dying mid-session, which is exactly the day a load number is least reliable.",
  },
  {
    id: "capture_device",
    table: "workout_set_entries",
    column: "captureDeviceInfo",
    channel: "context",
    kind: "derived",
    unit: "device/format",
    populated: "native_capture_only",
    why:
      "A within-athlete comparison across two devices is not a within-athlete comparison. The reaction- " +
      "time literature's own lapse thresholds are hardware-specific, which is why this file does not " +
      "import one, and a capture from a different phone, lens or negotiated format is suspect on the " +
      "same grounds. Already a column -- it needed reading, not adding.",
  },
  {
    id: "tracking_opt_out",
    table: "users",
    column: "trackingOptOut",
    channel: "context",
    kind: "self_report",
    unit: "boolean",
    populated: "always",
    why:
      "An athlete who has opted out has no captures at all, so every capture signal in this file is " +
      "absent for a stated reason rather than missing. The Notice to Parent or Guardian and the Video " +
      "and Biometric Consent both describe this switch; it is a consent fact before it is an input.",
  },

  // ---------- exclusion: the finding is not about training ----------
  {
    id: "calories_kcal",
    table: "food_log_entries",
    column: "caloriesKcal",
    channel: "exclusion",
    kind: "self_report",
    unit: "kcal",
    populated: "when_logged",
    why:
      "Low energy availability is first on the overtraining differential-diagnosis list, and it " +
      "produces every symptom the Anvil measures. Self-reported intake under-reports badly, so a low " +
      "number is weak evidence and a normal one is almost none -- which makes this usable only to " +
      "RAISE a question, never to dismiss one.",
  },
  {
    id: "iron_mg",
    table: "food_log_entries",
    column: "ironMg",
    channel: "exclusion",
    kind: "self_report",
    unit: "mg",
    populated: "when_logged",
    why: "Iron deficiency is on the same exclusion list and is common in adolescent athletes, especially menstruating ones. Fatigue with low iron intake is a blood test, not a deload.",
  },
  {
    id: "vitamin_b12_mcg",
    table: "food_log_entries",
    column: "vitaminB12Mcg",
    channel: "exclusion",
    kind: "self_report",
    unit: "mcg",
    populated: "when_logged",
    why: "On the same list, and the deficiency whose presentation is most specifically NEUROLOGICAL -- which is the one this drill would mistake for its own subject.",
  },
  {
    id: "vitamin_d_mcg",
    table: "food_log_entries",
    column: "vitaminDMcg",
    channel: "exclusion",
    kind: "self_report",
    unit: "mcg",
    populated: "when_logged",
    why: "On the same list, with a seasonal pattern that would otherwise look like a season-long decline in every channel at once.",
  },
  {
    id: "protein_g",
    table: "food_log_entries",
    column: "proteinG",
    channel: "exclusion",
    kind: "self_report",
    unit: "g",
    populated: "when_logged",
    why: "Recovery substrate. Carried beside calories because the two fall together in an under-eating athlete and separately in a badly-composed diet, and the distinction changes the advice.",
  },
] as const satisfies readonly AnvilSignal[];

/**
 * THE BOILERPLATE REASONS, NAMED ONCE EACH.
 *
 * Most of the columns the Anvil does not read are not read for one of a handful of reasons that
 * repeat dozens of times -- a row id, a foreign key, a timestamp, a file path. The obvious rule
 * for `NOT_AN_ANVIL_SIGNAL` is "every reason must be a sentence", and this repo has already
 * learned what that rule does: `every-marketing-page-has-a-way-out.test.ts` found that nine copies
 * of "a legal document, as /terms" is padding a per-entry length check would have FORCED, and
 * solved it with one shared reason. So the boilerplate is stated once, properly, and the length
 * rule applies only to a bespoke reason -- which is where the thinking actually is.
 */
export const NON_SIGNAL_REASON = {
  ROW_ID: "A surrogate primary key. It identifies a row and says nothing about an athlete.",
  ATHLETE_KEY:
    "Whose row this is. Every signal in this file is per-athlete by construction, so the key is how a read is scoped rather than something a channel reads.",
  TIME_INDEX:
    "Which day or session the row describes. All three channels are time series, so the date is the index they are ordered on, not a value in them.",
  AUDIT_TIMESTAMP:
    "When the row was written, deliberately distinct from the day it describes -- an athlete correcting yesterday's check-in moves this and not the reading. Audit, not signal.",
  FREE_TEXT:
    "Prose an athlete or coach typed. Nothing in this file reads free text into a channel: a sentence cannot be z-scored, and sending an athlete's own words to a model to score them is a consent question this feature has not asked.",
  STRUCTURE:
    "A foreign key or ordering field that places the row in the program tree. Read when grouping a comparison, never as a value -- and several of these are nullable in ways the schema's own comments warn make them unsafe as identity.",
  FOLDED_INTO_LOAD:
    "Already inside the training-load series the slow channel reads. Reading it separately as well would count one set's volume twice, which is the double-counting that makes a regression's coefficients meaningless.",
  FILE_PATH: "A path to a file. The measurement is what a channel reads; the media is not a measurement.",
  RETENTION_BOOKKEEPING:
    "Video-retention bookkeeping -- when a file is due for purge, or whether an athlete favorited it. A decision about storage, unrelated to the athlete's state, which would read as related if a channel saw it.",
  RAW_FRAMES:
    "Raw per-frame or per-rep values. A channel reads measurements; these are what a measurement is recomputed FROM, and handing them to one would let two summaries of the same take disagree.",
  UNCALIBRATED_TRUST:
    "A trust score. This repo records every threshold in every trust score as uncalibrated and tells the reader to treat one as a relative signal only, so it cannot condition a fatigue finding.",
} as const;

/**
 * Columns of the tables above that the Anvil does NOT read, each with the reason. This is the list
 * that has to stay honest: an entry here is a decision, and a column arriving without one fails
 * the ratchet rather than being ignored by default. Same shape as `NOT_PUBLIC_ON_PURPOSE` and
 * `NOT_PLUMBED_YET`.
 *
 * Keys are `table.column`.
 */
export const NOT_AN_ANVIL_SIGNAL: Record<string, string> = {
  // --- identity, plumbing and bookkeeping, which no channel can read ---
  "wellness_checkins.id": NON_SIGNAL_REASON.ROW_ID,
  "wellness_checkins.athleteId": NON_SIGNAL_REASON.ATHLETE_KEY,
  "wellness_checkins.date": NON_SIGNAL_REASON.TIME_INDEX,
  "wellness_checkins.createdAt": NON_SIGNAL_REASON.AUDIT_TIMESTAMP,
  "wellness_checkins.vo2Max":
    "Collected from Apple Health and deliberately unread. A watch's VO2max estimate updates on a scale of weeks from running data most of these athletes do not produce, so it moves for reasons that have nothing to do with the day being measured. Revisit if a sport with real aerobic volume ever uses it.",
  "body_metrics.id": NON_SIGNAL_REASON.ROW_ID,
  "body_metrics.athleteId": NON_SIGNAL_REASON.ATHLETE_KEY,
  "body_metrics.date": NON_SIGNAL_REASON.TIME_INDEX,
  "body_metrics.weightUnit":
    "Read by the body-mass signal to normalise it rather than as a signal of its own -- the trend is the fact and the unit is how it is spelled.",
  "body_metrics.bodyFatPercent":
    "Caliper or scale estimates at this precision cannot separate a real composition change from measurement error over the weeks a fatigue channel runs, so it would add noise to an exclusion that body mass already serves.",
  "body_metrics.notes": NON_SIGNAL_REASON.FREE_TEXT,
  "body_metrics.createdAt": NON_SIGNAL_REASON.AUDIT_TIMESTAMP,
  "testing_results.id": NON_SIGNAL_REASON.ROW_ID,
  "testing_results.athleteId": NON_SIGNAL_REASON.ATHLETE_KEY,
  "testing_results.date": "The time index, and the thing that places a result in a season.",
  "testing_results.createdAt": NON_SIGNAL_REASON.AUDIT_TIMESTAMP,
  "goniometer_readings.id": NON_SIGNAL_REASON.ROW_ID,
  "goniometer_readings.athleteId": NON_SIGNAL_REASON.ATHLETE_KEY,
  "goniometer_readings.recordedBy": "Which coach measured it. Provenance for a dispute, not an input.",
  "goniometer_readings.date": NON_SIGNAL_REASON.TIME_INDEX,
  "goniometer_readings.joint":
    "Read by the goniometer signal to say WHICH joint is restricted rather than as a signal of its own; the angle is the measurement.",
  "goniometer_readings.movement": "The same -- it qualifies the angle.",
  "goniometer_readings.notes": NON_SIGNAL_REASON.FREE_TEXT,
  "goniometer_readings.createdAt": NON_SIGNAL_REASON.AUDIT_TIMESTAMP,
  "injury_history.id": NON_SIGNAL_REASON.ROW_ID,
  "injury_history.athleteId": NON_SIGNAL_REASON.ATHLETE_KEY,
  "injury_history.bodyRegion": "A coarser spelling of bodyPart, which is already read. Reading both would double-count one fact.",
  "injury_history.occurredOn": "Dates the context signal; the injury itself is what conditions a reading.",
  "injury_history.description": NON_SIGNAL_REASON.FREE_TEXT,
  "injury_history.resolvedOn": "Dates the resolution; `resolved` is the fact read.",
  "injury_history.createdAt": NON_SIGNAL_REASON.AUDIT_TIMESTAMP,
  "cara_sessions.id": NON_SIGNAL_REASON.ROW_ID,
  "cara_sessions.athleteId": NON_SIGNAL_REASON.ATHLETE_KEY,
  "cara_sessions.activityType":
    "Which NCAA activity category the session counts as. A compliance classification that does not change what the body did.",
  "cara_sessions.startedAt": "Read by the training-minutes signal as one end of the interval.",
  "cara_sessions.lastActivityAt": "The idle sweep's own bookkeeping, not an interval end a channel should read.",
  "cara_sessions.endedAt": "The other end of the interval.",
  "cara_sessions.endReason":
    "Why the session closed. An idle-swept session is a less reliable duration than a completed one, which is worth knowing and is not worth a channel reading until somebody has measured how often it happens.",
  "cara_sessions.loggedByCoachId": "Who logged it. Provenance.",
  "cara_sessions.note": NON_SIGNAL_REASON.FREE_TEXT,
  "workout_logs.id": NON_SIGNAL_REASON.ROW_ID,
  "workout_logs.assignmentId": NON_SIGNAL_REASON.STRUCTURE,
  "workout_logs.programDayId": NON_SIGNAL_REASON.STRUCTURE,
  "workout_logs.athleteId": NON_SIGNAL_REASON.ATHLETE_KEY,
  "workout_logs.date": NON_SIGNAL_REASON.TIME_INDEX,
  "workout_logs.completedAt":
    "When the session finished. The duration this would give is `cara_sessions`' job, measured properly and server-closed, and two duration definitions that drift is the lesson this file opens with.",
  "workout_logs.revision": "An optimistic-concurrency counter.",
  "workout_log_entries.id": NON_SIGNAL_REASON.ROW_ID,
  "workout_log_entries.workoutLogId": NON_SIGNAL_REASON.STRUCTURE,
  "workout_log_entries.programExerciseId": "Structure, and nullable in a way that makes it unsafe to read as identity -- the schema says so.",
  "workout_log_entries.exerciseId": "Which lift. Read as the GROUPING a slow-channel comparison is made within, never as a value.",
  "workout_log_entries.correctiveId": "The same for a corrective.",
  "workout_log_entries.weightMode": "How the load is expressed, read when normalising load rather than on its own.",
  "workout_log_entries.notes": NON_SIGNAL_REASON.FREE_TEXT,
  "workout_log_entries.actualSets": NON_SIGNAL_REASON.FOLDED_INTO_LOAD,
  "workout_log_entries.actualReps": NON_SIGNAL_REASON.FOLDED_INTO_LOAD,
  "workout_log_entries.actualWeight": NON_SIGNAL_REASON.FOLDED_INTO_LOAD,

  // --- workout_set_entries: the long one, because it carries every capture mode ---
  "workout_set_entries.id": NON_SIGNAL_REASON.ROW_ID,
  "workout_set_entries.logEntryId": NON_SIGNAL_REASON.STRUCTURE,
  "workout_set_entries.setNumber":
    "Which set within the exercise. Read as the ORDER velocity loss is computed across rather than as a value -- the ordering is the measurement.",
  "workout_set_entries.reps": NON_SIGNAL_REASON.FOLDED_INTO_LOAD,
  "workout_set_entries.weight": NON_SIGNAL_REASON.FOLDED_INTO_LOAD,
  "workout_set_entries.weightUnit": "Read when normalising load.",
  "workout_set_entries.bandColor": "A band's resistance is not a number, so a set done on bands has no load this channel can use and says so.",
  "workout_set_entries.boxHeight": "Equipment, read by the camera's own box ruler and not by a fatigue channel.",
  "workout_set_entries.boxHeightUnit":
    "Equipment, on the same terms as the box height it qualifies -- read by the camera box ruler, not by a channel.",
  "workout_set_entries.concentricSeconds":
    "A duration whose numerator and denominator come from windows this repo has moved twice in a week. The velocities derived from it are read instead, because a velocity is the quantity the literature states and the duration is an intermediate.",
  "workout_set_entries.eccentricSeconds": "The same argument, on the phase the slow channel has least evidence about.",
  "workout_set_entries.eccentricMeanVelocityMps":
    "The lowering phase's velocity. Real and plausibly fatigue-sensitive, and held back because the lowering is unloaded intent as often as it is capacity -- an athlete told to control the descent produces a lower number by complying.",
  "workout_set_entries.barPathDeviationCm":
    "Scale-dependent in centimetres and so carries every ruler error directly, where the velocity ratio carries none. The skill side's angles are read instead for the same question.",
  "workout_set_entries.barPathTrace": NON_SIGNAL_REASON.RAW_FRAMES,
  "workout_set_entries.formFaults":
    "Fault labels whose gating this repo has corrected three times in four days, most recently telling a hip hinge to break parallel. A label whose own gate has moved that recently is not a fatigue input yet.",
  "workout_set_entries.repBreakdown": NON_SIGNAL_REASON.RAW_FRAMES,
  "workout_set_entries.armPathTrace": NON_SIGNAL_REASON.RAW_FRAMES,
  "workout_set_entries.peakPowerWatts":
    "Load times peak velocity, so it carries the scale error squared. `meanPowerWatts` is read instead as the steadier of the pair, and reading both would double-count one take.",
  "workout_set_entries.romCm":
    "Range of motion in centimetres. The single most scale-sensitive number this pipeline produces -- the measured take-to-take spread on one lift at one load reaches 1.68x -- so a change in it says more about the ruler than about the athlete.",
  "workout_set_entries.meanEai":
    "An eccentric-acceleration index with no published fatigue literature behind it and no sensor pairing in this repo. Rule #5: there is nothing yet to measure its scatter against.",
  "workout_set_entries.formCheckVideoUrl": NON_SIGNAL_REASON.FILE_PATH,
  "workout_set_entries.formCheckFlag": "Whether a form check was requested, which is a coaching workflow state.",
  "workout_set_entries.videoAttachReason":
    "Why a video was attached. A coaching workflow state: it records a decision about review rather than anything the athlete did.",
  "workout_set_entries.isPr":
    "A personal record flag. Derived from the same load this channel already reads, and reading a derived flag beside its own input is how one fact comes to be counted twice.",
  "workout_set_entries.videoFavorited": NON_SIGNAL_REASON.RETENTION_BOOKKEEPING,
  "workout_set_entries.videoUploadedAt": NON_SIGNAL_REASON.AUDIT_TIMESTAMP,
  "workout_set_entries.pendingDeletionAt": NON_SIGNAL_REASON.RETENTION_BOOKKEEPING,
  "workout_set_entries.staleAccountPendingDeletionAt": NON_SIGNAL_REASON.RETENTION_BOOKKEEPING,
  "workout_set_entries.jumpDistanceCm":
    "Broad-jump distance from the camera. The hand-measured version is read on the career channel; the camera's horizontal measurement is the one this pipeline has never paired against a sensor.",
  "workout_set_entries.jumpBreakdown":
    "Per-rep jump values. Claudino 2017 argues for the MEAN of a session's jumps, which is computed from these -- so the mean is the signal and this is its input, read by the assembler and not by a channel.",
  "workout_set_entries.swingSeparationDeg":
    "Golf and bat swing mechanics. An angle, so it survives scale -- and not read yet because no swing has been filmed beside a sensor, so there is no basis for knowing what a change in it means.",
  "workout_set_entries.swingTempoRatio": "The same, and a ratio, which makes it the first swing signal to read once one is paired.",
  "workout_set_entries.swingBackswingMs":
    "Half of the swing tempo ratio already refused above. A duration in milliseconds needs no scale, so it is well-posed -- and no swing has been filmed beside a sensor, so nothing establishes what a change in it means.",
  "workout_set_entries.swingDownswingMs":
    "The other half of that ratio, on the same terms. It is the one a fatigued athlete would be expected to lengthen, which is why it is named here rather than left implied.",
  "workout_set_entries.swingHeadSwayCm": "The same, and scale-dependent on top of it.",
  "workout_set_entries.swingTrustScore": NON_SIGNAL_REASON.UNCALIBRATED_TRUST,
  "workout_set_entries.medBallPeakSpeedMps":
    "Med-ball throw speed. Unpaired against a sensor, and the one tracker whose height ruler is recorded as stating an uncertainty two refits out of date.",
  "workout_set_entries.medBallReleaseHeightCm": "The same, and scale-dependent.",
  "workout_set_entries.medBallTrustScore": NON_SIGNAL_REASON.UNCALIBRATED_TRUST,
  "workout_set_entries.medBallRepBreakdown": NON_SIGNAL_REASON.RAW_FRAMES,
  "workout_set_entries.kbSwingPeakSpeedMps": "Kettlebell swing speed. Unpaired against a sensor on the same terms as the med ball.",
  "workout_set_entries.kbSwingPeakHeightCm": "The same, and scale-dependent.",
  "workout_set_entries.kbSwingTrustScore": NON_SIGNAL_REASON.UNCALIBRATED_TRUST,
  "workout_set_entries.horizontalLoadElapsedSeconds":
    "Sled push timing. Scales off a known distance rather than off a body ruler, which makes it one of the better-posed capture numbers -- and the mode has no scale blend, no sensor pairing and, by this repo's own record, nothing in the per-lift registry to read.",
  "workout_set_entries.horizontalLoadDistanceYards":
    "The distance a sled was pushed, which qualifies the time above rather than standing alone. Same unproven mode, and its gate is in yards per second where every other gate in the registry is in metres.",
  "workout_set_entries.horizontalLoadAvgSpeedYardsPerSec":
    "Distance over time from the two columns above, so reading it as well would count one push twice. Same unproven mode either way.",
  "workout_set_entries.legDriveAsymmetry":
    "Left-right drive asymmetry per rep, and the most tempting entry on this list. Held back for one measured reason: an asymmetry is a DIFFERENCE of two noisy limb estimates, so its variance is the sum of theirs, and this pipeline's take-to-take spread on a single-sided quantity has never been measured. Rule #5 points directly at it as the next thing to pair.",
  "workout_set_entries.armDriveAsymmetry": "The same argument at the upper body.",
  "workout_set_entries.weightLbs": NON_SIGNAL_REASON.FOLDED_INTO_LOAD,
  "workout_set_entries.repsCount": NON_SIGNAL_REASON.FOLDED_INTO_LOAD,
  "workout_set_entries.trustScores": "Uncalibrated by this repo's own statement.",
  "workout_set_entries.trustScorePct": NON_SIGNAL_REASON.UNCALIBRATED_TRUST,
  "workout_set_entries.trackingDiagnostics":
    "The capture's own account of what went wrong. Read by the assembler to decide whether a capture is ADMISSIBLE, never by a channel as a value -- which is the distinction between a diagnostic and a measurement that Rule #1 rests on.",
  "workout_set_entries.skeletonFrames": NON_SIGNAL_REASON.RAW_FRAMES,
  "workout_set_entries.skeletonFramesPath": NON_SIGNAL_REASON.FILE_PATH,

  // --- skill_session_logs ---
  "skill_session_logs.id": NON_SIGNAL_REASON.ROW_ID,
  "skill_session_logs.skillAssignmentId": NON_SIGNAL_REASON.STRUCTURE,
  "skill_session_logs.skillProgramDayId": NON_SIGNAL_REASON.STRUCTURE,
  "skill_session_logs.skillProgramExerciseId": NON_SIGNAL_REASON.STRUCTURE,
  "skill_session_logs.skillExerciseId": "Which drill. The grouping a comparison is made within.",
  "skill_session_logs.athleteId": NON_SIGNAL_REASON.ATHLETE_KEY,
  "skill_session_logs.trackingLevel": "Which tracker ran, read when deciding admissibility rather than as a value.",
  "skill_session_logs.skillDayLogId": "Structure, and nullable in a way that makes it unsafe as a join -- this repo has a test about exactly that.",
  "skill_session_logs.setNumber": NON_SIGNAL_REASON.STRUCTURE,
  "skill_session_logs.manualResult":
    "A hand-entered result with no unit a channel can resolve -- a time, a count or a word depending on the drill, so two of them cannot be compared.",
  "skill_session_logs.distanceYards":
    "The distance the time above was run over. Read as the time's qualifier -- a 40 and a 10 are not the same measurement -- rather than as a signal.",
  "skill_session_logs.presetId": NON_SIGNAL_REASON.STRUCTURE,
  "skill_session_logs.cameraAngle":
    "The angle recorded for the take. Never read as a reason to refuse one: Rule #1 is explicit that no surface tells an athlete where to stand and no take is turned down for its angle.",
  "skill_session_logs.faults": "Fault labels, on the same terms as the bar tracker's.",
  "skill_session_logs.weightTransferPct": "A percentage of a scale-dependent quantity, and unpaired against any sensor.",
  "skill_session_logs.hipRotationDeg": "An angle, so well-posed -- and it overlaps hip-shoulder separation, which is already read. Reading both would count one mechanism twice.",
  "skill_session_logs.armSlotDeg": "An angle whose change is a deliberate coaching target as often as it is fatigue, which makes it unusable as a fatigue input without knowing what was coached.",
  "skill_session_logs.armSlotLabel":
    "A bucketed spelling of the arm slot angle above, so it carries the same coaching-target problem at lower resolution.",
  "skill_session_logs.strideLengthM": "Scale-dependent in metres and unpaired.",
  "skill_session_logs.elbowExtensionDeg": "An angle, and a coaching target on the same terms as the arm slot.",
  "skill_session_logs.releaseHeightM": "Scale-dependent and unpaired.",
  "skill_session_logs.setPointPauseSeconds": "A timing value with no fatigue literature behind it and no pairing.",
  "skill_session_logs.kneeBendDepthDeg": "An angle, and a coaching target.",
  "skill_session_logs.videoUrl": NON_SIGNAL_REASON.FILE_PATH,
  "skill_session_logs.coachAnnotationUrl": NON_SIGNAL_REASON.FILE_PATH,
  "skill_session_logs.trustScorePct": NON_SIGNAL_REASON.UNCALIBRATED_TRUST,
  "skill_session_logs.createdAt": NON_SIGNAL_REASON.AUDIT_TIMESTAMP,
  "skill_session_logs.trackingDiagnostics": "Admissibility, not a value -- as on the set table.",
  "skill_session_logs.videoFavorited": NON_SIGNAL_REASON.RETENTION_BOOKKEEPING,
  "skill_session_logs.pendingDeletionAt": NON_SIGNAL_REASON.RETENTION_BOOKKEEPING,
  "skill_session_logs.staleAccountPendingDeletionAt": NON_SIGNAL_REASON.RETENTION_BOOKKEEPING,

  // --- food_log_entries ---
  "food_log_entries.id": NON_SIGNAL_REASON.ROW_ID,
  "food_log_entries.athleteId": NON_SIGNAL_REASON.ATHLETE_KEY,
  "food_log_entries.date": NON_SIGNAL_REASON.TIME_INDEX,
  "food_log_entries.description": NON_SIGNAL_REASON.FREE_TEXT,
  "food_log_entries.brand": NON_SIGNAL_REASON.FREE_TEXT,
  "food_log_entries.servingDescription": NON_SIGNAL_REASON.FREE_TEXT,
  "food_log_entries.carbsG":
    "Carbohydrate intake, and the omission most worth arguing about: it is the substrate central fatigue is actually about. Held back because the exclusion this serves is answered by calories, and a self-reported macro split is the least reliable part of the least reliable signal in this file.",
  "food_log_entries.fatG": "The same, with no mechanism pointing at it.",
  "food_log_entries.fiberG":
    "No mechanism connects fibre intake to central fatigue, and the exclusion this section serves is answered by energy and iron.",
  "wellness_checkins.hydration":
    "DROPPED AS A SIGNAL 2026-11-06, decision-list item 8, and it was a signal until then. Self-reported hydration earns its place only if hypohydration moves cognition, and the meta-analysis says it does not: g = -0.177, p = .331. A 1-to-5 tick is also the coarsest instrument in this file, so it cannot rescue a null. The MECHANISM is real at real dehydration and is not reachable from a self-report, which is the same argument the sodium row below makes one table over.",
  "food_log_entries.sodiumMg": "A hydration mechanism exists and the self-report is far too coarse for it -- and as of 2026-11-06 the hydration field is not read either, for the reason on the wellness_checkins.hydration row above. Neither end of this mechanism is reachable from a self-report.",
  "food_log_entries.calciumMg": "A bone-health exclusion rather than a fatigue one.",
  "food_log_entries.potassiumMg": "No mechanism at the precision a food log provides.",
  "food_log_entries.magnesiumMg": "A plausible mechanism and a popular supplement claim, with no evidence this repo can cite and none it can measure. Rule #5.",
  "food_log_entries.zincMg":
    "A supplement claim with a plausible mechanism, no evidence this repo can cite and nothing it can measure. Rule #5 applies to a nutrient exactly as it applies to a camera constant.",
  "food_log_entries.source": "Where the entry came from (barcode, search, AI). Provenance, and a reason to trust an entry less rather than a value.",
  "food_log_entries.meal": "Which meal. Timing matters in the literature and a per-meal fatigue claim is far beyond anything this has evidence for.",
  "food_log_entries.barcode":
    "A product identifier. It names what was eaten, which the macros and micronutrients beside it already quantify.",
  "food_log_entries.loggedAt": NON_SIGNAL_REASON.AUDIT_TIMESTAMP,
};

/**
 * EVERY DECLARED SIGNAL'S ID, AS A TYPE. `ANVIL_SIGNALS` is `as const`, so this is a union of
 * literals rather than `string` -- which is what lets `assembleAnvilState` declare its output as
 * `Record<AnvilSignalId, ...>` and makes a signal declared here and NOT assembled there a COMPILER
 * error instead of a key that quietly comes back blank.
 *
 * That is the `formCheckDestination` lesson applied to a bigger surface: a scan over a decision can
 * only see the words the decision is written with, so an exhaustive switch with no default beats a
 * runtime check every time one is available. Here one is available, so a runtime completeness
 * ratchet was written and then deleted.
 */
export type AnvilSignalId = (typeof ANVIL_SIGNALS)[number]["id"];

/** The channels, in the order a reader should meet them. */
export const ANVIL_CHANNELS: readonly AnvilChannel[] = [
  "fast",
  "slow",
  "career",
  "context",
  "exclusion",
];

/** Every signal in one channel. */
export function signalsForChannel(channel: AnvilChannel): readonly AnvilSignal[] {
  return ANVIL_SIGNALS.filter((s) => s.channel === channel);
}

/** One signal by id, or undefined. Callers that need every signal iterate `ANVIL_SIGNALS`. */
export function anvilSignal(id: string): AnvilSignal | undefined {
  return ANVIL_SIGNALS.find((s) => s.id === id);
}

/**
 * Why a signal has no value on a given athlete-day. There is no sixth member that means "we did
 * not look": the assembler visits every declared signal on every read, so a blank is always one
 * of these.
 */
export type AnvilAbsence =
  /** The column is genuinely empty for this athlete-day -- they did not log, weigh in or test. */
  | "no_data"
  /** Collected only from Apple Health, and this athlete is on the web or declined the permission. */
  | "health_not_connected"
  /** Computed only by the native capture path, and this capture came from the web tracker. */
  | "not_a_native_capture"
  /** The athlete has opted out of camera tracking, so no capture exists to read. */
  | "tracking_opted_out"
  /** The capture exists and its own diagnostics say it is not comparable (a different device, a refused take). */
  | "capture_not_comparable";

/**
 * One signal's value on one athlete-day: a number, a list, a boolean, or a stated absence. Never
 * an absent key. `AnvilReading<T>` is what makes "this athlete has no HRV" and "nobody asked for
 * HRV" different things, which is the second of this file's three rules.
 */
export type AnvilReading<T> = { value: T } | { absent: AnvilAbsence };

export function reading<T>(value: T | null | undefined, absent: AnvilAbsence): AnvilReading<T> {
  return value == null ? { absent } : { value };
}

export function isPresent<T>(r: AnvilReading<T>): r is { value: T } {
  return "value" in r;
}

/** The value, or a fallback, for a caller that genuinely cannot act on an absence. */
export function readingValue<T>(r: AnvilReading<T>, fallback: T): T {
  return isPresent(r) ? r.value : fallback;
}

/**
 * The coverage of one athlete-day's read, reported rather than inferred. A channel with no present
 * signals is a channel that said nothing, which is a different claim from a channel that said
 * "fine" -- and reporting them as the same number is how a broken gate and a correct empty state
 * come to look like the same pixels.
 */
export type AnvilCoverage = {
  channel: AnvilChannel;
  declared: number;
  present: number;
  absences: Record<string, AnvilAbsence>;
};

export function coverageFor(
  channel: AnvilChannel,
  readings: Record<string, AnvilReading<unknown>>,
): AnvilCoverage {
  const declared = signalsForChannel(channel);
  const absences: Record<string, AnvilAbsence> = {};
  let present = 0;
  for (const s of declared) {
    const r = readings[s.id];
    if (r && isPresent(r)) present++;
    else if (r) absences[s.id] = r.absent;
    else absences[s.id] = "no_data";
  }
  return { channel, declared: declared.length, present, absences };
}
