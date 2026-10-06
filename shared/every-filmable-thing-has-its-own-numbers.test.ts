// ALL 270 FILMABLE THINGS RESOLVE THEIR OWN RECORD: 54 exercises and 216 skill drills.
//
// Scott, 2026-10-06: "give each 54 exercises, and while you're at it all of the speed/agility,
// and skills that can be filmed too, I don't know that number, but every single thing that can
// be filmed needs its own system."
//
// The number he did not know is 216, and it is not a hand-written list either: skill drills are
// eligible by skillType (plus twelve named footwork drills), which is how server/seed.ts decides
// it, so this test reads the eligibility rule out of the seed rather than restating it. A drill
// added to an eligible skillType is filmable the day it is seeded and is covered here the same
// day, with nothing to remember.
//
// What this asserts is coverage and separateness, never a value: every filmable identity gets a
// record of its own, no two share one, and nothing resolves to the frozen shared template.
import fs from "node:fs";
import path from "path";

import { describe, expect, it } from "vitest";

import { romBucketForExercise } from "../client/src/lib/exercise-camera-profile";
import { SHARED_CAMERA_TUNABLES, cameraTunablesFor } from "./camera-tunables-by-lift";

const SEED = path.resolve(__dirname, "../server/seed.ts");
const src = fs.readFileSync(SEED, "utf8");

function namesInSet(marker: string): string[] {
  const start = src.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  return Array.from(src.slice(start, src.indexOf("])", start)).matchAll(/"([^"]+)"/g), (m) => m[1]);
}

function filmableExercises(): string[] {
  return namesInSet("CANONICAL_VIDEO_ELIGIBLE_NAMES = new Set([");
}

function filmableDrills(): { name: string; skillType: string }[] {
  const mechanics = new Set(namesInSet("MECHANICS_ELIGIBLE_SKILL_TYPES = new Set(["));
  const sprint = new Set(namesInSet("SPRINT_TIMING_ELIGIBLE_SKILL_TYPES = new Set(["));
  const footwork = new Set(namesInSet("SPRINT_TIMING_ELIGIBLE_FOOTWORK_NAMES = new Set(["));
  const out: { name: string; skillType: string }[] = [];
  for (const m of src.matchAll(/name:\s*"([^"]+)"/g)) {
    const window = src.slice(m.index! + m[0].length, m.index! + m[0].length + 500);
    const type = /skillType:\s*"([^"]+)"/.exec(window)?.[1];
    if (!type) continue;
    const eligible = mechanics.has(type) || sprint.has(type) || (type === "Footwork" && footwork.has(m[1]));
    if (eligible) out.push({ name: m[1], skillType: type });
  }
  return out;
}

describe("every filmable thing has its own numbers", () => {
  const exercises = filmableExercises();
  const drills = filmableDrills();

  it("counts 54 exercises and 216 drills", () => {
    // Pinned so a change to either eligibility rule is a decision somebody made on purpose --
    // video storage is the whole reason the lists are short (see videoEligible's own comment).
    expect(exercises.length).toBe(54);
    expect(drills.length).toBe(216);
  });

  it("covers the speed and agility work Scott named", () => {
    // "if we're testing let's say a 40 yard dash" -- the sprint-timed drills are the Agility and
    // Starts skillTypes plus the timed footwork ladder drills.
    const types = new Set(drills.map((d) => d.skillType));
    expect(types).toContain("Agility");
    expect(types).toContain("Starts");
    expect(types).toContain("Sprint Mechanics");
    expect(drills.some((d) => d.name.startsWith("Ladder Drill"))).toBe(true);
  });

  it("gives all 270 of them their own record, and no two the same one", () => {
    const seen = new Set<object>();
    const identities = [
      ...exercises.map((name) => ({ name, bucket: romBucketForExercise(name) })),
      ...drills.map((d) => ({ name: d.name, bucket: null })),
    ];
    expect(identities.length).toBe(270);
    for (const { name, bucket } of identities) {
      const resolved = cameraTunablesFor(name, bucket);
      expect(resolved.identity).toBe(name);
      // Not the frozen template: a record that WAS the template would make every lift share one.
      expect(resolved.values).not.toBe(SHARED_CAMERA_TUNABLES);
      expect(seen.has(resolved.values)).toBe(false);
      seen.add(resolved.values);
      // Every field present, so nothing reads undefined and silently becomes NaN downstream.
      for (const key of Object.keys(SHARED_CAMERA_TUNABLES)) {
        expect(Number.isFinite((resolved.values as Record<string, number>)[key])).toBe(true);
      }
    }
    expect(seen.size).toBe(270);
  });

  it("writing on any one of the 270 leaves the other 269 alone", () => {
    const all = [...exercises, ...drills.map((d) => d.name)];
    const before = all.map((name) => ({ ...cameraTunablesFor(name, romBucketForExercise(name)).values }));
    // Scribble on one drill's record the way a fitted calibration eventually will.
    const victim = cameraTunablesFor(all[100], null);
    victim.values.driveOnsetFraction = 0.99;
    victim.values.maxCountTrimPerEdge = 99;
    const after = all.map((name) => ({ ...cameraTunablesFor(name, romBucketForExercise(name)).values }));
    expect(after).toEqual(before);
  });
});
