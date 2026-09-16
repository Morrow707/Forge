import { describe, expect, it } from "vitest";
import { buildTrackingReportEntries } from "./tracking-report";

// THE FAILURES THIS REPORT USED TO BE SILENT ABOUT.
//
// A real bench set, logged at 10 reps at 135lb, came back with 15 tracked reps and per-rep peak
// speeds up to 2.79 m/s. Every one of those numbers is wrong -- a loaded barbell does not move
// at 2.8 m/s, and the five phantom reps were averaged into the set's mean velocity, range of
// motion and velocity loss. The entry carried no flag at all, because the only rep-count check
// asked whether tracking found FEWER reps than were logged, and the only speed ceiling in the
// codebase is a per-frame glitch filter set at 3 m/s.
const benchRow = (over: Record<string, unknown>) =>
  ({
    date: "2026-09-16",
    athleteId: 2,
    exerciseName: "Bench Press",
    setNumber: 1,
    reps: 10,
    weight: "135",
    weightUnit: "lbs",
    trackingLevel: "full",
    trackingDiagnostics: {
      outcome: "ok",
      bodyPose: { framesTotal: 800, framesWithBody: 800, avgWristConfidence: 0.7 },
      objectDetection: { framesWithLeftImplement: 700, framesWithRightImplement: 700 },
    },
    ...over,
  }) as never;

describe("a set tracking found more reps in than the athlete logged", () => {
  it("is flagged, with the count and what it cost", () => {
    const [entry] = buildTrackingReportEntries([
      benchRow({ repBreakdown: Array.from({ length: 15 }, (_, i) => ({ repNumber: i + 1 })) }),
    ]);
    expect(entry.flags.join(" ")).toMatch(/Logged 10 reps but tracking found 15/);
    // Says what it did to the set, not only that the numbers differ.
    expect(entry.flags.join(" ")).toMatch(/averages are built from all 15/);
  });

  it("still flags the undercount it always did", () => {
    const [entry] = buildTrackingReportEntries([
      benchRow({ repBreakdown: Array.from({ length: 4 }, (_, i) => ({ repNumber: i + 1 })) }),
    ]);
    expect(entry.flags.join(" ")).toMatch(/only found 4/);
  });

  it("says nothing when the counts agree", () => {
    const [entry] = buildTrackingReportEntries([
      benchRow({ repBreakdown: Array.from({ length: 10 }, (_, i) => ({ repNumber: i + 1 })) }),
    ]);
    expect(entry.flags.join(" ")).not.toMatch(/reps but tracking/);
  });
});

describe("a reported bar speed no barbell lift reaches", () => {
  it("is flagged, and points at calibration rather than at the athlete", () => {
    const [entry] = buildTrackingReportEntries([benchRow({ peakVelocityMps: 2.79 })]);
    const text = entry.flags.join(" ");
    expect(text).toMatch(/2\.79 m\/s is above anything a loaded barbell lift reaches/);
    expect(text).toMatch(/calibration/i);
    expect(text).toMatch(/scale/i);
  });

  it("leaves an ordinary fast set alone", () => {
    // Real, and well inside published VBT range for speed work.
    const [entry] = buildTrackingReportEntries([benchRow({ peakVelocityMps: 1.4 })]);
    expect(entry.flags.join(" ")).not.toMatch(/above anything a loaded barbell/);
  });

  it("does not apply to modes that legitimately move faster", () => {
    // A medicine-ball throw at 9 m/s is a throw, not a broken scale.
    const [entry] = buildTrackingReportEntries([
      benchRow({ trackingLevel: "med_ball", peakVelocityMps: 9 }),
    ]);
    expect(entry.flags.join(" ")).not.toMatch(/above anything a loaded barbell/);
  });
});

describe("a set that captured but lost its diagnostics", () => {
  // These used to be excluded from the report outright, which made "the pipeline ran and its
  // explanation went missing" indistinguishable from "this never happened".
  it("appears, and says that is what happened", () => {
    const [entry] = buildTrackingReportEntries([
      benchRow({ trackingDiagnostics: null, peakVelocityMps: 0.8 }),
    ]);
    expect(entry).toBeDefined();
    expect(entry.flags.join(" ")).toMatch(/No pipeline diagnostics were saved for this set/);
  });

  it("does not claim a clean entry is missing them", () => {
    const [entry] = buildTrackingReportEntries([benchRow({ peakVelocityMps: 0.8 })]);
    expect(entry.flags.join(" ")).not.toMatch(/No pipeline diagnostics/);
  });
});
