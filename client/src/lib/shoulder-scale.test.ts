import { describe, it, expect } from "vitest";
import { shoulderWidthScaleFromFrames } from "./pose-tracking";
import type { Landmark } from "@mediapipe/tasks-vision";

const HEIGHT_IN = 70; // 1.778m, so ~0.409m across the shoulders

/** Frames of a lifter whose shoulders sit `across` apart in pixel space and `depth` apart in
 *  the estimated depth axis. Depth near zero is square to the lens; large depth is turned away. */
function frames(across: number, depth = 0, count = 40) {
  return Array.from({ length: count }, () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
    lm[11] = { x: -across / 2, y: 0, z: -depth / 2, visibility: 1 };
    lm[12] = { x: across / 2, y: 0, z: depth / 2, visibility: 1 };
    return { worldLandmarks: lm };
  });
}

/** Frames whose torso runs from the shoulders to the hips along the given axis. "upright" is a
 *  standing lifter; "supine" is one lying down, filmed from the side. */
function torsoFrames(orientation: "upright" | "supine", across = 0.5, count = 40) {
  return Array.from({ length: count }, () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
    lm[11] = { x: -across / 2, y: 0, z: 0, visibility: 1 };
    lm[12] = { x: across / 2, y: 0, z: 0, visibility: 1 };
    const hipX = orientation === "supine" ? 0.6 : 0;
    const hipY = orientation === "supine" ? 0 : 0.6;
    lm[23] = { x: hipX - across / 2, y: hipY, z: 0, visibility: 1 };
    lm[24] = { x: hipX + across / 2, y: hipY, z: 0, visibility: 1 };
    return { worldLandmarks: lm };
  });
}

describe("shoulderWidthScaleFromFrames", () => {
  // A LYING ATHLETE'S SHOULDERS POINT AT THE LENS.
  //
  // The depth guard below leans on Vision's z and a real bench press walked straight through it:
  // measured against an OVR bar sensor on 2026-09-22 the take calibrated at 0.004981 m/unit
  // where the same phone's squats sat at 0.0035-0.0042, and reported a ROM 41% over the
  // sensor's. The torso's orientation says it without any z at all.
  // REFUSED BY POSTURE, NOT BY GEOMETRY, AND THE DIFFERENCE IS THE WHOLE POINT.
  //
  // The first attempt read the torso's orientation out of the frames. These are WORLD
  // landmarks -- body-centred -- so a supine athlete's torso is "vertical" in them exactly like
  // a standing one's. It shipped in build 515 and refused nothing: the bench set it was written
  // for still calibrated off the shoulders. The evidence for refusing is two bench sets minutes
  // apart measuring the same shoulders at 88.0px and 115.3px.
  // WITHDRAWN the day it shipped -- see the note in pose-tracking.ts. The refusal was right and
  // it arrived before its replacement, which left a lying lift with no numbers at all rather
  // than imprecise ones. This asserts the CURRENT behaviour so the withdrawal is visible rather
  // than a deleted test nobody notices; when the plate can carry the measurement, this flips
  // back and the assertion above it comes with it.
  it("still measures a lying athlete, until the plate can replace it", () => {
    expect(shoulderWidthScaleFromFrames(torsoFrames("supine"), HEIGHT_IN, "lying").scale).not.toBeNull();
  });

  it("still measures a standing athlete, whose shoulders are square to the lens", () => {
    expect(
      shoulderWidthScaleFromFrames(torsoFrames("upright"), HEIGHT_IN, "standing").scale,
    ).not.toBeNull();
  });

  // The frames cannot tell the two apart, which is why the posture has to be passed in. If this
  // ever starts failing, someone has found a geometric signal that works -- keep it.
  it("cannot tell them apart from the frames alone", () => {
    const supine = shoulderWidthScaleFromFrames(torsoFrames("supine"), HEIGHT_IN).scale;
    const upright = shoulderWidthScaleFromFrames(torsoFrames("upright"), HEIGHT_IN).scale;
    expect(supine).toEqual(upright);
  });

  it("gives a scale where body length could never provide one", () => {
    // Shoulders 0.409m of real breadth spanning 0.5 units of pixel space.
    const result = shoulderWidthScaleFromFrames(frames(0.5), HEIGHT_IN);
    expect(result.scale).not.toBeNull();
    // 40cm of real bar travel should read back as roughly 40cm.
    expect(0.489 * result.scale!).toBeCloseTo(0.4, 2);
  });

  it("scales with the athlete, not with a constant", () => {
    const tall = shoulderWidthScaleFromFrames(frames(0.5), 76);
    const short = shoulderWidthScaleFromFrames(frames(0.5), 62);
    expect(tall.scale!).toBeGreaterThan(short.scale!);
  });

  it("carries an honest uncertainty rather than pretending to be exact", () => {
    const result = shoulderWidthScaleFromFrames(frames(0.5), HEIGHT_IN);
    expect(result.uncertaintyFraction).toBeGreaterThan(0.05);
    expect(result.uncertaintyFraction).toBeLessThan(0.2);
  });

  it("refuses when the shoulders are turned away, since the width is foreshortened too", () => {
    // One shoulder well behind the other: their apparent width means nothing.
    expect(shoulderWidthScaleFromFrames(frames(0.2, 0.5), HEIGHT_IN).scale).toBeNull();
  });

  it("refuses without a height on file, which is the one thing it cannot infer", () => {
    expect(shoulderWidthScaleFromFrames(frames(0.5), null).scale).toBeNull();
    expect(shoulderWidthScaleFromFrames(frames(0.5), 0).scale).toBeNull();
    expect(shoulderWidthScaleFromFrames(frames(0.5), null).rejectedBecause).toBe("no_height");
  });

  it("refuses on too few usable frames rather than trusting one reading", () => {
    expect(shoulderWidthScaleFromFrames(frames(0.5, 0, 3), HEIGHT_IN).scale).toBeNull();
  });

  it("ignores frames where a shoulder was not tracked", () => {
    const mixed = frames(0.5, 0, 30);
    for (let i = 0; i < 10; i++) {
      mixed[i].worldLandmarks[11] = { x: 0, y: 0, z: 0, visibility: 0 };
    }
    expect(shoulderWidthScaleFromFrames(mixed, HEIGHT_IN).scale).not.toBeNull();
  });
});

describe("reporting what it measured", () => {
  it("reports the span and the frame counts even when it refuses", () => {
    const turned = shoulderWidthScaleFromFrames(frames(0.2, 0.5), HEIGHT_IN);
    expect(turned.scale).toBeNull();
    expect(turned.framesRejectedForAngle).toBeGreaterThan(0);
  });

  it("reports the span it used when it accepts", () => {
    const ok = shoulderWidthScaleFromFrames(frames(0.5), HEIGHT_IN);
    expect(ok.medianSpanUnits).toBeCloseTo(0.5, 6);
    expect(ok.framesUsed).toBeGreaterThan(0);
    expect(ok.rejectedBecause).toBeNull();
  });
});
