import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* The admin capture download is built field by field in routes.ts, so a column the replay query
 * selects is still dropped unless the mapping names it. 2026-11-10: four single-arm row captures
 * (two sets, each side its own row) came down with no side on any of them. The itest drives the
 * query; this reads the mapping, comments stripped. */
const stripComments = (src: string) =>
  src
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

describe("the capture download carries the side", () => {
  const routes = stripComments(readFileSync(join(__dirname, "routes.ts"), "utf8"));
  const start = routes.indexOf("const captures = rows.map((r, index) => ({");
  const end = routes.indexOf("}));", start);

  it("finds the capture mapping", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("names the side on every capture", () => {
    expect(routes.slice(start, end)).toMatch(/\bside: r\.side \?\? null,/);
  });

  it("and the replay query selects it", () => {
    const storage = readFileSync(join(__dirname, "storage.ts"), "utf8");
    const q = storage.indexOf("async getStoredCapturesForReplay(");
    const nextMethod = storage.indexOf("\n  async ", q + 1);
    expect(storage.slice(q, nextMethod)).toContain("side: workoutSetEntries.side,");
  });
});
