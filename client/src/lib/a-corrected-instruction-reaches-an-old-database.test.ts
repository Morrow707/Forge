import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// A CORRECTED INSTRUCTION ONLY EVER REACHED A FRESH DATABASE.
//
// The seed creates an exercise by NAME and nothing re-syncs `instructions` after, so build 623's
// correction to the Barbell Shoulder Press -- it is STANDING -- landed on a new install and never
// on one an earlier deploy had already written to. On 2026-10-07, two weeks later, the app on the
// phone still read "Seated, bar at collarbone" under a lift Scott does standing. He found it in a
// screenshot; nothing in the repo could have.
//
// The posture LABEL was fixed at the time and is what moves the numbers, so this is the text half
// only. The test exists because the failure is invisible from a fresh database, which is what
// every test in this repo runs against.
const SEED = readFileSync(join(process.cwd(), "server/seed.ts"), "utf8");

describe("a corrected exercise instruction reaches a database that already existed", () => {
  it("the seed carries the standing text for the Barbell Shoulder Press", () => {
    expect(SEED).toContain("Standing, bar at the collarbone, press straight overhead");
    expect(SEED).toContain("A seated barbell shoulder press is a different exercise.");
  });

  it("and a correction patch rewrites the old text on an existing row", () => {
    expect(SEED).toContain("CORRECTED_EXERCISE_INSTRUCTIONS");
    expect(SEED).toContain("Seated, bar at collarbone, press straight overhead");
    // Keyed on the exact wrong text, not a blanket re-sync: these rows are admin-editable, and a
    // blanket re-sync from the seed would silently revert an admin's own edit on every deploy.
    expect(SEED).toMatch(/\.trim\(\) !== patch\.from\.trim\(\)\) continue/);
    expect(SEED).toMatch(/updateExercise\(existingEx\.id, \{ instructions: patch\.to \}\)/);
  });

  it("every patch names a real seeded exercise, so a rename cannot leave it dead", () => {
    const block = SEED.slice(
      SEED.indexOf("const CORRECTED_EXERCISE_INSTRUCTIONS"),
      SEED.indexOf("let instructionsCorrected"),
    );
    const names = [...block.matchAll(/name: "([^"]+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(SEED, `${name} is patched but not seeded`).toContain(`name: "${name}",`);
    }
  });

  it("the correction's target text is what the seed actually ships", () => {
    // Otherwise the patch rewrites a row to something the seed would disagree with on the next
    // fresh install, and two databases drift apart on the same exercise.
    const block = SEED.slice(
      SEED.indexOf("const CORRECTED_EXERCISE_INSTRUCTIONS"),
      SEED.indexOf("let instructionsCorrected"),
    );
    expect(block).toContain("Standing, bar at the collarbone, press straight overhead");
  });
});
