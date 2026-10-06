/* THE SHOULDER RULER, AS THE THREE LIFTS OF BUILD 632 MEASURED IT.
 *
 * docs/camera-tracking-notes.md, "Three lifts beside OVR, build 632, 2026-10-06". Three numbers
 * from one session, each of which this file keeps:
 *
 *   lift                      spanSpreadFraction   accepted?   vs OVR
 *   Barbell Shoulder Press    0.063                yes         -1.9%
 *   Bench Press               0.21                 yes         -39.3% (not a scale error)
 *   Pendlay Row               0.464                no          -15.3% with one witness
 *
 * The row's refusal was reached by a body-length ratio that a HINGE defeats -- the Romanian
 * deadlift bug of 2026-10-05 in its second home -- and happened to be the right answer, because
 * reinstating that ruler takes the row to +17.5%. A guard that is right by accident cannot be
 * tuned, so the refusal now comes from the span's own self-disagreement, which needs no posture
 * assumption. These cases are the fit; changing MAX_SHOULDER_SPAN_SPREAD must break them.
 */
import { describe, expect, it } from "vitest";
import { shoulderWidthScaleFromFrames, POSE_LANDMARKS } from "./pose-tracking";
import { measureAxisForeshortening } from "./axis-foreshortening";

/** The jitter that makes the ruler MEASURE a given spanSpreadFraction. The reading is a median
 *  absolute deviation over the median, and alternating +/-s puts the median at span(1+s) and the
 *  MAD at 2s*span, so the fraction it reports is 2s/(1+s). Inverted here so the fixtures below
 *  carry the three numbers build 632 really produced (0.063, 0.21, 0.464) rather than a jitter
 *  that merely looks like them. */
const jitterFor = (reported: number) => reported / (2 - reported);

/** Frames whose shoulder span is `span` units wide and which REPORT `reported` as their
 *  spanSpreadFraction, with a body long enough that the stature yardstick is satisfied when it
 *  is consulted. */
function framesWithSpan(span: number, reported: number, n = 60) {
  const spread = jitterFor(reported);
  return Array.from({ length: n }, (_, i) => {
    const w = i % 2 === 0 ? span * (1 + spread) : span * (1 - spread);
    const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.9 }));
    lm[POSE_LANDMARKS.LEFT_SHOULDER] = { x: -w / 2, y: 0, z: 0, visibility: 0.9 };
    lm[POSE_LANDMARKS.RIGHT_SHOULDER] = { x: w / 2, y: 0, z: 0, visibility: 0.9 };
    // Nose and ankles set impliedBodyLengthUnits: a stature of span/0.23 keeps the ratio at 1.
    lm[POSE_LANDMARKS.NOSE] = { x: 0, y: 0, z: 0, visibility: 0.9 };
    lm[POSE_LANDMARKS.LEFT_ANKLE] = { x: 0, y: span / 0.23, z: 0, visibility: 0.9 };
    lm[POSE_LANDMARKS.RIGHT_ANKLE] = { x: 0, y: span / 0.23, z: 0, visibility: 0.9 };
    return { worldLandmarks: lm };
  });
}

describe("the shoulder ruler states its own measured noise", () => {
  it("keeps the standing press's 6.3% spread at the fitted floor, not tighter", () => {
    const r = shoulderWidthScaleFromFrames(framesWithSpan(81.24, 0.063), 75, "standing");
    expect(r.rejectedBecause).toBeNull();
    expect(r.spanSpreadFraction).toBeCloseTo(0.063, 2);
    // Measured agreement better than the cross-take fit does NOT buy a tighter uncertainty: the
    // floor is what the ruler is worth at its best.
    expect(r.uncertaintyFraction).toBeCloseTo(0.2, 5);
  });

  it("loosens the bench's 21% spread to its own measurement", () => {
    const r = shoulderWidthScaleFromFrames(framesWithSpan(112.89, 0.21), 75, "lying");
    expect(r.rejectedBecause).toBeNull();
    expect(r.spanSpreadFraction).toBeCloseTo(0.21, 2);
    // Loosened to exactly what it measured -- not to a second constant beside the floor.
    expect(r.uncertaintyFraction).toBe(r.spanSpreadFraction);
  });

  it("refuses the row's 46% spread, and refuses it for the SPREAD, not for a folded body", () => {
    const r = shoulderWidthScaleFromFrames(framesWithSpan(68.46, 0.464), 75, "bent_over");
    expect(r.rejectedBecause).toBe("implausible_span");
    expect(r.spanSpreadFraction).toBeCloseTo(0.464, 2);
    // The refusal still hands up everything it measured -- Rule #1 applies to a ruler too.
    expect(r.medianSpanUnits).toBeGreaterThan(0);
  });

  it("never refuses a hinge for having a hinge's body length", () => {
    // A folded athlete: nose and ankles close together, so impliedBodyLengthUnits is short and
    // the old ratio guard cleared 2. A tight span must survive that.
    const frames = framesWithSpan(68.46, 0.05).map((f) => {
      const lm = f.worldLandmarks.map((p) => ({ ...p }));
      lm[POSE_LANDMARKS.LEFT_ANKLE] = { x: 0, y: 120, z: 0, visibility: 0.9 };
      lm[POSE_LANDMARKS.RIGHT_ANKLE] = { x: 0, y: 120, z: 0, visibility: 0.9 };
      return { worldLandmarks: lm };
    });
    expect(shoulderWidthScaleFromFrames(frames, 75, "bent_over").rejectedBecause).toBeNull();
    // ...and an UPRIGHT athlete still gets the stature check, because there it means something.
    expect(shoulderWidthScaleFromFrames(frames, 75, "standing").rejectedBecause).toBe(
      "implausible_span",
    );
  });
});

describe("the foreshortening measurement", () => {
  const frames = (dz: number) =>
    Array.from({ length: 8 }, (_, i) => ({
      frameIndex: i,
      body3DJoints: [
        { name: "leftWrist", x: 0, y: 0, z: 0, confidence: 0.9, cx: 0, cy: i * 0.05, cz: i * dz },
        { name: "rightWrist", x: 0, y: 0, z: 0, confidence: 0.9, cx: 0, cy: i * 0.05, cz: i * dz },
      ],
    })) as never[];

  it("reads about 1 on a take whose movement is square to the lens", () => {
    const r = measureAxisForeshortening(frames(0));
    expect(r.ratio).toBeCloseTo(1, 3);
    expect(r.displacementAlongLensM).toBe(0);
  });

  it("reads the lens-axis component when the movement points down the lens", () => {
    // Equal travel in-image and along the lens: the real movement is sqrt(2) of what was seen.
    const r = measureAxisForeshortening(frames(0.05));
    expect(r.ratio).toBeCloseTo(Math.SQRT2, 2);
    expect(r.displacementAlongLensM).toBeGreaterThan(0);
  });

  it("CORRECTS NOTHING -- it is recorded, and that is deliberate (see the file comment)", () => {
    expect(measureAxisForeshortening(frames(0.05)).appliedCorrection).toBe(false);
  });

  it("says so rather than guessing when the take carried no 3D pose", () => {
    const r = measureAxisForeshortening([]);
    expect(r.ratio).toBeNull();
    expect(r.rejectedBecause).toBe("no_3d_frames");
  });
});
