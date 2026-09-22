import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readdirSync } from "node:fs";

// CLOSING THE CAMERA EARLY IS ONLY SAFE IF THE CAPTURE CARRIES ITS OWN SET NUMBER.
//
// The parent's capture handlers read the set being filmed off their own state and return early
// when it is null -- and closing the dialog clears exactly that state. So a dialog that gained
// the early close without threading the set number through would have logged the set, run the
// analysis, and then dropped the result on the floor in silence. Worse than the wait it fixes.
//
// Scanned rather than listed, same reasoning as refused-capture-survives.test.ts: this file
// began as three dialogs and the next one will not be on anybody's list.
const dir = join(process.cwd(), "client/src/components");
const dialogs = readdirSync(dir).filter((f) => /^av-.*tracker-dialog\.tsx$/.test(f));
const read = (f: string) => readFileSync(join(dir, f), "utf8");

describe("a dialog that closes early hands back the set it filmed", () => {
  it("finds the dialogs to check", () => {
    expect(dialogs.length).toBeGreaterThanOrEqual(6);
  });

  for (const file of dialogs) {
    const src = read(file);
    if (!src.includes("onRecordingStopped")) continue;
    it(`${file} pins the set number before it closes`, () => {
      // Either it threads an explicit forSetNumber through every onCapture (bar, jump), or it
      // pins one at stop and routes every onCapture through a shim (kettlebell, med ball, swing).
      const threads = /onCapture\([^)]*forSetNumber/s.test(src);
      const pins = src.includes("capturedSetRef.current = setNumber");
      expect(threads || pins, `${file} closes early without carrying its set number`).toBe(true);
    });

    it(`${file} only closes early when the parent can show progress`, () => {
      // A dialog that closes with nowhere to hand the progress leaves the athlete with no sign
      // anything is still running, which is worse than watching the analysis.
      const handler = src.slice(src.indexOf("onRecordingStopped"), src.indexOf("onRecordingStopped") + 600);
      expect(handler).toContain("onAnalysisStarted");
    });
  }
});
