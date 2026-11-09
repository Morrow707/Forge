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

/* COMMENTS COME OFF BEFORE ANY NEGATIVE ASSERTION. A comment explaining a fix is exactly where
 * the old form gets quoted, so prose about what the code no longer does is indistinguishable
 * from the code still doing it -- CLAUDE.md calls this the most repeated self-inflicted failure
 * in this repo, and the 2026-11-09 fix below quotes `onCapture` in its own explanation.
 *
 * LINE-AWARE, NOT THE TWO-REGEX VERSION. A non-greedy block-comment regex pairs a comment opener
 * inside a string or a regex with the next real closer thousands of lines away; on a big file it
 * silently empties the haystack, which reads as the code being wrong. A block comment counts only
 * when its opener starts the line, and an end-of-line comment is cut only where the slashes have
 * balanced quotes before them. */
function stripComments(src: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of src.split("\n")) {
    let l = line;
    if (inBlock) {
      const close = l.indexOf("*/");
      if (close === -1) { out.push(""); continue; }
      l = l.slice(close + 2);
      inBlock = false;
    }
    const open = l.search(/^\s*\/\*/);
    if (open !== -1) {
      const close = l.indexOf("*/", open);
      if (close === -1) { inBlock = true; out.push(l.slice(0, open)); continue; }
      l = l.slice(0, open) + l.slice(close + 2);
    }
    let quote: string | null = null;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "/" && l[i + 1] === "/") { l = l.slice(0, i); break; }
    }
    out.push(l);
  }
  return out.join("\n");
}

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

/* AND THE SAME ASYMMETRY IN THE OTHER SHAPE: if/else.
 *
 * The rule above is right and its SHAPE was too narrow. On 2026-10-08 an audit found four
 * dialogs losing a refused take through a plain `else`, not a `catch` -- av-jump twice,
 * av-swing and the web swing. Each sits directly under a comment describing this very bug
 * being fixed in the `catch` six lines above it, and every one of them was green here, because
 * none of them is in a catch.
 *
 *   if (recordVideo && uploadPromise) { ...await...; onCapture(empty); onOpenChange(false); }
 *   else { toast.error("Couldn't get a clean read on this take. The clip is saved."); }
 *
 * The else is the branch taken when there is no upload in flight at all -- a refused take with
 * the form-check switch off -- so the set got no row, no number and no diagnostics. It also
 * left the dialog open and spinning, and the message claimed a clip was saved when the
 * condition for reaching it is that nothing was uploaded.
 *
 * Same rule, same escape hatch: if one branch reports the take, its sibling reports the take.
 * `else if` is deliberately not matched -- a chain is a sequence of conditions, and the final
 * plain `else` of one still is.
 */
function ifElseBranches(source: string): { ifBody: string; elseBody: string; at: number }[] {
  const out: { ifBody: string; elseBody: string; at: number }[] = [];
  const re = /\}\s*else\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    // Walk back from the `}` that closes the if-body to its matching `{`.
    let depth = 1;
    let i = m.index - 1;
    while (i >= 0 && depth > 0) {
      if (source[i] === "}") depth++;
      else if (source[i] === "{") depth--;
      i--;
    }
    if (depth !== 0) continue;
    const ifBody = source.slice(i + 2, m.index);
    const elseBlock = matchedBlock(source, m.index + m[0].length - 1);
    out.push({ ifBody, elseBody: elseBlock.body, at: m.index });
  }
  return out;
}

describe("a capture whose sibling branch reported it", () => {
  for (const file of TRACKER_DIALOGS) {
    const source = readFileSync(join(COMPONENTS, file), "utf8");
    // Only the branches that actually report a take. An if/else about anything else is not
    // this rule's business.
    const reporting = ifElseBranches(source).filter((p) => p.ifBody.includes("onCapture("));

    it(`${file} reports the take on every branch, not just the one that worked`, () => {
      for (const pair of reporting) {
        if (pair.elseBody.includes(EXEMPTION)) continue;
        expect(
          pair.elseBody,
          `${file}: one branch of this if/else reports the capture and its else does not. ` +
            `That is the same loss the try/catch rule above pins, in the shape that slipped ` +
            `past it four times. Call onCapture with the metrics you have, or write ` +
            `"${EXEMPTION} <why>" in the else.`,
        ).toContain("onCapture(");
      }
    });

    it(`${file} does not leave the dialog open and spinning on the branch it lost`, () => {
      // The other half of the same bug: no onOpenChange left the dialog open, no
      // setSaving(false) left it spinning under a toast that said the clip was saved.
      for (const pair of reporting) {
        if (pair.elseBody.includes(EXEMPTION)) continue;
        if (!pair.ifBody.includes("onOpenChange(false)")) continue;
        expect(
          pair.elseBody,
          `${file}: this branch reports the take and never closes the dialog.`,
        ).toContain("onOpenChange(false)");
      }
    });
  }
});

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

// THE CAMERA CLOSES WHEN THE ANALYSIS STARTS, NOT WHEN IT FINISHES.
//
// onAnalysisStarted's own comment has always said the dialog closes as soon as it fires, and
// nothing closed it -- every onOpenChange(false) sat at the end of the save path, after the
// analysis. So the athlete stared at "Analyzing recording -- 0 frames processed..." over a live
// camera preview for 39 seconds on a 28-second take. Scott, 2026-09-22: "it should back out of
// the camera completely to upload in the background."
describe("the tracker dialog hands over to the set card", () => {
  it("closes in the same breath as onAnalysisStarted", () => {
    const src = readFileSync(
      join(process.cwd(), "client/src/components/av-bar-tracker-dialog.tsx"),
      "utf8",
    );
    const started = src.indexOf("onAnalysisStarted(forSetNumber);");
    expect(started).toBeGreaterThan(-1);
    // The close has to be the next thing that happens, not something a later branch might skip.
    const nextFewLines = src.slice(started, started + 1400);
    expect(nextFewLines).toContain("onOpenChange(false);");
    // ...and before the upload is even started, so a video has no chance to hold the camera open.
    expect(nextFewLines.indexOf("onOpenChange(false);")).toBeLessThan(
      nextFewLines.indexOf("uploadOrQueueVideo("),
    );
  });
});

/**
 * A VIDEO FAILURE MUST NEVER TAKE THE CAPTURE'S NUMBERS WITH IT -- ASSERTED AS THE RULE.
 *
 * The scan above catches the onCapture shape. It did not catch the four SKILL dialogs, which
 * save through a direct apiRequest to /api/athlete/skill-session-logs instead: their video
 * upload sat bare inside the same try as that save, so an upload that threw ran the catch and
 * the drill's numbers were never written at all. Found 2026-09-28, in all four at once.
 *
 * Same lesson as the scan above, one level up: a test aimed at one SPELLING of the bug misses
 * the bug written another way. This asserts the rule instead -- if a save path uploads a video,
 * that upload is inside its own try, so its failure can only cost the video.
 */
describe("a skill capture survives its video failing", () => {
  const skillDialogs = readdirSync(COMPONENTS).filter(
    (f) =>
      f.endsWith("tracker-dialog.tsx") &&
      readFileSync(join(COMPONENTS, f), "utf8").includes("/api/athlete/skill-session-logs"),
  );

  it("finds the skill dialogs to check", () => {
    expect(skillDialogs.length).toBeGreaterThanOrEqual(4);
  });

  it.each(skillDialogs)("%s uploads through the shared queue, never a bare FormData", (file) => {
    const src = readFileSync(join(COMPONENTS, file), "utf8");
    // uploadOrQueueVideo carries the Wi-Fi gate and the offline queue. A hand-rolled FormData
    // post has neither, which is how filming a sprint off Wi-Fi burned an athlete's data.
    expect(src).not.toContain('apiRequest("POST", "/api/athlete/skill-video"');
    expect(src).toContain("uploadOrQueueVideo(");
  });

  it.each(skillDialogs)("%s keeps the upload in its own try", (file) => {
    const src = readFileSync(join(COMPONENTS, file), "utf8");
    const upload = src.indexOf("uploadOrQueueVideo(");
    const log = src.indexOf("/api/athlete/skill-session-logs");
    expect(upload).toBeGreaterThan(-1);
    expect(log).toBeGreaterThan(upload);
    // The catch that protects the upload has to sit BETWEEN it and the session-log save, or the
    // upload is still sharing the save's try and the numbers are still hostage to it.
    const between = src.slice(upload, log);
    expect(between).toMatch(/catch\s*(\([^)]*\))?\s*\{/);
  });
});

/* AND THE SALVAGE MUST NOT BE CONDITIONAL ON THE UPLOAD EXISTING.
 *
 * Scott, 2026-11-09, having filmed a back squat and lost it: "I just got a couldn't analyze so it
 * cancelled it. Didn't save my back squat." Then the half that makes it a bug rather than a bad
 * day: "It didn't show up in the debug or in the diagnostics."
 *
 * The rule above -- if a try reports the take, its catch must too -- was satisfied. The hole was
 * one level out. On the `if (!result)` branch, where the analysis has ALREADY failed, six dialogs
 * wrapped the entire salvage in `if (inFlightUpload) { ... }` and then plainly returned. With no
 * upload in flight the function did nothing at all: no onCapture, no row, no diagnostics blob, not
 * one debug line. A filmed set came out identical to a set nobody pointed a camera at, which is
 * the precise failure Rule #1 exists to refuse and the one case a tracking report can never show
 * anybody, because an absence has nothing to show.
 *
 * REACHABLE TWO WAYS, the second of them the common one:
 *   - video recording switched off for the exercise, so there was never an upload; or
 *   - the analysis throwing BEFORE `onBlobReady` fired. `use-av-body-tracking.ts` awaits the
 *     re-encode AFTER the analysis, so an analysis that falls over early -- the native stall
 *     watchdog giving up is the documented case -- leaves `uploadPromise` null even though video
 *     was on and the recording happened.
 *
 * THE RULE IS STRUCTURAL, NOT ABOUT WORDING: on that branch the call reporting the take must not
 * sit inside ANY conditional on the upload. The upload decides whether a CLIP is attached; it
 * never decides whether a ROW exists.
 */
describe("a take whose analysis failed is reported even when there is no upload", () => {
  const SALVAGE_GUARD = "if (inFlightUpload) {";
  const withSalvage = TRACKER_DIALOGS.filter((f) =>
    readFileSync(join(COMPONENTS, f), "utf8").includes("const inFlightUpload = uploadPromise"),
  );

  it("finds the dialogs that salvage a failed analysis", () => {
    expect(withSalvage.length).toBeGreaterThanOrEqual(6);
  });

  it.each(withSalvage)("%s reports the take outside EVERY upload conditional", (file) => {
    const src = stripComments(readFileSync(join(COMPONENTS, file), "utf8"));
    // EVERY such block, not just the first. The first draft of this case checked only the first
    // one, and a mutation that moved the report into a SECOND `if (inFlightUpload)` straight
    // after it passed -- which is the bug wearing a new brace.
    let found = 0;
    for (let at = src.indexOf(SALVAGE_GUARD); at !== -1; at = src.indexOf(SALVAGE_GUARD, at + 1)) {
      found++;
      const { body } = matchedBlock(src, src.indexOf("{", at));
      expect(body, `onCapture must not be inside an \`${SALVAGE_GUARD}\` block`).not.toContain("onCapture(");
    }
    expect(found, "the upload conditional").toBeGreaterThan(0);
  });

  it.each(withSalvage)("%s reports the take and says so in the debug console", (file) => {
    const src = stripComments(readFileSync(join(COMPONENTS, file), "utf8"));
    const at = src.indexOf(SALVAGE_GUARD);
    const { end } = matchedBlock(src, src.indexOf("{", at));
    // Between the conditional closing and the function returning. Bounded by the block's own
    // brace, never a character count -- a window would move the moment somebody adds a comment.
    const after = src.slice(end, end + 1600);
    expect(after, "onCapture after the conditional").toContain("onCapture(");
    // and the failure reaches the ONE instrument that exists on a phone. There is no console on
    // an iPhone; a failure nobody can read is the half of this bug Scott actually reported.
    expect(after, "a debug line for the failure").toContain("logDebug(");
  });
});
