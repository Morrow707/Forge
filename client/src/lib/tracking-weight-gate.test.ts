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
  // COMMENTS STRIPPED, or this scan reads the explanation as the thing explained: the query
  // now carries a paragraph on why it does not filter by trackingLevel, and naming the column
  // to say so is not the same as consulting it. Same lesson as the read ratchet, where the
  // component that FIXES a bug quoted it and got reported as a case of it.
  const fn = storage
    .slice(
      storage.indexOf("async getRecentTrackedSetsForAdmin"),
      storage.indexOf("async getForceVelocityProfileForAthlete"),
    )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("does not consult the program row at all", () => {
    // THIS ASSERTION USED TO RUN THE OTHER WAY, twice, and both forms were wrong.
    //
    // First `isNotNull(programExercises.trackingLevel)`, which dropped a set whose program day
    // had since been edited. That was replaced by an isNull/!= 'none' pair, pinned here, which
    // still dropped a set whose exercise a coach had since switched tracking OFF on -- the one
    // edit somebody makes after a few takes come back unusable, so it hid exactly the captures
    // that prompted it. Measured in server/capture-diagnostics-round-trip.itest.ts.
    //
    // There is no third version of a condition over this column that is right. What the camera
    // did is a fact about the SET; trackingLevel is a live setting that says what the program
    // asks for today. So the whole clause is gone, and the rule is that it stays gone.
    // The column is still SELECTED -- the report shows what the program asks for today beside
    // what the camera did, which is useful context. What must not come back is a WHERE over it.
    expect(fn).not.toContain("isNull(programExercises.trackingLevel)");
    expect(fn).not.toContain("isNotNull(programExercises.trackingLevel)");
    expect(fn).not.toContain("!= 'none'");
  });

  it("still excludes a set that was never put through the camera", () => {
    // Membership is any camera-derived column. A hand-logged set has none of them, which is
    // what keeps this report from filling with sets nobody pointed a camera at -- and is why
    // the program-row clause above was redundant as well as harmful.
    expect(fn).toContain("isNotNull(workoutSetEntries.trackingDiagnostics)");
    expect(fn).toContain("isNotNull(workoutSetEntries.peakVelocityMps)");
  });
});
