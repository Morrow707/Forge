import { describe, expect, it } from "vitest";
import { dropAcrossAxisOutliers } from "./bar-tracking";
import type { TrackedPoint } from "./bar-tracking";

// THE GUARD THAT PROTECTS A TAKE WAS DESTROYING IT.
//
// The caller applies this function's result by emptying its own array and re-pushing the kept
// points:
//
//   trace.length = 0;
//   trace.push(...cleanedTrace);
//
// That is only correct while `kept` is a DIFFERENT array. Every early return here used to hand
// back the caller's own array, so `trace.length = 0` emptied the very thing the spread was
// about to read, and the trace came out at zero points.
//
// The three early returns are the guards: no movement axis, too few points, and -- the one that
// bit a real set -- more than a third of the trace sitting off the bar's median line, where
// thinning is refused because the axis is the more likely thing to be wrong. So the failure
// showed up only on the takes these guards exist to rescue. A back squat with 787 of 856 frames
// producing a bar point came back with 0 tracked points and told the athlete to keep the bar in
// frame, which he had; the set before it, with only 79 points off-axis, took the filtering path
// and read fine.
//
// Pinning identity rather than contents: contents alone pass even while aliased.
describe("dropAcrossAxisOutliers never returns the caller's own array", () => {
  const pointAt = (x: number, y: number, t: number): TrackedPoint => ({ t, x, y, z: 0, confidence: 1 });

  const applyLikeTheCaller = (trace: TrackedPoint[], axis: { x: number; y: number } | null) => {
    const { kept } = dropAcrossAxisOutliers(trace, axis);
    trace.length = 0;
    trace.push(...kept);
    return trace;
  };

  it("survives the no-axis guard", () => {
    const trace = Array.from({ length: 20 }, (_, i) => pointAt(0, i * 0.05, i * 33));
    expect(applyLikeTheCaller(trace, null)).toHaveLength(20);
  });

  it("survives the too-few-points guard", () => {
    const trace = Array.from({ length: 5 }, (_, i) => pointAt(0, i * 0.05, i * 33));
    expect(applyLikeTheCaller(trace, { x: 0, y: 1 })).toHaveLength(5);
  });

  it("survives the refuse-to-drop-more-than-a-third guard -- the one a real squat hit", () => {
    // Half the trace sits far off the median line across the axis, so thinning is refused and
    // every point must be handed back untouched.
    const trace = Array.from({ length: 40 }, (_, i) =>
      pointAt(i % 2 === 0 ? 0 : 3, (i % 10) * 0.08, i * 33),
    );
    const kept = applyLikeTheCaller(trace, { x: 0, y: 1 });
    expect(kept).toHaveLength(40);
  });

  it("still thins a trace with a few genuine off-bar points", () => {
    const trace = Array.from({ length: 40 }, (_, i) =>
      pointAt(i === 3 || i === 9 ? 3 : 0, (i % 10) * 0.08, i * 33),
    );
    const kept = applyLikeTheCaller(trace, { x: 0, y: 1 });
    expect(kept).toHaveLength(38);
  });
});
