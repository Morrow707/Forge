// WHICH TRACKER FILMS A SET. One resolver, read by the coach's toggle when tracking is turned on
// AND by the athlete's workout page when a set is filmed, so the two cannot disagree.
//
// Added 2026-10-01 after a medicine ball rotational throw beside the OVR sensor was filmed by
// the BAR tracker: the program exercise had been saved under the generic "full" level before the
// toggle learned to pick med_ball from the name, and the workout page routed on the saved level
// alone. The take came back as four "reps" of bar path on a rotational throw, scale suspect,
// with no med-ball number at all, against a sensor that had read ten throws. Nothing refused,
// nothing wrong in either tracker; the wrong tracker.
//
// The rule: a SPECIFIC saved level (jump, med_ball, kb_swing, golf_swing, ...) is the coach's
// decision and stands. The GENERIC levels ("full", the older "bar_path") mean "camera on", and
// what the camera runs is decided here from the exercise's own name and equipment, the same way
// the toggle decides it. "none" stays off. Category is NOT read at capture time: the toggle maps
// a plyometric category to jump when tracking is first switched on, but a "full" already saved
// on a plyometric exercise (a barbell jump squat, say) is a bar lift the coach kept as one.

export type TrackingLevel =
  | "none"
  | "bar_path"
  | "full"
  | "jump"
  | "golf_swing"
  | "baseball_swing"
  | "med_ball"
  | "kb_swing"
  | "horizontal_load";

// Word-boundary, not substring -- "Baseball-Style Rotational Med Ball Throw" shouldn't silently
// become a swing-tracked exercise just because the word appears in its name; an exercise actually
// named "Golf Swing" or "Baseball Batting Drill" should. Checked against the exercise's own name
// only (never its description) -- description text is far more likely to mention a sport in
// passing ("great for baseball players") without the exercise itself being that sport's swing.
export const GOLF_NAME_PATTERN = /\bgolf\b/i;
export const BASEBALL_NAME_PATTERN = /\bbaseball\b/i;
// Checked BEFORE the baseball pattern -- "Baseball-Style Rotational Med Ball Throw" would
// otherwise become swing-tracked instead of med-ball-tracked. "Wall Ball" is a medicine ball
// thrown at a target and belongs in this mode, but it never says "med ball" in its name.
export const MED_BALL_NAME_PATTERN = /\b(?:med(?:icine)?[\s-]?ball|wall\s*ball)\b/i;
// "Kettlebell Snatch"/"KB Clean" deliberately do NOT match -- those are vertical-linear,
// ballistic movements (same category as a barbell clean/snatch), not the arc pattern a swing
// needs. See kb-swing-tracking.ts's own file comment.
export const KB_SWING_NAME_PATTERN = /\b(?:kettlebell|kb)\s+swing\b/i;
// Sled push/pull/drag and a farmer's/suitcase/loaded carry: cover a known distance in a straight
// line. See av-horizontal-load-tracker-dialog.tsx's own file comment.
export const HORIZONTAL_LOAD_NAME_PATTERN =
  /\b(?:sled (?:push|pull|drag)|(?:farmer'?s?|suitcase)\s+(?:carry|walk)|loaded carry)\b/i;

const GENERIC_LEVELS: ReadonlySet<TrackingLevel> = new Set(["full", "bar_path"]);

/** The specific tracker an exercise's name and equipment call for, or null when nothing in
 *  them says. Equipment is the library's structured value ("Medicine Ball" in
 *  shared/exercise-family.ts's taxonomy), which catches a throw whose name never says "ball". */
export function trackerFromExercise(exercise: {
  exerciseName?: string | null;
  equipment?: string | null;
}): TrackingLevel | null {
  const name = exercise.exerciseName ?? "";
  const equipment = exercise.equipment ?? "";
  if (MED_BALL_NAME_PATTERN.test(name) || /\bmed(?:icine)?[\s-]?ball\b/i.test(equipment)) return "med_ball";
  if (KB_SWING_NAME_PATTERN.test(name)) return "kb_swing";
  if (HORIZONTAL_LOAD_NAME_PATTERN.test(name)) return "horizontal_load";
  if (GOLF_NAME_PATTERN.test(name)) return "golf_swing";
  if (BASEBALL_NAME_PATTERN.test(name)) return "baseball_swing";
  return null;
}

/** The tracker that films a set. A specific saved level stands; a generic one ("full",
 *  "bar_path") is resolved from the exercise; "none" is off. */
export function resolveTrackingMode(
  saved: TrackingLevel,
  exercise: { exerciseName?: string | null; equipment?: string | null },
): TrackingLevel {
  if (!GENERIC_LEVELS.has(saved)) return saved;
  return trackerFromExercise(exercise) ?? saved;
}
