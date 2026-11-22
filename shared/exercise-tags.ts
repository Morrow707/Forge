/**
 * EXERCISE AND PROGRAM TAGS: the fixed words that let one search find a warm-up, a joint-care
 * drill or a return-to-training drill in the ordinary library.
 *
 * Scott, 2026-11-22: warm-up, joint-care and return-to-training drills live in the SAME exercise
 * library as every lift (no second library), and one search finds everything. This module is the
 * vocabulary only. The drills themselves and the programs come later, from research.
 *
 * Why fixed lists rather than free text, for joints and purposes:
 *   - A search for "knee" has to find every knee drill. Free text ("knees", "Knee joint", "ACL")
 *     splits one meaning across many spellings, and the search would only find the one typed.
 *     Nicknames below turn what people type ("acl", "rotator cuff") into these words instead.
 *   - "Add care drills" in the program builder matches a day's joints against a drill's joints.
 *     That only works when both sides use the same eight words.
 * Positions stay free text (lower case, trimmed): every sport names its own ("pitcher",
 * "goalkeeper", "lineman"), and a fixed list would always be missing somebody's.
 *
 * Coaching lines built from these tags name a JOINT or a MOVEMENT, never say a body is weak
 * (the strength-profile rule: Forge has thirteen-year-olds on it).
 */

/** The joints a drill can be about. Eight, because those are the joints a coach asks about. */
export const EXERCISE_JOINTS = ["shoulder", "elbow", "wrist", "back", "hip", "knee", "ankle", "neck"] as const;
export type ExerciseJoint = (typeof EXERCISE_JOINTS)[number];

/**
 * What a drill is FOR, beside the main training it sits in. An exercise with no purpose tag is an
 * ordinary lift, which is what every exercise in the library was before these tags existed.
 *   warmup              done before the session to get ready for it
 *   care                regular joint-care work ("prehab"), done whether or not anything hurts
 *   return_to_training  used while coming back from time off for an injury, with a clinician's
 *                       clearance; Forge never decides when somebody is ready
 */
export const EXERCISE_PURPOSES = ["warmup", "care", "return_to_training"] as const;
export type ExercisePurpose = (typeof EXERCISE_PURPOSES)[number];

export const EXERCISE_PURPOSE_LABEL: Record<ExercisePurpose, string> = {
  warmup: "Warm-up",
  care: "Joint care",
  return_to_training: "Return to training",
};

export const EXERCISE_JOINT_LABEL: Record<ExerciseJoint, string> = {
  shoulder: "Shoulder",
  elbow: "Elbow",
  wrist: "Wrist",
  back: "Back",
  hip: "Hip",
  knee: "Knee",
  ankle: "Ankle",
  neck: "Neck",
};

/**
 * Where in the season a PROGRAM is meant to run. Its own list rather than the users' season-phase
 * enum, which has "taper" and no "post_season": a profile says where an athlete is right now, a
 * program says what part of the year it was written for, and those two questions have different
 * answers.
 */
export const PROGRAM_SEASON_PHASES = ["off_season", "pre_season", "in_season", "post_season"] as const;
export type ProgramSeasonPhase = (typeof PROGRAM_SEASON_PHASES)[number];

export const PROGRAM_SEASON_PHASE_LABEL: Record<ProgramSeasonPhase, string> = {
  off_season: "Off-season",
  pre_season: "Preseason",
  in_season: "In-season",
  post_season: "Postseason",
};

/**
 * The age under which an exercise marked `youthSafe === false` is kept out of what Forge OFFERS an
 * athlete (the picker's order, an AI draft, a swap). It never stops a coach placing one by hand:
 * the coach sees a note and the exercise stays. 14 is the age Scott named for this build; the
 * classification of each exercise is research still to come.
 */
export const YOUTH_SAFE_MIN_AGE = 14;

/** The most positions one exercise or program carries. Enough for every real case; stops a paste. */
export const MAX_TAGGED_POSITIONS = 12;
/** The longest a position name may be, in characters. */
export const MAX_POSITION_LENGTH = 40;
/** The longest a caution note may be, in characters: one or two sentences. */
export const MAX_CAUTION_NOTE_LENGTH = 300;

/** A position as stored: lower case, trimmed, inner whitespace collapsed. */
export function normalizePosition(value: string): string {
  // Any run of whitespace becomes one space: "Defensive   End" -> "defensive end".
  // https://regex101.com/?regex=%5Cs%2B&flags=g&testString=Defensive%20%20%20End
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Positions as stored: normalised, blanks dropped, duplicates dropped, original order kept. */
export function normalizePositions(values: readonly string[] | null | undefined): string[] {
  if (!values) return [];
  const normalized = values.map(normalizePosition).filter((v) => v.length > 0);
  return normalized.filter((v, at) => normalized.indexOf(v) === at);
}

/**
 * What people type -> a tag. Keys are normalised the way the search normalises a query (lower
 * case, punctuation to spaces). A value is ALWAYS one of the vocabularies above; the test holds
 * that, so a nickname cannot point at a tag that does not exist.
 *
 * These turn a typed word into a tag the search then looks for on the exercise's or program's
 * tags. Every word typed must still be found somewhere, so a nickname narrows like any word.
 */
export const TAG_NICKNAMES: Record<string, ExerciseJoint | ExercisePurpose> = {
  // purposes
  warmup: "warmup",
  warmups: "warmup",
  "warm up": "warmup",
  "warm ups": "warmup",
  prehab: "care",
  care: "care",
  "joint care": "care",
  rehab: "return_to_training",
  return: "return_to_training",
  "return to training": "return_to_training",
  "return to play": "return_to_training",
  // knee
  acl: "knee",
  mcl: "knee",
  meniscus: "knee",
  patella: "knee",
  patellar: "knee",
  knees: "knee",
  // shoulder
  "rotator cuff": "shoulder",
  cuff: "shoulder",
  labrum: "shoulder",
  shoulders: "shoulder",
  // elbow
  "tommy john": "elbow",
  ucl: "elbow",
  elbows: "elbow",
  // ankle
  achilles: "ankle",
  sprain: "ankle",
  ankles: "ankle",
  // hip
  groin: "hip",
  adductor: "hip",
  adductors: "hip",
  hips: "hip",
  // back
  lumbar: "back",
  "low back": "back",
  "lower back": "back",
  // wrist
  wrists: "wrist",
};

/** What people type for a season phase -> the program's phase tag. Same rule as TAG_NICKNAMES. */
export const SEASON_PHASE_NICKNAMES: Record<string, ProgramSeasonPhase> = {
  offseason: "off_season",
  "off season": "off_season",
  preseason: "pre_season",
  "pre season": "pre_season",
  inseason: "in_season",
  "in season": "in_season",
  "mid season": "in_season",
  midseason: "in_season",
  postseason: "post_season",
  "post season": "post_season",
};

const JOINT_SET: ReadonlySet<string> = new Set(EXERCISE_JOINTS);
const PURPOSE_SET: ReadonlySet<string> = new Set(EXERCISE_PURPOSES);
const PHASE_SET: ReadonlySet<string> = new Set(PROGRAM_SEASON_PHASES);

export function isExerciseJoint(value: string): value is ExerciseJoint {
  return JOINT_SET.has(value);
}
export function isExercisePurpose(value: string): value is ExercisePurpose {
  return PURPOSE_SET.has(value);
}
export function isProgramSeasonPhase(value: string): value is ProgramSeasonPhase {
  return PHASE_SET.has(value);
}

/** The tags an exercise carries, as the search and the care-drill suggester read them. */
export type ExerciseTagFields = {
  joints?: readonly string[] | null;
  purposes?: readonly string[] | null;
  positions?: readonly string[] | null;
  youthSafe?: boolean | null;
  cautionNote?: string | null;
};

/**
 * Whether Forge should hold this exercise back when OFFERING it to an athlete of this age.
 * Only an explicit `youthSafe === false` and a known age under YOUTH_SAFE_MIN_AGE hold it back:
 * an unclassified exercise (null) and an unknown age are never held back, because "not
 * classified" is not "unsafe" and a missing birthday is not a child.
 */
export function heldBackForAge(exercise: { youthSafe?: boolean | null }, age: number | null | undefined): boolean {
  return exercise.youthSafe === false && age != null && age < YOUTH_SAFE_MIN_AGE;
}

/**
 * The list with every exercise held back for this age removed. An unknown age returns the list as
 * given. Used where Forge picks for somebody (an AI draft, a swap); a coach choosing by hand never
 * goes through this.
 */
export function keepForAge<T extends { youthSafe?: boolean | null }>(
  list: readonly T[],
  age: number | null | undefined,
): T[] {
  if (age == null || age >= YOUTH_SAFE_MIN_AGE) return [...list];
  return list.filter((ex) => !heldBackForAge(ex, age));
}

/** The note a coach sees under an exercise that is marked not for under-14s, on a program for one. */
export const YOUTH_HELD_BACK_NOTE = `Marked not for athletes under ${YOUTH_SAFE_MIN_AGE}. It stays if you chose it; check it suits this athlete.`;
