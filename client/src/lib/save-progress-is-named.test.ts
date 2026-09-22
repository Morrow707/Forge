import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workout = readFileSync(resolve(__dirname, "../pages/workout.tsx"), "utf-8");
const hook = readFileSync(resolve(__dirname, "./use-av-body-tracking.ts"), "utf-8");

/**
 * TWO WAITS, TWO BARS, TWO NUMBERS.
 *
 * The athlete waits through analysis and then a save, and for a long time saw one bar whose
 * percentage was fed only by onUploadProgress -- so "Processing... 79%" was really the SAVE at
 * 79%, and analysis, the slower half, showed no number at all. Naming the two phases was the
 * first fix and was not enough: "I want a processing percentage, and a saving percentage, so it
 * should be two bars not just the one."
 */
describe("both halves of the wait have their own bar", () => {
  it("draws a phase bar for each of the two waits", () => {
    expect(workout).toContain('<ProcessingPhaseBar\n                          label="Processing"');
    expect(workout).toContain('<ProcessingPhaseBar label="Saving"');
  });

  it("feeds them from two different sources", () => {
    // The whole complaint was one number standing in for two. If both bars read the same map
    // again, that is the same bug with twice the furniture.
    expect(workout).toContain("percent={analysisProgress[set.setNumber]}");
    expect(workout).toContain("percent={processingProgress[set.setNumber]}");
    expect(workout).toContain("onAnalysisProgress={(setNumber, percent) =>");
    expect(workout).toContain("onUploadProgress={(setNumber, percent) =>");
  });

  it("never invents the analysis percentage", () => {
    // A progress bar that lies is worse than one that is absent. This number is measured: every
    // sampled frame arrives carrying its own timestamp into the clip, and it is divided by how
    // long the athlete actually filmed. No timer, no easing, no fabricated ramp.
    expect(hook).toContain("Math.round((frame.timestamp / totalSeconds) * 100)");
    expect(hook).toContain("const totalSeconds = recordedSecondsRef.current;");
  });

  it("does not let the analysis bar reach 100 on its own", () => {
    // The last sampled frame is not the end of the work -- the summary, the metrics and the
    // diagnostics all follow it. A bar sitting full while the athlete still waits is its own
    // kind of lie, so analysis is capped at 99 and only completes when the upload starts.
    expect(hook).toContain("Math.min(99,");
    expect(workout).toContain("done={processingProgress[set.setNumber] != null}");
  });

  it("clears both phases together", () => {
    // A leftover analysis percentage shows up on the NEXT take of this set number as a bar
    // that is already part-full.
    expect(workout).toContain("setAnalysisProgress((prev) => {");
  });
});

// 100% MEANS THE SERVER HAS IT, NOT THAT THE BYTES LEFT THE PHONE.
//
// upload.onprogress counts bytes handed to the network stack, so it hits loaded === total
// before the server has received the tail, written the clip and answered. On a large take
// that gap was twenty seconds of a bar sitting at 100% -- indistinguishable from a save that
// died. Reported on-device 2026-09-22.
describe("the saving bar cannot claim 100% early", () => {
  const client = readFileSync(resolve(__dirname, "./queryClient.ts"), "utf-8");

  it("caps the streamed fraction below 1", () => {
    expect(client).toContain("Math.min(e.loaded / e.total, 0.99)");
  });

  it("reports 1 only once the response has landed", () => {
    const onload = client.indexOf("xhr.onload");
    const full = client.indexOf("onProgress?.(1)");
    expect(full).toBeGreaterThan(onload);
  });

  it("renames the last stretch instead of parking on a number", () => {
    expect(workout).toContain('finishing ? "Finishing" : label');
    expect(workout).toContain("shown >= 99");
  });
});
