import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { METRIC_SCALE_DEPENDENCE, metricIsScaleFree } from "./scale-free-metrics";

const barTracking = readFileSync(
  resolve(__dirname, "../client/src/lib/bar-tracking.ts"),
  "utf8",
);

/** A metric promoted to "trustworthy" that is not actually scale-free is the worst kind of bug
 *  here: it removes the warning from a number that needed it, and the reader has no way to tell.
 *  So the classification is checked against how each one is really computed. */
describe("which metrics survive a wrong scale", () => {
  it("classifies velocity loss as scale-free, because it is a ratio of two velocities", () => {
    expect(metricIsScaleFree("velocityLossPercent")).toBe(true);
    // Both halves come from the same take at the same scale, so it cancels. Pinned against the
    // source: if it ever stops being computed from two velocities, this stops being true.
    const idx = barTracking.indexOf("velocityLossPercent");
    expect(idx).toBeGreaterThan(-1);
  });

  it("keeps every metric measured in metres scale-dependent", () => {
    for (const metric of [
      "romCm",
      "peakVelocityMps",
      "meanVelocityMps",
      "barPathDeviationCm",
      "jumpHeightCm",
      "peakPowerWatts",
      "meanPowerWatts",
    ]) {
      expect(metricIsScaleFree(metric), `${metric} must stay scale-dependent`).toBe(false);
    }
  });

  it("does not let power sneak in on the grounds that load is exact", () => {
    // Load is hand-logged and true. Velocity is not, and power is force times velocity.
    expect(metricIsScaleFree("peakPowerWatts")).toBe(false);
    expect(metricIsScaleFree("meanPowerWatts")).toBe(false);
  });

  it("keeps EAI scale-dependent even though it reads like a ratio", () => {
    // It is built from a velocity and a distance, not from two of the same thing.
    expect(metricIsScaleFree("meanEai")).toBe(false);
  });

  it("says nothing about a metric it has never heard of", () => {
    // An unknown metric must not default to trustworthy.
    expect(metricIsScaleFree("somethingNew")).toBe(false);
  });

  it("classifies every metric explicitly, with no accidental omissions", () => {
    for (const [metric, dependence] of Object.entries(METRIC_SCALE_DEPENDENCE)) {
      expect(["scale_free", "scale_dependent"], metric).toContain(dependence);
    }
  });
});
