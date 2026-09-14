import { describe, expect, it } from "vitest";
import { buildTrackingReportEntries, formatTrackingReport } from "./tracking-report";

// ONE UNREADABLE ROW TOOK DOWN THE PAGE THAT EXISTS TO READ THEM.
//
// trackingDiagnostics is a `json` column with no database-level constraint, and its shape has
// grown steadily -- bodyPose, objectDetection, trace and calibration were each added after rows
// already existed. Anything written through the API today is complete because the insert schema
// requires them; anything written before a field existed, or by any path that skips validation,
// is not.
//
// Found under a 500k-user load seed: a set whose diagnostics carried only an outcome threw
// "Cannot read properties of undefined (reading 'framesWithBody')" and the entire admin tracking
// report answered 500. That is the wrong failure mode whatever put the row there -- this page
// exists to investigate captures that went wrong, so a capture that went wrong enough to write a
// partial row is exactly when an admin needs the other nineteen entries.
describe("a partial diagnostics blob does not take the report down", () => {
  const goodRow = {
    date: "2026-09-14",
    athleteId: 2,
    exerciseName: "Back Squat",
    setNumber: 1,
    reps: 5,
    trackingLevel: "full",
    trackingDiagnostics: {
      outcome: "ok",
      bodyPose: { framesTotal: 100, framesWithBody: 100, avgWristConfidence: 0.8 },
      objectDetection: { framesWithLeftImplement: 90, framesWithRightImplement: 88 },
    },
  } as never;

  // The shape that crashed it: an outcome and nothing else.
  const partialRow = {
    date: "2026-09-14",
    athleteId: 3,
    exerciseName: "Box Jump",
    setNumber: 2,
    reps: 5,
    trackingLevel: "jump",
    trackingDiagnostics: { outcome: "ok", trace: { points: 120, repsFound: 5 } },
  } as never;

  it("renders the good rows and flags the bad one instead of throwing", () => {
    const entries = buildTrackingReportEntries([goodRow, partialRow, goodRow]);
    expect(entries).toHaveLength(3);
    const flagged = entries.filter((e) => e.flags.some((f) => f.includes("could not be read")));
    expect(flagged).toHaveLength(1);
    // The unreadable row still carries the columns that live outside the JSON, so an admin can
    // tell WHICH set is broken -- that identification is the whole value of keeping the row.
    expect(flagged[0].exerciseName).toBe("Box Jump");
    expect(flagged[0].setNumber).toBe(2);
  });

  it("does not throw on a row with no diagnostics at all", () => {
    const noDiagnostics = { ...(goodRow as object), trackingDiagnostics: null } as never;
    expect(() => buildTrackingReportEntries([noDiagnostics])).not.toThrow();
  });

  it("the plain-text report survives the same row", () => {
    expect(() => formatTrackingReport([goodRow, partialRow])).not.toThrow();
    expect(formatTrackingReport([goodRow, partialRow])).toContain("Box Jump");
  });
});
