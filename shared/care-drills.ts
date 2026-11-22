/**
 * "ADD CARE DRILLS": which library drills to PROPOSE for one program day.
 *
 * Scott, 2026-11-22. The coach taps the button on a day, sees two to four suggestions, and accepts,
 * edits or dismisses them. Nothing is added to the day without that tap, so this module only ever
 * returns a proposal.
 *
 * How the drills are chosen, in order:
 *   1. The joints the day LOADS MOST: each exercise on the day counts once for each joint it is
 *      tagged with, and, where it carries no joint tags yet (most of the library today), for the
 *      joints its muscle group works across (`JOINTS_BY_MUSCLE_GROUP`).
 *   2. Then the program's own tagged joints, and its sport and positions: a drill tagged for the
 *      program's sport or one of its positions ranks above an otherwise equal one.
 *   3. Only drills tagged with the purpose "care", and never one already on the day. Never filtered
 *      by an athlete's age (Scott, 2026-11-22: weight-room proficiency, not age).
 *
 * With no care drills tagged in the library the answer says so (`noneTagged`), so the button can
 * read "No care drills tagged yet" rather than a silent empty list.
 *
 * The reason line names a JOINT, never a weakness: "Knee: today's squats and lunges load it".
 */
import { EXERCISE_JOINT_LABEL, isExerciseJoint, type ExerciseJoint } from "./exercise-tags";

/** The fewest suggestions worth showing when the library has that many care drills. */
export const MIN_CARE_SUGGESTIONS = 2;
/** The most suggestions shown at once: enough to choose from, few enough to read. */
export const MAX_CARE_SUGGESTIONS = 4;
/** A drill for a joint the day loads counts this much per exercise loading it. */
const DAY_LOAD_WEIGHT = 2;
/** A drill for a joint the program is tagged with counts this much. */
const PROGRAM_JOINT_WEIGHT = 1;
/** A drill tagged for the program's sport, or one of its positions, counts this much more. */
const SPORT_MATCH_WEIGHT = 1;

/**
 * The joints a muscle group works across, for an exercise that has no joint tags of its own. A
 * guide for ranking suggestions only; it never becomes a tag on the exercise.
 */
export const JOINTS_BY_MUSCLE_GROUP: Record<string, readonly ExerciseJoint[]> = {
  quads: ["knee", "hip"],
  hamstrings: ["knee", "hip"],
  glutes: ["hip"],
  "hip flexors": ["hip"],
  hips: ["hip"],
  adductors: ["hip", "knee"],
  calves: ["ankle"],
  ankle: ["ankle"],
  shoulders: ["shoulder"],
  chest: ["shoulder", "elbow"],
  back: ["shoulder", "back"],
  lats: ["shoulder"],
  traps: ["shoulder", "neck"],
  biceps: ["elbow"],
  triceps: ["elbow"],
  forearms: ["wrist", "elbow"],
  "lower back": ["back"],
  core: ["back"],
  abs: ["back"],
  obliques: ["back"],
  neck: ["neck"],
};

export type CareDayExercise = {
  exerciseId: number;
  name: string;
  muscleGroup?: string | null;
  joints?: readonly string[] | null;
};

export type CareLibraryExercise = {
  id: number;
  name: string;
  muscleGroup?: string | null;
  joints?: readonly string[] | null;
  purposes?: readonly string[] | null;
  sports?: readonly string[] | null;
  positions?: readonly string[] | null;
};

export type CareProgramContext = {
  sport?: string | null;
  positions?: readonly string[] | null;
  joints?: readonly string[] | null;
};

export type CareSuggestion<T extends CareLibraryExercise> = {
  exercise: T;
  /** The joint this drill was chosen for, when one decided it. */
  joint: ExerciseJoint | null;
  /** One line for the coach: what on the day or the program led here. */
  reason: string;
};

export type CareSuggestionResult<T extends CareLibraryExercise> = {
  suggestions: CareSuggestion<T>[];
  /** True when the library holds no drill tagged "care" at all. */
  noneTagged: boolean;
};

/** The joints one day exercise loads: its own tags, or its muscle group's joints when it has none. */
export function jointsLoadedBy(ex: { muscleGroup?: string | null; joints?: readonly string[] | null }): ExerciseJoint[] {
  const own = (ex.joints ?? []).filter(isExerciseJoint);
  if (own.length > 0) return own;
  return [...(JOINTS_BY_MUSCLE_GROUP[(ex.muscleGroup ?? "").trim().toLowerCase()] ?? [])];
}

/** How many of the day's exercises load each joint, most loaded first. */
export function dayJointLoad(day: readonly CareDayExercise[]): { joint: ExerciseJoint; count: number; names: string[] }[] {
  const byJoint = day.reduce((acc, ex) => {
    jointsLoadedBy(ex).forEach((joint) => {
      const entry = acc.get(joint) ?? { joint, count: 0, names: [] as string[] };
      entry.count += 1;
      if (!entry.names.includes(ex.name)) entry.names.push(ex.name);
      acc.set(joint, entry);
    });
    return acc;
  }, new Map<ExerciseJoint, { joint: ExerciseJoint; count: number; names: string[] }>());
  return Array.from(byJoint.values()).sort((a, b) => b.count - a.count);
}

function lower(values: readonly string[] | null | undefined): string[] {
  return (values ?? []).map((v) => v.trim().toLowerCase());
}

/** The drills to propose for this day, best first, between two and four of them where possible. */
export function suggestCareDrills<T extends CareLibraryExercise>(
  day: readonly CareDayExercise[],
  library: readonly T[],
  program: CareProgramContext = {},
): CareSuggestionResult<T> {
  const careDrills = library.filter((ex) => lower(ex.purposes).includes("care"));
  if (careDrills.length === 0) return { suggestions: [], noneTagged: true };
  const onDay = new Set(day.map((ex) => ex.exerciseId));
  const load = dayJointLoad(day);
  const loadByJoint = new Map(load.map((l) => [l.joint, l]));
  const programJoints = new Set(lower(program.joints));
  const sport = (program.sport ?? "").trim().toLowerCase();
  const positions = new Set(lower(program.positions));

  const scored = careDrills
    .filter((ex) => !onDay.has(ex.id))
    .map((ex, at) => {
      const joints = (ex.joints ?? []).filter(isExerciseJoint);
      const best = joints
        .map((joint) => ({
          joint,
          score:
            (loadByJoint.get(joint)?.count ?? 0) * DAY_LOAD_WEIGHT +
            (programJoints.has(joint) ? PROGRAM_JOINT_WEIGHT : 0),
        }))
        .sort((a, b) => b.score - a.score)[0];
      const sportMatch =
        (sport.length > 0 && lower(ex.sports).includes(sport)) || lower(ex.positions).some((p) => positions.has(p));
      const score = (best?.score ?? 0) + (sportMatch ? SPORT_MATCH_WEIGHT : 0);
      return { ex, at, score, joint: best && best.score > 0 ? best.joint : null, sportMatch };
    })
    .sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name) || a.at - b.at);

  const chosen = scored.filter((s) => s.score > 0).slice(0, MAX_CARE_SUGGESTIONS);
  const fill = scored.filter((s) => s.score <= 0).slice(0, Math.max(0, MIN_CARE_SUGGESTIONS - chosen.length));
  const suggestions = [...chosen, ...fill].map((s) => ({
    exercise: s.ex,
    joint: s.joint,
    reason: reasonFor(s.joint, s.joint ? loadByJoint.get(s.joint) : undefined, s.sportMatch, programJoints, sport),
  }));
  return { suggestions, noneTagged: false };
}

function reasonFor(
  joint: ExerciseJoint | null,
  loaded: { names: string[] } | undefined,
  sportMatch: boolean,
  programJoints: ReadonlySet<string>,
  sport: string,
): string {
  if (joint && loaded && loaded.names.length > 0) {
    return `${EXERCISE_JOINT_LABEL[joint]}: today's ${loaded.names.slice(0, MIN_CARE_SUGGESTIONS).join(" and ")} load it.`;
  }
  if (joint && programJoints.has(joint)) return `${EXERCISE_JOINT_LABEL[joint]}: this program is tagged for it.`;
  if (sportMatch && sport) return `Tagged for ${sport}.`;
  return "A joint-care drill from the library.";
}
