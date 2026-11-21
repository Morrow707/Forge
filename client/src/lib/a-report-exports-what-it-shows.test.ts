/* Every coach report card that shows a camera number keeps the accuracy caveat in its CSV, and the
 * export helper escapes like the roster export does. The caveat rides as the first line because a
 * CSV has nowhere else to carry it. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCsvExport } from "@/components/csv-export-button";

/** Characters of an export's props quoted in a failure message. */
const QUOTE_LENGTH = 80;
const REPORT_FILES = ["pages/coach/analytics.tsx", "pages/coach/leaderboard.tsx"];

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
// Block comments: matches "/* note */" across lines; rejects "a / b * c" (no closing pair on it).
// https://regex101.com/?regex=%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F&testString=%2F*%20note%20*%2F%0Aa%20%2F%20b%20*%20c
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
// Whole-line comments: matches "  // note"; rejects "x // note" (code before the slashes is kept).
// https://regex101.com/?regex=%5E%5Cs*%5C%2F%5C%2F.*%24&flags=gm&testString=%20%20%2F%2F%20note%0Ax%20%2F%2F%20note
const LINE_COMMENT = /^\s*\/\/.*$/gm;
const stripComments = (s: string) => s.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");
// A camera column header or note: matches "Peak m/s", "Peak W", "ROM cm", "camera-timed",
// "Seconds"; rejects "Est. 1RM" and "Total volume" (hand-logged columns).
// https://regex101.com/?regex=m%5C%2Fs%7CPeak%20W%7CROM%20cm%7Ccamera-timed%7CSeconds&testString=Peak%20m%2Fs%0AEst.%201RM
const CAMERA_COLUMN = /m\/s|Peak W|ROM cm|camera-timed|Seconds/;

const exportsIn = (file: string): string[] =>
  stripComments(read(file))
    .split("<CsvExportButton")
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf("/>")));

describe("CSV exports on coach reports", () => {
  it("puts a note above the header and escapes formula-looking cells", () => {
    const lines = buildCsvExport(["Athlete", "Value"], [["=cmd", 1]], "Camera numbers").split("\n");
    expect(lines).toEqual(["Camera numbers", "Athlete,Value", "'=cmd,1"]);
  });

  it("has no note line when none is given", () => {
    expect(buildCsvExport(["A"], [["x"]]).split("\n")[0]).toBe("A");
  });

  it.each(REPORT_FILES)("every export in %s that carries a camera column carries the caveat", (file) => {
    const found = exportsIn(file);
    expect(found.length).toBeGreaterThan(0);
    const missing = found.filter((e) => CAMERA_COLUMN.test(e) && !e.includes("CAMERA_ACCURACY_INLINE"));
    expect(missing.map((e) => e.slice(0, QUOTE_LENGTH))).toEqual([]);
  });
});
