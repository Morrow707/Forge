// A DIAGNOSTICS BLOB THAT IS BUILT AND THEN DROPPED IS WORSE THAN ONE NEVER BUILT.
//
// Three scans already guard this pipeline's diagnostics and all three stop at the dialog
// directory: refused-capture-survives.test.ts (the dialog hands the metrics up),
// every-capture-says-how-it-was-sampled.test.ts and every-capture-names-its-object-system.test.ts
// (the dialog fills the blob). Between the dialog and the database sits one more step nobody was
// watching -- the capture handler on the workout page that maps the metrics onto the set.
//
// On 2026-10-08 an audit found handleHorizontalLoadCapture mapping captureDeviceInfo,
// skeletonFrames and three numbers, and never trackingDiagnostics. Both sled dialogs build the
// blob correctly -- the sampling measure, and declareObjectSystem saying in words that this mode
// has NO object witness, which is the entire point of Rule #4's "record explicitly that it has
// none, so overwatch's silence is a recorded fact and not an absence" -- and it was discarded one
// function later. It was the only one of the five handlers on that page missing the key, so the
// two sled modes have appeared in every export with no diagnostics at all, and the three scans
// above were green throughout because each asserts an END of the pipe and never the middle.
//
// This watches the middle.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "client/src/pages/workout.tsx"), "utf8");

/** Every `function handle*Capture(...) { ... }` in the page, with its body. */
function captureHandlers(source: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /function\s+(handle\w*Capture)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const open = source.indexOf("{", re.lastIndex);
    if (open < 0) continue;
    let depth = 1;
    let i = open + 1;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    out.push({ name: m[1], body: source.slice(open + 1, i - 1) });
  }
  return out;
}

const handlers = captureHandlers(src);

describe("a capture handler carries the diagnostics blob to the server", () => {
  it("finds the handlers", () => {
    // Guards the guard: a rename that stopped matching would make every case below vacuous,
    // which is the quiet way a rule like this dies.
    expect(handlers.length).toBeGreaterThanOrEqual(5);
  });

  for (const h of handlers) {
    it(`${h.name} maps trackingDiagnostics onto the set`, () => {
      // Only handlers that actually write a set. One that does something else is not this
      // rule's business.
      if (!h.body.includes("onUpdateSet(")) return;
      // The one escape, same shape as the refused-capture scan's, and it costs a sentence.
      if (h.body.includes("diagnostics-exempt:")) return;
      expect(
        h.body,
        `${h.name} writes a set and never maps trackingDiagnostics. The dialog built the blob ` +
          `and this is where it is dropped -- which is invisible in every export, because an ` +
          `absent blob and a mode that never built one look identical. Map it, or write ` +
          `"diagnostics-exempt: <why>" in the handler.`,
      ).toContain("trackingDiagnostics");
    });
  }

  it("the sled handler specifically, because it is the one that was missing it", () => {
    const sled = handlers.find((h) => h.name === "handleHorizontalLoadCapture");
    expect(sled, "handleHorizontalLoadCapture is gone -- was it renamed?").toBeTruthy();
    expect(sled!.body).toContain("trackingDiagnostics: metrics?.trackingDiagnostics ?? null");
  });

  it("the box jump's headline reads the glitch flag, as build 621 intended", () => {
    // The other thing this page was quietly undoing. metrics.bestJumpHeightCm is the number
    // build 621 fixed with repsForSetBest, and the page consulted it ONLY when repBreakdown was
    // empty -- on the path every real box jump takes it recomputed a bare Math.max over every
    // rep, flagged ones included, so the 238.4cm reading survived the fix for it.
    //
    // CLAUDE.md names the search this closes: "the next place to look for it is any other
    // set-level Math.max over reps."
    expect(src).toContain("repsForSetBest(");
    expect(src).not.toMatch(/Math\.max\(\s*\.\.\.repBreakdown\.map\(\(r\) => r\.jumpHeightCm\)\s*\)/);
  });
});
