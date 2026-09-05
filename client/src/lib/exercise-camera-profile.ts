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
  // Floor and quadruped work. A plank, bird dog, bear crawl, ab-wheel rollout, superman hold,
  // glute-ham raise and neck bridge all put the body somewhere that head-to-ankle means nothing.
  [/\b(?:plank|superman|bird\s*dog|bear\s*crawl|quadruped|ab\s*wheel|rollout|glute\s*ham\s*raise|neck\s*bridge)\b/i, "lying"],
  [/\bget-?up\b/i, "lying"],
  [/\bkneeling\b/i, "supported"],
  // A pull-up hangs as one straight line and keeps its full length; a hanging leg raise or
  // windshield wiper folds the body to an L partway through the rep, so the same span means two
  // different things at two points in the same take.
  [/\bhanging\b/i, "supported"],
];

// Movement types that never yield a trustworthy standing-height read, taken from the library's
// own taxonomy rather than from the exercise name.
//
// This is a backstop, and it exists because the name patterns above are leaky by construction:
// they are a list of spellings, and the library has 413 exercises with more added over time.
// Sweeping the whole library turned up a tail the patterns missed -- planks, bird dogs, bear
// crawls, floor mobility work -- and the honest fix is a categorical rule rather than twenty
// more spellings. Refusing these costs nothing real: an isometric hold has no rep and no range
// of motion to report, and neither does a stretch.
const POSTURE_UNRELIABLE_MOVEMENT_TYPES = new Set(["Isometric", "Mobility"]);

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

/** True when this lift's numbers must NOT be derived from the athlete's height.
 *
 * Pass the exercise's movementType where the caller has it -- it catches the floor and hold
 * work whose NAME gives nothing away. */
export function heightCalibrationUnreliable(
  name: string | null | undefined,
  movementType?: string | null,
): boolean {
  if (movementType && POSTURE_UNRELIABLE_MOVEMENT_TYPES.has(movementType)) return true;
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

// Filmable lifts the manual does not cover. Every one of these is video-eligible today (see
// CANONICAL_VIDEO_ELIGIBLE_NAMES in server/seed.ts), and 16 of the 19 are Olympic lifts, so the
// gap sat squarely on the lifts a weightlifter actually films. These are not new judgements:
// each one applies the rule the manual already states for its own sibling. A hang variant dips
// to the hang before it pulls (Hang Clean and Hang Snatch, both in the manual). A jerk dips
// before it drives (Push Press and Split Jerk, both in the manual). A lift that starts with the
// bar at rest on the floor or on blocks has nothing to lower first (Power Clean and Snatch).
//
// Two of them were actively wrong rather than merely absent: Hang Power Clean and Hang Power
// Snatch are typed Pull, so the taxonomy hinted "concentric" -- the exact inversion already
// fixed for Hang Clean and Hang Snatch.
const FIRST_MOVE_UNMANUALLED: [string, FirstMove][] = [
  ["Hang Power Clean", "eccentric"],
  ["Hang Power Snatch", "eccentric"],
  ["Push Jerk", "eccentric"],
  ["Jerk Balance", "eccentric"],
  ["Snatch Balance", "eccentric"],
  ["Block Clean", "concentric"],
  ["Block Snatch", "concentric"],
  ["Power Snatch", "concentric"],
  ["Pause Clean", "concentric"],
  ["Muscle Clean", "concentric"],
  ["Muscle Snatch", "concentric"],
  ["Clean High Pull", "concentric"],
  ["Snatch-Grip High Pull", "concentric"],
  ["Tall Clean", "concentric"],
  ["Tall Snatch", "concentric"],
  ["Trap Bar Squat", "eccentric"],
];

const FIRST_MOVE_NORMALIZED = new Map<string, FirstMove>(
  [...FIRST_MOVE_BY_NAME, ...FIRST_MOVE_UNMANUALLED].map(([name, move]) => [
    normalizeName(name),
    move,
  ]),
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

// Where to put the phone, what has to be visible, and where one rep ends -- per exercise.
//
// Taken verbatim from the execution manual, which walks each lift one physical action at a time.
// Nothing here changes a measurement; it is what the athlete is shown BEFORE recording, and
// getting it right is upstream of every number. Camera angle decides which axis is even
// measurable (see docs/camera-tracking-notes.md), so an athlete filming a squat from the front
// has not taken a slightly worse video, they have taken one where bar drift -- the fault that
// matters most on that lift -- points straight at the lens and cannot be seen at all.
//
// The manual covers 91 bar-path lifts. The 16 below it that are filmable today but were not
// written up are appended after it, following the same rules its own siblings state.
export type ExerciseFilmGuidance = {
  /** Where the phone goes. */
  view: string;
  /** What must be visible for the whole rep. */
  inFrame: string;
  /** What the tracker locks onto. */
  follows: string;
  /** Where one rep starts and ends, which is what the rep segmenter is trying to find. */
  oneRep: string;
};

const FILM_GUIDANCE_BY_NAME = new Map<string, ExerciseFilmGuidance>([
  ["Arnold Press", {
    view: "Square to the FRONT so the rotation of the hands is visible.",
    inFrame: "Both dumbbells at the bottom (palms facing you) and at lockout.",
    follows: "Both dumbbells.",
    oneRep: "One rep = dumbbells in front of the face, palms facing you, rotate and press to lockout, lower and rotate back.",
  }],
  ["Assisted Pull-Up", {
    view: "Square to the side.",
    inFrame: "The assist platform, the whole body at hang and at the top.",
    follows: "The shoulders.",
    oneRep: "One rep = full hang on the platform, pull until the chin is over the bar, lower to a full hang.",
  }],
  ["Back Extension", {
    view: "Square to the side of the machine.",
    inFrame: "The whole torso from the hips up, at the bottom and at the top.",
    follows: "The shoulders and the hips.",
    oneRep: "One rep = torso upright in line with the legs, hinge forward over the pad, rise back to flat.",
  }],
  ["Back Squat", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates, both feet, the top of your head at standing height, and the bar at its lowest point.",
    follows: "The bar (wrists on it) and the hips.",
    oneRep: "One rep = stand tall with the bar, descend to depth, return to standing tall. The rep ends at lockout, not at the bottom.",
  }],
  ["Barbell Curl", {
    view: "Square to the side.",
    inFrame: "The bar at arm's length and at the top of the curl, the elbows.",
    follows: "The bar.",
    oneRep: "One rep = bar at arm's length against the thighs, curl to the shoulders, lower to arm's length.",
  }],
  ["Barbell Good Morning", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates, the bar at its lowest, full standing height.",
    follows: "The bar and the hips.",
    oneRep: "One rep = stand tall with the bar on the back, hinge until the torso is near parallel, return to standing.",
  }],
  ["Barbell Shoulder Press", {
    view: "Square to the side, level with the bar at shoulder height, seeing full lockout.",
    inFrame: "The seat, both plates, the bar at the shoulders and overhead.",
    follows: "The bar.",
    oneRep: "One rep = bar at the collarbone, press to lockout, lower to the collarbone.",
  }],
  ["Barbell Shrug", {
    view: "Square to the FRONT or side.",
    inFrame: "Both plates, the shoulders at rest and at the top.",
    follows: "The bar.",
    oneRep: "One rep = bar hanging at arm's length, shrug the shoulders straight up, lower.",
  }],
  ["Bench Dip", {
    view: "Square to the side, level with the bench.",
    inFrame: "The bench, the hands, the hips at the top and bottom.",
    follows: "The shoulders and hips.",
    oneRep: "One rep = arms straight with hands on the bench behind you, lower the hips toward the floor, press back up.",
  }],
  ["Bench Press", {
    view: "Square to the SIDE of the bench, camera level with the bar. Not from the foot of the bench, not from behind the head, not raised. The side is the only view where the app can work out real-world scale for this lift.",
    inFrame: "The bench, both feet on the floor, both plates, the bar at lockout, and the bar touching the chest.",
    follows: "The bar (wrists on it).",
    oneRep: "One rep = bar locked out over the shoulders, lower to touch the chest, press back to lockout. The rep ends at lockout.",
  }],
  ["Bent-Over Row", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates, the torso, the bar at arm's length and at the ribs.",
    follows: "The bar.",
    oneRep: "One rep = bar hanging at arm's length below the shoulders, row to the lower ribs, lower to arm's length. The bar does NOT touch the floor.",
  }],
  ["Box Squat", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates, the box, both feet, and full standing height.",
    follows: "The bar and the hips.",
    oneRep: "One rep = stand tall, sit fully onto the box, pause with tension, stand back to lockout.",
  }],
  ["Bulgarian Split Squat", {
    view: "Square to the side of the front leg.",
    inFrame: "The bench, both feet, the whole front leg at the top and bottom.",
    follows: "The dumbbells and hips.",
    oneRep: "One rep = standing tall on the front leg with the rear foot on the bench, lower until the front thigh is parallel, drive back up. Count per leg.",
  }],
  ["Cable Curl", {
    view: "Square to the side.",
    inFrame: "The weight at arm's length and at the top, the elbows.",
    follows: "The weight (wrists).",
    oneRep: "One rep = arms straight, curl to the shoulders, lower to straight.",
  }],
  ["Cable Fly", {
    view: "Square to the FRONT so both arms are seen sweeping together.",
    inFrame: "Both handles at the widest point and at the finish.",
    follows: "Both hands.",
    oneRep: "One rep = arms wide, sweep the hands together in front of the chest, return to wide under control.",
  }],
  ["Cable Pull-Through", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "The cable, both hands, the hips at their furthest back and at lockout.",
    follows: "The hands (rope) and the hips.",
    oneRep: "One rep = stand tall with the rope between the legs, hinge back until the hands pass behind the knees, drive the hips forward to standing.",
  }],
  ["Chest-Supported Row", {
    view: "Square to the side.",
    inFrame: "The incline bench, both dumbbells at arm's length and at the top.",
    follows: "Both dumbbells.",
    oneRep: "One rep = dumbbells hanging at arm's length, row both to the ribs, lower.",
  }],
  ["Chin-Up", {
    view: "Square to the side or front.",
    inFrame: "The bar, full hang, chin over the bar.",
    follows: "The shoulders/hips.",
    oneRep: "One rep = full hang, pull until the chin is over the bar, lower to a full hang.",
  }],
  ["Clean & Jerk", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep. Needs the tallest frame of all: floor to overhead lockout.",
    inFrame: "Both plates on the floor, the rack position, the split, full lockout overhead.",
    follows: "The bar.",
    oneRep: "One rep = bar on the floor, clean to the rack, stand, dip and jerk overhead, recover the feet. The rep ends locked out overhead.",
  }],
  ["Clean Pull", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates on the floor, full extension with a high shrug.",
    follows: "The bar.",
    oneRep: "One rep = bar dead on the floor, pull to full triple extension and a high shrug, lower. The bar is NOT received on the shoulders.",
  }],
  ["Close-Grip Bench Press", {
    view: "Square to the side of the bench, camera level with the bar.",
    inFrame: "The bench, both feet, both plates, the bar at lockout and at the chest.",
    follows: "The bar.",
    oneRep: "One rep = lockout, lower to the chest, press to lockout.",
  }],
  ["Concentration Curl", {
    view: "Square to the side of the working arm.",
    inFrame: "The dumbbell at full extension and at the top.",
    follows: "The dumbbell.",
    oneRep: "One rep = arm extended with the elbow braced on the thigh, curl to the shoulder, lower. Count per arm.",
  }],
  ["Cossack Squat", {
    view: "Square to the FRONT.",
    inFrame: "Both feet in the wide stance, the whole body at the bottom.",
    follows: "The hips.",
    oneRep: "One rep = wide stance, sit fully into one hip with the other leg straight, return to center.",
  }],
  ["Deadlift", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates on the floor, both feet, and the bar at lockout against the hips.",
    follows: "The bar and the hips.",
    oneRep: "One rep = bar dead on the floor, pull to standing lockout, lower back to the floor. The rep ends when the plates touch the floor.",
  }],
  ["Decline Bench Press", {
    view: "Square to the side of the bench, camera level with the bar.",
    inFrame: "The declined bench, the leg pads, both plates, lockout and the chest.",
    follows: "The bar.",
    oneRep: "One rep = lockout, lower to the lower chest, press to lockout.",
  }],
  ["Deficit Deadlift", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "The platform under your feet, both plates, the bar at lockout.",
    follows: "The bar and the hips.",
    oneRep: "One rep = bar on the floor, stand to lockout, lower to the floor.",
  }],
  ["Diamond Push-Up", {
    view: "Square to the side, camera on the floor.",
    inFrame: "Whole body, top and bottom.",
    follows: "The shoulders.",
    oneRep: "One rep = plank on straight arms, lower the chest to the hands, press back up.",
  }],
  ["Dip", {
    view: "Square to the side.",
    inFrame: "Both bars, the whole body at the top and at the bottom.",
    follows: "The shoulders (there is no implement).",
    oneRep: "One rep = arms locked straight on the bars, lower until the shoulders drop below the elbows, press back to lockout.",
  }],
  ["Dumbbell Bench Press", {
    view: "Square to the side of the bench, level with the dumbbells.",
    inFrame: "The bench, both feet, both dumbbells at the top and at the bottom.",
    follows: "Both dumbbells (wrists).",
    oneRep: "One rep = dumbbells pressed together over the chest, lower to a full chest stretch, press back up.",
  }],
  ["Dumbbell Box Step-Up", {
    view: "Square to the side, level with the box top.",
    inFrame: "The box, the whole standing leg, both dumbbells.",
    follows: "The dumbbells (wrists) and the hips.",
    oneRep: "One rep = one foot on the box, drive up to standing on the box, step back down under control. Count reps per leg.",
  }],
  ["Dumbbell Curl", {
    view: "Square to the side.",
    inFrame: "The weight at arm's length and at the top, the elbows.",
    follows: "The weight (wrists).",
    oneRep: "One rep = arms straight, curl to the shoulders, lower to straight.",
  }],
  ["Dumbbell Romanian Deadlift", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both dumbbells, their lowest point, full standing height.",
    follows: "The dumbbells (wrists) and the hips.",
    oneRep: "One rep = stand tall, hinge until the dumbbells are just below the knee, return to standing.",
  }],
  ["Dumbbell Shoulder Press", {
    view: "Square to the side, seeing the dumbbells at the shoulders and at lockout.",
    inFrame: "Both dumbbells, top and bottom.",
    follows: "Both dumbbells.",
    oneRep: "One rep = dumbbells at shoulder height, press to lockout overhead, lower to the shoulders.",
  }],
  ["EZ-Bar Curl", {
    view: "Square to the side.",
    inFrame: "The weight at arm's length and at the top, the elbows.",
    follows: "The weight (wrists).",
    oneRep: "One rep = arms straight, curl to the shoulders, lower to straight.",
  }],
  ["Face Pull", {
    view: "Square to the side.",
    inFrame: "The rope at arm's length and pulled to the ears.",
    follows: "The hands.",
    oneRep: "One rep = rope at arm's length at face height, pull toward the ears with the elbows high, return.",
  }],
  ["Floor Press", {
    view: "Square to the side, camera on the floor level with the bar.",
    inFrame: "Your whole body on the floor, both plates, the bar at lockout and the upper arms touching the floor.",
    follows: "The bar.",
    oneRep: "One rep = lockout, lower until the upper arms touch the floor, press to lockout.",
  }],
  ["Front Squat", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates, the elbows, both feet, full standing height.",
    follows: "The bar and the hips.",
    oneRep: "One rep = stand tall, descend to full depth, stand back to lockout.",
  }],
  ["Goblet Squat", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "The dumbbell, both elbows, both feet, full standing height.",
    follows: "The dumbbell (wrists) and the hips.",
    oneRep: "One rep = stand tall, descend to full depth, stand back up.",
  }],
  ["Hammer Curl", {
    view: "Square to the side.",
    inFrame: "The weight at arm's length and at the top, the elbows.",
    follows: "The weight (wrists).",
    oneRep: "One rep = arms straight, curl to the shoulders, lower to straight.",
  }],
  ["Hang Clean", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates, the bar at the hang and racked on the shoulders.",
    follows: "The bar.",
    oneRep: "One rep = standing with the bar at the thighs, dip to the hang above the knee, drive and receive in the rack, stand. Begins with a short dip.",
  }],
  ["Hang Snatch", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates, the hang, overhead lockout.",
    follows: "The bar.",
    oneRep: "One rep = standing with the bar at the hips, dip to the hang above the knee, drive and receive overhead, stand.",
  }],
  ["Hex Bar Deadlift", {
    view: "Directly in front or directly behind, camera level with the bar. Both plates should look the same size -- if one looks bigger, the phone is not square. The hex bar's frame blocks a side view of the legs.",
    inFrame: "The whole hex bar, both feet, full standing height.",
    follows: "The handles and the hips.",
    oneRep: "One rep = bar on the floor, stand to lockout, lower to the floor.",
  }],
  ["Hip Thrust", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep. The bar travels a short distance, so get close enough to see it.",
    inFrame: "The bench, both plates, the hips at their lowest and highest.",
    follows: "The bar and the hips.",
    oneRep: "One rep = hips on or near the floor with the bar across them, drive the hips up until the torso is flat, lower back down.",
  }],
  ["Incline Barbell Bench Press", {
    view: "Square to the side of the bench, camera level with the bar.",
    inFrame: "The angled bench, both feet, both plates, lockout and the chest.",
    follows: "The bar.",
    oneRep: "One rep = lockout, lower to the upper chest, press to lockout.",
  }],
  ["Incline Dumbbell Press", {
    view: "Square to the side of the bench, level with the dumbbells.",
    inFrame: "The angled bench, both dumbbells at top and bottom.",
    follows: "Both dumbbells.",
    oneRep: "One rep = dumbbells pressed together, lower to a full stretch, press back up.",
  }],
  ["Inverted Row", {
    view: "Square to the side.",
    inFrame: "The bar, the whole body at arm's length and with the chest at the bar.",
    follows: "The shoulders.",
    oneRep: "One rep = hanging under the bar with straight arms, pull the chest to the bar, lower.",
  }],
  ["Landmine Press", {
    view: "Square to the side of the bar's travel.",
    inFrame: "The landmine sleeve, the whole bar, the hand at the shoulder and at full extension.",
    follows: "The hand on the bar.",
    oneRep: "One rep = bar end at the shoulder, press up and forward to arm's length, return to the shoulder. Count per arm.",
  }],
  ["Lat Pulldown", {
    view: "Square to the side.",
    inFrame: "The bar at full extension overhead and at the upper chest.",
    follows: "The bar.",
    oneRep: "One rep = bar overhead with straight arms, pull to the upper chest, return under control.",
  }],
  ["Lateral Lunge", {
    view: "Square to the FRONT so the sideways step is visible.",
    inFrame: "Both feet, the whole body at the bottom.",
    follows: "The hips.",
    oneRep: "One rep = standing, step wide to one side and sit into that hip, push back to center.",
  }],
  ["Leg Extension", {
    view: "Square to the side.",
    inFrame: "The pad at 90 degrees and at full extension.",
    follows: "The ankles.",
    oneRep: "One rep = knees bent at 90 degrees, extend fully, lower under control.",
  }],
  ["Leg Press", {
    view: "Square to the side of the machine, camera level with the sled's travel.",
    inFrame: "The whole sled path, both feet on the platform, and the knees.",
    follows: "The sled (feet) -- there is no bar or wrist to follow, so the tracker follows the ankles.",
    oneRep: "One rep = platform at lockout, lower until the knees reach 90 degrees, press back to lockout.",
  }],
  ["Lying Leg Curl", {
    view: "Square to the side of the machine.",
    inFrame: "The pad at full extension and curled to the glutes.",
    follows: "The ankles.",
    oneRep: "One rep = legs straight under the pad, curl the heels to the glutes, lower under control.",
  }],
  ["Machine Chest Fly", {
    view: "Square to the FRONT.",
    inFrame: "Both pads at wide and at the finish.",
    follows: "Both hands/forearms.",
    oneRep: "One rep = arms wide on the pads, bring them together in front of the chest, return under control.",
  }],
  ["Machine Chest Press", {
    view: "Square to the side of the machine.",
    inFrame: "The handles at their furthest out and at the chest.",
    follows: "The handles (wrists).",
    oneRep: "One rep = handles at the chest, press straight out until the arms are nearly straight, return under control.",
  }],
  ["Machine Row", {
    view: "Square to the side.",
    inFrame: "The handles at arm's length and at the torso.",
    follows: "The handles.",
    oneRep: "One rep = handles at arm's length, row to the torso, return under control.",
  }],
  ["Machine Shoulder Press", {
    view: "Square to the side of the machine.",
    inFrame: "The handles at the shoulders and at lockout.",
    follows: "The handles.",
    oneRep: "One rep = handles at the shoulders, press to lockout, return under control.",
  }],
  ["Meadows Row", {
    view: "Square to the side of the working arm.",
    inFrame: "The landmine bar, the torso, the hand at arm's length and at the hip.",
    follows: "The working hand.",
    oneRep: "One rep = bar end hanging at arm's length, row to the hip, lower. Count per arm.",
  }],
  ["Overhead Press", {
    view: "Square to the side, camera level with the bar at shoulder height, far enough back to see the bar at full lockout overhead.",
    inFrame: "Both plates, the bar at the shoulders and at full lockout, both feet.",
    follows: "The bar.",
    oneRep: "One rep = bar at the collarbone, press to lockout overhead, lower back to the collarbone.",
  }],
  ["Overhead Squat", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates, the bar overhead at its highest, both feet, and full depth. This needs the tallest frame of any lift.",
    follows: "The bar and the hips.",
    oneRep: "One rep = stand tall with the bar locked out overhead, squat to full depth, stand back up with the bar still overhead.",
  }],
  ["Overhead Tricep Extension", {
    view: "Square to the side, seeing the dumbbell overhead and behind the head.",
    inFrame: "The dumbbell at lockout and at its lowest behind the head.",
    follows: "The dumbbell.",
    oneRep: "One rep = dumbbell locked out overhead, lower behind the head by bending only the elbows, press back to lockout.",
  }],
  ["Paused Bench Press", {
    view: "Square to the side of the bench, camera level with the bar.",
    inFrame: "The bench, both feet, both plates, lockout and the chest.",
    follows: "The bar.",
    oneRep: "One rep = lockout, lower to the chest, hold DEAD STILL on the chest for one to two seconds, press to lockout. The pause is part of the rep.",
  }],
  ["Pendlay Row", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates on the floor, the torso, the bar at the ribs.",
    follows: "The bar.",
    oneRep: "One rep = bar DEAD on the floor, row explosively to the lower ribs, lower back to the floor. Every rep starts from a dead stop.",
  }],
  ["Pike Push-Up", {
    view: "Square to the side, camera on the floor.",
    inFrame: "The inverted V of the body, the head at the top and near the floor.",
    follows: "The shoulders.",
    oneRep: "One rep = hips high in an inverted V on straight arms, lower the head toward the floor, press back up.",
  }],
  ["Power Clean", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep. Needs the tallest frame: the bar on the floor and the bar racked on the shoulders.",
    inFrame: "Both plates on the floor, both feet, the bar at the hips, the bar racked on the shoulders.",
    follows: "The bar.",
    oneRep: "One rep = bar dead on the floor, pull and receive it in a front-rack quarter squat, stand tall. The rep ends standing with the bar in the rack.",
  }],
  ["Preacher Curl", {
    view: "Square to the side of the pad.",
    inFrame: "The pad, the bar at full stretch and at the top.",
    follows: "The bar.",
    oneRep: "One rep = arms fully extended down the pad, curl to the top, lower to full stretch.",
  }],
  ["Pull-Up", {
    view: "Square to the side or front, low enough to see the full hang and the chin over the bar.",
    inFrame: "The bar, the whole body at full hang and at the top.",
    follows: "The shoulders/hips.",
    oneRep: "One rep = full hang with straight arms, pull until the chin is over the bar, lower to a full hang.",
  }],
  ["Push Press", {
    view: "Square to the side, level with the bar at the shoulders, seeing full lockout.",
    inFrame: "Both plates, both feet, the dip, and full lockout.",
    follows: "The bar.",
    oneRep: "One rep = bar at the shoulders, DIP the knees, drive up and press to lockout, lower to the shoulders. The dip is a short down before the up.",
  }],
  ["Push-Up", {
    view: "Square to the side, camera on the floor.",
    inFrame: "The whole body from head to heels, at the top and at the bottom.",
    follows: "The shoulders.",
    oneRep: "One rep = arms straight in a plank, lower the chest to the floor, press back to straight arms.",
  }],
  ["Rack Pull", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "The pins, both plates, the bar at lockout.",
    follows: "The bar and the hips.",
    oneRep: "One rep = bar resting on the pins, pull to lockout, lower back to the pins.",
  }],
  ["Reverse Hyper", {
    view: "Square to the side of the machine.",
    inFrame: "The whole leg swing from hanging to parallel.",
    follows: "The ankles and the hips.",
    oneRep: "One rep = legs hanging straight down, swing them up to parallel with the floor, lower under control.",
  }],
  ["Reverse Lunge", {
    view: "Square to the side.",
    inFrame: "Both feet, the whole body at the bottom.",
    follows: "The dumbbells and hips.",
    oneRep: "One rep = standing, step backward into a lunge, drive back to standing.",
  }],
  ["Reverse-Grip Lat Pulldown", {
    view: "Square to the side.",
    inFrame: "The bar overhead and at the upper chest.",
    follows: "The bar.",
    oneRep: "One rep = arms straight overhead, pull to the upper chest, return.",
  }],
  ["Romanian Deadlift", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates, the bar at its lowest point (below the knee), full standing height.",
    follows: "The bar and the hips.",
    oneRep: "One rep = stand tall with the bar, hinge until the bar is just below the knee, return to standing. The bar does NOT touch the floor.",
  }],
  ["Seated Cable Row", {
    view: "Square to the side.",
    inFrame: "The handle at arm's length and at the torso, the whole torso.",
    follows: "The handle.",
    oneRep: "One rep = handle at arm's length with the torso upright, row to the torso, return under control.",
  }],
  ["Seated Calf Raise", {
    view: "Square to the side, camera low.",
    inFrame: "The feet at full stretch and on the toes.",
    follows: "The heels.",
    oneRep: "One rep = on the toes, lower the heels to a full stretch, rise back up.",
  }],
  ["Single-Arm Dumbbell Row", {
    view: "Square to the side of the working arm.",
    inFrame: "The bench, the torso, the dumbbell at arm's length and at the hip.",
    follows: "The dumbbell.",
    oneRep: "One rep = dumbbell hanging at arm's length, row to the hip, lower. Count per arm.",
  }],
  ["Single-Leg Romanian Deadlift", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "The dumbbell, the whole standing leg, the free leg extending behind.",
    follows: "The dumbbell (wrist) and the hips.",
    oneRep: "One rep = stand on one leg, hinge until the torso is near parallel, return to standing. Count reps per leg.",
  }],
  ["Skater Squat", {
    view: "Square to the side.",
    inFrame: "Whole body, the trailing leg, the heel touching down.",
    follows: "The hips and the trailing ankle.",
    oneRep: "One rep = stand on one leg, lower until the trailing knee or heel lightly touches behind you, stand back up.",
  }],
  ["Skull Crusher", {
    view: "Square to the side of the bench, level with the bar.",
    inFrame: "The bench, the bar at lockout and at the forehead.",
    follows: "The bar.",
    oneRep: "One rep = bar locked out over the face, lower toward the forehead by bending only the elbows, press back to lockout.",
  }],
  ["Snatch", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep. Tallest frame: floor to overhead.",
    inFrame: "Both plates on the floor, the wide grip, the bar overhead at lockout in the squat and standing.",
    follows: "The bar.",
    oneRep: "One rep = bar on the floor, pull to overhead in one motion, receive in an overhead squat, stand tall. Ends locked out overhead.",
  }],
  ["Snatch Pull", {
    view: "Square to the side, camera level with the bar, far enough back that the whole bar and your whole body are in frame for the entire rep.",
    inFrame: "Both plates on the floor, full extension with a high shrug.",
    follows: "The bar.",
    oneRep: "One rep = bar on the floor, pull with a snatch grip to full extension and a high shrug, lower. Not received overhead.",
  }],
  ["Split Jerk", {
    view: "Square to the side, camera level with the bar at the shoulders, wide enough to see the split of the feet and full lockout.",
    inFrame: "Both plates, the front rack, both feet before and after the split, lockout overhead.",
    follows: "The bar.",
    oneRep: "One rep = bar in the front rack, dip, drive, split and receive it overhead, recover the feet together, lower the bar.",
  }],
  ["Standing Calf Raise", {
    view: "Square to the side, camera low at foot level.",
    inFrame: "The feet at full stretch (heels below the step) and on the toes.",
    follows: "The heels.",
    oneRep: "One rep = standing on the toes, lower the heels to a full stretch, rise back onto the toes.",
  }],
  ["Step-Down", {
    view: "Square to the side, level with the box top.",
    inFrame: "The box, the whole standing leg, the free foot reaching the floor.",
    follows: "The hips and the free ankle.",
    oneRep: "One rep = standing on the box on one leg, lower the free foot to lightly touch the floor, drive back to standing on the box.",
  }],
  ["Straight-Arm Pulldown", {
    view: "Square to the side.",
    inFrame: "The bar overhead and at the thighs, the arms straight throughout.",
    follows: "The bar.",
    oneRep: "One rep = bar overhead with straight arms, pull down in an arc to the thighs, return.",
  }],
  ["Sumo Deadlift", {
    view: "Directly in front or directly behind, camera level with the bar. Both plates should look the same size -- if one looks bigger, the phone is not square. A side view hides one leg behind the other on this stance.",
    inFrame: "Both plates, both feet, the bar at lockout.",
    follows: "The bar and the hips.",
    oneRep: "One rep = bar dead on the floor, stand to lockout, lower to the floor.",
  }],
  ["T-Bar Row", {
    view: "Square to the side.",
    inFrame: "The bar, the torso, the handle at arm's length and at the sternum.",
    follows: "The handles.",
    oneRep: "One rep = handle hanging at arm's length, row to the sternum, lower under control.",
  }],
  ["Tricep Rope Pushdown", {
    view: "Square to the side.",
    inFrame: "The rope at the top (elbows bent) and at the bottom (arms straight).",
    follows: "The hands (rope).",
    oneRep: "One rep = rope at chest height with elbows bent, press down until the arms are straight, return under control. 'Up' here means the working direction, which is down -- the tracker follows the hands moving away from the start.",
  }],
  ["Turkish Get-Up", {
    view: "Square to the side, wide enough to see the whole body from lying to standing.",
    inFrame: "The kettlebell overhead throughout, the whole body at every stage.",
    follows: "The kettlebell (wrist).",
    oneRep: "One rep = lying on the back with the bell pressed overhead, stand fully upright with the bell still overhead, reverse every step back to lying. The bell never leaves lockout.",
  }],
  ["Walking Lunge", {
    view: "Square to the side, with room for several steps in frame.",
    inFrame: "Both feet, the whole body, the full stride.",
    follows: "The dumbbells and hips.",
    oneRep: "One rep = one step forward into a lunge and back to standing. Each step is one rep.",
  }],
  ["Zottman Curl", {
    view: "Square to the FRONT so the hand rotation is visible.",
    inFrame: "Both dumbbells at the bottom and top.",
    follows: "Both dumbbells.",
    oneRep: "One rep = arms straight palms up, curl to the top, rotate palms DOWN, lower slowly, rotate palms back up at the bottom.",
  }],]);

// Filmable today, absent from the manual. Sixteen of the nineteen are Olympic lifts, so the gap
// sat squarely on the lifts a weightlifter films. Written to the manual's own rules: a squat-
// pattern lift is filmed from the side, an Olympic lift needs the bar's whole travel from floor
// to overhead in frame, and a rep ends at a held finish rather than at the moment of receipt.
//
// Note the recurring warning on every one of these. Bar-path deviation and peak velocity both
// assume the bar travels a straight vertical line, and a correct clean or snatch deliberately
// does not -- the bar loops around the knees and back in under the athlete. Those two numbers
// are not trustworthy on any lift in this block until an Olympic path model exists. See
// docs/camera-tracking-notes.md.
const OLYMPIC_PATH_WARNING =
  "The bar deliberately does NOT travel a straight line on this lift, so bar-path deviation and " +
  "peak velocity are not trustworthy here yet.";

const FILM_GUIDANCE_UNMANUALLED: [string, ExerciseFilmGuidance][] = [
  ["Trap Bar Squat", {
    view: "Square to the side, camera level with the handles, far enough back that the whole trap bar and your whole body stay in frame.",
    inFrame: "Both plates, both feet, the handles at their lowest point, and full standing height.",
    follows: "The handles (wrists on them) and the hips.",
    oneRep: "One rep = stand tall inside the bar, descend to depth, return to standing tall. The rep ends at lockout.",
  }],
  ["Power Snatch", {
    view: "Square to the side, camera level with the athlete's hip at setup, far enough back to hold the bar from the floor to overhead.",
    inFrame: "Both plates, both feet, the bar on the floor, and the bar locked out overhead. This needs a tall frame.",
    follows: "The bar and the hips.",
    oneRep: `One rep = bar on the floor, pull, receive overhead in a partial squat, stand to lockout. The rep ends standing, not at the catch. ${OLYMPIC_PATH_WARNING}`,
  }],
  ["Block Clean", {
    view: "Square to the side, camera level with the bar on the blocks.",
    inFrame: "Both plates, both feet, the blocks, and the bar racked on the shoulders at the finish.",
    follows: "The bar and the hips.",
    oneRep: `One rep = bar at rest on the blocks, pull, receive in the front rack, stand. Nothing lowers first. ${OLYMPIC_PATH_WARNING}`,
  }],
  ["Block Snatch", {
    view: "Square to the side, camera level with the bar on the blocks, far enough back to hold the bar overhead.",
    inFrame: "Both plates, both feet, the blocks, and the bar locked out overhead.",
    follows: "The bar and the hips.",
    oneRep: `One rep = bar at rest on the blocks, pull, receive overhead, stand to lockout. ${OLYMPIC_PATH_WARNING}`,
  }],
  ["Hang Power Clean", {
    view: "Square to the side, camera level with the bar at the hang.",
    inFrame: "Both plates, both feet, the bar at the hang above the knee, and the bar racked at the finish.",
    follows: "The bar and the hips.",
    oneRep: `One rep = standing with the bar at the thighs, dip to the hang above the knee, drive and receive in the rack above a quarter squat, stand. The dip is a short DOWN before the up. ${OLYMPIC_PATH_WARNING}`,
  }],
  ["Hang Power Snatch", {
    view: "Square to the side, camera level with the bar at the hang, far enough back to hold the bar overhead.",
    inFrame: "Both plates, both feet, the bar at the hang, and the bar locked out overhead.",
    follows: "The bar and the hips.",
    oneRep: `One rep = standing with the bar at the hips, dip to the hang above the knee, drive and receive overhead above a quarter squat, stand. Begins with a short dip. ${OLYMPIC_PATH_WARNING}`,
  }],
  ["Muscle Clean", {
    view: "Square to the side, camera level with the bar at setup.",
    inFrame: "Both plates, both feet, the bar at its lowest, and the bar racked on the shoulders.",
    follows: "The bar and the hips.",
    oneRep: `One rep = pull the bar to the shoulders with NO re-bend of the knees to get under it. The rep ends with the bar racked and the legs straight. ${OLYMPIC_PATH_WARNING}`,
  }],
  ["Muscle Snatch", {
    view: "Square to the side, camera level with the bar at setup, far enough back to hold the bar overhead.",
    inFrame: "Both plates, both feet, the bar at its lowest, and the bar locked out overhead.",
    follows: "The bar and the hips.",
    oneRep: `One rep = pull the bar to overhead with NO re-bend of the knees. The rep ends locked out with the legs straight. ${OLYMPIC_PATH_WARNING}`,
  }],
  ["Pause Clean", {
    view: "Square to the side, camera level with the bar on the floor.",
    inFrame: "Both plates, both feet, the bar on the floor, the pause position above the knee, and the rack position.",
    follows: "The bar and the hips.",
    oneRep: `One rep = pull from the floor, hold still for a full count above the knee, finish the pull, receive, stand. The pause is part of the rep, not a break between two. ${OLYMPIC_PATH_WARNING}`,
  }],
  ["Clean High Pull", {
    view: "Square to the side, camera level with the bar on the floor.",
    inFrame: "Both plates, both feet, the bar on the floor, and the bar at its highest point.",
    follows: "The bar and the elbows.",
    oneRep: `One rep = pull from the floor to chest height leading with the elbows, then lower under control. There is no catch. ${OLYMPIC_PATH_WARNING}`,
  }],
  ["Snatch-Grip High Pull", {
    view: "Square to the side, camera level with the bar on the floor.",
    inFrame: "Both plates, both feet, the bar on the floor, and the bar at its highest point.",
    follows: "The bar and the elbows.",
    oneRep: `One rep = pull from the floor to chest height with a wide grip, elbows leading, then lower under control. ${OLYMPIC_PATH_WARNING}`,
  }],
  ["Push Jerk", {
    view: "Square to the side, camera level with the bar in the front rack, far enough back to hold the bar overhead.",
    inFrame: "Both plates, both feet, the bar at the shoulders, the lowest point of the dip, and the bar locked out overhead.",
    follows: "The bar and the hips.",
    oneRep: "One rep = bar in the front rack, DIP the knees, drive and press to lockout overhead receiving in a partial squat, stand. The dip is a short down before the up.",
  }],
  ["Jerk Balance", {
    view: "Square to the side, camera level with the bar in the front rack, far enough back to hold the bar overhead.",
    inFrame: "Both feet in the split, the bar at the shoulders, and the bar locked out overhead.",
    follows: "The bar and the hips.",
    oneRep: "One rep = bar in the front rack with the feet already staggered, dip, drive, and shift into the split with the bar locked out. Begins with the dip.",
  }],
  ["Snatch Balance", {
    view: "Square to the side, camera level with the bar on the back, far enough back to hold the bar overhead and a full squat.",
    inFrame: "Both plates, both feet, the bar on the back at the start, and the bar overhead at full squat depth.",
    follows: "The bar and the hips.",
    oneRep: "One rep = bar on the back at snatch grip, dip, drive it up and drop into a full overhead squat, stand. Begins with the dip.",
  }],
  ["Tall Clean", {
    view: "Square to the side, camera level with the bar at the hip.",
    inFrame: "Both plates, both feet, the bar at the hip, and the bar racked on the shoulders.",
    follows: "The bar and the hips.",
    oneRep: `One rep = standing tall with the bar at the hip and the legs straight, pull yourself UNDER the bar into the rack, stand. There is no leg drive. ${OLYMPIC_PATH_WARNING}`,
  }],
  ["Tall Snatch", {
    view: "Square to the side, camera level with the bar at the hip, far enough back to hold the bar overhead.",
    inFrame: "Both plates, both feet, the bar at the hip, and the bar locked out overhead at depth.",
    follows: "The bar and the hips.",
    oneRep: `One rep = standing tall with the bar at the hip, pull yourself UNDER the bar into an overhead squat, stand. No leg drive. ${OLYMPIC_PATH_WARNING}`,
  }],
];

const FILM_GUIDANCE_NORMALIZED = new Map<string, ExerciseFilmGuidance>(
  [...FILM_GUIDANCE_BY_NAME, ...FILM_GUIDANCE_UNMANUALLED].map(([name, guidance]) => [
    normalizeName(name),
    guidance,
  ]),
);

/** How to film this lift, or null when nothing has been written for it. Null is a real answer:
 * showing a generic instruction would be worse than showing none, because "square to the side"
 * is wrong for the handful of lifts that need a front view. */
export function filmGuidanceForExercise(
  name: string | null | undefined,
): ExerciseFilmGuidance | null {
  if (!name) return null;
  return FILM_GUIDANCE_NORMALIZED.get(normalizeName(name)) ?? null;
}

/** True when this lift's bar deliberately does not travel a straight vertical line.
 *
 * Bar-path deviation measures how far the bar strayed from a straight line, and peak velocity is
 * read off that same trace. Both assume the straight line is the target. On a correct clean or
 * snatch it is not: the bar loops back around the knees and in under the athlete, and a lifter
 * doing it properly scores WORSE on deviation than one hauling it up in a straight line badly.
 * Reporting those two numbers on these lifts is not imprecise, it is inverted.
 *
 * The other metrics are unaffected -- range of motion, timing, velocity loss and rep count all
 * mean what they usually mean. Only the two that assume a straight path are withheld. */
export function barPathAssumptionInvalid(name: string | null | undefined): boolean {
  return romBucketForExercise(name) === "olympic";
}
