import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// THE DIAGNOSTICS RECORD OF A FAILED CAPTURE IS NOT A NICETY. IT IS THE PRODUCT.
//
// When a tracker cannot trust its numbers it does not discard the take: it writes an empty (or
// scale-free) metrics row plus a trackingDiagnostics blob saying why, and saves the clip for the
// coach. That blob is the only account of what went wrong, and the admin tracking report over
// those blobs is the entire feedback loop for this pipeline. Nobody can fix a camera problem
// from a set that silently came back empty. A capture that loses its own explanation therefore
// costs MORE than a capture that failed loudly.
//
// THE BUG THIS PINS. Ten tracker dialogs shared one shape: if the VIDEO UPLOAD threw, the catch
// toasted "And the video didn't save either" and stopped. No onCapture, no close. Metrics and
// diagnostics both dropped, because of a failure in a separate concern, leaving a set
// indistinguishable from one where record was never pressed.
//
// The asymmetry is what gives it away, and it is what this test encodes: finishWithRecording's
// catch, on the SUCCESS path, always called onCapture and closed. A good capture survived a
// failed upload; a refused one did not. Exactly backwards.
//
// THE RULE. If a try block reports the take, its catch must report the take. Nothing about
// videos, uploads or wording -- those are the details that changed between dialogs and would
// have let a reworded copy slip through.
//
// DISCOVERED, NEVER LISTED. This began as a hand-written list of the eight files known to have
// the bug. Rerun as a directory scan it immediately found more, which is the argument against
// ever writing the list down: there are fifteen dialogs and the next one will not be on it.
const COMPONENTS = join(__dirname, "..", "components");
const TRACKER_DIALOGS = readdirSync(COMPONENTS)
  .filter((f) => f.endsWith("tracker-dialog.tsx"))
  .sort();

/** The one deliberate escape, and it costs a sentence of justification in the source. */
const EXEMPTION = "diagnostics-exempt:";

function matchedBlock(source: string, openBraceIdx: number): { body: string; end: number } {
  let depth = 1;
  let i = openBraceIdx + 1;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }
  return { body: source.slice(start, i - 1), end: i };
}

/** Every try/catch pair in a file, as [tryBody, catchBody]. */
function tryCatchPairs(source: string): { tryBody: string; catchBody: string; at: number }[] {
  const pairs: { tryBody: string; catchBody: string; at: number }[] = [];
  const re = /\btry\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const tryBlock = matchedBlock(source, m.index + m[0].length - 1);
    const after = source.slice(tryBlock.end, tryBlock.end + 80);
    const c = after.match(/^\s*catch\s*(\([^)]*\))?\s*\{/);
    if (!c) continue;
    const catchOpen = tryBlock.end + c[0].length - 1;
    const catchBlock = matchedBlock(source, catchOpen);
    pairs.push({ tryBody: tryBlock.body, catchBody: catchBlock.body, at: m.index });
  }
  return pairs;
}

describe("a capture whose save path threw", () => {
  it("has tracker dialogs to check at all", () => {
    // Guards the guard. A rename that stopped matching *tracker-dialog.tsx would make every
    // assertion below vacuously pass, which is the quiet way a rule like this dies.
    expect(TRACKER_DIALOGS.length).toBeGreaterThanOrEqual(15);
  });

  for (const file of TRACKER_DIALOGS) {
    const source = readFileSync(join(COMPONENTS, file), "utf8");
    const reporting = tryCatchPairs(source).filter((p) => p.tryBody.includes("onCapture("));

    it(`${file} reports the take on failure too`, () => {
      for (const pair of reporting) {
        if (pair.catchBody.includes(EXEMPTION)) continue;
        expect(
          pair.catchBody,
          `${file}: this try reports the capture and its catch does not. A capture that ` +
            `fails is the one the tracking report most needs. Call onCapture with the metrics ` +
            `you have, or write "${EXEMPTION} <why>" in the catch.`,
        ).toContain("onCapture(");
      }
    });
  }
});
