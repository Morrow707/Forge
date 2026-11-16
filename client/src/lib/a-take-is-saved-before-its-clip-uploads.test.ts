import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** A MEASURED TAKE IS SAVED BEFORE ITS CLIP UPLOADS (2026-11-16).
 *
 * The bar tracker used to await the clip's upload (10-30s of a phone pushing a video) before
 * handing the take's numbers to the workout screen, so for that whole window the numbers existed
 * only in memory: leave the app or have it killed and a finished analysis was lost. Now the take is
 * handed up first and the clip follows in a second call with the SAME metrics object, which the
 * screen attaches only while that take is still the set's latest. Source scans, bounded by braces,
 * comments stripped (the explanations quote the forms). */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

function stripComments(src: string): string {
  return src
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
    .split("\n")
    .map((line) => {
      let quote: string | null = null;
      for (let i = 0; i < line.length - 1; i++) {
        const c = line[i];
        if (quote) {
          if (c === "\\") i++;
          else if (c === quote) quote = null;
        } else if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function braceBody(src: string, marker: string): string {
  const idx = src.indexOf(marker);
  expect(idx, `${marker} not found`).toBeGreaterThan(-1);
  // The body starts at the first "{" after the signature's own parentheses close.
  let i = src.indexOf("(", idx);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === "(") paren++;
    else if (src[i] === ")" && --paren === 0) break;
  }
  const open = src.indexOf("{", i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(open, j + 1);
  }
  throw new Error(`${marker} has no closing brace`);
}

describe("a measured take is saved before its clip uploads", () => {
  it.each([
    ["client/src/components/av-bar-tracker-dialog.tsx", "async function finishWithRecording("],
    ["client/src/components/av-jump-tracker-dialog.tsx", "async function finishWithRecording("],
  ])("%s hands the take up before it awaits the upload", (file, marker) => {
    const body = braceBody(stripComments(read(file)), marker);
    const awaitUpload = body.indexOf("await inFlightUpload");
    expect(awaitUpload, "finishWithRecording no longer awaits the upload").toBeGreaterThan(-1);
    const firstWithMetrics = body.indexOf("onCapture(metrics, undefined, forSetNumber, skeletonFrames)");
    expect(firstWithMetrics, "the take is not handed up without its clip").toBeGreaterThan(-1);
    expect(firstWithMetrics).toBeLessThan(awaitUpload);
  });

  it("the screen attaches a follow-up clip only to the take it came from", () => {
    const src = stripComments(read("client/src/pages/workout.tsx"));
    const body = braceBody(src, "function handleTrackerCapture(");
    const attach = body.indexOf("latestTake === metrics");
    const record = body.indexOf("latestTakeBySetRef.current.set(targetSetNumber, metrics)");
    expect(attach).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(attach);
    // The follow-up writes the video alone, never the whole take again.
    const branch = body.slice(attach, body.indexOf("return;", attach));
    expect(branch).toMatch(/onUpdateSet\(targetSetNumber, \{ formCheckVideoUrl: videoUrl \}/);
    // A follow-up for a take a retake replaced is dropped.
    expect(body).toMatch(/latestTake !== metrics && appliedTakesRef\.current\.has\(metrics\)\)\s*\{\s*return;/);
  });
});
