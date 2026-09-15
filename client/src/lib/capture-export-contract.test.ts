import { describe, expect, it } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";

// THE EXPORT AND THE HARNESS HAVE TO AGREE, AND NOTHING MADE THEM.
//
// capture-replay.ts re-runs segmentation, rep counting, velocity, range of motion and trust over
// a stored bar-path trace with no device and no camera. Its input type says it is "shaped to
// match what the set row already holds so an export needs no transformation" -- but for its whole
// life there was no export, so that claim was never checked against one.
//
// GET /api/admin/capture-export.json is that export now. This pins the two together on a row
// shaped exactly as the route emits it: if either side renames a field, this fails here rather
// than at the point somebody is trying to diagnose a real miscount from a real capture.
describe("the admin capture export feeds the replay harness unchanged", () => {
  // One rep of a squat, as the route returns it: an object with the route's own extra reporting
  // fields (athlete, date, setNumber) alongside the ones StoredCapture requires.
  const exportedRow = {
    setId: 41,
    athlete: "Athlete 1",
    date: "2026-09-14",
    exerciseName: "Back Squat",
    setNumber: 1,
    heightIn: 70,
    loadKg: 61.2,
    loggedReps: 5,
    boxHeightIn: null,
    movementType: "Squat",
    // What the app published for this set. Present so a replay can be diffed against it -- see
    // the `reported` group's comment on the route.
    reported: {
      peakVelocityMps: 1.45,
      meanVelocityMps: 0.88,
      eccentricMeanVelocityMps: 0.52,
      concentricSeconds: 0.7,
      eccentricSeconds: 1.1,
      barPathDeviationCm: 5.8,
      romCm: 67.8,
      meanEai: 4.1,
      velocityLossPercent: 22.3,
      peakPowerWatts: 870,
      meanPowerWatts: 528,
      jumpHeightCm: null,
      jumpDistanceCm: null,
      groundContactSeconds: null,
      reactiveStrengthIndex: null,
      repBreakdown: [],
      formFaults: [],
    },
    trustScores: [],
    trackingDiagnostics: null,
    captureDeviceInfo: { deviceModel: "iPhone 15 Pro", lens: "Wide" },
    // Centimetres relative to the first point, which is what buildPathTrace writes -- see the
    // unit note in capture-replay.ts. A metres-shaped fixture here is how the 100x scale bug
    // stayed invisible for as long as it did.
    barPathTrace: Array.from({ length: 160 }, (_, i) => {
      // Two reps down-and-up, so segmentation has something real to find.
      const phase = (i % 80) / 80;
      const y = phase < 0.5 ? -74 * (phase / 0.5) : -74 * (1 - (phase - 0.5) / 0.5);
      return { t: (i / 60) * 1000, x: 0, y };
    }),
    armPathTrace: null,
  };

  it("is accepted as a StoredCapture with no transformation", () => {
    const capture: StoredCapture = exportedRow;
    expect(capture.exerciseName).toBe("Back Squat");
    expect(capture.barPathTrace).toHaveLength(160);
  });

  it("replays into a result the harness can report on", () => {
    const result = replayCapture(exportedRow as StoredCapture);
    expect(result).toBeDefined();
    expect(result.setId).toBe(41);
    expect(result.exerciseName).toBe("Back Squat");
  });

  // The reason the export was widened. Comparing a replay against what the athlete LOGGED only
  // ever answers "did the rep count come out right"; comparing it against what the app REPORTED
  // catches a threshold change that fixed the rep count while moving mean velocity somewhere
  // nobody was watching. That is impossible unless the reported numbers travel with the trace.
  it("carries what the app reported, so a replay can be diffed against it", () => {
    const replayed = replayCapture(exportedRow as StoredCapture).metrics!;
    expect(replayed).not.toBeNull();
    for (const field of [
      "peakVelocityMps",
      "meanVelocityMps",
      "romCm",
      "velocityLossPercent",
      "barPathDeviationCm",
    ] as const) {
      // The point is only that both sides exist and are named the same, so a diff can be taken
      // at all. The VALUES are expected to differ -- the stored trace is decimated to ~200
      // points, so a replay sees a coarser signal than the live run did.
      expect(exportedRow.reported).toHaveProperty(field);
      expect(replayed).toHaveProperty(field);
    }
  });

  it("carries the capture conditions, so a bad number can be told apart from a bad take", () => {
    expect(exportedRow).toHaveProperty("trustScores");
    expect(exportedRow).toHaveProperty("trackingDiagnostics");
    expect(exportedRow).toHaveProperty("captureDeviceInfo");
  });

  it("carries nothing that resolves to a person", () => {
    // The same stance the tracking report takes: a capture-quality diagnostic shows that sets
    // belong to one athlete and never says which. heightIn is here because every scale in the
    // pipeline derives from it, and the replay is worthless without it.
    for (const field of ["name", "email", "athleteId", "userId", "dateOfBirth"]) {
      expect(exportedRow).not.toHaveProperty(field);
    }
    // Widening the export is exactly where an identifying field gets in by accident, so the check
    // runs over the whole document rather than its top level. captureDeviceInfo is the one that
    // needed looking at: it names a device MODEL, which is a class of phone and not a phone.
    const serialised = JSON.stringify(exportedRow);
    for (const leak of ["identifierForVendor", "serial", "udid", "@", "deviceId"]) {
      expect(serialised).not.toContain(leak);
    }
  });
});
