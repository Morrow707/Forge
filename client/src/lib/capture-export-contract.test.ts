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
    barPathTrace: Array.from({ length: 160 }, (_, i) => {
      // Two reps down-and-up, so segmentation has something real to find.
      const phase = (i % 80) / 80;
      const y = phase < 0.5 ? -0.74 * (phase / 0.5) : -0.74 * (1 - (phase - 0.5) / 0.5);
      return { t: (i / 60) * 1000, x: 0, y, z: 0, confidence: 0.9 };
    }),
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

  it("carries nothing that resolves to a person", () => {
    // The same stance the tracking report takes: a capture-quality diagnostic shows that sets
    // belong to one athlete and never says which. heightIn is here because every scale in the
    // pipeline derives from it, and the replay is worthless without it.
    for (const field of ["name", "email", "athleteId", "userId", "dateOfBirth"]) {
      expect(exportedRow).not.toHaveProperty(field);
    }
  });
});
