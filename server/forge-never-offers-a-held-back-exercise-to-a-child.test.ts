import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * YOUTH-SAFE (Scott, 2026-11-22): wherever Forge PICKS an exercise for an athlete under 14 (an AI
 * program draft, an exercise swap, the pain-map swap), an exercise marked `youthSafe === false` is
 * kept out of what the model is shown. A coach placing one by hand is never refused; that path
 * goes through none of these.
 *
 * The AI paths cannot run here (no model key), so this reads each method's body, comments
 * stripped so a comment naming the filter cannot stand in for it, and requires the filter in it.
 */
const stripComments = (src: string) =>
  src
    // Block comments: "/* a */" goes; "a / b" has none.
    // https://regex101.com/?regex=%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F&flags=g&testString=x%20%2F*%20a%20*%2F%20y
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Line comments not inside a URL or a string opener: "x // y" loses "// y"; "http://a" keeps it.
    // https://regex101.com/?regex=(%5E%7C%5B%5E%3A%22'%60%5D)%5C%2F%5C%2F.*%24&flags=gm&testString=x%20%2F%2F%20y%0Ahttp%3A%2F%2Fa
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const storage = stripComments(readFileSync(join(__dirname, "storage.ts"), "utf8"));
const body = (name: string) => {
  const at = storage.indexOf(`async ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  const next = storage.indexOf("\n  async ", at + `async ${name}(`.length);
  return storage.slice(at, next);
};

describe("Forge never offers an exercise marked not for under-14s to a child", () => {
  it("the AI program draft narrows its catalog by the athlete's age", () => {
    const fn = body("generateProgramDraft");
    expect(fn).toContain("keepForAge(keepForRoom(visibleExercises, draftRoom), draftAge)");
    expect(fn).toContain("const validIds = roomExercises.map((e) => e.id);");
  });

  it("an exercise swap on a program for youth leaves the held-back exercises out", () => {
    const fn = body("substituteExercise");
    expect(fn).toContain("await this.programIsForYouth(programId, authorId)");
    expect(fn).toContain('e.youthSafe !== false');
  });

  it("the pain-map swap narrows by the athlete's own age", () => {
    const fn = body("generateModifiedWorkout");
    expect(fn).toContain("await this.knownAgeOf(athleteId)");
    expect(fn).toContain("keepForAge(");
  });

  it("the age comes from a real date of birth, never the stale users.age column", () => {
    const fn = body("youngestKnownAge");
    expect(fn).toContain("users.dateOfBirth");
    expect(fn).not.toContain("users.age");
  });
});
