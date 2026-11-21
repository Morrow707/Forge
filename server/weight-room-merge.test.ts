import { describe, expect, it } from "vitest";
import { CAMERA_DERIVED_SET_COLUMNS, setLogInputSchema } from "@shared/schema";
import { CARRIED_SET_KEYS, hashDisplayToken, mergeStationSets, setWasFilmed, weekWindow, type StoredEntry } from "./weight-room-merge";

/* The station's whole-day merge, with no database. submitWorkoutLog replaces the day, so the
 * merge is the only thing standing between a tablet save and the sets an athlete logged on
 * their phone. Each case below is a way the day could be lost. */

const SQUAT = 11;
const BENCH = 12;
const SQUAT_EXERCISE = 101;
const BENCH_EXERCISE = 102;
const FIRST = 1;
const SECOND = 2;
const THIRD = 3;
const FILMED_MPS = 0.74;
const DAY = [
  { programExerciseId: SQUAT, exerciseId: SQUAT_EXERCISE, weightMode: "numeric" as const },
  { programExerciseId: BENCH, exerciseId: BENCH_EXERCISE, weightMode: "numeric" as const },
];

function storedSquat(): StoredEntry {
  return {
    programExerciseId: SQUAT,
    correctiveId: null,
    exerciseId: SQUAT_EXERCISE,
    weightMode: "numeric",
    weightUnit: "lbs",
    rpe: 8,
    notes: "felt good",
    sets: [
      { setNumber: FIRST, reps: "5", weight: "185", id: 900, isPr: false, formCheckVideoUrl: "/uploads/form-videos/a.mov" },
      { setNumber: SECOND, reps: "5", weight: "205", meanVelocityMps: FILMED_MPS, skeletonFrames: [{ t: 0 }], barPathTrace: [{ t: 0 }] },
    ],
  };
}

describe("mergeStationSets", () => {
  it("carries every stored set back, keeps the clip, and omits the frame columns so the save path carries them", () => {
    const { entries } = mergeStationSets([storedSquat()], [], DAY);
    const sets = entries[0].sets as Record<string, unknown>[];
    expect(sets).toHaveLength(2);
    expect(sets[0].formCheckVideoUrl).toBe("/uploads/form-videos/a.mov");
    expect(sets[1].meanVelocityMps).toBe(FILMED_MPS);
    expect("skeletonFrames" in sets[1]).toBe(false);
    expect("barPathTrace" in sets[1]).toBe(false);
    // Row-only columns never go back as input.
    expect("id" in sets[0]).toBe(false);
    expect("isPr" in sets[0]).toBe(false);
    expect(entries[0]).toMatchObject({ rpe: 8, notes: "felt good", programExerciseId: SQUAT });
  });

  it("overwrites a hand-logged set, adds a new one, and never writes over a filmed set", () => {
    const result = mergeStationSets(
      [storedSquat()],
      [
        { programExerciseId: SQUAT, setNumber: FIRST, reps: "6", weight: "190", weightUnit: "lbs" },
        { programExerciseId: SQUAT, setNumber: SECOND, reps: "9", weight: "999", weightUnit: "lbs" },
        { programExerciseId: SQUAT, setNumber: THIRD, reps: "5", weight: "225", weightUnit: "lbs" },
      ],
      DAY,
    );
    const sets = result.entries[0].sets as Record<string, unknown>[];
    expect(sets.map((s) => [s.setNumber, s.reps, s.weight])).toEqual([
      [FIRST, "6", "190"],
      [SECOND, "5", "205"],
      [THIRD, "5", "225"],
    ]);
    expect(result.written).toBe(2);
    expect(result.skippedFilmed).toEqual([{ programExerciseId: SQUAT, setNumber: SECOND }]);
  });

  it("opens an entry for an exercise with nothing logged, and refuses one that is not on the day", () => {
    const result = mergeStationSets(
      [storedSquat()],
      [
        { programExerciseId: BENCH, setNumber: FIRST, reps: "8", weight: "60", weightUnit: "kg" },
        { programExerciseId: 999, setNumber: FIRST, reps: "8", weight: "60", weightUnit: "kg" },
      ],
      DAY,
    );
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1]).toMatchObject({ programExerciseId: BENCH, exerciseId: BENCH_EXERCISE, weightUnit: "kg" });
    expect(result.skippedUnknown).toEqual([{ programExerciseId: 999, setNumber: FIRST }]);
  });

  it("keeps a corrective entry the station never touches", () => {
    const corrective: StoredEntry = { ...storedSquat(), programExerciseId: null, correctiveId: 7, sets: [{ setNumber: FIRST, reps: "10", weight: null }] };
    const { entries } = mergeStationSets([corrective], [], DAY);
    expect(entries).toEqual([expect.objectContaining({ correctiveId: 7 })]);
    expect("programExerciseId" in entries[0]).toBe(false);
  });

  it("reads its carried keys from the save schema, so a new set column is carried the day it exists", () => {
    const schemaKeys = Object.keys(setLogInputSchema.shape);
    expect(CARRIED_SET_KEYS.length).toBe(schemaKeys.length - 4);
    expect(CARRIED_SET_KEYS).toContain("meanVelocityMps");
    expect(CARRIED_SET_KEYS).toContain("trackingDiagnostics");
  });

  it("calls a set filmed when any camera-derived column holds a value", () => {
    expect(setWasFilmed({ reps: "5" })).toBe(false);
    expect(CAMERA_DERIVED_SET_COLUMNS.every((c) => setWasFilmed({ [c]: 1 }))).toBe(true);
  });
});

describe("weight room helpers", () => {
  it("weeks start on Monday", () => {
    expect(weekWindow("2026-11-21")).toEqual({ start: "2026-11-16", end: "2026-11-21" });
    expect(weekWindow("2026-11-16")).toEqual({ start: "2026-11-16", end: "2026-11-16" });
    expect(weekWindow("2026-11-22")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  });
  it("never stores the raw display token", () => {
    expect(hashDisplayToken("abc")).not.toContain("abc");
    expect(hashDisplayToken("abc")).toHaveLength(64);
  });
});
