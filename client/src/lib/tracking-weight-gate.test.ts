import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workout = readFileSync(join(__dirname, "..", "pages", "workout.tsx"), "utf8");
const storage = readFileSync(
  join(__dirname, "..", "..", "..", "server", "storage.ts"),
  "utf8",
);

// POWER IS THE ONLY METRIC THAT NEEDS THE LOAD, AND IT NEEDS IT UP FRONT.
//
// summarizeTrackedSet takes loadKg and computes peakPowerWatts/meanPowerWatts as
// mass * g * velocity, leaving both null when there is no load. workout.tsx reads loadKg off
// the set row's entered weight at the moment a tracker dialog mounts, and nothing recomputes
// power if the weight is typed afterwards -- so a set recorded before its weight is entered is
// permanently missing two of its numbers, with nothing on screen saying so.
//
// Velocity, ROM and bar path are unaffected: neither tracker calibrates from the weight. The
// web path needs no scale factor at all and the native path scales off a known-size reference.
describe("recording a tracked set", () => {
  it("is unavailable until the weight is entered", () => {
    expect(workout).toContain("const weightMissingForTracking =");
    expect(workout).toContain("disabled={weightMissingForTracking}");
  });

  it("only gates exercises that actually have a load", () => {
    // A bodyweight or band exercise has no external load, loadKg is undefined there by design,
    // and gating on a weight box that is not rendered would lock the camera for good.
    const gate = workout.slice(workout.indexOf("const weightMissingForTracking ="));
    expect(gate.slice(0, 200)).toContain("item.materials.usesWeight");
  });

  it("says what to do rather than just going grey", () => {
    expect(workout).toContain("Enter ${unit} to record");
  });
});

// A CAPTURE THAT RAN IS EVIDENCE THAT IT RAN.
//
// getRecentTrackedSetsForAdmin feeds the tracking report, which is the only place a capture
// failure can be read back. It required programExercises.trackingLevel to be non-null through a
// LEFT join -- so a set that captured cleanly and then had its program day edited underneath it
// (which nulls programExerciseId, by that join's own design) vanished from the report entirely.
describe("the tracking report's membership test", () => {
  const fn = storage.slice(
    storage.indexOf("async getRecentTrackedSetsForAdmin"),
    storage.indexOf("async getForceVelocityProfileForAthlete"),
  );

  it("keeps a tracked set whose program row is gone", () => {
    expect(fn).toContain("isNull(programExercises.trackingLevel)");
    // The old, silently-excluding form.
    expect(fn).not.toContain("isNotNull(programExercises.trackingLevel)");
  });

  it("still excludes a set that was never put through the camera", () => {
    expect(fn).toContain("isNotNull(workoutSetEntries.trackingDiagnostics)");
  });

  it("still excludes an exercise whose program row says tracking is off", () => {
    expect(fn).toContain("!= 'none'");
  });
});
