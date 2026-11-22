import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIRST_CHOICE,
  NICKNAMES,
  editDistance,
  normalizeSearchText,
  queryReadings,
  searchExercises,
} from "./exercise-search";
import {
  SEASON_PHASE_NICKNAMES,
  TAG_NICKNAMES,
  isExerciseJoint,
  isExercisePurpose,
  isProgramSeasonPhase,
} from "./exercise-tags";

/**
 * Scott, 2026-11-14: "rdl 4 romanian deadlift, shoulder press 4 barbell shoulder press ...
 * missed spelled words." Driven against the REAL library names read out of server/seed.ts, so a
 * nickname that points at a lift the library does not have fails here.
 */
const seed = readFileSync(join(__dirname, "../server/seed.ts"), "utf8");
// An exercise row's name: `name: "Back Squat",` directly followed by its category or muscle
// group. Matches `name: "Back Squat",\n category:`; rejects `name: "Varsity"` on a team row.
const NAMES = Array.from(seed.matchAll(/name:\s*"([^"]+)",\s*\n?\s*(?:category|muscleGroup)/g)).map(
  (m) => m[1],
);
const LIBRARY = Array.from(new Set(NAMES)).map((name) => ({
  name,
  muscleGroup: "",
  equipment: "",
  sports: [] as string[],
}));
const top = (q: string, n = 1) => searchExercises(LIBRARY, q).slice(0, n).map((e) => e.name);

describe("exercise search", () => {
  it("reads the real library", () => {
    expect(LIBRARY.length).toBeGreaterThan(350);
  });

  it.each([
    ["rdl", "Romanian Deadlift"],
    ["RDL", "Romanian Deadlift"],
    ["shoulder press", "Barbell Shoulder Press"],
    ["ohp", "Barbell Shoulder Press"],
    ["military press", "Barbell Shoulder Press"],
    ["squat", "Back Squat"],
    ["bench", "Bench Press"],
    ["deadlift", "Deadlift"],
    ["pullup", "Pull-Up"],
    ["pull ups", "Pull-Up"],
    ["chinup", "Chin-Up"],
    ["pushups", "Push-Up"],
    ["bss", "Bulgarian Split Squat"],
    ["cmj", "Countermovement Jump"],
    ["skullcrushers", "Skull Crusher"],
    ["kb swing", "Kettlebell Swing"],
    ["farmers walk", "Farmer's Carry"],
    ["clean and jerk", "Clean & Jerk"],
    ["trap bar deadlift", "Hex Bar Deadlift"],
    ["db bench", "Dumbbell Bench Press"],
    ["lat pull down", "Lat Pulldown"],
    ["ghr", "Glute Ham Raise"],
  ])("%s -> %s first", (typed, first) => {
    expect(top(typed)[0]).toBe(first);
  });

  it.each([
    ["romainian deadlift", "Romanian Deadlift"],
    ["romanian deadlfit", "Romanian Deadlift"],
    ["barbel shoulder press", "Barbell Shoulder Press"],
    ["bulgarain split squat", "Bulgarian Split Squat"],
    ["kettelbell swing", "Kettlebell Swing"],
    ["benchpress", "Bench Press"],
    ["dumbell curl", "Dumbbell Curl"],
    ["pendley row", "Pendlay Row"],
    ["squatt", "Back Squat"],
    ["hip thurst", "Hip Thrust"],
  ])("a misspelling: %s -> %s", (typed, first) => {
    expect(top(typed)[0]).toBe(first);
  });

  it("finds a lift while its name is still being typed", () => {
    expect(top("roman")[0]).toBe("Romanian Deadlift");
    expect(top("barbell sho")[0]).toBe("Barbell Shoulder Press");
    expect(top("pullu")[0]).toBe("Pull-Up");
  });

  it("typing barbell lists the barbell lifts and nothing else", () => {
    const found = searchExercises(LIBRARY, "barbell").map((e) => e.name);
    expect(found.length).toBeGreaterThan(5);
    expect(found.every((n) => /barbell/i.test(n))).toBe(true);
  });

  it("adding a word narrows, never widens", () => {
    const one = searchExercises(LIBRARY, "deadlift").length;
    const two = searchExercises(LIBRARY, "sumo deadlift").length;
    expect(two).toBeGreaterThan(0);
    expect(two).toBeLessThan(one);
  });

  it("the typed nickname still finds a name that spells it out", () => {
    expect(searchExercises(LIBRARY, "rdl").map((e) => e.name)).toContain("Single-Leg RDL to Row");
  });

  it("nonsense finds nothing, and an empty box returns everything in its own order", () => {
    expect(searchExercises(LIBRARY, "zzqqxx")).toHaveLength(0);
    expect(searchExercises(LIBRARY, "  ").map((e) => e.name)).toEqual(LIBRARY.map((e) => e.name));
  });

  it("a short word is not matched by typo (three letters off by one matches too much)", () => {
    expect(searchExercises(LIBRARY, "dop").map((e) => e.name)).not.toContain("Dip");
  });

  it("muscle group and equipment still answer, below a name match", () => {
    const list = [
      { name: "Leg Press", muscleGroup: "Quads", equipment: "Machine", sports: [] },
      { name: "Quad Stretch", muscleGroup: "Mobility", equipment: "Bodyweight", sports: [] },
    ];
    expect(searchExercises(list, "quads").map((e) => e.name)).toEqual(["Quad Stretch", "Leg Press"]);
  });

  it("every nickname and every first choice points at words the library really has", () => {
    const libraryNames = LIBRARY.map((e) => normalizeSearchText(e.name));
    for (const [nick, expansions] of Object.entries(NICKNAMES)) {
      for (const phrase of expansions) {
        const hit = libraryNames.some((n) => ` ${n} `.includes(` ${phrase} `));
        expect(hit, `"${nick}" -> "${phrase}" names nothing in the library`).toBe(true);
      }
    }
    for (const [nick, name] of Object.entries(FIRST_CHOICE)) {
      expect(libraryNames, `first choice for "${nick}"`).toContain(name);
    }
  });

  it("every tag nickname points at a tag that exists", () => {
    // A nickname that names nothing fails here, the same way a library nickname does above.
    Object.entries(TAG_NICKNAMES).forEach(([nick, tag]) => {
      expect(isExerciseJoint(tag) || isExercisePurpose(tag), `"${nick}" -> "${tag}"`).toBe(true);
    });
    Object.entries(SEASON_PHASE_NICKNAMES).forEach(([nick, phase]) => {
      expect(isProgramSeasonPhase(phase), `"${nick}" -> "${phase}"`).toBe(true);
    });
  });

  it("counts a swapped pair as one edit and stops counting past the cap", () => {
    expect(editDistance("romainan", "romanian", 2)).toBeLessThanOrEqual(2);
    expect(editDistance("squat", "squta", 1)).toBe(1);
    expect(editDistance("squat", "deadlift", 2)).toBe(3);
  });
});

/**
 * TAGS (2026-11-22). Warm-up, joint-care and return-to-training drills live in this same library,
 * so the one search has to find them by what they are for, which joint, and which position. The
 * real library has no tags yet (the drills come from research later), so a handful are tagged here
 * on real names and two drills are added, on top of the whole real library.
 */
describe("exercise search over tags", () => {
  type Tagged = (typeof LIBRARY)[number] & { joints?: string[]; purposes?: string[]; positions?: string[] };
  const TAGS: Record<string, Pick<Tagged, "joints" | "purposes" | "positions">> = {
    "Ankle Dorsiflexion Mobilization": { joints: ["ankle"], purposes: ["warmup"] },
    "Band Pull-Apart": { joints: ["shoulder"], purposes: ["warmup", "care"], positions: ["pitcher"] },
    "Copenhagen Plank": { joints: ["hip"], purposes: ["care"], positions: ["goalkeeper"] },
  };
  const TAGGED: Tagged[] = [
    ...LIBRARY.map((ex) => ({ ...ex, ...(TAGS[ex.name] ?? {}) })),
    { name: "Spanish Squat Hold", muscleGroup: "", equipment: "", sports: [], joints: ["knee"], purposes: ["return_to_training"] },
    { name: "Wall Ankle Rocks", muscleGroup: "", equipment: "", sports: [], joints: ["ankle"], purposes: ["care"] },
  ];
  const found = (q: string) => searchExercises(TAGGED, q).map((e) => e.name);

  it("the tagged names are real library names", () => {
    Object.keys(TAGS).forEach((name) => expect(LIBRARY.map((e) => e.name)).toContain(name));
  });

  it.each([
    ["warmup ankle", "Ankle Dorsiflexion Mobilization"],
    ["warm-up ankle", "Ankle Dorsiflexion Mobilization"],
    ["pitcher", "Band Pull-Apart"],
    ["goalkeeper", "Copenhagen Plank"],
    ["acl", "Spanish Squat Hold"],
    ["meniscus rehab", "Spanish Squat Hold"],
    ["knee return", "Spanish Squat Hold"],
    ["rotator cuff warm up", "Band Pull-Apart"],
    ["groin prehab", "Copenhagen Plank"],
    ["achilles", "Wall Ankle Rocks"],
  ])("%s finds %s", (typed, name) => {
    expect(found(typed)).toContain(name);
  });

  it("misspellings reach a tag through the typo path: sholder, wramup", () => {
    expect(found("sholder care")).toContain("Band Pull-Apart");
    expect(found("wramup")).toEqual(expect.arrayContaining(["Ankle Dorsiflexion Mobilization", "Band Pull-Apart"]));
  });

  it("a nickname still narrows: every added word must be found", () => {
    const warmups = found("warmup");
    const ankleWarmups = found("warmup ankle");
    expect(ankleWarmups.length).toBeGreaterThan(0);
    expect(ankleWarmups.length).toBeLessThan(warmups.length);
    expect(ankleWarmups).not.toContain("Band Pull-Apart");
    expect(found("acl pitcher")).toEqual([]);
  });

  it("a four-letter typo never reaches a tag (rack is not back)", () => {
    const backDrill = [{ name: "Cat Cow", muscleGroup: "", equipment: "", sports: [], joints: ["back"] }];
    expect(searchExercises(backDrill, "back").map((e) => e.name)).toEqual(["Cat Cow"]);
    expect(searchExercises(backDrill, "rack")).toEqual([]);
  });

  it("names still come first: rdl and squat are unchanged with tags present", () => {
    expect(found("rdl")[0]).toBe("Romanian Deadlift");
    expect(found("squat")[0]).toBe("Back Squat");
    expect(found("shoulder press")[0]).toBe("Barbell Shoulder Press");
  });

  it("a multi-word nickname and a one-word one combine in one reading", () => {
    expect(queryReadings("rotator cuff warm up")).toContain("shoulder warmup");
  });
});
