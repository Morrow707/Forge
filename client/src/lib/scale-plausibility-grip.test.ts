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

  it("never lets a demoted 3D reading decide alone: with only body rulers in the room the two are blended", () => {
    // Set 3 as reconciled on build 566: body_3d won on rank alone at 1.9x small. Two body
    // rulers with nothing anchored beside them are averaged now (reconcileScaleEstimates,
    // BODY_RULERS), demoted or not -- the demotion still matters where a cluster forms.
    const demoted = body3DCandidate(reading("longest_projection"))!;
    const verdict = reconcileScaleEstimates([demoted, shoulder]);
    expect(verdict.blended).toBe(true);
    // Inverse-variance weighted since build 578, not a plain mean.
    const w = (e: { uncertaintyFraction: number }) => 1 / Math.max(0.01, e.uncertaintyFraction) ** 2;
    const expected = (demoted.scale * w(demoted) + shoulder.scale * w(shoulder)) / (w(demoted) + w(shoulder));
    expect(verdict.scale).toBeCloseTo(expected, 8);
  });

  it("ranks an in-plane 3D reading above the shoulder ruler when a third ruler lets a cluster form", () => {
    const peer = body3DCandidate(reading("in_plane"))!;
    const agreeing: ScaleEstimate = { source: "height", scale: peer.scale * 1.02, uncertaintyFraction: 0.05 };
    const verdict = reconcileScaleEstimates([peer, shoulder, agreeing]);
    expect(verdict.agreedSources).toContain("body_3d");
    expect(verdict.agreedSources).not.toContain("shoulder_width");
  });

  it("still joins an agreeing cluster when demoted: a peer, not a switch", () => {
    const demoted = body3DCandidate({ ...reading("longest_projection"), scale: 0.0042 })!;
    const verdict = reconcileScaleEstimates([demoted, shoulder]);
    expect(verdict.agreedSources.sort()).toEqual(["body_3d", "shoulder_width"]);
    expect(verdict.corroborated).toBe(true);
  });
});

describe("a yardstick that would convict most of the rulers stands down (2026-10-30, Pendlay row set 2)", () => {
  // The export's own numbers: a grip of 52.7 units on a take whose shoulder span was 70 -- a grip
  // NARROWER than the shoulders, the only such ratio on any take in the corpus -- read against
  // three rulers of which two (the 3D bone at 0.003636 and the depth ruler at 0.001911) were
  // within 3% of the scale the sensor required (0.004109) once collapsed, and one (the shoulder
  // span at 0.006278) was 53% high. The grip yardstick convicted the two good ones (7.5in and 4in
  // grips) and the survivor took the whole scale: range of motion 78.4 against 51.3cm.
  const GRIP = 52.7;
  const body3D: ScaleEstimate = { source: "body_3d", scale: 0.003636, uncertaintyFraction: 0.2 };
  const depth: ScaleEstimate = { source: "depth", scale: 0.001911, uncertaintyFraction: 0.6 };
  const wideShoulder: ScaleEstimate = { source: "shoulder_width", scale: 0.006278, uncertaintyFraction: 0.317 };

  it("keeps every ruler when the grip would reject a strict majority, and says which yardstick stood down", () => {
    const { kept, rejected, abstained } = rejectImplausibleScales([body3D, depth, wideShoulder], null, 75, GRIP);
    expect(kept.map((k) => k.source)).toEqual(["body_3d", "depth", "shoulder_width"]);
    expect(rejected).toEqual([]);
    expect(abstained).toHaveLength(1);
    expect(abstained[0].yardstick).toBe("grip");
    expect(abstained[0].wouldHaveRejected.map((r) => r.source)).toEqual(["body_3d", "depth"]);
    expect(abstained[0].wouldHaveRejected[0].impliedGripIn).toBeCloseTo(7.5, 0);
    expect(abstained[0].wouldHaveRejected[1].impliedGripIn).toBeCloseTo(4.0, 0);
  });

  it("and with the rulers kept, the row's own record lands the take inside 3% of the sensor", () => {
    const required = 0.004108889;
    const { kept } = rejectImplausibleScales([body3D, depth, wideShoulder], null, 75, GRIP);
    const blend = reconcileScaleEstimates(kept, 0.4).scale!;
    expect(Math.abs(blend / required - 1)).toBeLessThan(0.03);
    // and the as-filmed verdict (shoulder alone) is the +53% the phone shipped
    expect(reconcileScaleEstimates([wideShoulder], 0.4).scale! / required - 1).toBeGreaterThan(0.5);
  });

  it("still rejects a lone outlier: the rulers outvote the candidate, not the yardstick", () => {
    // The 10-01 squat's shape (1 of 5 rejected) and the 09-29 bench's (1 of 2): both unchanged.
    const good = (source: string) => ({ source, scale: 0.0045, uncertaintyFraction: 0.2 }) as ScaleEstimate;
    const wild: ScaleEstimate = { source: "plate", scale: 0.0045 * 6, uncertaintyFraction: 0.05 };
    const five = rejectImplausibleScales([wild, good("body_3d"), good("depth"), good("height"), good("shoulder_width")], null, 75, GRIP_UNITS);
    expect(five.rejected.map((r) => r.source)).toEqual(["plate"]);
    expect(five.abstained).toEqual([]);
    const two = rejectImplausibleScales([wild, good("shoulder_width")], null, 75, GRIP_UNITS);
    expect(two.rejected.map((r) => r.source)).toEqual(["plate"]);
    expect(two.abstained).toEqual([]);
  });

  it("an exact half is not a majority: 2 of 4 are still rejected", () => {
    const good = (source: string) => ({ source, scale: 0.0045, uncertaintyFraction: 0.2 }) as ScaleEstimate;
    const bad = (source: string) => ({ source, scale: 0.0045 * 6, uncertaintyFraction: 0.2 }) as ScaleEstimate;
    const r = rejectImplausibleScales([bad("plate"), bad("depth"), good("height"), good("shoulder_width")], null, 75, GRIP_UNITS);
    expect(r.rejected.map((x) => x.source)).toEqual(["plate", "depth"]);
    expect(r.abstained).toEqual([]);
  });

  it("the height yardstick abstains by the same rule, independently of the grip", () => {
    // Two rulers imply a 2.6x-tall athlete off a body span that is really a folded torso; the
    // third does not. The height yardstick stands down, the grip (not given) says nothing.
    const bodySpan = 400;
    const tall = (source: string) => ({ source, scale: (75 * 0.0254 * 2.6) / bodySpan, uncertaintyFraction: 0.2 }) as ScaleEstimate;
    const fine: ScaleEstimate = { source: "height", scale: (75 * 0.0254) / bodySpan, uncertaintyFraction: 0.1 };
    const r = rejectImplausibleScales([tall("body_3d"), tall("depth"), fine], bodySpan, 75, null);
    expect(r.kept).toHaveLength(3);
    expect(r.abstained.map((a) => a.yardstick)).toEqual(["height"]);
  });
});
