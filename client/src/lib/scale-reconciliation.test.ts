import { describe, it, expect } from "vitest";
import { rejectImplausibleScales, reconcileScaleEstimates } from "./pose-tracking";

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


// ---------------------------------------------------------------------------
// The two real takes that a fixed trust order could not both get right.
// ---------------------------------------------------------------------------

describe("rejectImplausibleScales", () => {
  const HEIGHT_IN = 70;
  // Nose-to-ankle, in the same pixel space the plate is measured in. At the true scale this
  // spans the athlete, so a scale is right exactly when it turns this back into their height.
  const BODY_SPAN_PX = 459;
  const TRUE_SCALE = (HEIGHT_IN * 0.0254) / BODY_SPAN_PX;

  it("drops the plate read that made a back squat 18cm", () => {
    // The real take: the plate detector measured 512px for something 45cm across, giving a scale
    // 4.4x too small. The old trust order preferred plate unconditionally, so it won, and the
    // squat came back 18cm instead of about 79cm. At that scale the athlete is 16 inches tall.
    const plate = { source: "plate" as const, scale: 0.45 / 512, uncertaintyFraction: 0.05 };
    const height = { source: "height" as const, scale: TRUE_SCALE, uncertaintyFraction: 0.05 };

    const { kept, rejected } = rejectImplausibleScales([plate, height], BODY_SPAN_PX, HEIGHT_IN);
    expect(kept.map((k) => k.source)).toEqual(["height"]);
    expect(rejected[0].source).toBe("plate");
    expect(rejected[0].impliedHeightIn).toBeLessThan(30);
    expect(reconcileScaleEstimates(kept).scale).toBeCloseTo(TRUE_SCALE, 6);
  });

  it("keeps the plate read that saved the bench, where the body could not be measured", () => {
    // The other real take: a bench filmed from the side, calibration unresolved on 97% of frames.
    // No usable body span means nothing to check against, and refusing on no evidence would throw
    // away the only good source that take had.
    const plate = { source: "plate" as const, scale: 0.000881, uncertaintyFraction: 0.05 };
    const { kept, rejected } = rejectImplausibleScales([plate], null, HEIGHT_IN);
    expect(kept).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it("drops a collapsed shoulder span rather than the plate beside it", () => {
    // Bench from the side again, but with a body span this time: the shoulders sit one behind the
    // other, their separation collapses, and the shoulder scale comes out several times too big.
    const plate = { source: "plate" as const, scale: TRUE_SCALE, uncertaintyFraction: 0.05 };
    const shoulder = {
      source: "shoulder_width" as const,
      scale: TRUE_SCALE * 4.2,
      uncertaintyFraction: 0.1,
    };
    const { kept } = rejectImplausibleScales([plate, shoulder], BODY_SPAN_PX, HEIGHT_IN);
    expect(kept.map((k) => k.source)).toEqual(["plate"]);
  });

  it("never rejects every candidate", () => {
    // If nothing survives, the body span is the thing that is wrong, not all three scales at
    // once -- and a questionable number beats no number at all.
    const a = { source: "plate" as const, scale: TRUE_SCALE * 10, uncertaintyFraction: 0.05 };
    const b = { source: "height" as const, scale: TRUE_SCALE * 12, uncertaintyFraction: 0.05 };
    const { kept, rejected } = rejectImplausibleScales([a, b], BODY_SPAN_PX, HEIGHT_IN);
    expect(kept).toHaveLength(2);
    expect(rejected).toHaveLength(0);
  });
});
