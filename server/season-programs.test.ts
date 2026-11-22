/**
 * THE FORGE SEASON PROGRAM FILES, CHECKED WITHOUT A DATABASE (2026-11-22).
 *
 * Every group file in server/seed-data/season-programs/ is read from the folder (the folder is
 * the list, so a file dropped in later is covered the day it lands) and every exercise name in it is
 * held against the library a coach can SEE: the names seed.ts creates, minus what the library
 * review hid, plus what it added and the throwing-workload exercises. An unresolved name here is
 * one the production seed would skip with a log line.
 *
 * Then the conversion (server/season-program-structure.ts) and the layer rules
 * (shared/season-program-layers.ts) are driven directly.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIBRARY_REVIEW_EXERCISES } from "./seed-data/library-review-2026-11-22";
import { HIDDEN_EXERCISE_NAMES } from "@shared/library-review-2026-11-22";
import { BULLPEN_EXERCISE, CATCHING_GAME_EXERCISE, PITCHING_GAME_EXERCISE } from "@shared/throwing-workload";
import { readSeasonProgramFile, seasonProgramFiles } from "./season-program-files";
import { CARE_NOTE, convertSeasonProgram, exerciseNamesIn, parseRestSeconds, type FileProgram } from "./season-program-structure";
import { GIRLS_TEAM_LABEL, layersForSetup, positionLabel, swapsForDay } from "@shared/season-program-layers";

const SEED = readFileSync(join(import.meta.dirname, "seed.ts"), "utf8");
const LIBRARY_ARRAYS = ["seedExercises", "combinationExercises", "expansionExercises"] as const;

// A library entry's name inside one array: `{ name: "Back Squat",` -> "Back Squat". Rejects a
// name written without the opening brace on its line ("  name: x") and a single-quoted name.
// https://regex101.com/?regex=%5C%7B%5Cs*name%3A%5Cs*%22(%5B%5E%22%5D%2B)%22&flags=g&testString=%7B%20name%3A%20%22Back%20Squat%22%2C
const ENTRY_NAME = /\{\s*name:\s*"([^"]+)"/g;

const BRACKET_STEP: Record<string, number> = { "[": 1, "]": -1 };

/** One array's literal, bounded by matching its own brackets (never a character window). */
function arrayLiteral(src: string, constName: string): string {
  const start = src.indexOf(`const ${constName}`);
  if (start < 0) throw new Error(`seed.ts has no ${constName}`);
  const open = src.indexOf("[", src.indexOf("=", start));
  const close = Array.from(src.slice(open)).reduce<{ depth: number; at: number | null }>(
    (acc, ch, i) => {
      if (acc.at != null) return acc;
      const depth = acc.depth + (BRACKET_STEP[ch] ?? 0);
      return { depth, at: depth === 0 ? open + i : null };
    },
    { depth: 0, at: null },
  ).at;
  if (close == null) throw new Error(`${constName} never closes`);
  return src.slice(open, close + 1);
}

const SEEDED = LIBRARY_ARRAYS.flatMap((n) => Array.from(arrayLiteral(SEED, n).matchAll(ENTRY_NAME), (m) => m[1]));
const VISIBLE = new Set([
  ...SEEDED.filter((n) => !HIDDEN_EXERCISE_NAMES.has(n)),
  ...LIBRARY_REVIEW_EXERCISES.map((e) => e.name),
  PITCHING_GAME_EXERCISE,
  BULLPEN_EXERCISE,
  CATCHING_GAME_EXERCISE,
]);

const FILES = seasonProgramFiles();
const ALL = FILES.flatMap((f) => readSeasonProgramFile(f).programs.map((program) => ({ file: f, program })));

describe("the season program files", () => {
  it("are found in the folder, and the library they are checked against is the real one", () => {
    expect(FILES.length).toBeGreaterThan(0);
    expect(ALL.length).toBeGreaterThan(0);
    // The premise: the bracket matcher found the seeded library, not an empty array.
    expect(SEEDED.length).toBeGreaterThan(300);
    expect(VISIBLE.has("Back Squat")).toBe(true);
  });

  it("use only exercise names a coach can see in the library", () => {
    const missing = ALL.flatMap(({ file, program }) =>
      exerciseNamesIn(program).filter((n) => !VISIBLE.has(n)).map((n) => `${file.split("/").pop()}: ${program.name}: "${n}"`),
    );
    expect(missing).toEqual([]);
  });

  it("never name a program twice, because the seed creates once by exact name", () => {
    const names = ALL.map((e) => e.program.name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it("convert with every name resolved and every warm-up inside the block's limits", () => {
    const ids = new Map(Array.from(VISIBLE).map((n, i) => [n, i + 1]));
    ALL.forEach(({ program }) => {
      const converted = convertSeasonProgram(program, (n) => ids.get(n));
      expect(converted.unresolved).toEqual([]);
      expect(converted.structure.weeks.length).toBeGreaterThan(0);
    });
  });
});

describe("parseRestSeconds", () => {
  it.each([
    ["2 min", 120],
    ["90 s", 90],
    ["2-3 min", 120],
    ["2.5 min", 150],
    ["45 sec", 45],
    ["as needed", null],
    [null, null],
  ])("%s -> %s", (rest, seconds) => expect(parseRestSeconds(rest)).toBe(seconds));
});

const SAMPLE: FileProgram = {
  name: "Sample In-Season",
  sport: "Baseball",
  seasonPhase: "in_season",
  purposes: [],
  positions: ["Pitcher"],
  joints: ["shoulder", "not-a-joint"],
  audience: "For high school athletes.",
  note: "Heavy day 48-72 h before games.",
  blocks: [
    {
      name: "Block 1",
      weeks: [1, 2],
      lighterWeek: 2,
      days: [
        {
          title: "Day 1",
          focus: "Strength",
          warmup: [{ exercise: "Jog", sets: 1, seconds: 700, reps: null, note: null }],
          exercises: [
            { exercise: "Press", sets: 3, reps: "5", load: "85% 1RM", rest: "3 min", supersetWithNext: true },
            { exercise: "Row", sets: 3, reps: "8", load: "RPE 7", rest: "90 s", supersetWithNext: false },
            { exercise: "Squat", sets: 3, reps: "5", load: "85% 1RM", rest: "3 min" },
          ],
          care: [{ exercise: "External Rotation", sets: 2, reps: "12", load: "Light band", rest: "45 s" }],
          skillNotes: "Bullpen after.",
        },
      ],
    },
  ],
  positionLayers: {
    pitcher: {
      swaps: [
        { replace: "Press", with: "Landmine", reason: "Shoulder-friendly press." },
        { replace: "Deadlift", with: "Trap Bar", reason: "Not on this day." },
      ],
      addCare: [{ exercise: "Wrist Flexion", sets: 2, reps: "15", load: "Light", rest: "30 s" }],
      note: "Pitcher note.",
    },
  },
  girlsTeam: { addWarmup: [{ exercise: "Hop and Stick", sets: 2, reps: "3", seconds: null, note: null }], note: "Girls note." },
};
const SAMPLE_IDS = new Map(
  ["Jog", "Press", "Row", "Squat", "External Rotation", "Landmine", "Deadlift", "Trap Bar", "Wrist Flexion", "Hop and Stick"].map(
    (n, i) => [n, i + 1],
  ),
);
const idOf = (n: string) => SAMPLE_IDS.get(n)!;

describe("convertSeasonProgram", () => {
  const converted = convertSeasonProgram(SAMPLE, (n) => SAMPLE_IDS.get(n));
  const day = converted.structure.weeks[0].days[0];

  it("keeps the tags it may, and drops a joint outside the vocabulary", () => {
    expect(converted.structure.seasonPhase).toBe("in_season");
    expect(converted.structure.joints).toEqual(["shoulder"]);
    expect(converted.structure.positions).toEqual(["pitcher"]);
  });

  it("turns each block week into a program week, the lighter one named and explained", () => {
    expect(converted.structure.weeks.map((w) => w.name)).toEqual(["Week 1", "Week 2 (lighter week)"]);
    expect(converted.structure.blocks[0].notes).toContain("Lighter week");
  });

  it("puts the main work in order, then the care drills marked end of session", () => {
    expect(day.exercises.map((e) => e.exerciseId)).toEqual([idOf("Press"), idOf("Row"), idOf("Squat"), idOf("External Rotation")]);
    expect(day.exercises[3].notes).toBe(CARE_NOTE);
    expect(day.exercises[0]).toMatchObject({ weight: "85% 1RM", restSeconds: 180 });
  });

  it("links a superset run with one token and leaves the next exercise alone", () => {
    expect(day.exercises[0].supersetGroup).not.toBeNull();
    expect(day.exercises[1].supersetGroup).toBe(day.exercises[0].supersetGroup);
    expect(day.exercises[2].supersetGroup).toBeNull();
  });

  it("carries the focus and skill notes on the warm-up and clamps an over-long item", () => {
    expect(day.warmup?.note).toBe("Strength Skill work: Bullpen after.");
    expect(converted.clampedDurations).toHaveLength(1);
  });

  it("reports a name it cannot resolve instead of inventing one", () => {
    const partial = convertSeasonProgram(SAMPLE, (n) => (n === "Row" ? undefined : SAMPLE_IDS.get(n)));
    expect(partial.unresolved.map((u) => u.name)).toEqual(["Row"]);
  });

  it("builds the layers by normalized position", () => {
    expect(Object.keys(converted.layers!.positions)).toEqual(["pitcher"]);
    expect(converted.layers!.girlsTeam!.addWarmup[0].exerciseId).toBe(idOf("Hop and Stick"));
  });
});

describe("the layer rules", () => {
  const layers = convertSeasonProgram(SAMPLE, (n) => SAMPLE_IDS.get(n)).layers;

  it("apply nothing without a season setup, or for a position the program has no layer for", () => {
    expect(layersForSetup(layers, null).labels).toEqual([]);
    expect(layersForSetup(layers, { position: "catcher", teamGender: "boys" }).labels).toEqual([]);
  });

  it("match the position however it was typed, and label both layers", () => {
    const applied = layersForSetup(layers, { position: "  PITCHER ", teamGender: "girls" });
    expect(applied.labels).toEqual([positionLabel("pitcher"), GIRLS_TEAM_LABEL]);
  });

  it("never swap an exercise the day does not hold", () => {
    const applied = layersForSetup(layers, { position: "pitcher", teamGender: null });
    const swaps = swapsForDay(applied.position, [idOf("Press"), idOf("Row")]);
    expect(Array.from(swaps.keys())).toEqual([idOf("Press")]);
  });
});
