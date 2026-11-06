import { describe, it, expect } from "vitest";
import { deriveBodyWitnessTrace, BODY_WITNESS_MAX_POINTS } from "./body-witness-trace";

// Indices as pose-tracking.ts numbers them; the module repeats them because the server cannot
// import the client, and this pins the repetition to the same joints.
const lm = (y: number, visibility = 0.9) => ({ x: 100, y, z: 0, visibility });
function frame(t: number, ys: Partial<Record<"ls" | "rs" | "lw" | "rw" | "lh" | "rh" | "la" | "ra", number>>) {
  const w = new Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  if (ys.ls != null) w[11] = lm(ys.ls);
  if (ys.rs != null) w[12] = lm(ys.rs);
  if (ys.lw != null) w[15] = lm(ys.lw);
  if (ys.rw != null) w[16] = lm(ys.rw);
  if (ys.lh != null) w[23] = lm(ys.lh);
  if (ys.rh != null) w[24] = lm(ys.rh);
  if (ys.la != null) w[27] = lm(ys.la);
  if (ys.ra != null) w[28] = lm(ys.ra, 0.4);
  return { t, landmarks: [], worldLandmarks: w };
}

describe("the body witness trace derived from stored skeleton frames", () => {
  it("takes the pair's midpoint where both joints are present, the one that is where only one is, null where neither", () => {
    const out = deriveBodyWitnessTrace([
      frame(1000, { ls: -500, rs: -510, lw: -300, lh: -400, rh: -420, la: -10, ra: -12 }),
      frame(1033.4, { ls: -505 }),
    ])!;
    expect(out.units).toBe("analysis_frame_px_y_down");
    expect(out.framesRead).toBe(2);
    expect(out.points[0]).toEqual({ t: 1000, sh: -505, hp: -410, wr: -300, an: -11, c: 0.4 });
    expect(out.points[1]).toEqual({ t: 1033, sh: -505, hp: null, wr: null, an: null, c: 0.9 });
  });

  it("skips frames with no clock, keeps a frame with no joints as a point of nulls, and is null on nothing", () => {
    expect(deriveBodyWitnessTrace(null)).toBeNull();
    expect(deriveBodyWitnessTrace([])).toBeNull();
    expect(deriveBodyWitnessTrace([{ landmarks: [] }, "junk"])).toBeNull();
    const out = deriveBodyWitnessTrace([frame(5, {})])!;
    expect(out.points).toEqual([{ t: 5, sh: null, hp: null, wr: null, an: null, c: null }]);
  });

  it("thins a long trace evenly to the cap and keeps the clock monotonic", () => {
    const frames = Array.from({ length: BODY_WITNESS_MAX_POINTS * 3 }, (_, i) => frame(i * 10, { lh: -i }));
    const out = deriveBodyWitnessTrace(frames)!;
    expect(out.points.length).toBe(BODY_WITNESS_MAX_POINTS);
    expect(out.framesRead).toBe(BODY_WITNESS_MAX_POINTS * 3);
    for (let i = 1; i < out.points.length; i++) expect(out.points[i].t).toBeGreaterThan(out.points[i - 1].t);
  });
});
