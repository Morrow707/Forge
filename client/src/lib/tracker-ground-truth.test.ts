import { describe, it, expect } from "vitest";
import { GROUND_TRUTH, relativeError, summarizeError } from "./tracker-ground-truth";

describe("tracker ground truth", () => {
  it("computes the sign and size of the seed error", () => {
    // The bench set where a broken calibration reported 181cm of bar travel
    // against a sensor's 15.3 inches. Over-reported by roughly 360%.
    const bench = GROUND_TRUTH[0];
    const error = relativeError(bench);
    expect(error).toBeGreaterThan(3);
  });

  it("refuses to call a handful of samples a measurement", () => {
    // The honest answer while the table is this thin. A threshold derived from
    // one or two sets is still a guess wearing a number, and the summary has to
    // say so rather than reporting a confident figure.
    //
    // Asserted as the RULE rather than as the current row count: this pinned
    // "exactly one group" and so failed the first time real paired data was
    // added, which is the one moment it should have had nothing to say.
    const summary = summarizeError();
    expect(summary.length).toBeGreaterThan(0);
    for (const group of summary) {
      expect(group.usable, `${group.exercise} ${group.metric}`).toBe(group.samples >= 5);
    }
    // And nothing has cleared that bar yet. When something does, this line is
    // the one that fails, and that failure is the good news.
    expect(summary.every((g) => !g.usable)).toBe(true);
  });

  it("uses a median so one broken reading does not set the error rate", () => {
    // Four good sets and one catastrophic calibration failure. A mean would
    // report the tracker as 70% out; it is actually about 5% out with one
    // failure that should have been detected rather than measured.
    const entries = [
      ...Array.from({ length: 4 }, (_, i) => ({
        ...GROUND_TRUTH[0],
        id: `good-${i}`,
        trueValue: 40,
        trackedValue: 42,
      })),
      { ...GROUND_TRUTH[0], id: "broken", trueValue: 40, trackedValue: 180 },
    ];
    const summary = summarizeError(entries);
    expect(summary[0].medianAbsoluteError).toBeCloseTo(0.05, 2);
    expect(summary[0].worst).toBeGreaterThan(3);
    expect(summary[0].usable).toBe(true);
  });

  it("keeps enough about each entry to explain a discrepancy", () => {
    // An error figure with no record of the camera angle or the calibration
    // state is a number nobody can act on.
    for (const entry of GROUND_TRUTH) {
      expect(entry.instrument.length).toBeGreaterThan(3);
      expect(entry.exercise.length).toBeGreaterThan(3);
      expect(entry.trueValue).toBeGreaterThan(0);
    }
  });
});
