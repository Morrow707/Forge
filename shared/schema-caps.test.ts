import { describe, it, expect } from "vitest";
import {
  setLogInputSchema,
  logEntryInputSchema,
  submitWorkoutLogSchema,
  submitWellnessCheckinSchema,
} from "./schema";
import { BODY_PAIN_PARTS } from "./wellness";

// These caps are the only thing standing between a single request and an
// unbounded capture payload landing in Postgres as jsonb, so each one is
// checked at the bound, one under, and one over -- an off-by-one either way
// is the whole failure mode.
function repeat<T>(make: (i: number) => T, n: number): T[] {
  return Array.from({ length: n }, (_, i) => make(i));
}

const barPathPoint = (i: number) => ({ t: i, x: i, y: i });
const skeletonLandmark = { x: 0, y: 0, z: 0, visibility: 1 };
const skeletonFrame = (i: number) => ({
  t: i,
  landmarks: [skeletonLandmark],
  worldLandmarks: [skeletonLandmark],
});
const repBreakdownEntry = (i: number) => ({
  repNumber: i + 1,
  peakVelocityMps: 1,
  meanVelocityMps: 0.8,
  concentricSeconds: 0.5,
  startT: i,
  endT: i + 1,
});
const legDriveEntry = (i: number) => ({
  repNumber: i + 1,
  leftDriveDegPerSec: 100,
  rightDriveDegPerSec: 90,
  asymmetryPercent: 10,
  dominantSide: "left" as const,
});
const armDriveEntry = (i: number) => ({
  repNumber: i + 1,
  leftVelocityMps: 3,
  rightVelocityMps: 2.7,
  asymmetryPercent: 10,
  dominantSide: "left" as const,
});
const setTrust = { score: 0.9, label: "high" as const, notes: [] };
const trustScore = (i: number) => ({ repNumber: i + 1, ...setTrust });
const jumpEntry = (i: number) => ({
  repNumber: i + 1,
  flightSeconds: 0.5,
  jumpHeightCm: 40,
  peakHeightCm: 42,
  horizontalDistanceCm: null,
  groundContactSeconds: null,
});
const medBallEntry = (i: number) => ({ repNumber: i + 1, peakSpeedMps: 12, trust: setTrust });
const formFault = (i: number) => ({ code: `f${i}`, label: `Fault ${i}` });

function baseSet(extra: Record<string, unknown> = {}) {
  return { setNumber: 1, ...extra };
}

describe("setLogInputSchema accepts a minimal set", () => {
  it("needs only a set number", () => {
    expect(setLogInputSchema.safeParse({ setNumber: 1 }).success).toBe(true);
  });

  it("rejects a set with no set number", () => {
    expect(setLogInputSchema.safeParse({}).success).toBe(false);
  });

  it("accepts null for every optional capture field", () => {
    const result = setLogInputSchema.safeParse(
      baseSet({ skeletonFrames: null, barPathTrace: null, repBreakdown: null, armPathTrace: null }),
    );
    expect(result.success).toBe(true);
  });
});

// [field, cap, element factory]
const arrayCaps: [string, number, (i: number) => unknown][] = [
  ["skeletonFrames", 3600, skeletonFrame],
  ["barPathTrace", 7200, barPathPoint],
  ["repBreakdown", 200, repBreakdownEntry],
  ["legDriveAsymmetry", 200, legDriveEntry],
  ["armDriveAsymmetry", 200, armDriveEntry],
  ["trustScores", 200, trustScore],
  ["jumpBreakdown", 200, jumpEntry],
  ["medBallRepBreakdown", 200, medBallEntry],
  ["formFaults", 50, formFault],
];

describe.each(arrayCaps)("setLogInputSchema cap on %s (%i)", (field, cap, make) => {
  it("accepts one under the cap", () => {
    expect(setLogInputSchema.safeParse(baseSet({ [field]: repeat(make, cap - 1) })).success).toBe(true);
  });

  it("accepts exactly the cap", () => {
    expect(setLogInputSchema.safeParse(baseSet({ [field]: repeat(make, cap) })).success).toBe(true);
  });

  it("rejects one over the cap", () => {
    const result = setLogInputSchema.safeParse(baseSet({ [field]: repeat(make, cap + 1) }));
    expect(result.success).toBe(false);
  });

  it("rejects a payload far over the cap", () => {
    expect(setLogInputSchema.safeParse(baseSet({ [field]: repeat(make, cap * 3) })).success).toBe(false);
  });

  it("accepts an empty array", () => {
    expect(setLogInputSchema.safeParse(baseSet({ [field]: [] })).success).toBe(true);
  });
});

describe("armPathTrace caps each side at 7200 independently", () => {
  const at = (n: number) => repeat(barPathPoint, n);

  it("accepts both sides exactly at the cap", () => {
    expect(setLogInputSchema.safeParse(baseSet({ armPathTrace: { left: at(7200), right: at(7200) } })).success).toBe(true);
  });

  it("rejects an over-cap left side", () => {
    expect(setLogInputSchema.safeParse(baseSet({ armPathTrace: { left: at(7201), right: at(1) } })).success).toBe(false);
  });

  it("rejects an over-cap right side", () => {
    expect(setLogInputSchema.safeParse(baseSet({ armPathTrace: { left: at(1), right: at(7201) } })).success).toBe(false);
  });

  it("requires both sides to be present", () => {
    expect(setLogInputSchema.safeParse(baseSet({ armPathTrace: { left: at(1) } })).success).toBe(false);
  });
});

describe("setLogInputSchema field-level guards", () => {
  it("caps the form-check video URL at 500 characters", () => {
    expect(setLogInputSchema.safeParse(baseSet({ formCheckVideoUrl: "a".repeat(500) })).success).toBe(true);
    expect(setLogInputSchema.safeParse(baseSet({ formCheckVideoUrl: "a".repeat(501) })).success).toBe(false);
  });

  it("trims the video URL before applying the cap", () => {
    const parsed = setLogInputSchema.parse(baseSet({ formCheckVideoUrl: "  /uploads/form-videos/a.mp4  " }));
    expect(parsed.formCheckVideoUrl).toBe("/uploads/form-videos/a.mp4");
  });

  it("restricts formCheckFlag to best or worst", () => {
    expect(setLogInputSchema.safeParse(baseSet({ formCheckFlag: "best" })).success).toBe(true);
    expect(setLogInputSchema.safeParse(baseSet({ formCheckFlag: "worst" })).success).toBe(true);
    expect(setLogInputSchema.safeParse(baseSet({ formCheckFlag: "middling" })).success).toBe(false);
  });

  it("restricts boxHeightUnit to in or m", () => {
    expect(setLogInputSchema.safeParse(baseSet({ boxHeightUnit: "in" })).success).toBe(true);
    expect(setLogInputSchema.safeParse(baseSet({ boxHeightUnit: "cm" })).success).toBe(false);
  });

  it("drops isPr and pendingDeletionAt, which a client must never be able to set", () => {
    const parsed = setLogInputSchema.parse(baseSet({ isPr: true, pendingDeletionAt: "2026-01-01" }) as never);
    expect(parsed).not.toHaveProperty("isPr");
    expect(parsed).not.toHaveProperty("pendingDeletionAt");
  });
});

describe("logEntryInputSchema cap on sets (100)", () => {
  const entry = (n: number) => ({
    programExerciseId: 1,
    sets: repeat(() => ({ setNumber: 1 }), n),
  });

  it("accepts 99 sets", () => expect(logEntryInputSchema.safeParse(entry(99)).success).toBe(true));
  it("accepts exactly 100 sets", () => expect(logEntryInputSchema.safeParse(entry(100)).success).toBe(true));
  it("rejects 101 sets", () => expect(logEntryInputSchema.safeParse(entry(101)).success).toBe(false));

  it("defaults sets to an empty array", () => {
    expect(logEntryInputSchema.parse({ programExerciseId: 1 }).sets).toEqual([]);
  });

  it("requires exactly one of programExerciseId or correctiveId", () => {
    expect(logEntryInputSchema.safeParse({ programExerciseId: 1 }).success).toBe(true);
    expect(logEntryInputSchema.safeParse({ correctiveId: 1 }).success).toBe(true);
    expect(logEntryInputSchema.safeParse({ programExerciseId: 1, correctiveId: 2 }).success).toBe(false);
    expect(logEntryInputSchema.safeParse({}).success).toBe(false);
  });

  it("defaults weightMode to numeric and leaves weightUnit unset", () => {
    const parsed = logEntryInputSchema.parse({ programExerciseId: 1 });
    expect(parsed.weightMode).toBe("numeric");
    expect(parsed.weightUnit).toBeUndefined();
  });
});

describe("submitWorkoutLogSchema cap on entries (100)", () => {
  const log = (n: number) => ({
    assignmentId: 1,
    programDayId: 1,
    date: "2026-01-01",
    entries: repeat(() => ({ programExerciseId: 1, sets: [] }), n),
  });

  it("accepts 99 entries", () => expect(submitWorkoutLogSchema.safeParse(log(99)).success).toBe(true));
  it("accepts exactly 100 entries", () => expect(submitWorkoutLogSchema.safeParse(log(100)).success).toBe(true));
  it("rejects 101 entries", () => expect(submitWorkoutLogSchema.safeParse(log(101)).success).toBe(false));

  it("stops the caps being multiplied out across nesting levels", () => {
    // 100 entries x 101 sets: the inner cap has to bite even though the
    // outer one is satisfied.
    const oversized = {
      assignmentId: 1,
      programDayId: 1,
      date: "2026-01-01",
      entries: repeat(() => ({ programExerciseId: 1, sets: repeat(() => ({ setNumber: 1 }), 101) }), 100),
    };
    expect(submitWorkoutLogSchema.safeParse(oversized).success).toBe(false);
  });

  it("defaults completed to false and entries to empty", () => {
    const parsed = submitWorkoutLogSchema.parse({ assignmentId: 1, programDayId: 1, date: "2026-01-01" });
    expect(parsed.completed).toBe(false);
    expect(parsed.entries).toEqual([]);
  });
});

describe("submitWellnessCheckinSchema", () => {
  const valid = { sleepHours: 8, soreness: 2, stress: 2 };

  it("accepts a check-in with no date, keeping the old server's-today behavior", () => {
    const parsed = submitWellnessCheckinSchema.parse(valid);
    expect(parsed.date).toBeUndefined();
  });

  it("accepts a well-formed date", () => {
    expect(submitWellnessCheckinSchema.parse({ ...valid, date: "2026-01-31" }).date).toBe("2026-01-31");
  });

  const badDates = [
    "2026-1-1",
    "26-01-01",
    "2026/01/01",
    "2026-01-01T00:00:00Z",
    " 2026-01-01",
    "2026-01-01 ",
    "20260101",
    "",
    "not-a-date",
  ];
  for (const date of badDates) {
    it(`rejects the date ${JSON.stringify(date)}`, () => {
      const result = submitWellnessCheckinSchema.safeParse({ ...valid, date });
      expect(result.success).toBe(false);
    });
  }

  it("rejects a non-string date", () => {
    expect(submitWellnessCheckinSchema.safeParse({ ...valid, date: 20260101 }).success).toBe(false);
    expect(submitWellnessCheckinSchema.safeParse({ ...valid, date: null }).success).toBe(false);
  });

  // The regex is shape-only by design -- the route bounds the value against
  // the server's own date, which is where an out-of-range day is caught.
  it("accepts a shape-valid but calendar-impossible date, leaving the range check to the route", () => {
    expect(submitWellnessCheckinSchema.safeParse({ ...valid, date: "2026-13-45" }).success).toBe(true);
  });

  it("bounds sleep hours to a real day", () => {
    for (const sleepHours of [0, 8, 24]) {
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, sleepHours }).success).toBe(true);
    }
    for (const sleepHours of [-1, 24.1, 25]) {
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, sleepHours }).success).toBe(false);
    }
  });

  it("holds the 1-5 scales to integers in range", () => {
    for (const field of ["soreness", "stress", "hydration", "mentalFocus"]) {
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, [field]: 1 }).success).toBe(true);
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, [field]: 5 }).success).toBe(true);
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, [field]: 0 }).success).toBe(false);
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, [field]: 6 }).success).toBe(false);
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, [field]: 3.5 }).success).toBe(false);
    }
  });

  it("defaults hydration, mental focus and the pain map", () => {
    const parsed = submitWellnessCheckinSchema.parse(valid);
    expect(parsed.hydration).toBe(3);
    expect(parsed.mentalFocus).toBe(3);
    expect(parsed.bodyPainMap).toEqual([]);
  });

  it("caps the pain map at the number of body parts that exist", () => {
    const parts = BODY_PAIN_PARTS.map((p) => p.key);
    expect(submitWellnessCheckinSchema.safeParse({ ...valid, bodyPainMap: parts }).success).toBe(true);
    expect(submitWellnessCheckinSchema.safeParse({ ...valid, bodyPainMap: [...parts, "knee_left"] }).success).toBe(false);
  });

  const optionalRanges: [string, number, number][] = [
    ["restingHeartRate", 20, 220],
    ["hrv", 0, 300],
    ["vo2Max", 10, 90],
    ["respiratoryRate", 4, 60],
    ["bodyMass", 20, 400],
    ["heartRateRecovery", 0, 100],
  ];
  describe.each(optionalRanges)("%s bounds", (field, min, max) => {
    it("accepts both ends of the range", () => {
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, [field]: min }).success).toBe(true);
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, [field]: max }).success).toBe(true);
    });

    it("rejects just outside either end", () => {
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, [field]: min - 1 }).success).toBe(false);
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, [field]: max + 1 }).success).toBe(false);
    });

    it("accepts null and undefined, since the field is nullish", () => {
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, [field]: null }).success).toBe(true);
      expect(submitWellnessCheckinSchema.safeParse({ ...valid, [field]: undefined }).success).toBe(true);
    });
  });

  it("requires sleep, soreness and stress", () => {
    expect(submitWellnessCheckinSchema.safeParse({ soreness: 2, stress: 2 }).success).toBe(false);
    expect(submitWellnessCheckinSchema.safeParse({ sleepHours: 8, stress: 2 }).success).toBe(false);
    expect(submitWellnessCheckinSchema.safeParse({ sleepHours: 8, soreness: 2 }).success).toBe(false);
  });
});
