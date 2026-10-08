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
/* EVERY DIALOG THAT POINTS A CAMERA AT SOMEBODY, not just the ones named "tracker".
 *
 * This matched /tracker-dialog\.tsx$/ alone, and on 2026-10-08 an audit found the banned
 * sentence alive in two dialogs the glob never looked at: av-overhead-squat-capture-dialog.tsx
 * ("make sure your whole body stayed in frame and try again") and av-goniometer-capture-dialog
 * .tsx ("make sure the joint stays fully in frame and try again"). Both are post-take banners
 * that name the athlete's framing as the fault, which is the exact shape Rule #1's 2026-09-29
 * clause bans, and both are attached to a take that produced nothing.
 *
 * A rule about what a camera screen may say to an athlete has no business being keyed on the
 * word "tracker" in a filename. */
const dialogs = readdirSync(dir).filter((f) => /-(tracker|capture)-dialog\.tsx$/.test(f));

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
  // A toast about the angle, however gently worded, is still a banner about the angle. The
  // mismatch note goes into trackingDiagnostics.cameraView and is never toasted.
  /head-on or from behind/i,
  /needs a (side|front) view/i,
];

describe("no tracker dialog tells the athlete where to stand after a take", () => {
  it("finds the dialogs", () => {
    expect(dialogs.length).toBeGreaterThanOrEqual(15);
  });

  for (const file of dialogs) {
    it(`${file} carries no framing prescription in its copy`, () => {
      const src = readFileSync(join(dir, file), "utf8");
      /* EVERYTHING THE SCREEN CAN RENDER, not just string literals.
       *
       * This read string literals only, and the two banners the 2026-10-08 audit found are
       * BARE JSX TEXT -- `Couldn't get a clear enough read, make sure your whole body stayed in
       * frame and try again.` sitting between tags, in no quotes at all. A scan for a rule about
       * what an athlete is shown that cannot see the most ordinary way to show them something is
       * not a scan.
       *
       * The original reason for the narrowing is real and is kept by stripping COMMENTS instead:
       * a comment quoting the copy that was removed is how the next reader learns what it was,
       * and nobody is ever shown one. */
      /* Comments blanked to SAME-LENGTH whitespace rather than removed, so every index in the
       * scanned text still points at the same character in the raw source. That is what lets
       * the exemption below be checked against the real file, right where the hit is. */
      const blank = (m: string) => m.replace(/[^\n]/g, " ");
      const withoutComments = src
        .replace(/\/\*[\s\S]*?\*\//g, blank)
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.slice(p1.length)));

      /* THE ONE ESCAPE, and it costs a sentence of justification in the source.
       *
       * Rule #1 bans prescribing a view AFTER a take and explicitly ALLOWS describing one
       * before -- exercise-camera-profile.ts does exactly that for every lift. A sprint and a
       * sled push genuinely need the athlete to know the whole run will be in shot, and that
       * note belongs on the setup step.
       *
       * The catch, and the reason each exemption has to state its own reasoning: on three of
       * these dialogs a FAILED ANALYSIS returns to the setup step, so the setup note is also
       * the first thing shown after an unreadable take -- a verdict blaming the athlete's
       * framing, reached by a route no scan was looking at. The three with a failure route gate
       * the banner on a readFailed flag and say so.
       *
       * Written `framing-exempt: <why>` in a JSX comment IMMEDIATELY above the copy it covers.
       * Scoped to the BLOCK, never the file and never a character count: a file-wide escape
       * would let one justified setup banner silence every other sentence in the same dialog,
       * and a fixed window is a magic number that gets widened the first time a comment grows
       * (this one failed at 900 against a 966-character justification, which is an argument
       * about prose length and not about the rule). The structural test is that no JSX block
       * has CLOSED between the marker and the copy -- if one has, the marker was explaining
       * something else. */
      const coveredByExemption = (hitIdx: number) => {
        const before = src.slice(0, hitIdx);
        const marker = before.lastIndexOf("framing-exempt:");
        if (marker < 0) return false;
        return !before.slice(marker).includes(")}");
      };
      const offenders: string[] = [];
      for (const re of FORBIDDEN) {
        const all = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
        let m: RegExpExecArray | null;
        while ((m = all.exec(withoutComments))) {
          if (coveredByExemption(m.index)) continue;
          offenders.push(
            `${re} => ${withoutComments.slice(Math.max(0, m.index - 60), m.index + 90).replace(/\s+/g, " ").trim()}`,
          );
        }
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  }

  it("the bar tracker never toasts the camera-view note (it is a diagnostics field)", () => {
    const src = readFileSync(join(dir, "av-bar-tracker-dialog.tsx"), "utf8");
    expect(src).not.toMatch(/toast\.\w+\(\s*viewProblem/);
    expect(src).not.toMatch(/toast\.\w+\(\s*cameraViewMismatch/);
    expect(src).toMatch(/cameraView:\s*cameraViewDiagnostics/);
  });
});
