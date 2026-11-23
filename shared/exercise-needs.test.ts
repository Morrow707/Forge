/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/require-regex-example, ts-patterns/no-loop-statements -- test fixtures; the regexes read seed.ts rows ("name: \"Back Squat\",\n category:" matches, "name: \"Varsity\"" does not) */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EQUIPMENT_IDS, type EquipmentId, type EquipmentRoom } from "./equipment-profile";
import { exerciseNeeds, keepForRoom, missingEquipmentSentence, roomAllows } from "./exercise-needs";
import { EXLIB_EXERCISES } from "../server/seed-data/exlib-2026-11-23";

/**
 * Scott, 2026-11-21: "they don't have a bench so every sort of seated press is out, but we can
 * still do floor press". Driven against the REAL library read out of server/seed.ts: each exercise
 * row is `name: "...",` followed by its category or muscle group, and its fields run to the next
 * row's name (bounded by the next match, never a character count).
 */
const seed = readFileSync(join(__dirname, "../server/seed.ts"), "utf8");
const starts = Array.from(seed.matchAll(/name:\s*"([^"]+)",\s*\n?\s*(?:category|muscleGroup)/g));
const LIBRARY = Array.from(
  new Map(
    starts.map((m, i) => {
      const body = seed.slice(m.index!, i + 1 < starts.length ? starts[i + 1].index : seed.length);
      const field = (key: string) => body.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1] ?? null;
      return [m[1], { name: m[1], equipment: field("equipment"), category: field("category"), movementType: field("movementType") }] as const;
    }),
  ).values(),
);
const byName = (name: string) => {
  const ex = LIBRARY.find((e) => e.name === name);
  if (!ex) throw new Error(`no library exercise named ${name}`);
  return ex;
};
const roomWithout = (...missing: EquipmentId[]): EquipmentRoom => ({
  items: EQUIPMENT_IDS.filter((id) => !missing.includes(id)),
  dumbbellMaxLbs: null,
});
const NO_BENCH = roomWithout("flat_bench", "adjustable_bench");

describe("what an exercise needs", () => {
  it("reads the real library", () => {
    expect(LIBRARY.length).toBeGreaterThan(350);
  });

  it("every library exercise resolves to a requirement set", () => {
    const unresolved = LIBRARY.filter((ex) => !exerciseNeeds(ex).recognised).map((ex) => `${ex.name} [${ex.equipment}]`);
    expect(unresolved).toEqual([]);
  });

  it("every exercise the ExLib additions bring in resolves too", () => {
    const unresolved = EXLIB_EXERCISES.filter((ex) => !exerciseNeeds(ex).recognised).map((ex) => `${ex.name} [${ex.equipment}]`);
    expect(unresolved).toEqual([]);
  });

  it("with no bench, every flat, incline, decline and seated bench press is out", () => {
    const presses = LIBRARY.filter(
      (ex) => ex.equipment !== "Machine" && /(bench|seated|incline|decline).*press/i.test(ex.name),
    );
    expect(presses.length).toBeGreaterThan(10);
    expect(presses.filter((ex) => roomAllows(ex, NO_BENCH)).map((ex) => ex.name)).toEqual([]);
    for (const name of ["Bench Press", "Incline Barbell Bench Press", "Dumbbell Bench Press", "Incline Dumbbell Press", "Seated Barbell Press", "Close-Grip Bench Press"]) {
      expect(roomAllows(byName(name), NO_BENCH)).toBe(false);
    }
  });

  it("Floor Press stays in with no bench and no rack, on a barbell or dumbbells alone", () => {
    const floor = byName("Floor Press");
    expect(roomAllows(floor, NO_BENCH)).toBe(true);
    expect(roomAllows(floor, roomWithout("flat_bench", "adjustable_bench", "squat_rack", "plates"))).toBe(true);
    expect(roomAllows(floor, { items: ["dumbbells"], dumbbellMaxLbs: null })).toBe(true);
    expect(roomAllows(floor, { items: [], dumbbellMaxLbs: null })).toBe(false);
  });

  it("a coach's seated dumbbell press needs dumbbells and a bench", () => {
    const ex = { name: "Seated Dumbbell Shoulder Press", equipment: "Dumbbell", category: "strength" };
    expect(exerciseNeeds(ex).needs).toEqual([["dumbbells"], ["flat_bench", "adjustable_bench"]]);
    expect(roomAllows(ex, NO_BENCH)).toBe(false);
  });

  it.each([
    ["Bench Press", [["barbell"], ["plates"], ["flat_bench", "adjustable_bench"], ["squat_rack"]]],
    ["Box Jump", [["plyo_box"]]],
    ["Pull-Up", [["pullup_bar"]]],
    ["Back Squat", [["barbell"], ["plates"], ["squat_rack"]]],
    ["Deadlift", [["barbell"], ["plates"]]],
    ["Push-Up", []],
  ])("%s needs %j", (name, needs) => {
    expect(exerciseNeeds(byName(name)).needs).toEqual(needs);
  });

  it("no profile means everything is available", () => {
    expect(LIBRARY.every((ex) => roomAllows(ex, null))).toBe(true);
    expect(missingEquipmentSentence(byName("Bench Press"), null)).toBeNull();
  });

  it("an equipment word nobody taught it is never filtered out", () => {
    const rings = { name: "Parallette L-Sit", equipment: "Parallettes" };
    expect(exerciseNeeds(rings).recognised).toBe(false);
    expect(roomAllows(rings, { items: [], dumbbellMaxLbs: null })).toBe(true);
  });

  it("names what is missing in words", () => {
    expect(missingEquipmentSentence(byName("Bench Press"), NO_BENCH)).toBe("Needs a flat bench or an adjustable bench you haven't listed");
  });

  it("a room filter narrows, and never leaves nothing", () => {
    const list = [byName("Bench Press"), byName("Floor Press")];
    expect(keepForRoom(list, NO_BENCH).map((e) => e.name)).toEqual(["Floor Press"]);
    expect(keepForRoom([byName("Bench Press")], NO_BENCH).map((e) => e.name)).toEqual(["Bench Press"]);
  });
});
