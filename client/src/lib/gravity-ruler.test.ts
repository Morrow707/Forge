import { describe, it, expect } from "vitest";
import {
  gravityReadingFromJump,
  gravityVerdictForSet,
  GRAVITY_MPS2,
  MIN_GRAVITY_FLIGHT_SECONDS,
} from "./gravity-ruler";

/** Flight height for a given time, the scale-free half. */
const trueHeightCm = (t: number) => ((GRAVITY_MPS2 * t * t) / 8) * 100;

describe("the gravity ruler", () => {
  const base = { netRiseCm: 0, frameIntervalSeconds: 1 / 120 };

  it("reads 1.00 when the take's scale is right", () => {
    const t = 0.5;
    const r = gravityReadingFromJump({
      ...base,
      flightSeconds: t,
      displacementHeightCm: trueHeightCm(t),
    })!;
    expect(r.scaleErrorRatio).toBeCloseTo(1, 2);
  });

  it("measures the scale error directly when the trace is too big", () => {
    // A take whose every distance is 45% too large -- the fleet's current median.
    const t = 0.5;
    const r = gravityReadingFromJump({
      ...base,
      flightSeconds: t,
      displacementHeightCm: trueHeightCm(t) * 1.45,
    })!;
    expect(r.scaleErrorRatio).toBeCloseTo(1.45, 2);
  });

  it("REFUSES A BOX JUMP, because the formula assumes you land where you took off", () => {
    // g*t^2/8 comes from a symmetric parabola. On a box the fall is shorter than the rise, and
    // the generalised formula that fixes that has to use the trace's own netRise -- which feeds
    // the scale back into the half that is supposed to be free of it. A ruler that borrows from
    // what it is checking measures nothing.
    const t = 0.5;
    expect(
      gravityReadingFromJump({
        ...base,
        netRiseCm: 45,
        flightSeconds: t,
        displacementHeightCm: trueHeightCm(t),
      }),
    ).toBeNull();
    // A depth jump, landing lower, is refused for the same reason.
    expect(
      gravityReadingFromJump({
        ...base,
        netRiseCm: -30,
        flightSeconds: t,
        displacementHeightCm: trueHeightCm(t),
      }),
    ).toBeNull();
  });

  it("refuses a hop with too little air to time", () => {
    expect(
      gravityReadingFromJump({
        ...base,
        flightSeconds: MIN_GRAVITY_FLIGHT_SECONDS - 0.01,
        displacementHeightCm: 5,
      }),
    ).toBeNull();
  });

  it("says how much the FRAME RATE is worth, because height goes with the square of time", () => {
    const fast = gravityReadingFromJump({
      flightSeconds: 0.5,
      displacementHeightCm: 30,
      netRiseCm: 0,
      frameIntervalSeconds: 1 / 120,
    })!;
    const slow = gravityReadingFromJump({
      flightSeconds: 0.5,
      displacementHeightCm: 30,
      netRiseCm: 0,
      frameIntervalSeconds: 1 / 30,
    })!;
    // ~3% at 120fps, ~13% at 30fps. The second is not a ruler, it is a rumour, and the number
    // has to say so rather than leaving a caller to know it.
    expect(fast.uncertaintyFraction).toBeCloseTo(0.033, 2);
    expect(slow.uncertaintyFraction).toBeCloseTo(0.133, 2);
    expect(slow.uncertaintyFraction).toBeGreaterThan(fast.uncertaintyFraction);
  });

  it("takes the median across a set, so one mistimed landing cannot speak for it", () => {
    const reps = [1.0, 1.02, 0.98, 4.0].map((ratio) =>
      gravityReadingFromJump({
        ...base,
        flightSeconds: 0.5,
        displacementHeightCm: trueHeightCm(0.5) * ratio,
      })!,
    );
    const verdict = gravityVerdictForSet(reps)!;
    expect(verdict.scaleErrorRatio).toBeCloseTo(1.02, 1);
    expect(verdict.repsUsed).toBe(4);
  });

  it("does not pretend several reps narrow the answer the way independent draws would", () => {
    // They share a tracker, a framing and a frame rate. Their errors move together, so a
    // root-n narrowing would be a claim the data does not support.
    const reps = Array.from({ length: 9 }, () =>
      gravityReadingFromJump({
        ...base,
        flightSeconds: 0.5,
        displacementHeightCm: trueHeightCm(0.5),
      })!,
    );
    const verdict = gravityVerdictForSet(reps)!;
    expect(verdict.uncertaintyFraction).toBeCloseTo(reps[0].uncertaintyFraction, 3);
  });

  it("has nothing to say about a set with no usable rep", () => {
    expect(gravityVerdictForSet([])).toBeNull();
  });
});
