/* WEIGHT ROOM STATION: how a station save becomes a whole-day save (2026-11-21).
 *
 * submitWorkoutLog REPLACES the day: it deletes every entry on the log and inserts what the
 * payload carries. So a station that sent only the sets typed on the tablet would delete
 * everything else on the athlete's day -- the sets they logged on their own phone, the camera
 * numbers on a filmed set, the corrective work. The station therefore never builds the payload
 * on the client. The server reads what the day holds, copies every stored set back as it is, and
 * lays the station's typed sets over it. This module is that merge, pure, so it can be tested
 * without a database.
 *
 * Three rules, each one a way to lose somebody's data if it were missing:
 *  - EVERY stored entry and set goes back. The stored set's own fields are copied by name from
 *    the save schema's field list (`setLogInputSchema`), never a hand-typed list, so a column
 *    added to the save path is carried the day it exists.
 *  - The three frame columns (skeleton frames, bar path, arm path) are OMITTED, which is the save
 *    path's own "carry the stored value forward" signal. They are megabytes and do not change.
 *  - A set that was FILMED is never overwritten from the station. The camera's reps and the
 *    numbers measured from them belong together; a typed rep count over them would leave a mean
 *    velocity computed from reps that no longer exist. The station reports it as skipped and the
 *    tile shows it as filmed on the athlete's phone.
 */
import { createHash } from "crypto";
import { CAMERA_DERIVED_SET_COLUMNS, setLogInputSchema, type SubmitWorkoutLogInput } from "@shared/schema";

/** The keys a station save may carry for a stored set. */
const FRAME_COLUMNS_CARRIED_BY_OMISSION = new Set(["skeletonFrames", "barPathTrace", "armPathTrace"]);
/** An instruction, never a stored value. */
const INSTRUCTION_KEYS = new Set(["removeFormCheckVideo"]);

export const CARRIED_SET_KEYS: readonly string[] = Object.keys(setLogInputSchema.shape).filter(
  (key) => !FRAME_COLUMNS_CARRIED_BY_OMISSION.has(key) && !INSTRUCTION_KEYS.has(key),
);

export type StoredSet = Record<string, unknown> & { setNumber: number };
export type StoredEntry = {
  programExerciseId: number | null;
  correctiveId: number | null;
  exerciseId: number | null;
  weightMode: "numeric" | "bodyweight" | "band" | "box";
  weightUnit?: "lbs" | "kg" | null;
  rpe: number | null;
  notes: string | null;
  sets: StoredSet[];
};
export type StationSet = {
  programExerciseId: number;
  setNumber: number;
  reps: string | null;
  weight: string | null;
  weightUnit: "lbs" | "kg";
};
export type DayExercise = {
  programExerciseId: number;
  exerciseId: number;
  weightMode: "numeric" | "bodyweight" | "band" | "box";
};

/** True when any camera-derived column on a stored set holds a value. */
export function setWasFilmed(set: Record<string, unknown>): boolean {
  return CAMERA_DERIVED_SET_COLUMNS.some((column) => set[column] != null);
}

function carriedSet(stored: StoredSet): Record<string, unknown> {
  return Object.fromEntries(
    CARRIED_SET_KEYS.filter((key) => stored[key] !== undefined).map((key) => [key, stored[key]]),
  );
}

const setKey = (programExerciseId: number, setNumber: number) => `${programExerciseId}:${setNumber}`;

export type StationMergeResult = {
  entries: SubmitWorkoutLogInput["entries"];
  /** Station sets that were written over the day. */
  written: number;
  /** Station sets that landed on a filmed set and were left as the camera recorded them. */
  skippedFilmed: { programExerciseId: number; setNumber: number }[];
  /** Station sets naming an exercise that is not on this day. */
  skippedUnknown: { programExerciseId: number; setNumber: number }[];
};

export function mergeStationSets(
  stored: StoredEntry[],
  station: StationSet[],
  dayExercises: DayExercise[],
): StationMergeResult {
  const onDay = new Map(dayExercises.map((e) => [e.programExerciseId, e]));
  const filmed = new Set(
    stored.flatMap((entry) =>
      entry.programExerciseId == null
        ? []
        : entry.sets.filter(setWasFilmed).map((s) => setKey(entry.programExerciseId as number, s.setNumber)),
    ),
  );
  const skippedFilmed = station.filter((s) => filmed.has(setKey(s.programExerciseId, s.setNumber)));
  const skippedUnknown = station.filter((s) => !onDay.has(s.programExerciseId));
  const usable = station.filter(
    (s) => onDay.has(s.programExerciseId) && !filmed.has(setKey(s.programExerciseId, s.setNumber)),
  );
  const typedFor = (programExerciseId: number) => usable.filter((s) => s.programExerciseId === programExerciseId);

  const storedEntries = stored.map((entry) => {
    const typed = entry.programExerciseId == null ? [] : typedFor(entry.programExerciseId);
    const typedByNumber = new Map(typed.map((s) => [s.setNumber, s]));
    const keptSets = entry.sets.map((s) => {
      const over = typedByNumber.get(s.setNumber);
      const base = carriedSet(s);
      return over ? { ...base, reps: over.reps, weight: over.weight } : base;
    });
    const storedNumbers = new Set(entry.sets.map((s) => s.setNumber));
    const newSets = typed
      .filter((s) => !storedNumbers.has(s.setNumber))
      .map((s) => ({ setNumber: s.setNumber, reps: s.reps, weight: s.weight }));
    const unit = typed[0]?.weightUnit ?? entry.weightUnit ?? null;
    return {
      ...(entry.programExerciseId != null ? { programExerciseId: entry.programExerciseId } : {}),
      ...(entry.correctiveId != null ? { correctiveId: entry.correctiveId } : {}),
      ...(entry.exerciseId != null ? { exerciseId: entry.exerciseId } : {}),
      weightMode: entry.weightMode,
      weightUnit: unit,
      rpe: entry.rpe,
      notes: entry.notes,
      sets: [...keptSets, ...newSets].sort((a, b) => Number(a.setNumber) - Number(b.setNumber)),
    };
  });

  const storedProgramExercises = new Set(stored.map((e) => e.programExerciseId).filter((id) => id != null));
  const freshEntries = dayExercises
    .filter((e) => !storedProgramExercises.has(e.programExerciseId) && typedFor(e.programExerciseId).length > 0)
    .map((e) => {
      const typed = typedFor(e.programExerciseId).sort((a, b) => a.setNumber - b.setNumber);
      return {
        programExerciseId: e.programExerciseId,
        exerciseId: e.exerciseId,
        weightMode: e.weightMode,
        weightUnit: typed[0].weightUnit,
        rpe: null,
        notes: null,
        sets: typed.map((s) => ({ setNumber: s.setNumber, reps: s.reps, weight: s.weight })),
      };
    });

  return {
    entries: [...storedEntries, ...freshEntries] as SubmitWorkoutLogInput["entries"],
    written: usable.length,
    skippedFilmed: skippedFilmed.map(({ programExerciseId, setNumber }) => ({ programExerciseId, setNumber })),
    skippedUnknown: skippedUnknown.map(({ programExerciseId, setNumber }) => ({ programExerciseId, setNumber })),
  };
}

const WEEK_DAYS = 7;
const MONDAY_OFFSET = 6;
const DAY_MS = 86_400_000;
const ISO_DATE_LENGTH = 10;

/** Only a display token's SHA-256 is stored; the raw token leaves the server once. */
export const hashDisplayToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The ISO Monday of the week holding `iso`, and `iso` itself, both as YYYY-MM-DD. */
export function weekWindow(iso: string): { start: string; end: string } {
  const day = new Date(`${iso}T00:00:00Z`);
  const sinceMonday = (day.getUTCDay() + MONDAY_OFFSET) % WEEK_DAYS;
  const start = new Date(day.getTime() - sinceMonday * DAY_MS).toISOString().slice(0, ISO_DATE_LENGTH);
  return { start, end: iso };
}

