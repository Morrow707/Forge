import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// RULE #1, THE 2026-09-29 CLAUSE: no surface after a take tells the athlete where to stand.
//
// Scott, on the bench banner ("Filming square to the side, camera level with the bar, gives the
// most reliable read"): "fix that error message, and make a note in Claude.md to never have it
// pop up again. The athlete is able to film from any angle." The audit that followed found the
// same sentence, in eleven spellings, on every other tracker dialog -- "make sure your feet
// leave the ground clearly in frame", "try again with your whole body in frame", "make sure
// both hands and the kettlebell stay in frame". Each was attached to an empty save, so the
// athlete was refused AND told it was their fault.
//
// Scans the directory rather than holding a list, for the reason the refused-capture scan does:
// the dialog that gets the next one will not be on anybody's list. Pre-recording guidance lives
// in exercise-camera-profile.ts and is allowed; a tracker dialog's own copy is what this reads.
const dir = join(process.cwd(), "client/src/components");
const dialogs = readdirSync(dir).filter((f) => /tracker-dialog\.tsx$/.test(f));

const FORBIDDEN = [
  /make sure [^"]*in frame/i,
  /stays? in frame/i,
  /in frame throughout/i,
  /try again with/i,
  /whole body in frame/i,
  /square to the side/i,
  /level with the bar/i,
  /clearly visible/i,
  /withheld rather than guessed/i,
  /full motion in frame/i,
];

describe("no tracker dialog tells the athlete where to stand after a take", () => {
  it("finds the dialogs", () => {
    expect(dialogs.length).toBeGreaterThanOrEqual(15);
  });

  for (const file of dialogs) {
    it(`${file} carries no framing prescription in its copy`, () => {
      const src = readFileSync(join(dir, file), "utf8");
      // String literals only: comments quoting the old copy are how the next reader learns what
      // was removed, and they are not shown to anybody.
      const literals = src.match(/"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
      const offenders = literals.filter((lit) => FORBIDDEN.some((re) => re.test(lit)));
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  }
});
