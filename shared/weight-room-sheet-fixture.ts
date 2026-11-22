/* eslint-disable ts-patterns/no-magic-numbers -- test fixture data: ids, loads and reps are the example itself */
/* A weight-room sheet's source data for tests: a team, a day of lifts and a roster, built the way
 * server/weight-room-sheets.ts loadSheetDay builds it. Used by the shared, server and client tests
 * so every layer is checked against the same day. Not imported by any product code. */
import type { LoggedSet, SheetSource, SheetSourceAthlete, SheetSourceLift } from "./weight-room-sheet";

const BASE_LIFT: Omit<SheetSourceLift, "programExerciseId" | "exerciseId" | "name"> = {
  sets: 3,
  reps: "5",
  weight: "75%",
  restSeconds: null,
  notes: null,
  category: "strength",
  movementType: "Squat",
  equipment: "Barbell",
  laterality: "bilateral",
  usesWeight: true,
  usesBodyweight: false,
  supersetGroup: null,
  restAfterGroupOnly: false,
};

export function sheetLift(id: number, name: string, patch: Partial<SheetSourceLift> = {}): SheetSourceLift {
  return { ...BASE_LIFT, programExerciseId: id * 10, exerciseId: id, name, ...patch };
}

export function sheetAthlete(id: number, name: string, lifts: Record<string, { testedLbs?: number | null; history?: LoggedSet[] }> = {}, patch: Partial<SheetSourceAthlete> = {}): SheetSourceAthlete {
  return {
    athleteId: id,
    name,
    displayName: `${name.split(" ")[0]} ${name.split(" ").slice(-1)[0][0]}.`,
    position: null,
    groupLabel: null,
    onDay: true,
    lifts: Object.fromEntries(Object.entries(lifts).map(([k, v]) => [k, { testedLbs: v.testedLbs ?? null, history: v.history ?? [] }])),
    ...patch,
  };
}

export function sheetSource(patch: Partial<SheetSource> = {}): SheetSource {
  return {
    teamId: 12,
    teamName: "Varsity",
    date: "2026-11-21",
    programDayId: 345,
    dayTitle: "Lower A",
    programName: "Off-season",
    coachName: "Coach Rivera",
    phaseLine: "Accumulation, week 3 of 8",
    lighterWeek: false,
    qrUrl: "https://forgeperformancesystems.com/athlete/calendar?date=2026-11-21",
    coachUnit: "lbs",
    lifts: [
      sheetLift(1, "Back Squat"),
      sheetLift(2, "Romanian Deadlift", { movementType: "Hinge", weight: "70%", reps: "8" }),
      sheetLift(3, "Hamstring Curl", { category: "accessory", movementType: "Pull", equipment: "Machine", weight: null, reps: "12" }),
    ],
    athletes: [
      sheetAthlete(101, "Jordan Reyes", { "1": { testedLbs: 300, history: [{ date: "2026-11-14", weight: 225, reps: 5, unit: "lbs" }] } }),
      sheetAthlete(102, "Avery Brooks", { "1": { history: [{ date: "2026-11-10", weight: 200, reps: 5, unit: "lbs" }] } }),
      sheetAthlete(103, "Sam New"),
    ],
    ...patch,
  };
}
