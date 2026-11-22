/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures */
/**
 * Every visible Forge library exercise and skill drill has a Spanish name (exercise-es.json), so
 * `t.exercise(name)` never falls back to English for a Forge exercise. The list is read from the
 * seed sources, so an exercise added to the library fails here until it is translated
 * (`npx tsx scripts/i18n-library-names.ts --missing`). A coach's own exercise is never in it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { libraryNamesToTranslate } from "./library-names";
import { REPO_ROOT } from "./source-files";

const catalog = JSON.parse(readFileSync(join(REPO_ROOT, "client/src/i18n/exercise-es.json"), "utf8")) as Record<string, string>;

describe("the library names catalog", () => {
  const names = libraryNamesToTranslate();

  it("reads the library (several hundred names, not a parse that stopped early)", () => {
    expect(names.length).toBeGreaterThan(600);
    expect(names).toContain("Back Squat");
    expect(names).toContain("Cone Weave Dribbling (Soccer)");
  });

  it("has a non-empty Spanish name for every visible library name", () => {
    expect(names.filter((n) => !catalog[n]?.trim())).toEqual([]);
  });
});
