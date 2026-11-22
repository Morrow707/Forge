import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * NO EXERCISE IS FILTERED, SORTED OR LABELLED BY AN ATHLETE'S AGE. Scott, 2026-11-22: "underage
 * athletes can do whatever they want, as an exercise professional, age doesn't matter in the weight
 * room, its about weight room proficiency, a 12 year old can back squat the bar if a) they are
 * strong enough to hold 45lbs on their backs, and b) they can show that they can do a back squat
 * correctly and safely, thats the only 2 things that matters."
 *
 * It states what is FORBIDDEN, read from every source file rather than a list of named files:
 *   - the `youthSafe` / `youth_safe` column is read nowhere but where it is DECLARED (the schema and
 *     the reconciler) and the seed data that writes it; the column stays, nothing decides on it;
 *   - the old helpers and the youth-audience routes never come back under any file.
 * Comments are stripped first: this file and the code's own comments quote every forbidden word
 * while explaining the rule, and prose about a removed filter is not the filter.
 *
 * What this does NOT cover, on purpose: accounts and consent by age (the under-13 guardian claim,
 * the Anvil's adults-only rule, a minor's video retention). Those are law about data, not the
 * weight room, and they read a date of birth for their own reasons.
 */
const ROOT = join(__dirname, "..");
const SCANNED = ["client/src", "server", "shared"];
// A TypeScript source file: matches "storage.ts" and "page.tsx"; rejects "group-a.json".
// https://regex101.com/?regex=%5C.(ts%7Ctsx)%24&testString=storage.ts
const SOURCE = /\.(ts|tsx)$/;
// A unit or integration test: matches "a.test.ts" and "b.itest.ts"; rejects "storage.ts".
// https://regex101.com/?regex=%5C.(test%7Citest)%5C.tsx%3F%24&testString=a.itest.ts
const TEST_FILE = /\.(test|itest)\.tsx?$/;
/** Fewer files than this means the walk found the wrong tree. */
const AT_LEAST_FILES = 100;

/** Where the column may still be named: where it is declared, and seed data that writes it. */
const COLUMN_MAY_APPEAR = (rel: string) =>
  rel === "shared/schema.ts" || rel === "server/reconcile-schema.ts" || rel.startsWith("server/seed-data/");

const FORBIDDEN_ANYWHERE = [
  "keepForAge",
  "heldBackForAge",
  "programIsForYouth",
  "YOUTH_SAFE_MIN_AGE",
  "YOUTH_HELD_BACK_NOTE",
  "isUnderYouthAge",
  "UNDER_14_LOADING_NOTE",
  "forYouth",
  "youth-audience",
];

const stripComments = (src: string) =>
  src
    // Block comments: "/* a */" goes; "a / b" has none.
    // https://regex101.com/?regex=%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F&flags=g&testString=x%20%2F*%20a%20*%2F%20y
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Line comments not inside a URL or a string opener: "x // y" loses "// y"; "http://a" keeps it.
    // https://regex101.com/?regex=(%5E%7C%5B%5E%3A%22'%60%5D)%5C%2F%5C%2F.*%24&flags=gm&testString=x%20%2F%2F%20y%0Ahttp%3A%2F%2Fa
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return SOURCE.test(name) && !TEST_FILE.test(name) ? [full] : [];
  });
}

const files = SCANNED.flatMap((d) => walk(join(ROOT, d))).map((full) => ({
  rel: relative(ROOT, full).split("\\").join("/"),
  code: stripComments(readFileSync(full, "utf8")),
}));

export function ageRuleOffences(list: readonly { rel: string; code: string }[]): string[] {
  return list.flatMap(({ rel, code }) => [
    ...FORBIDDEN_ANYWHERE.filter((word) => code.includes(word)).map((word) => `${rel}: ${word}`),
    ...(!COLUMN_MAY_APPEAR(rel) && (code.includes("youthSafe") || code.includes("youth_safe")) ? [`${rel}: reads youthSafe`] : []),
  ]);
}

describe("no exercise is filtered, sorted or labelled by an athlete's age", () => {
  it("scans a real tree", () => {
    expect(files.length).toBeGreaterThan(AT_LEAST_FILES);
    expect(files.some((f) => f.rel === "server/storage.ts")).toBe(true);
    expect(files.some((f) => f.rel === "client/src/components/exercise-picker-dialog.tsx")).toBe(true);
  });

  it("nothing reads the youthSafe column or brings back an age filter", () => {
    expect(ageRuleOffences(files)).toEqual([]);
  });

  it("catches a filter in code and lets a comment explaining its removal through", () => {
    const filter = { rel: "server/storage.ts", code: stripComments("const v = list.filter((e) => e.youthSafe !== false);") };
    const prose = { rel: "server/storage.ts", code: stripComments("// keepForAge and youthSafe were removed\nconst v = list;") };
    expect(ageRuleOffences([filter])).toEqual(["server/storage.ts: reads youthSafe"]);
    expect(ageRuleOffences([prose])).toEqual([]);
    expect(ageRuleOffences([{ rel: "shared/schema.ts", code: 'youthSafe: boolean("youth_safe"),' }])).toEqual([]);
  });
});
