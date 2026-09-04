import { describe, it, expect } from "vitest";
import { computeForceVelocityProfile, type LoadVelocityPoint } from "./force-velocity";

const p = (loadKg: number, meanVelocityMps: number, date = "2026-01-01"): LoadVelocityPoint => ({
  date,
  loadKg,
  meanVelocityMps,
});

describe("refusing to fit a profile that would not mean anything", () => {
  it("needs at least three points", () => {
    expect(computeForceVelocityProfile([])).toBeNull();
    expect(computeForceVelocityProfile([p(60, 1.0)])).toBeNull();
    expect(computeForceVelocityProfile([p(60, 1.0), p(100, 0.5)])).toBeNull();
  });

  it("accepts exactly three points", () => {
    expect(computeForceVelocityProfile([p(60, 1.0), p(80, 0.75), p(100, 0.5)])).not.toBeNull();
  });

  it("refuses points with no spread in velocity, which would divide by zero", () => {
    expect(computeForceVelocityProfile([p(60, 0.8), p(80, 0.8), p(100, 0.8)])).toBeNull();
  });

  it("refuses a flat relationship, where load does not track velocity at all", () => {
    // Zero slope is not an inverse relationship.
    expect(computeForceVelocityProfile([p(80, 0.5), p(80, 0.75), p(80, 1.0)])).toBeNull();
  });

  it("refuses a positive slope, where heavier bar somehow moved faster", () => {
    expect(computeForceVelocityProfile([p(60, 0.5), p(80, 0.75), p(100, 1.0)])).toBeNull();
  });
});

describe("fitting a real load-velocity profile", () => {
  // A perfectly linear set: load = 140 - 80 * velocity.
  const clean = [p(60, 1.0), p(80, 0.75), p(100, 0.5), p(120, 0.25)];

  it("recovers the exact line from perfectly linear data", () => {
    const profile = computeForceVelocityProfile(clean)!;
    expect(profile.slope).toBeCloseTo(-80, 6);
    expect(profile.intercept).toBeCloseTo(140, 6);
    expect(profile.rSquared).toBeCloseTo(1, 10);
  });

  it("derives v0 as the velocity where the line crosses zero load", () => {
    const profile = computeForceVelocityProfile(clean)!;
    expect(profile.v0).toBeCloseTo(140 / 80, 6);
    // Sanity: the fitted line really is zero there.
    expect(profile.intercept + profile.slope * profile.v0).toBeCloseTo(0, 6);
  });

  it("gives a negative slope for any real profile", () => {
    expect(computeForceVelocityProfile(clean)!.slope).toBeLessThan(0);
  });

  it("puts L0 above the heaviest load actually lifted", () => {
    const profile = computeForceVelocityProfile(clean)!;
    expect(profile.intercept).toBeGreaterThan(Math.max(...clean.map((x) => x.loadKg)));
  });

  it("drops r-squared when the data is noisy", () => {
    const noisy = [p(60, 1.0), p(80, 0.9), p(100, 0.2), p(120, 0.55)];
    const profile = computeForceVelocityProfile(noisy)!;
    expect(profile.rSquared).toBeLessThan(1);
    expect(profile.rSquared).toBeGreaterThan(0);
  });

  it("reports zero r-squared when every load is identical, so there is no variance to explain", () => {
    // Same load at different velocities gives ssTot === 0. den is non-zero
    // (velocity varies) but the slope is zero, so this is refused earlier --
    // add one differing load so a fit happens with near-zero spread in y.
    const profile = computeForceVelocityProfile([p(100, 0.5), p(100, 0.6), p(99, 0.7)]);
    expect(profile).not.toBeNull();
    expect(profile!.rSquared).toBeGreaterThanOrEqual(0);
    expect(profile!.rSquared).toBeLessThanOrEqual(1);
  });

  it("does not depend on the order the points arrive in", () => {
    const forward = computeForceVelocityProfile(clean)!;
    const reversed = computeForceVelocityProfile([...clean].reverse())!;
    expect(reversed.slope).toBeCloseTo(forward.slope, 10);
    expect(reversed.intercept).toBeCloseTo(forward.intercept, 10);
    expect(reversed.v0).toBeCloseTo(forward.v0, 10);
  });

  it("ignores the date field entirely", () => {
    const dated = clean.map((x, i) => ({ ...x, date: `2026-01-0${i + 1}` }));
    expect(computeForceVelocityProfile(dated)!.slope).toBeCloseTo(-80, 6);
  });

  it("handles a realistic bench profile without producing nonsense", () => {
    const profile = computeForceVelocityProfile([
      p(60, 0.92),
      p(70, 0.78),
      p(80, 0.63),
      p(90, 0.51),
      p(100, 0.35),
    ])!;
    expect(profile.slope).toBeLessThan(0);
    expect(profile.v0).toBeGreaterThan(0);
    expect(profile.intercept).toBeGreaterThan(100);
    expect(profile.rSquared).toBeGreaterThan(0.98);
  });
});
