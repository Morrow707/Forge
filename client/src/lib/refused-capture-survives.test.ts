import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// A REFUSED CAPTURE IS THE ONE WHOSE RECORD MATTERS MOST.
//
// When a tracker cannot trust its numbers it does not discard the take: it writes an empty (or
// scale-free) metrics row plus a trackingDiagnostics blob saying why, and saves the clip for the
// coach. That blob is the only account of what went wrong, and the tracking report is built to
// render it.
//
// Every one of these dialogs had the same hole. If the VIDEO UPLOAD threw, the catch toasted and
// stopped -- no onCapture, no close -- so the metrics and the diagnostics went with it. The set
// kept its typed reps and weight and nothing anywhere recorded that a camera had run, which is
// indistinguishable from never having pressed record.
//
// The asymmetry is what gives it away: finishWithRecording's catch (the SUCCESS path) has always
// called onCapture and closed. A good capture survived a failed upload; a refused one did not.
const DIALOGS = [
  "av-bar-tracker-dialog.tsx",
  "av-jump-tracker-dialog.tsx",
  "av-kb-swing-tracker-dialog.tsx",
  "av-medball-tracker-dialog.tsx",
  "av-swing-tracker-dialog.tsx",
  "swing-tracker-dialog.tsx",
  "kb-swing-tracker-dialog.tsx",
  "medball-tracker-dialog.tsx",
];

describe("a capture whose video upload failed", () => {
  for (const file of DIALOGS) {
    const source = readFileSync(join(__dirname, "..", "components", file), "utf8");

    it(`${file} still reports the take`, () => {
      // Every "the video didn't save either" branch hands the metrics up anyway.
      const catches = [...source.matchAll(/didn't save either[\s\S]{0,1400}?\n\s*\} finally/g)];
      expect(catches.length, `${file} has no upload-failure branch to check`).toBeGreaterThan(0);
      for (const [block] of catches) {
        expect(block, file).toContain("onCapture(");
        expect(block, file).toContain("onOpenChange(false)");
      }
    });
  }
});
