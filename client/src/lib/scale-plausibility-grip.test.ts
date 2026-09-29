import { describe, it, expect } from "vitest";
import {
  IMPLAUSIBLE_GRIP_HIGH_M,
  IMPLAUSIBLE_GRIP_LOW_M,
  reconcileScaleEstimates,
  rejectImplausibleScales,
  type ScaleEstimate,
} from "./pose-tracking";
import { body3DCandidate } from "./body-scale-fallback";
import type { Body3DScaleReading } from "./body-3d-ruler";

// Scott's bench, 2026-09-29, set 3, build 566: the 3D ruler said 0.00246 m/unit, the shoulder
// ruler 0.00413, the sensor about 0.0046. The body-height check had nothing to read (a lying
// athlete resolved a body length on 0 of 914 frames), so the 1.9x-small candidate anchored the
// take. The grip was measured on 818 frames at 172.7 units: at the 3D ruler's scale that is a
// 0.42m grip, at the sensor's a 0.80m one. This take's numbers are what the bounds are set
// around -- generous, so that only a scale wrong by a factor trips them.
const GRIP_UNITS = 172.7;
const shoulder: ScaleEstimate = { source: "shoulder_width", scale: 0.00413, uncertaintyFraction: 0.1 };

describe("the grip as a second yardstick for a candidate scale", () => {
  it("drops a candidate that puts two hands on a bar closer than a fist, and says what it implied", () => {
    const tooSmall: ScaleEstimate = { source: "body_3d", scale: IMPLAUSIBLE_GRIP_LOW_M / GRIP_UNITS / 2, uncertaintyFraction: 0.08 };
    const { kept, rejected } = rejectImplausibleScales([tooSmall, shoulder], null, 75, GRIP_UNITS);
    expect(kept.map((k) => k.source)).toEqual(["shoulder_width"]);
    expect(rejected[0].source).toBe("body_3d");
    expect(rejected[0].impliedGripIn).toBeCloseTo((IMPLAUSIBLE_GRIP_LOW_M / 2) / 0.0254, 0);
  });

  it("drops one that puts them wider than an outstretched adult", () => {
    const tooBig: ScaleEstimate = { source: "plate", scale: (IMPLAUSIBLE_GRIP_HIGH_M * 2) / GRIP_UNITS, uncertaintyFraction: 0.05 };
    const { kept } = rejectImplausibleScales([tooBig, shoulder], null, 75, GRIP_UNITS);
    expect(kept.map((k) => k.source)).toEqual(["shoulder_width"]);
  });

  it("keeps every plausible grip, including the two rulers from the real take", () => {
    const body3D: ScaleEstimate = { source: "body_3d", scale: 0.00246, uncertaintyFraction: 0.08 };
    const { kept, rejected } = rejectImplausibleScales([body3D, shoulder], null, 75, GRIP_UNITS);
    expect(kept.length).toBe(2);
    expect(rejected).toEqual([]);
  });

  it("checks nothing when there is no grip and no body length to check against", () => {
    const wild: ScaleEstimate = { source: "body_3d", scale: 1e-6, uncertaintyFraction: 0.08 };
    expect(rejectImplausibleScales([wild], null, 75, null).kept.length).toBe(1);
  });

  it("never rejects everything", () => {
    const a: ScaleEstimate = { source: "body_3d", scale: 1e-6, uncertaintyFraction: 0.08 };
    const b: ScaleEstimate = { source: "shoulder_width", scale: 1, uncertaintyFraction: 0.1 };
    expect(rejectImplausibleScales([a, b], null, 75, GRIP_UNITS).kept.length).toBe(2);
  });
});

describe("the longest-projection 3D ruler is demoted, the in-plane one is a full peer", () => {
  const reading = (method: Body3DScaleReading["method"]): Body3DScaleReading => ({
    scale: 0.00246,
    uncertaintyFraction: 0.12,
    framesUsed: 30,
    limb: "shin",
    metres: 0.51,
    limbs: [],
    method,
    medianWristDepthM: null,
    heightSource: "reference_corrected",
    referenceHeightM: 1.8,
    rejectedBecause: null,
  });

  it("marks the longest-projection reading demoted and the in-plane reading not", () => {
    expect(body3DCandidate(reading("longest_projection"))?.demoted).toBe(true);
    expect(body3DCandidate(reading("in_plane"))?.demoted).toBeUndefined();
    expect(body3DCandidate({ ...reading("in_plane"), scale: null })).toBeNull();
  });

  it("lets the shoulder ruler anchor over a demoted 3D reading that disagrees with it", () => {
    // Set 3 as reconciled on build 566: body_3d won on rank alone. Demoted, it is the outlier.
    const demoted = body3DCandidate(reading("longest_projection"))!;
    const verdict = reconcileScaleEstimates([demoted, shoulder]);
    expect(verdict.agreedSources).toEqual(["shoulder_width"]);
    expect(verdict.outliers[0].source).toBe("body_3d");
  });

  it("still ranks an in-plane 3D reading above the shoulder ruler", () => {
    const peer = body3DCandidate(reading("in_plane"))!;
    expect(reconcileScaleEstimates([peer, shoulder]).agreedSources).toEqual(["body_3d"]);
  });

  it("still joins an agreeing cluster when demoted: a peer, not a switch", () => {
    const demoted = body3DCandidate({ ...reading("longest_projection"), scale: 0.0042 })!;
    const verdict = reconcileScaleEstimates([demoted, shoulder]);
    expect(verdict.agreedSources.sort()).toEqual(["body_3d", "shoulder_width"]);
    expect(verdict.corroborated).toBe(true);
  });
});
