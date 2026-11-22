/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures */
import { describe, expect, it } from "vitest";
import {
  RAMP_DRAFT_NOTE,
  RAMP_MAX_MINUTES,
  RAMP_MIN_MINUTES,
  buildRampWarmup,
  estimateWarmupMinutes,
  normalizeWarmupBlock,
  rampPhaseOf,
  warmupDayContextOf,
  warmupFromProgramDays,
  warmupHasItems,
  warmupItemLine,
  warmupItemPrescription,
  warmupRatePercent,
  type WarmupCandidate,
} from "./program-day-warmup";
import { buildSheet, DEFAULT_SHEET_LAYOUT, EMPTY_DAY_EDITS, type SheetSource } from "./weight-room-sheet";

/* The warm-up on a program day (2026-11-22): the stored shape, the words, a drafted RAMP warm-up,
 * the copy from a warm-up program, and what the printed sheet does with a real block. */

const tagged = (id: number, name: string, category: string, extra: Partial<WarmupCandidate> = {}): WarmupCandidate => ({
  id,
  name,
  category,
  purposes: ["warmup"],
  ...extra,
});

describe("the stored block", () => {
  it("is null with nothing in it, and keeps every field of an item", () => {
    expect(normalizeWarmupBlock(null)).toBeNull();
    expect(normalizeWarmupBlock({ note: "  ", items: [] })).toBeNull();
    expect(normalizeWarmupBlock({ items: [{ exerciseId: 4, sets: 2, reps: " 10 ", durationSeconds: null, note: " slow " }] })).toEqual({
      note: null,
      items: [{ exerciseId: 4, sets: 2, reps: "10", durationSeconds: null, note: "slow" }],
    });
  });

  it("drops an item with no real exercise and clamps nonsense", () => {
    const block = normalizeWarmupBlock({ items: [{ exerciseId: 0 }, { exerciseId: 3, sets: -1, durationSeconds: 99999 }] });
    expect(block?.items).toEqual([{ exerciseId: 3, sets: null, reps: null, durationSeconds: 600, note: null }]);
  });

  it("a note alone is not a warm-up an athlete can do", () => {
    expect(warmupHasItems({ items: [] })).toBe(false);
    expect(warmupHasItems(null)).toBe(false);
    expect(warmupHasItems({ items: [{}] })).toBe(true);
  });
});

describe("the words", () => {
  it("prints sets by reps, a time, or a single count", () => {
    expect(warmupItemPrescription({ sets: 2, reps: "10", durationSeconds: null })).toBe("2 × 10");
    expect(warmupItemPrescription({ sets: null, reps: null, durationSeconds: 180 })).toBe("3 min");
    expect(warmupItemPrescription({ sets: 2, reps: null, durationSeconds: 30 })).toBe("2 × 30s");
    expect(warmupItemPrescription({ sets: 1, reps: "8 each side", durationSeconds: null })).toBe("8 each side");
    expect(warmupItemLine({ sets: 2, reps: "20", durationSeconds: null }, "Jumping Jacks")).toBe("Jumping Jacks 2 × 20");
  });

  it("the team rate is a whole percent, and nothing to count is null", () => {
    expect(warmupRatePercent({ withWarmup: 3, done: 2 })).toBe(67);
    expect(warmupRatePercent({ withWarmup: 0, done: 0 })).toBeNull();
  });
});

describe("a drafted RAMP warm-up", () => {
  const library = [
    tagged(1, "Bike", "conditioning"),
    tagged(2, "Glute Bridge", "accessory", { joints: ["hip"] }),
    tagged(3, "Band Pull-Apart", "accessory", { joints: ["shoulder"] }),
    tagged(4, "Mini-Band Walk", "accessory", { joints: ["hip", "knee"] }),
    tagged(5, "World's Greatest Stretch", "mobility", { joints: ["hip"] }),
    tagged(6, "Ankle Rocks", "mobility", { joints: ["ankle", "knee"] }),
    tagged(7, "Thoracic Rotation", "mobility", { joints: ["back"] }),
    tagged(8, "Pogo Hops", "plyometric", { joints: ["ankle"] }),
    { id: 9, name: "Back Squat", category: "strength", purposes: [] },
  ];

  it("is in RAMP order, from tagged drills only, sized 8 to 15 minutes", () => {
    const day = warmupDayContextOf([{ joints: ["knee", "hip"], bodyRegion: "Lower Body", muscleGroup: "Quads" }]);
    const block = buildRampWarmup(library, day);
    expect(block?.note).toBe(RAMP_DRAFT_NOTE);
    const ids = block!.items.map((i) => i.exerciseId);
    expect(ids).not.toContain(9);
    const phases = ids.map((id) => rampPhaseOf(library.find((e) => e.id === id)!));
    expect(phases).toEqual([...phases].sort((a, b) => ["raise", "activate", "mobilize", "potentiate"].indexOf(a) - ["raise", "activate", "mobilize", "potentiate"].indexOf(b)));
    expect(phases[0]).toBe("raise");
    const minutes = estimateWarmupMinutes(block!.items);
    expect(minutes).toBeGreaterThanOrEqual(RAMP_MIN_MINUTES);
    expect(minutes).toBeLessThanOrEqual(RAMP_MAX_MINUTES);
  });

  it("picks the drills that suit the day's joints first", () => {
    const lower = buildRampWarmup(library, warmupDayContextOf([{ joints: ["knee", "hip"] }]));
    const upper = buildRampWarmup(library, warmupDayContextOf([{ joints: ["shoulder"] }]));
    expect(lower!.items.map((i) => i.exerciseId)).toContain(4);
    expect(upper!.items.map((i) => i.exerciseId)).toContain(3);
  });

  it("with nothing tagged it drafts nothing rather than guessing", () => {
    expect(buildRampWarmup([{ id: 9, name: "Back Squat", category: "strength" }], warmupDayContextOf([]))).toBeNull();
  });
});

describe("Use a warm-up program", () => {
  it("copies the chosen days in order, a drill on two days once", () => {
    const block = warmupFromProgramDays([
      { exercises: [{ exerciseId: 1, sets: 1, reps: "3 min", notes: null }, { exerciseId: 2, sets: 2, reps: "10", notes: "squeeze" }] },
      { exercises: [{ exerciseId: 2, sets: 2, reps: "10", notes: null }, { exerciseId: 5, sets: 1, reps: "5", notes: null }] },
    ]);
    expect(block?.items.map((i) => i.exerciseId)).toEqual([1, 2, 5]);
    expect(block?.items[1]).toMatchObject({ sets: 2, reps: "10", note: "squeeze" });
  });
});

describe("the printed sheet's warm-up line", () => {
  const lift = (id: number, name: string, category: string) => ({
    programExerciseId: id,
    exerciseId: id,
    name,
    sets: 3,
    reps: "5",
    weight: null,
    restSeconds: null,
    notes: null,
    category,
    movementType: null,
    equipment: "Barbell",
    laterality: null,
    usesWeight: true,
    usesBodyweight: false,
    supersetGroup: null,
    restAfterGroupOnly: false,
  });
  const source = (warmupBlock: string[] | null): SheetSource => ({
    teamId: 1,
    teamName: "Varsity",
    date: "2026-11-22",
    programDayId: 1,
    dayTitle: "Lower",
    programName: "Fall",
    coachName: "Coach",
    phaseLine: null,
    lighterWeek: false,
    qrUrl: null,
    coachUnit: "lbs",
    lifts: [lift(1, "Hip Circles", "mobility"), lift(2, "Back Squat", "strength")],
    athletes: [],
    warmupBlock,
  });

  it("prints the day's real block and keeps every lift in the main work", () => {
    const model = buildSheet(source(["Bike 3 min", "Glute Bridge 2 × 10"]), DEFAULT_SHEET_LAYOUT, EMPTY_DAY_EDITS);
    expect(model.warmup).toEqual(["Bike 3 min", "Glute Bridge 2 × 10"]);
    expect(model.blocks.map((b) => b.name)).toEqual(expect.arrayContaining(["Hip Circles", "Back Squat"]));
  });

  it("with no block it falls back to the mobility-lift guess", () => {
    const model = buildSheet(source(null), DEFAULT_SHEET_LAYOUT, EMPTY_DAY_EDITS);
    expect(model.warmup).toEqual(["Hip Circles 3×5"]);
    expect(model.blocks.map((b) => b.name)).toEqual(["Back Squat"]);
  });

  it("the warm-up toggle still hides it", () => {
    const off = { ...DEFAULT_SHEET_LAYOUT, toggles: { ...DEFAULT_SHEET_LAYOUT.toggles, warmup: false } };
    expect(buildSheet(source(["Bike 3 min"]), off, EMPTY_DAY_EDITS).warmup).toBeNull();
  });
});
