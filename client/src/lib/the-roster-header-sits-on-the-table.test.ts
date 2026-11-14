// A sticky header cell inside a horizontally scrolling box is positioned against that box, never
// against the page, so an offset of the app bar's height draws the header that far down inside the
// table (2026-11-14: the roster's header floated 313px into the athlete rows on a phone).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROSTER = path.resolve(__dirname, "../pages/coach/roster.tsx");
const APP_BAR_OFFSET = "var(--app-shell-sticky-height";

// Drops whole-line `//` comments so the explanation above the table cannot satisfy or fail the
// scan. Matches "  // top: var(--app-shell-sticky-height)"; leaves "style={{ top: 0 }}" alone.
// https://regex101.com/?regex=%5E%5Cs*%5C%2F%5C%2F
const WHOLE_LINE_COMMENT = /^\s*\/\//;
const code = (src: string) =>
  src
    .split("\n")
    .filter((line) => !WHOLE_LINE_COMMENT.test(line))
    .join("\n");

describe("the roster's header sits on the table", () => {
  it("the table is in a horizontally scrolling box (the premise)", () => {
    expect(code(fs.readFileSync(ROSTER, "utf8"))).toContain("overflow-x-auto");
  });

  it("no header cell is offset by the app bar's height", () => {
    expect(code(fs.readFileSync(ROSTER, "utf8"))).not.toContain(APP_BAR_OFFSET);
  });
});
