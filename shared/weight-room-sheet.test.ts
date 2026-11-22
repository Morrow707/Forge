/* eslint-disable ts-patterns/no-magic-numbers -- test values: the loads, reps and ids are the examples being checked */
import { describe, expect, it } from "vitest";
import {
  CARDS_PER_PAGE,
  DEFAULT_SHEET_LAYOUT,
  EMPTY_DAY_EDITS,
  MIN_BOX_WIDTH_PT,
  SHEET_TOGGLE_KEYS,
  STANDARD_REST,
  acrossBands,
  bestEstimatedMax,
  boxesFor,
  buildSheet,
  decodeSheetCode,
  defaultLiftOrder,
  deriveGoal,
  encodeSheetCode,
  lastTimeLabel,
  liftsOutOfUsualOrder,
  matchAthleteName,
  matchLift,
  paginate,
  parseIntensity,
  parseSetCell,
  platesLabel,
  platesPerSide,
  prescriptionChanges,
  prescriptionVersion,
  presenceFromSets,
  restLabel,
  sheetLayoutSchema,
  supersetLabels,
  supersetRestLine,
  targetLoad,
  wouldBePr,
  type SheetLayout,
} from "./weight-room-sheet";
import { sheetAthlete, sheetLift, sheetSource } from "./weight-room-sheet-fixture";

const layout = (patch: Partial<SheetLayout> = {}): SheetLayout => ({ ...DEFAULT_SHEET_LAYOUT, ...patch });

describe("the goal of a lift, from the field's standard bands", () => {
  it("reads the program's own word first", () => {
    expect(deriveGoal({ reps: "10", percent: 70, notes: "Strength focus today" })).toEqual({ goal: "strength", source: "program" });
  });
  it("power is 1-5 reps at a lighter load, or an Olympic or plyometric lift", () => {
    expect(deriveGoal({ reps: "3", percent: 70 })?.goal).toBe("power");
    expect(deriveGoal({ reps: "3", percent: null, category: "olympic" })?.goal).toBe("power");
  });
  it("strength is up to 6 reps at 85% or more (or no % given)", () => {
    expect(deriveGoal({ reps: "5", percent: 85 })?.goal).toBe("strength");
    expect(deriveGoal({ reps: "6", percent: null })?.goal).toBe("strength");
  });
  it("hypertrophy is 6-12 reps; endurance is past 12 or 12 at 67% or less", () => {
    expect(deriveGoal({ reps: "8-10", percent: 75 })?.goal).toBe("hypertrophy");
    expect(deriveGoal({ reps: "15", percent: null })?.goal).toBe("endurance");
    expect(deriveGoal({ reps: "12", percent: 60 })?.goal).toBe("endurance");
    expect(deriveGoal({ reps: "12", percent: 70 })?.goal).toBe("hypertrophy");
  });
  it("says nothing for a timed set with no load", () => {
    expect(deriveGoal({ reps: "30s", percent: null })).toBeNull();
  });
});

describe("rest between sets", () => {
  it("the program's rest wins, written as a person would", () => {
    expect(restLabel(90, "strength")).toBe("1:30");
    expect(restLabel(120, "hypertrophy")).toBe("2 min");
    expect(restLabel(45, null)).toBe("45 s");
  });
  it("otherwise the goal's standard rest", () => {
    expect(restLabel(null, "power")).toBe(STANDARD_REST.power);
    expect(restLabel(null, "strength")).toBe("2-5 min");
    expect(restLabel(null, "hypertrophy")).toBe("30-90 s");
    expect(restLabel(null, "endurance")).toBe("30 s or less");
    expect(restLabel(null, null)).toBe("");
  });
});

describe("loads", () => {
  it("reads % and RPE out of a prescribed load", () => {
    expect(parseIntensity("@ 82.5% 1RM")).toEqual({ percent: 82.5, rpe: null });
    expect(parseIntensity("RPE 8")).toEqual({ percent: null, rpe: 8 });
  });
  it("rounds a target to 5 lb or 2.5 kg, and has none without a max or a %", () => {
    expect(targetLoad(300, 75, "lbs")).toBe(225);
    expect(targetLoad(301, 77, "lbs")).toBe(230);
    expect(targetLoad(140, 77, "kg")).toBe(107.5);
    expect(targetLoad(null, 75, "lbs")).toBeNull();
    expect(targetLoad(300, null, "lbs")).toBeNull();
  });
  it("plates per side on a 45 lb bar with the standard set, and on a 20 kg bar", () => {
    expect(platesPerSide(185, 45, [45, 35, 25, 10, 5, 2.5])).toEqual({ plates: [45, 25], remainder: 0 });
    expect(platesLabel(185, 45, [45, 35, 25, 10, 5, 2.5])).toBe("185 = 45+25 per side");
    expect(platesPerSide(100, 20, [25, 20, 15, 10, 5, 2.5, 1.25])).toEqual({ plates: [25, 15], remainder: 0 });
    expect(platesLabel(45, 45, [45])).toBe("bar only");
    expect(platesLabel(187, 45, [45, 35, 25, 10, 5, 2.5])).toContain("short");
  });
  it("last time is the heaviest set of the most recent session before the sheet's day", () => {
    const history = [
      { date: "2026-11-10", weight: 245, reps: 3, unit: "lbs" as const },
      { date: "2026-11-14", weight: 225, reps: 5, unit: "lbs" as const },
      { date: "2026-11-14", weight: 215, reps: 5, unit: "lbs" as const },
      { date: "2026-11-21", weight: 300, reps: 1, unit: "lbs" as const },
    ];
    expect(lastTimeLabel(history, "2026-11-21", "lbs")).toBe("225×5");
    expect(lastTimeLabel([], "2026-11-21", "lbs")).toBe("");
  });
  it("a star only where the target would beat the athlete's best estimated max", () => {
    const best = bestEstimatedMax([{ date: "2026-11-14", weight: 225, reps: 5, unit: "lbs" }], "2026-11-21", "lbs");
    expect(best).toBeCloseTo(262.5);
    expect(wouldBePr(235, "5", best)).toBe(true);
    expect(wouldBePr(225, "5", best)).toBe(false);
    expect(wouldBePr(235, "5", null)).toBe(false);
    expect(wouldBePr(100, "20", 50)).toBe(false);
  });
});

describe("supersets", () => {
  const day = [
    { supersetGroup: null },
    { supersetGroup: "g1", restAfterGroupOnly: true },
    { supersetGroup: "g1", restAfterGroupOnly: true },
    { supersetGroup: null },
    { supersetGroup: "g2" },
    { supersetGroup: "g2" },
  ];
  it("labels A, B1, B2, C, D1, D2", () => {
    expect(supersetLabels(day).map((s) => s.label)).toEqual(["A", "B1", "B2", "C", "D1", "D2"]);
  });
  it("rests once after the group, or between each", () => {
    const slots = supersetLabels(day);
    expect(supersetRestLine(slots[1], "90 s")).toBe("");
    expect(supersetRestLine(slots[2], "90 s")).toBe("Rest 90 s after B2");
    expect(supersetRestLine(slots[5], "90 s")).toBe("Rest 90 s between each");
  });
});

describe("lift order", () => {
  it("power first, then multi-joint, then single-joint", () => {
    const lifts = [
      { name: "Curl", category: "accessory", movementType: "Pull" },
      { name: "Squat", category: "strength", movementType: "Squat" },
      { name: "Clean", category: "olympic", movementType: "Combination" },
    ];
    expect(defaultLiftOrder(lifts).map((l) => l.name)).toEqual(["Clean", "Squat", "Curl"]);
    expect(liftsOutOfUsualOrder(lifts)).toBe(true);
  });
  it("keeps the program's order when the library cannot classify a lift", () => {
    const lifts = [{ name: "B", category: "conditioning" }, { name: "A", category: "olympic" }];
    expect(defaultLiftOrder(lifts).map((l) => l.name)).toEqual(["B", "A"]);
    expect(liftsOutOfUsualOrder(lifts)).toBe(false);
  });
});

describe("boxes by exercise type", () => {
  const base = { movementType: null, laterality: null, usesWeight: true, usesBodyweight: false };
  it("time, distance, hold, L/R and BW", () => {
    expect(boxesFor({ ...base, reps: "30s" }).kind).toBe("time");
    expect(boxesFor({ ...base, reps: "40yd" }).kind).toBe("distance");
    expect(boxesFor({ ...base, reps: "45s", movementType: "Isometric" }).kind).toBe("hold");
    expect(boxesFor({ ...base, reps: "8", laterality: "unilateral" }).sides).toBe(true);
    expect(boxesFor({ ...base, reps: "10", usesWeight: false, usesBodyweight: true }).bodyweight).toBe(true);
    expect(boxesFor({ ...base, reps: "5" })).toEqual({ kind: "load", sides: false, bodyweight: false });
  });
});

describe("the sheet code", () => {
  it("round-trips team, date, program day and version, and refuses a misread", () => {
    const code = encodeSheetCode(12, "2026-11-21", 345, "0A1B2");
    expect(decodeSheetCode(`printed: ${code}`)).toEqual({ teamId: 12, date: "2026-11-21", programDayId: 345, version: "0A1B2" });
    const misread = code.replace("-C-", "-D-");
    expect(decodeSheetCode(misread)).toBeNull();
    expect(decodeSheetCode("nothing here")).toBeNull();
  });
  it("the version moves when the prescription does, and the changes are said", () => {
    const lifts = [{ programExerciseId: 1, exerciseId: 1, sets: 3, reps: "5", weight: "75%", restSeconds: null }];
    expect(prescriptionVersion(lifts)).toBe(prescriptionVersion([...lifts]));
    expect(prescriptionVersion(lifts)).not.toBe(prescriptionVersion([{ ...lifts[0], reps: "3" }]));
    expect(prescriptionChanges([{ programExerciseId: 1, name: "Squat", sets: 3, reps: "5", weight: null }], [{ programExerciseId: 1, name: "Squat", sets: 4, reps: "5", weight: null }])).toEqual([
      "Squat: printed 3×5, now 4×5.",
    ]);
  });
});

describe("paging a big roster", () => {
  it("cards are four to a page, never split", () => {
    const pages = paginate(Array.from({ length: 10 }, (_, i) => i), CARDS_PER_PAGE);
    expect(pages.map((p) => p.length)).toEqual([4, 4, 2]);
  });
  it("athletes across: 3 lifts fit one band, 8 lifts wrap onto more bands, no box under the minimum", () => {
    const width = 720;
    const three = acrossBands([5, 5, 5], width);
    expect(three).toEqual([[0, 1, 2]]);
    const eight = acrossBands(Array.from({ length: 8 }, () => 5), width);
    expect(eight.length).toBeGreaterThan(1);
    expect(eight.flat()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    eight.forEach((band) => expect(width / band.reduce((n) => n + 5, 0)).toBeGreaterThanOrEqual(MIN_BOX_WIDTH_PT));
  });
});

describe("reading names and lifts off a sheet, never guessing", () => {
  const roster = [
    { id: 1, name: "Michael Jordan" },
    { id: 2, name: "Michael Smith" },
    { id: 3, name: "Avery Brooks" },
  ];
  it("matches a full name, a nickname with an initial, and a unique first name", () => {
    expect(matchAthleteName("Michael Jordan", roster)).toEqual({ status: "matched", athleteId: 1 });
    expect(matchAthleteName("Mike J.", roster)).toEqual({ status: "matched", athleteId: 1 });
    expect(matchAthleteName("avery", roster)).toEqual({ status: "matched", athleteId: 3 });
  });
  it("two Michaels is ambiguous; a name not on the roster is unmatched", () => {
    expect(matchAthleteName("Mike", roster)).toEqual({ status: "ambiguous", candidateIds: [1, 2] });
    expect(matchAthleteName("Stranger Danger", roster)).toEqual({ status: "unmatched" });
  });
  it("reads lift shorthand against the day's own lifts", () => {
    const day = [
      { programExerciseId: 10, name: "Back Squat" },
      { programExerciseId: 20, name: "Front Squat" },
      { programExerciseId: 30, name: "Romanian Deadlift" },
    ];
    expect(matchLift("BS", day)).toEqual({ status: "matched", programExerciseId: 10 });
    expect(matchLift("RDL", day)).toEqual({ status: "matched", programExerciseId: 30 });
    expect(matchLift("squat", day).status).not.toBe("unmatched");
    expect(matchLift("Pull-Up", day)).toEqual({ status: "unmatched" });
  });
  it("reads every set notation", () => {
    expect(parseSetCell("225x5")?.sets).toEqual([{ reps: "5", weight: "225", unit: null }]);
    expect(parseSetCell("225/5")?.sets[0]).toEqual({ reps: "5", weight: "225", unit: null });
    expect(parseSetCell("5@225")?.sets[0]).toEqual({ reps: "5", weight: "225", unit: null });
    expect(parseSetCell("3x5 225")?.sets).toHaveLength(3);
    expect(parseSetCell("8", "185")?.sets[0]).toEqual({ reps: "8", weight: "185", unit: null });
    expect(parseSetCell("||||")?.sets[0].reps).toBe("4");
    expect(parseSetCell("100kg x 5")?.sets[0]).toEqual({ reps: "5", weight: "100", unit: "kg" });
    expect(parseSetCell("5x5")?.uncertain).toBe(true);
    expect(parseSetCell("good")).toBeNull();
  });
  it("attendance comes from the numbers alone: a set is present, nothing is not marked, never absent", () => {
    expect(presenceFromSets(1)).toBe("present");
    expect(presenceFromSets(0)).toBe("not_marked");
  });
});

describe("the sheet model", () => {
  it("fills every athlete in from Forge's data, with no typing", () => {
    const model = buildSheet(sheetSource(), layout({ toggles: { ...DEFAULT_SHEET_LAYOUT.toggles, max: true } }), EMPTY_DAY_EDITS);
    const squat = model.blocks.findIndex((b) => b.name === "Back Squat");
    const jordan = model.groups[0].rows.find((r) => r.athleteId === 101)!;
    expect(jordan.cells[squat].max).toBe("300 lb");
    expect(jordan.cells[squat].target).toBe("225 lb");
    expect(jordan.cells[squat].last).toBe("225×5");
    expect(jordan.cells[squat].plates).toBe("225 = 45+45 per side");
    const sam = model.groups[0].rows.find((r) => r.athleteId === 103)!;
    expect(sam.cells[squat].max).toBe("—");
    expect(sam.cells[squat].target).toBe("—");
    expect(sam.cells[squat].last).toBe("");
  });
  it("sorts by last name and groups by position, each group its own page", () => {
    const source = sheetSource({
      athletes: [
        sheetAthlete(1, "Zed Adams", {}, { position: "WR" }),
        sheetAthlete(2, "Amy Zulu", {}, { position: "QB" }),
        sheetAthlete(3, "Bo Brown", {}, { position: "WR" }),
      ],
    });
    const model = buildSheet(source, layout({ groupBy: "position" }), EMPTY_DAY_EDITS);
    expect(model.groups.map((g) => g.label)).toEqual(["QB", "WR"]);
    expect(model.groups[1].rows.map((r) => r.athleteId)).toEqual([1, 3]);
  });
  it("one athlete's typed target applies to that athlete only and is marked changed", () => {
    const edits = { ...EMPTY_DAY_EDITS, targetOverrides: { "102": { "1": "205 lb" } } };
    const model = buildSheet(sheetSource(), DEFAULT_SHEET_LAYOUT, edits);
    const rows = model.groups[0].rows;
    expect(rows.find((r) => r.athleteId === 102)!.cells[0].targetChanged).toBe(true);
    expect(rows.find((r) => r.athleteId === 101)!.cells[0].targetChanged).toBe(false);
  });
  it("a lift for a bodyweight move prints BW", () => {
    const source = sheetSource({ lifts: [sheetLift(9, "Push-Up", { usesWeight: false, usesBodyweight: true, equipment: "Bodyweight", weight: null })] });
    expect(buildSheet(source, DEFAULT_SHEET_LAYOUT, EMPTY_DAY_EDITS).groups[0].rows[0].cells[0].target).toBe("BW");
  });
  it("every toggle can be turned off, and what it controls disappears from the model", () => {
    const on = layout({ toggles: Object.fromEntries(SHEET_TOGGLE_KEYS.map((k) => [k, true])) as SheetLayout["toggles"] });
    const off = layout({ toggles: Object.fromEntries(SHEET_TOGGLE_KEYS.map((k) => [k, false])) as SheetLayout["toggles"] });
    const source = sheetSource({
      lifts: [
        sheetLift(3, "Hamstring Curl", { category: "accessory", movementType: "Pull", notes: "Slow down", supersetGroup: "g" }),
        sheetLift(1, "Back Squat", { supersetGroup: "g" }),
        sheetLift(7, "Band Pull-Apart", { category: "mobility", movementType: "Activation" }),
      ],
    });
    const full = buildSheet(source, { ...on, liftOrder: [3, 1] }, { ...EMPTY_DAY_EDITS, note: "Hydrate" });
    expect(full.code && full.qrUrl && full.note && full.phaseLine && full.warmup && full.orderNote).toBeTruthy();
    expect(full.blocks[0].goal && full.blocks[0].effort && full.blocks[0].slot && full.blocks[0].cues).toBeTruthy();
    const bare = buildSheet(source, { ...off, liftOrder: [3, 1] }, { ...EMPTY_DAY_EDITS, note: "Hydrate" });
    expect([bare.code, bare.qrUrl, bare.note, bare.phaseLine, bare.warmup, bare.orderNote]).toEqual([null, null, null, null, null, null]);
    expect(bare.coachNotes).toBe(false);
    expect(bare.boldTargets).toBe(false);
    bare.blocks.forEach((b) => expect([b.goal, b.rest, b.effort, b.slot, b.cues, b.superset]).toEqual([null, null, null, null, null, null]));
    bare.groups.flatMap((g) => g.rows).flatMap((r) => r.cells).forEach((c) => {
      expect([c.max, c.target, c.last, c.plates, c.pr]).toEqual([null, null, null, null, false]);
    });
  });
  it("the max column is off by default, the coach notes strip is off, and athletes-across drops last time and plates", () => {
    expect(DEFAULT_SHEET_LAYOUT.toggles.max).toBe(false);
    expect(DEFAULT_SHEET_LAYOUT.toggles.coachNotes).toBe(false);
    const model = buildSheet(sheetSource(), layout({ view: "across" }), EMPTY_DAY_EDITS);
    expect(model.orientation).toBe("landscape");
    model.groups[0].rows.forEach((r) => r.cells.forEach((c) => expect([c.last, c.plates]).toEqual([null, null])));
  });
});

describe("branding is not the sheet's to change", () => {
  it("a saved layout refuses any branding field", () => {
    ["brandPrimaryColor", "brandLogoUrl", "brandTeamName", "brandHeadingFont"].forEach((field) => {
      expect(sheetLayoutSchema.safeParse({ [field]: "x" }).success).toBe(false);
    });
  });
});
