import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workout = readFileSync(resolve(__dirname, "../pages/workout.tsx"), "utf-8");

/**
 * The athlete waits through two phases and only ever saw one name. The percentage is fed
 * exclusively by onUploadProgress, so "Processing... 79%" was the SAVE at 79% while analysis --
 * the slower half -- showed no number. Reported on-device: "still only shows the processing bar."
 */
describe("the wait is named for what it is doing", () => {
  it("calls the upload phase saving, with its percentage", () => {
    expect(workout).toContain("`Saving… ${processingProgress[set.setNumber]}%`");
  });

  it("calls the analysis phase analyzing", () => {
    expect(workout).toContain('"Analyzing…"');
  });

  it("no longer labels both phases the same thing", () => {
    expect(workout).not.toContain("`Processing… ${processingProgress[set.setNumber]}%`");
  });

  it("still only feeds the percentage from real upload progress", () => {
    // A percentage invented for the analysis phase would be a progress bar that lies, which is
    // worse than one that is absent -- the whole complaint here was not knowing which half.
    const feeds = workout.match(/setProcessingProgress\(\(prev\) => \(\{ \.\.\.prev, \[setNumber\]: percent \}\)\)/g);
    expect(feeds?.length).toBeGreaterThanOrEqual(1);
    expect(workout).toContain("onUploadProgress={(setNumber, percent) =>");
  });
});
