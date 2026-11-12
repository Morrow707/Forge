import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* A NIGHTLY SWEEP NEVER HANDS POSTGRES EVERY ACCOUNT'S ID AS ONE LIST.
 *
 * Postgres takes at most 65,535 bind parameters, and building a list that long overflows the stack
 * first ("Maximum call stack size exceeded"). sweepVideoRetentionCap once filtered with
 * `inArray(workoutLogs.athleteId, [...capByAthlete.keys()])`, one parameter per filming account, so
 * past ~65k such accounts it failed every night and no video cap was enforced (the 500,000-account
 * scale test, 2026-11-12). Sweeps filter by a join and apply per-account rules in memory.
 *
 * The rule is stated as what is FORBIDDEN, over every storage method whose name starts with
 * "sweep": an `inArray` whose list is spread from a Map or Set's keys or values. */

const STORAGE = readFileSync(join(__dirname, "storage.ts"), "utf8");
const EVEN = 2;

/** Block comments that open a line, then `//` comments whose quotes are balanced before them (a
 * naive two-regex strip eats URLs and strings in a file this size -- see CLAUDE.md). */
function stripComments(src: string): string {
  // A block comment starting its line: "  /** text */" yes; 'const a = "/*";' no.
  // https://regex101.com/?regex=%5E%5Cs*%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F&testString=%20%20%2F**%20text%20*%2F
  const noBlocks = src.replace(/^\s*\/\*[\s\S]*?\*\//gm, "");
  return noBlocks
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at === -1) return line;
      const before = line.slice(0, at);
      // Quote characters: '"', "'" and "`" yes; letters no.
      // https://regex101.com/?regex=%5B%22'%60%5D&testString=%22a%22
      const quotes = (before.match(/["'`]/g) ?? []).length;
      return quotes % EVEN === 0 ? before : line;
    })
    .join("\n");
}

/** The text from `open` to its matching close brace. */
function braceBlock(text: string, open: number): string {
  const end = Array.from(text.slice(open)).reduce(
    (acc, ch, i) => {
      if (acc.end !== -1) return acc;
      const depth = acc.depth + (ch === "{" ? 1 : 0) - (ch === "}" ? 1 : 0);
      return { depth, end: depth === 0 ? open + i + 1 : -1 };
    },
    { depth: 0, end: -1 },
  ).end;
  return text.slice(open, end === -1 ? text.length : end);
}

/** The first `{` after `from` that is not inside a type's angle brackets: a `Promise<{ ... }>`
 * return type is not the method body (CLAUDE.md records this trap twice). */
function bodyOpen(text: string, from: number): number {
  const found = Array.from(text.slice(from)).reduce(
    (acc, ch, i) => {
      if (acc.at !== -1) return acc;
      if (ch === "{" && acc.angle === 0) return { angle: 0, at: from + i };
      const angle = acc.angle + (ch === "<" ? 1 : 0) - (ch === ">" ? 1 : 0);
      return { angle, at: -1 };
    },
    { angle: 0, at: -1 },
  ).at;
  return found === -1 ? text.length : found;
}

/** Each `async sweepX(` method body, bounded by its own braces. */
function sweepBodies(src: string): { name: string; body: string }[] {
  // A storage method named sweep...: "  async sweepVideoRetentionCap(" yes; "runVideoRetentionSweep(" no.
  // https://regex101.com/?regex=async%20(sweep%5BA-Za-z%5D*)%5C(&testString=%20%20async%20sweepVideoRetentionCap()
  return Array.from(src.matchAll(/async (sweep[A-Za-z]*)\(/g)).map((m) => ({
    name: m[1],
    body: braceBlock(src, bodyOpen(src, src.indexOf(")", m.index ?? 0))),
  }));
}

// `inArray(x.athleteId, [...capByAthlete.keys()])` yes; `inArray(users.role, [...ROLES_LIST])` no.
// https://regex101.com/?regex=inArray%5C(%5B%5E%2C%5D%2B%2C%5Cs*%5C%5B%5C.%5C.%5C.%5Cw%2B%5C.(keys%7Cvalues)%5C(%5C)%5C%5D&testString=inArray(workoutLogs.athleteId%2C%20%5B...capByAthlete.keys()%5D)
const EVERY_ID_LIST = /inArray\([^,]+,\s*\[\.\.\.\w+\.(keys|values)\(\)\]/;

describe("a nightly sweep never sends Postgres every account's id", () => {
  const sweeps = sweepBodies(stripComments(STORAGE));

  it("finds the sweeps it is checking, by their bodies and not their return types", () => {
    const cap = sweeps.find((s) => s.name === "sweepVideoRetentionCap");
    expect(cap?.body).toContain("candidates");
  });

  it("no sweep filters by a list spread from a Map or Set of accounts", () => {
    sweeps.forEach((s) => expect(s.body, s.name).not.toMatch(EVERY_ID_LIST));
  });

  it("the pattern it forbids is the one that broke, so the check can fail", () => {
    expect("inArray(workoutLogs.athleteId, [...capByAthlete.keys()])").toMatch(EVERY_ID_LIST);
  });
});
