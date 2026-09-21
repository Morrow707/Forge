import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A CALLER-SUPPLIED PATH IS NEVER THE FORMAT STRING.
 *
 * `console.error` treats its first argument as a printf format: a url carrying "%s" consumes
 * the next argument, so `console.error(\`...${url}\`, err)` loses the ERR -- the one thing the
 * line exists to record -- and does so from a value a caller supplies. CodeQL raised it as a
 * high alert (js/tainted-format-string) once the export work added call sites where a request
 * path reaches these helpers.
 *
 * Scoped to this ONE module rather than a repo-wide scan, deliberately. Thirty-odd other
 * console calls in server/ interpolate job names and counts, none of which come from a
 * request; a scan that flagged all of them would be a ratchet nobody reads (see CLAUDE.md on
 * exactly that trade). What is special here is that every exported function in this file takes
 * a path from its caller, and several of those callers hand it straight from an upload.
 */
describe("server/uploaded-files.ts logging", () => {
  const src = readFileSync("server/uploaded-files.ts", "utf8");

  it("never interpolates a url into the first argument of a console call", () => {
    const offenders = src
      .split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /console\.(error|warn|log)\(`[^`]*\$\{\s*(url|sourceUrl|destination\w*)/.test(line));
    expect(
      offenders,
      "pass the path as a later argument: console.error(\"...\", url, err)",
    ).toEqual([]);
  });

  it("still logs the path and the error, so the line keeps its point", () => {
    // The fix must not become "drop the url": which file failed to delete is the whole reason
    // somebody reads this log.
    expect(src).toContain('console.error("Failed to delete uploaded file at", url, err)');
    expect(src).toContain('console.error("Failed to copy uploaded file", sourceUrl, err)');
  });
});
