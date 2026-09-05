// What the camera needs to know about each exercise, taken from the execution manual
// (docs/camera-tracking-notes.md points at it) rather than guessed from the exercise name at
// the moment it is needed.
//
// Three separate questions live here because three separate parts of the pipeline were each
// answering them badly on their own:
//
//   1. Which phase happens FIRST. The rep segmenter needs a starting direction to label the
//      concentric. Before this table the only source was inferFirstPhaseHint's movementType
//      taxonomy, which has no answer for anything typed Push or Press -- that is EVERY bench
//      press and EVERY overhead press, the two lifts currently being calibrated against known
//      ground truth -- and gets three wrong outright (a hang clean and hang snatch both dip to
//      the hang before they pull, and a step-up drives up before it steps down).
//
//   2. What POSTURE the athlete is in. Height calibration divides the athlete's real height by
//      their head-to-ankle span in pixels. That is only the same quantity when the athlete is
//      standing. See CameraPosture below for why "supine" was too narrow a way to ask.
//
//   3. How far the implement can travel. Only as a backstop against a grossly wrong scale --
//      see romBucketForExercise.
//
// Deliberately a plain data module with no imports: it is pure exercise knowledge, it is worth
// unit-testing without a DOM, and every consumer of it lives in a different layer.

/** How the athlete's body is arranged during the rep, as it bears on height calibration.
 *
 * The pipeline used to ask only "is this lift done lying down?" (isKnownSupineMovement, still
 * exported from pose-tracking.ts). That is the right question for a bench press and the wrong
 * shape of question in general, because it lets a whole class through: uprightEnough() is a
 * DIRECTION test, comparing the head-to-ankle segment's vertical component against that
 * segment's own length. A SEATED athlete passes it comfortably -- head above hips, ankles below
 * -- but their head-to-ankle span is roughly 0.77 of their standing height (sitting height is
 * ~0.52 of stature, a bench adds ~0.25). The scale factor then comes out about 30% too large,
 * and every centimetre, metre-per-second and watt derived from it carries that bias with no
 * indication anything is wrong. It is small enough to clear implausibleRangeOfMotion's ceiling,
 * which is exactly what makes it dangerous: a 4x error announces itself, a 1.3x error does not.
 *
 * "hanging" is treated as valid: the manual has a strict dead hang with straight arms for both
 * pull-up and chin-up, which does span true standing height. That is an ASSUMPTION, not a
 * measurement -- an athlete who bends their knees on a pull-up breaks it the same way sitting
 * does. It has not been checked against real footage. "supported" covers the cases where the
 * manual's own text shows the legs are NOT straight (a dip taken with the ankles crossed, an
 * assisted pull-up taken kneeling on the platform).
 */
export type CameraPosture = "standing" | "seated" | "lying" | "supported" | "hanging";

/** Whether an athlete in this posture can have real-world scale derived from their height. */
export function postureAllowsHeightCalibration(posture: CameraPosture): boolean {
  return posture === "standing" || posture === "hanging";
}

export type FirstMove = "concentric" | "eccentric";

// Names as they appear in the seeded exercise library. Compared after normalizeName below, so
// case and punctuation differences do not matter, but a genuinely different name will miss and
// fall through to the pattern rules -- which is the intended failure mode: a miss costs the
// hint, never a wrong answer.
const POSTURE_BY_NAME = new Map<string, CameraPosture>([
  ["Back Extension", "lying"],
  ["Bench Press", "lying"],
  ["Chest-Supported Row", "lying"],
  ["Close-Grip Bench Press", "lying"],
  ["Decline Bench Press", "lying"],
  ["Dumbbell Bench Press", "lying"],
  ["Floor Press", "lying"],
  ["Hip Thrust", "lying"],
  ["Incline Barbell Bench Press", "lying"],
  ["Incline Dumbbell Press", "lying"],
  ["Inverted Row", "lying"],
  ["Lying Leg Curl", "lying"],
  ["Machine Chest Fly", "lying"],
  ["Paused Bench Press", "lying"],
  ["Reverse Hyper", "lying"],
  ["Skull Crusher", "lying"],
  ["Turkish Get-Up", "lying"],
  ["Barbell Shoulder Press", "seated"],
  ["Bench Dip", "seated"],
  ["Concentration Curl", "seated"],
  ["Lat Pulldown", "seated"],
  ["Leg Extension", "seated"],
  ["Leg Press", "seated"],
  ["Machine Chest Press", "seated"],
  ["Machine Shoulder Press", "seated"],
  ["Preacher Curl", "seated"],
  ["Reverse-Grip Lat Pulldown", "seated"],
  ["Russian Twist", "seated"],
  ["Seated Cable Row", "seated"],
  ["Seated Calf Raise", "seated"],
  ["Assisted Pull-Up", "supported"],
  ["Dip", "supported"],
  ["Chin-Up", "hanging"],
  ["Pull-Up", "hanging"],]);

// For the ~300 library exercises the manual does not cover. Ordered: first match wins.
//
// Every entry here is a movement whose NAME is enough to know the body is not standing at full
// length. Bench-press variants are the biggest group and the easiest to miss, because most of
// them do not contain the word "bench": a board press, pin press, Spoto press, Larsen press,
// JM press and Tate press are all performed lying on a bench and all fell through the old
// /bench\s*press/ pattern into a confident, wrong number.
const POSTURE_PATTERNS: [RegExp, CameraPosture][] = [
  [/\b(?:bench|floor|board|pin|spoto|larsen|jm|tate)\s*press\b/i, "lying"],
  [/\bchest\s*(?:fly|flye)\b/i, "lying"],
  [/\bskull\s*crusher\b/i, "lying"],
  [/\b(?:lying|supine|prone)\b/i, "lying"],
  [/\bhip\s*thrust\b/i, "lying"],
  [/\bglute\s*bridge\b/i, "lying"],
  [/\bpullover\b/i, "lying"],
  [/\bchest[-\s]*supported\b/i, "lying"],
  [/\binverted\s+row\b/i, "lying"],
  [/\breverse\s+hyper\b/i, "lying"],
  [/\b(?:sit-?up|crunch|dead\s*bug|hollow|russian\s+twist)\b/i, "lying"],
  [/\b(?:incline|decline)\b/i, "lying"],
  [/\bback\s+extension\b/i, "lying"],
  [/\bseated\b/i, "seated"],
  [/\bleg\s+(?:press|extension)\b/i, "seated"],
  [/\blat\s+pulldown\b/i, "seated"],
  [/\bmachine\s+(?:chest|shoulder)\s+press\b/i, "seated"],
  [/\b(?:preacher|concentration)\s+curl\b/i, "seated"],
  [/\bdip\b/i, "supported"],
  [/\bassisted\s+pull-?up\b/i, "supported"],
];

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ").trim();
}

const POSTURE_NORMALIZED = new Map<string, CameraPosture>(
  Array.from(POSTURE_BY_NAME, ([name, posture]) => [normalizeName(name), posture]),
);

/** The athlete's posture during the rep. Defaults to "standing" for anything unrecognised --
 * the same assumption the pipeline made everywhere before this existed, so an unknown exercise
 * behaves exactly as it did rather than losing its numbers to a new gate it was never
 * measured against. */
export function postureForExercise(name: string | null | undefined): CameraPosture {
  if (!name) return "standing";
  const normalized = normalizeName(name);
  const known = POSTURE_NORMALIZED.get(normalized);
  if (known) return known;
  for (const [pattern, posture] of POSTURE_PATTERNS) {
    if (pattern.test(normalized)) return posture;
  }
  return "standing";
}

/** True when this lift's numbers must NOT be derived from the athlete's height. */
export function heightCalibrationUnreliable(name: string | null | undefined): boolean {
  return !postureAllowsHeightCalibration(postureForExercise(name));
}

/** Why the numbers are being withheld, in the athlete's own terms. One sentence per posture:
 * the athlete needs to know this is a property of the lift and not something they did wrong,
 * or the next thing they try is another take from another angle, which cannot help. */
export function calibrationRefusalReason(posture: CameraPosture): string | null {
  switch (posture) {
    case "lying":
      return "This lift is done lying down, so your height can't be used to work out real-world scale -- that only works for a standing athlete, at any camera angle. Numbers are withheld rather than guessed.";
    case "seated":
      return "This lift is done seated, so the camera sees roughly three quarters of your standing height and would read every distance about a third too big. Numbers are withheld rather than guessed.";
    case "supported":
      return "Your legs aren't straight under you on this lift, so your height can't be used to work out real-world scale. Numbers are withheld rather than guessed.";
    default:
      return null;
  }
}

const FIRST_MOVE_BY_NAME = new Map<string, FirstMove>([
  ["Arnold Press", "concentric"],
  ["Assisted Pull-Up", "concentric"],
  ["Back Extension", "eccentric"],
  ["Back Squat", "eccentric"],
  ["Barbell Curl", "concentric"],
  ["Barbell Good Morning", "eccentric"],
  ["Barbell Shoulder Press", "concentric"],
  ["Barbell Shrug", "concentric"],
  ["Bench Dip", "eccentric"],
  ["Bench Press", "eccentric"],
  ["Bent-Over Row", "concentric"],
  ["Box Squat", "eccentric"],
  ["Bulgarian Split Squat", "eccentric"],
  ["Cable Curl", "concentric"],
  ["Cable Fly", "concentric"],
  ["Cable Pull-Through", "eccentric"],
  ["Chest-Supported Row", "concentric"],
  ["Chin-Up", "concentric"],
  ["Clean & Jerk", "concentric"],
  ["Clean Pull", "concentric"],
  ["Close-Grip Bench Press", "eccentric"],
  ["Concentration Curl", "concentric"],
  ["Cossack Squat", "eccentric"],
  ["Deadlift", "concentric"],
  ["Decline Bench Press", "eccentric"],
  ["Deficit Deadlift", "concentric"],
  ["Diamond Push-Up", "eccentric"],
  ["Dip", "eccentric"],
  ["Dumbbell Bench Press", "eccentric"],
  ["Dumbbell Box Step-Up", "concentric"],
  ["Dumbbell Curl", "concentric"],
  ["Dumbbell Romanian Deadlift", "eccentric"],
  ["Dumbbell Shoulder Press", "concentric"],
  ["EZ-Bar Curl", "concentric"],
  ["Face Pull", "concentric"],
  ["Floor Press", "eccentric"],
  ["Front Squat", "eccentric"],
  ["Goblet Squat", "eccentric"],
  ["Hammer Curl", "concentric"],
  ["Hang Clean", "eccentric"],
  ["Hang Snatch", "eccentric"],
  ["Hex Bar Deadlift", "concentric"],
  ["Hip Thrust", "concentric"],
  ["Incline Barbell Bench Press", "eccentric"],
  ["Incline Dumbbell Press", "eccentric"],
  ["Inverted Row", "concentric"],
  ["Landmine Press", "concentric"],
  ["Lat Pulldown", "concentric"],
  ["Lateral Lunge", "eccentric"],
  ["Leg Extension", "concentric"],
  ["Leg Press", "eccentric"],
  ["Lying Leg Curl", "concentric"],
  ["Machine Chest Fly", "concentric"],
  ["Machine Chest Press", "concentric"],
  ["Machine Row", "concentric"],
  ["Machine Shoulder Press", "concentric"],
  ["Meadows Row", "concentric"],
  ["Overhead Press", "concentric"],
  ["Overhead Squat", "eccentric"],
  ["Overhead Tricep Extension", "eccentric"],
  ["Paused Bench Press", "eccentric"],
  ["Pendlay Row", "concentric"],
  ["Pike Push-Up", "eccentric"],
  ["Power Clean", "concentric"],
  ["Preacher Curl", "concentric"],
  ["Pull-Up", "concentric"],
  ["Push Press", "eccentric"],
  ["Push-Up", "eccentric"],
  ["Rack Pull", "concentric"],
  ["Reverse Hyper", "concentric"],
  ["Reverse Lunge", "eccentric"],
  ["Reverse-Grip Lat Pulldown", "concentric"],
  ["Romanian Deadlift", "eccentric"],
  ["Seated Cable Row", "concentric"],
  ["Seated Calf Raise", "eccentric"],
  ["Single-Arm Dumbbell Row", "concentric"],
  ["Single-Leg Romanian Deadlift", "eccentric"],
  ["Skater Squat", "eccentric"],
  ["Skull Crusher", "eccentric"],
  ["Snatch", "concentric"],
  ["Snatch Pull", "concentric"],
  ["Split Jerk", "eccentric"],
  ["Standing Calf Raise", "eccentric"],
  ["Step-Down", "eccentric"],
  ["Straight-Arm Pulldown", "concentric"],
  ["Sumo Deadlift", "concentric"],
  ["T-Bar Row", "concentric"],
  ["Tricep Rope Pushdown", "concentric"],
  ["Turkish Get-Up", "concentric"],
  ["Walking Lunge", "eccentric"],
  ["Zottman Curl", "concentric"],]);

const FIRST_MOVE_NORMALIZED = new Map<string, FirstMove>(
  Array.from(FIRST_MOVE_BY_NAME, ([name, move]) => [normalizeName(name), move]),
);

/** Which phase of the rep happens first, per the execution manual. Null for anything not in
 * the table, which leaves the caller on whatever it did before -- the phase-speed comparison
 * deciding alone. */
export function firstMoveForExercise(name: string | null | undefined): FirstMove | null {
  if (!name) return null;
  return FIRST_MOVE_NORMALIZED.get(normalizeName(name)) ?? null;
}

// Which anthropometric travel limits implausibleRangeOfMotion should hold this lift to.
//
// Deliberately NOT expectedPatternFromName, though the two overlap and it is tempting to reuse
// it. That function's return values feed a second consumer: the pattern-mismatch check that
// compares a name-derived guess against guessMovementPattern's read of the actual trace. That
// comparison is only meaningful across the four patterns guessMovementPattern can produce, so
// adding a fifth name there would make every curl and every pull-up read as a mismatch and take
// an undeserved trust-score penalty. Two questions, two functions.
//
// The buckets below are anthropometric bounds, not calibrated thresholds, and they are set
// generously on purpose. The job is catching a scale that is several times wrong, not judging
// whether a rep was good: a false rejection throws away a real set's numbers, which costs more
// than letting a mildly odd number through. The one place the old default genuinely failed is
// small-travel movements -- a calf raise moves about 0.05 of standing height, so a 4x scale
// error still lands far under the 1.3x default ceiling and reports as normal.
const ROM_BUCKET_PATTERNS: [RegExp, string][] = [
  [/\bdeadlift\b/i, "deadlift"],
  [/\bsquat\b/i, "squat"],
  [/\b(?:snatch|clean|jerk)\b/i, "olympic"],
  [/\b(?:overhead|shoulder press|push press|military press|arnold press|landmine press)\b/i, "overhead_press"],
  [/\b(?:pull-?up|chin-?up|pulldown)\b/i, "vertical_pull"],
  [/\b(?:curl|skull\s*crusher|tricep|pushdown|extension)\b/i, "elbow_flexion_extension"],
  [/\b(?:calf\s+raise|shrug)\b/i, "ankle_or_shrug"],
  [/\b(?:lunge|step-?up|step-?down)\b/i, "lunge_or_step"],
  [/\b(?:dip|push-?up)\b/i, "dip_or_pushup"],
  [/\b(?:bench|row|press|fly|flye)\b/i, "horizontal_press_or_row"],
];

/** The ROM bucket for implausibleRangeOfMotion, or null when nothing is known and the caller
 * should fall back to its own generous default. */
export function romBucketForExercise(name: string | null | undefined): string | null {
  if (!name) return null;
  const normalized = normalizeName(name);
  for (const [pattern, bucket] of ROM_BUCKET_PATTERNS) {
    if (pattern.test(normalized)) return bucket;
  }
  return null;
}
