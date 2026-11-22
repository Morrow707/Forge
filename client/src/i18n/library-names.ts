// The Forge library names the library catalog has to cover, read from the seed sources. Node only;
// never imported by the app (it reads server/seed.ts off disk).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./source-files";
import { LIBRARY_REVIEW_EXERCISES, LIBRARY_REVIEW_SKILL_DRILLS } from "../../../server/seed-data/library-review-2026-11-22";
import { HIDDEN_EXERCISE_NAMES, HIDDEN_SKILL_DRILL_NAMES } from "../../../shared/library-review-2026-11-22";
import { BULLPEN_EXERCISE, CATCHING_GAME_EXERCISE, PITCHING_GAME_EXERCISE } from "../../../shared/throwing-workload";

const EXERCISE_ARRAYS = ["seedExercises", "combinationExercises", "expansionExercises"] as const;
const SKILL_ARRAYS = ["seedSkillDrills", "multiSportSkillDrills"] as const;

// A library entry's name: `{ name: "Back Squat",` -> "Back Squat". Rejects '  name: x'.
// https://regex101.com/?regex=%5C%7B%5Cs*name%3A%5Cs*%22(%5B%5E%22%5D%2B)%22&flags=g&testString=%7B%20name%3A%20%22Back%20Squat%22%2C
const ENTRY_NAME = /\{\s*name:\s*"([^"]+)"/g;
const BRACKET_STEP: Record<string, number> = { "[": 1, "]": -1 };

/** One array's literal, bounded by matching its own brackets (never a character window). The
 *  search starts at the `= [` after the name, so a type annotation in between is skipped. */
function arrayLiteral(src: string, constName: string): string {
  const start = src.indexOf(`const ${constName}`);
  if (start < 0) throw new Error(`seed.ts has no ${constName}`);
  const open = src.indexOf("[", src.indexOf("= [", start));
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

const namesIn = (src: string, arrays: readonly string[]) =>
  arrays.flatMap((n) => Array.from(arrayLiteral(src, n).matchAll(ENTRY_NAME), (m) => m[1]));

/** Every visible library exercise and skill drill name, sorted and without duplicates. */
export function libraryNamesToTranslate(): string[] {
  const seed = readFileSync(join(REPO_ROOT, "server/seed.ts"), "utf8");
  const exercises = [
    ...namesIn(seed, EXERCISE_ARRAYS).filter((n) => !HIDDEN_EXERCISE_NAMES.has(n)),
    ...LIBRARY_REVIEW_EXERCISES.map((e) => e.name),
    PITCHING_GAME_EXERCISE,
    BULLPEN_EXERCISE,
    CATCHING_GAME_EXERCISE,
  ];
  const drills = [
    ...namesIn(seed, SKILL_ARRAYS).filter((n) => !HIDDEN_SKILL_DRILL_NAMES.has(n)),
    ...LIBRARY_REVIEW_SKILL_DRILLS.map((d) => d.name),
  ];
  return [...new Set([...exercises, ...drills])].sort();
}
