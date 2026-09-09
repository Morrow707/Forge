import { describe, it, expect } from "vitest";
import { reconcileScaleEstimates } from "./pose-tracking";

const plate = (scale: number) => ({ source: "plate" as const, scale, uncertaintyFraction: 0.02 });
const height = (scale: number) => ({ source: "height" as const, scale, uncertaintyFraction: 0.05 });
const shoulder = (scale: number) => ({
  source: "shoulder_width" as const,
  scale,
  uncertaintyFraction: 0.1,
});

describe("reconcileScaleEstimates", () => {
  it("says nothing when nothing was measurable", () => {
    const verdict = reconcileScaleEstimates([]);
    expect(verdict.scale).toBeNull();
    expect(verdict.corroborated).toBe(false);
  });

  it("uses a lone source but does not call it corroborated", () => {
    const verdict = reconcileScaleEstimates([shoulder(0.004)]);
    expect(verdict.scale).toBeCloseTo(0.004, 6);
    expect(verdict.corroborated).toBe(false);
    expect(verdict.agreedSources).toEqual(["shoulder_width"]);
  });

  it("averages two sources that agree, and marks the result corroborated", () => {
    const verdict = reconcileScaleEstimates([plate(0.0100), height(0.0102)]);
    expect(verdict.scale).toBeCloseTo(0.0101, 6);
    expect(verdict.corroborated).toBe(true);
    expect(verdict.agreedSources).toHaveLength(2);
    expect(verdict.outliers).toHaveLength(0);
  });

  it("catches the six-times-wrong reading that reached an athlete's screen", () => {
    // The real failure: a shoulder-derived scale roughly six times too small, with nothing to
    // check it against. Given a second opinion, it is now named as the outlier rather than used.
    const verdict = reconcileScaleEstimates([plate(0.010), height(0.0101), shoulder(0.0016)]);
    expect(verdict.agreedSources).toEqual(expect.arrayContaining(["plate", "height"]));
    expect(verdict.agreedSources).not.toContain("shoulder_width");
    expect(verdict.corroborated).toBe(true);
    expect(verdict.outliers).toHaveLength(1);
    expect(verdict.outliers[0].source).toBe("shoulder_width");
    expect(verdict.outliers[0].ratioToChosen).toBeLessThan(0.25);
  });

  it("falls back to the most trustworthy source when nothing agrees", () => {
    // Three readings, all far apart. A plate is an object of known size and does not care where
    // the camera is standing, so it answers -- but the result is honest that nothing backed it.
    const verdict = reconcileScaleEstimates([shoulder(0.004), height(0.008), plate(0.012)]);
    expect(verdict.agreedSources).toEqual(["plate"]);
    expect(verdict.corroborated).toBe(false);
    expect(verdict.outliers).toHaveLength(2);
  });

  it("prefers the larger agreeing group over the more trusted lone source", () => {
    const verdict = reconcileScaleEstimates([plate(0.02), height(0.0100), shoulder(0.0101)]);
    expect(verdict.agreedSources).toHaveLength(2);
    expect(verdict.scale).toBeCloseTo(0.01005, 5);
    expect(verdict.outliers[0].source).toBe("plate");
  });

  it("lets a loose source agree on its own looser terms", () => {
    // Shoulder breadth is allowed a tenth either way, so an 8% gap is agreement for it and would
    // not be for two plate reads.
    expect(reconcileScaleEstimates([height(0.0100), shoulder(0.0108)]).corroborated).toBe(true);
  });

  it("ignores a nonsense value rather than averaging it in", () => {
    const verdict = reconcileScaleEstimates([
      plate(0.01),
      { source: "height", scale: 0, uncertaintyFraction: 0.05 },
    ]);
    expect(verdict.scale).toBeCloseTo(0.01, 6);
    expect(verdict.agreedSources).toEqual(["plate"]);
  });
});
