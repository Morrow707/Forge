/* Reading an uploaded weight-room sheet sends the model the day's lift names and the image, and NO
 * athlete name (Scott, 2026-11-22: "I won't want the names to be saved in the ai"). The model only
 * transcribes what is written; Forge matches names against the coach's roster on its own. This
 * states what is forbidden: no roster name field on the hints the model receives. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "weight-room-sheets.ts"), "utf8");
// Block comments: matches "/* note */" across lines; rejects "a / b * c".
// https://regex101.com/?regex=%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F&testString=%2F*%20note%20*%2F
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
// Whole-line comments: matches "  // note"; rejects "x // note".
// https://regex101.com/?regex=%5E%5Cs*%5C%2F%5C%2F.*%24&flags=gm&testString=%20%20%2F%2F%20note
const LINE_COMMENT = /^\s*\/\/.*$/gm;
const code = source.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");

describe("the sheet read sends no athlete names to the model", () => {
  it("the hints type carries lifts only", () => {
    // The model hook's hint type: matches "hints: { lifts: string[] }" exactly; rejects one with names.
    // https://regex101.com/?regex=hints%3A%20%5C%7B%20lifts%3A%20string%5C%5B%5C%5D%20%5C%7D&testString=hints%3A%20%7B%20lifts%3A%20string%5B%5D%20%7D
    expect(code).toMatch(/hints: \{ lifts: string\[\] \}/);
  });

  it("no roster name is put into the model's context", () => {
    expect(code).not.toContain("hints.names");
    expect(code).not.toContain("Names on the team");
    expect(code).not.toContain("athletes.map((a) => a.displayName)");
  });
});
