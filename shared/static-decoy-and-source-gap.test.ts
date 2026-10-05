import { describe, it, expect } from "vitest";
import {
  staticDecoyVerdict,
  sourceAgreementVerdict,
  MIN_BODY_TRAVEL_FOR_DECOY_YARDSTICKS,
  MAX_DECOY_TRAVEL_YARDSTICKS,
  MAX_SOURCE_GAP_YARDSTICKS,
  scaleDriftVerdict,
  MIN_REPS_FOR_DRIFT,
} from "./tracker-arbiter";

/* OVERWATCH LEARNS TO SPOT A RACK, AND TO READ THE GAP IT ALREADY RECORDED.
 *
 * Both fitted from the 2026-10-04 OVR pairing. The Back Squat's object lock held 32 of 840
 * frames across 135 full-frame re-searches, with 39 of 130 plate candidates thrown out as too
 * large -- the signature of a detector finding the rack, which in a squat take is loaded with
 * plates and sits in frame throughout. And sourceAgreement.medianGapPx was 119-122 on both
 * barbell takes, recorded on every take and read by nothing.
 */
const Y = 100; // yardstick in px, so a yardstick of travel is 100px

describe("a rack does not move and a barbell does", () => {
  it("convicts a candidate that sat still while the athlete squatted", () => {
    const v = staticDecoyVerdict({
      // A fixture: the same place, frame after frame, bar a pixel of noise.
      candidateCenters: [0, 1, 0, 1, 0, 1].map((n) => ({ x: 500 + n, y: 300 })),
      // The athlete's anchor sweeping a squat's range: 1.8 yardsticks.
      bodyAnchors: [0, 60, 140, 180, 100, 20].map((n) => ({ x: 200, y: 400 + n })),
      yardstickPx: Y,
    });
    expect(v.isStaticDecoy).toBe(true);
    expect(v.reason).toBe("static_while_body_moved");
    expect(v.candidateTravelYardsticks).toBeLessThan(MAX_DECOY_TRAVEL_YARDSTICKS);
    expect(v.bodyTravelYardsticks).toBeGreaterThan(MIN_BODY_TRAVEL_FOR_DECOY_YARDSTICKS);
  });

  it("clears a plate that travelled with the athlete", () => {
    const v = staticDecoyVerdict({
      candidateCenters: [0, 60, 140, 180, 100, 20].map((n) => ({ x: 500, y: 300 + n })),
      bodyAnchors: [0, 60, 140, 180, 100, 20].map((n) => ({ x: 200, y: 400 + n })),
      yardstickPx: Y,
    });
    expect(v.isStaticDecoy).toBe(false);
    expect(v.reason).toBe("moved_with_body");
  });

  it("says nothing when the athlete stood still -- a pause is not evidence", () => {
    // Between reps, at the top of a hold, or on a take filmed standing: everything is static and
    // convicting here would blame the object for the athlete not moving.
    const v = staticDecoyVerdict({
      candidateCenters: Array.from({ length: 6 }, () => ({ x: 500, y: 300 })),
      bodyAnchors: Array.from({ length: 6 }, (_, i) => ({ x: 200, y: 400 + (i % 2) })),
      yardstickPx: Y,
    });
    expect(v.isStaticDecoy).toBe(false);
    expect(v.reason).toBe("body_did_not_move");
  });

  it("a verdict it cannot reach PASSES, like every other check in this file", () => {
    const few = staticDecoyVerdict({
      candidateCenters: [{ x: 1, y: 1 }, { x: 1, y: 1 }],
      bodyAnchors: [{ x: 1, y: 1 }, { x: 9, y: 9 }],
      yardstickPx: Y,
    });
    expect(few.isStaticDecoy).toBe(false);
    expect(few.reason).toBe("too_few_samples");
    // No yardstick: the threshold is in grip widths and without one there is no threshold.
    expect(
      staticDecoyVerdict({
        candidateCenters: Array.from({ length: 6 }, () => ({ x: 500, y: 300 })),
        bodyAnchors: Array.from({ length: 6 }, (_, i) => ({ x: 200, y: 400 + i * 40 })),
        yardstickPx: null,
      }).isStaticDecoy,
    ).toBe(false);
  });

  it("measures travel as a span, never as a sum of per-frame steps", () => {
    // A sum accumulates landmark jitter into a large number for a box that never went anywhere,
    // which would make a rack look like it moved -- the one implementation choice that decides
    // whether this works at all.
    const jittery = Array.from({ length: 40 }, (_, i) => ({ x: 500 + (i % 2) * 3, y: 300 - (i % 2) * 3 }));
    const v = staticDecoyVerdict({
      candidateCenters: jittery,
      bodyAnchors: jittery.map((_, i) => ({ x: 200, y: 400 + i * 5 })),
      yardstickPx: Y,
    });
    // 40 frames of 4px jitter sums to well over a yardstick; its SPAN is about 4px.
    expect(v.candidateTravelYardsticks).toBeLessThan(0.1);
    expect(v.isStaticDecoy).toBe(true);
  });
});

describe("the gap between the two witnesses", () => {
  it("reads the 2026-10-04 barbell takes as disagreement", () => {
    // 119px and 122px against a grip width. On a bench-width grip of ~100px that is more than a
    // full yardstick: the two witnesses were not on the same object.
    expect(sourceAgreementVerdict({ medianGapPx: 119.2, yardstickPx: 100 }).witnessesDisagree).toBe(true);
    expect(sourceAgreementVerdict({ medianGapPx: 122.4, yardstickPx: 100 }).gapYardsticks).toBeCloseTo(1.224, 2);
  });

  it("is a ratio to the grip, so it needs no per-setup tuning", () => {
    // The same 120px gap at twice the framing is half the disagreement. That is the whole reason
    // the threshold is in yardsticks and not in pixels.
    expect(sourceAgreementVerdict({ medianGapPx: 120, yardstickPx: 200 }).witnessesDisagree).toBe(false);
    expect(MAX_SOURCE_GAP_YARDSTICKS).toBe(1.0);
  });

  it("reads a missing gap or a missing yardstick as agreement, never as a finding", () => {
    expect(sourceAgreementVerdict({ medianGapPx: null, yardstickPx: 100 }).witnessesDisagree).toBe(false);
    expect(sourceAgreementVerdict({ medianGapPx: undefined, yardstickPx: 100 }).witnessesDisagree).toBe(false);
    expect(sourceAgreementVerdict({ medianGapPx: 500, yardstickPx: null }).witnessesDisagree).toBe(false);
  });
});

describe("scale drift across a set", () => {
  it("flags five reps measured with five different rulers", () => {
    // The athlete walking toward the lens: scale climbing rep over rep.
    const v = scaleDriftVerdict([0.0034, 0.0036, 0.0038, 0.0041, 0.0044]);
    expect(v.scaleDrifted).toBe(true);
    expect(v.repsMeasured).toBe(5);
    expect(v.spreadFraction).toBeGreaterThan(0.1);
    // The furthest from the median is where to look first.
    expect(v.worstRepIndex).toBe(4);
  });

  it("passes a set whose scale held still", () => {
    const v = scaleDriftVerdict([0.00365, 0.00362, 0.00368, 0.00364, 0.00366]);
    expect(v.scaleDrifted).toBe(false);
    expect(v.spreadFraction).toBeLessThan(0.05);
  });

  it("says nothing on too few reps, and ignores nulls rather than counting them", () => {
    expect(scaleDriftVerdict([0.0034, 0.0044]).scaleDrifted).toBe(false);
    expect(scaleDriftVerdict([0.0034, 0.0044]).spreadFraction).toBeNull();
    // A rep whose scale could not be measured is absent, not zero -- a zero would read as a
    // hundred-percent drift and condemn a good set.
    const v = scaleDriftVerdict([0.00365, null, 0.00362, undefined, 0.00368]);
    expect(v.repsMeasured).toBe(3);
    expect(v.scaleDrifted).toBe(false);
    expect(MIN_REPS_FOR_DRIFT).toBe(3);
  });
});
