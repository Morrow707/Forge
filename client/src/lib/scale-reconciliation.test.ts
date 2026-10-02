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
    // Between the two, nearer the plate: the blend is weighted by each ruler's uncertainty
    // (build 578), and a plate is the tighter instrument.
    expect(verdict.scale!).toBeGreaterThan(0.0100);
    expect(verdict.scale!).toBeLessThan(0.0102);
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

  it("a lone plate against two body rulers steps aside; the body rulers are blended", () => {
    // Three readings, all far apart. This used to go to the plate by rank ("an object of known
    // size does not care where the camera is standing"), and in every sensor-paired take where
    // the detector offered a plate that nothing corroborated (squat set 2 2026-10-01, the push
    // press and the Pendlay row 2026-10-02) the "plate" was the athlete's torso at a third of the
    // true scale. Rule #2: a witness nobody agrees with does not lead.
    const verdict = reconcileScaleEstimates([shoulder(0.004), height(0.008), plate(0.012)]);
    expect(verdict.agreedSources).toEqual(["shoulder_width", "height"]);
    expect(verdict.blended).toBe(true);
    expect(verdict.corroborated).toBe(false);
    expect(verdict.outliers.map((o) => o.source)).toEqual(["plate"]);
  });

  it("a lone plate against ONE other ruler still answers (one against one is rank's to break)", () => {
    const verdict = reconcileScaleEstimates([shoulder(0.004), plate(0.012)]);
    expect(verdict.agreedSources).toEqual(["plate"]);
    expect(verdict.corroborated).toBe(false);
  });

  it("prefers the larger agreeing group over the more trusted lone source", () => {
    const verdict = reconcileScaleEstimates([plate(0.02), height(0.0100), shoulder(0.0101)]);
    expect(verdict.agreedSources).toHaveLength(2);
    expect(verdict.scale!).toBeGreaterThan(0.0100);
    expect(verdict.scale!).toBeLessThan(0.0101);
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


describe("a jump's box as a known-size reference", () => {
  const HEIGHT_IN = 70;
  const BODY_SPAN_PX = 459;
  const TRUE_SCALE = (HEIGHT_IN * 0.0254) / BODY_SPAN_PX;

  // The box-derived scale as the dialog computes it: a real height over the pixel gap between
  // the box top and the floor the athlete is standing on.
  const boxScale = (boxHeightIn: number, gapPx: number) => (boxHeightIn * 0.0254) / gapPx;

  it("agrees with the body when both are right", () => {
    // A 24in box on a frame where the body scale is correct: the gap between box top and floor
    // is that height at that scale.
    const gapPx = (24 * 0.0254) / TRUE_SCALE;
    const verdict = reconcileScaleEstimates([
      { source: "plate", scale: boxScale(24, gapPx), uncertaintyFraction: 0.05 },
      { source: "height", scale: TRUE_SCALE, uncertaintyFraction: 0.05 },
    ]);
    expect(verdict.corroborated).toBe(true);
    expect(verdict.scale!).toBeCloseTo(TRUE_SCALE, 6);
  });

  it("throws out a body scale that would make a 24in box jump read as 338cm", () => {
    // The real take. A body scale several times too large turns a two-foot box into something
    // over two metres; measured against the athlete's own height it puts them at ten feet, and
    // it is dropped before the box has to argue with it.
    const gapPx = (24 * 0.0254) / TRUE_SCALE;
    const wrongBody = TRUE_SCALE * 4.5;
    const { kept, rejected } = rejectImplausibleScales(
      [
        { source: "plate", scale: boxScale(24, gapPx), uncertaintyFraction: 0.05 },
        { source: "height", scale: wrongBody, uncertaintyFraction: 0.05 },
      ],
      BODY_SPAN_PX,
      HEIGHT_IN,
    );
    expect(kept.map((k) => k.source)).toEqual(["plate"]);
    expect(rejected[0].source).toBe("height");
    expect(reconcileScaleEstimates(kept).scale!).toBeCloseTo(TRUE_SCALE, 6);
  });
});

describe("the two body rulers are averaged when they are all the take has", () => {
  // Three OVR-paired back squats, 2026-09-28: height alone 6%, 13% and 19% low; shoulders alone
  // 6-17% high; the mean within 5% on all three. See reconcileScaleEstimates.
  it("blends height and shoulder breadth even when they disagree by 25%", () => {
    const v = reconcileScaleEstimates([
      { source: "height", scale: 0.00351, uncertaintyFraction: 0.05 },
      { source: "shoulder_width", scale: 0.0044, uncertaintyFraction: 0.08 },
    ]);
    expect(v.blended).toBe(true);
    expect(v.corroborated).toBe(false);
    expect(v.agreedSources.sort()).toEqual(["height", "shoulder_width"]);
    // Weighted by uncertainty since build 578: between the two, nearer the tighter height ruler.
    expect(v.scale!).toBeGreaterThan(0.00351);
    expect(v.scale!).toBeLessThan((0.00351 + 0.0044) / 2);
    expect(v.outliers).toEqual([]);
  });

  it("never blends when a real ruler is in the room AND something agrees with it", () => {
    const v = reconcileScaleEstimates([
      { source: "plate", scale: 0.0030, uncertaintyFraction: 0.05 },
      { source: "height", scale: 0.00321, uncertaintyFraction: 0.05 },
      { source: "shoulder_width", scale: 0.0044, uncertaintyFraction: 0.08 },
    ]);
    expect(v.blended).toBeFalsy();
    expect(v.agreedSources).toContain("plate");
    expect(v.corroborated).toBe(true);
  });

  it("a plate that agrees with nobody is an outlier and the body rulers blend (2026-10-02)", () => {
    const v = reconcileScaleEstimates([
      { source: "plate", scale: 0.0030, uncertaintyFraction: 0.05 },
      { source: "height", scale: 0.00351, uncertaintyFraction: 0.05 },
      { source: "shoulder_width", scale: 0.0044, uncertaintyFraction: 0.08 },
    ]);
    expect(v.blended).toBe(true);
    expect(v.outliers.map((o) => o.source)).toEqual(["plate"]);
  });

  it("leaves a lone ruler alone", () => {
    const v = reconcileScaleEstimates([{ source: "height", scale: 0.00351, uncertaintyFraction: 0.05 }]);
    expect(v.blended).toBeFalsy();
    expect(v.scale).toBe(0.00351);
  });
});
