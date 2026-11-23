/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { replayCapture, type StoredCapture } from "./capture-replay";
import { summarizeJumpSet, type JumpSegmentationEvent } from "./jump-tracking";
import { cameraTunablesFor } from "@shared/camera-tunables-by-lift";

/* ROUND TWENTY-FIVE (2026-11-23, set 1 of each on build 827, filmed from behind). Bugs first,
 * then one step per lift (RULE #6):
 *  - Back Squat: rep 5 stood a whole second at lockout and the stand rule only cut stands under a
 *    second, so its mean read 0.43 against the OVR's 0.73 (restArrivalAfterPeak's
 *    cutStandThePhaseEndsIn). Step: heightRulerUncertainty 0.13 -> 0.14.
 *  - Box Jump: a step down off the box read as a takeoff that never "landed", so jump 5 fell
 *    inside a false flight and was lost; a landmark spike on the step down after jump 1 became a
 *    21.6cm "jump" onto a 61cm box. Step: heightRulerUncertainty 0.08 -> 0.07.
 *  - Romanian Deadlift: body3DCorrectedUncertainty 0.2 -> 0.16 (the 3D torso read the OVR's
 *    scale; the shoulder ruler +18%). */

type Fixture = StoredCapture & { id: string; loggedReps: number; trackingLevel: string; barPathTrace: { t: number; x: number; y: number; c?: number }[]; boxHeightIn: number | null };
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-23-export.json"), "utf8"));
const byName = (name: string) => fixtures.find((x) => x.exerciseName === name)!;

describe("round twenty-five", () => {
  it("each lift's step is its own", () => {
    // set 1 moved them 0.13 -> 0.14 and 0.08 -> 0.07; set 2 one more step each
    expect(cameraTunablesFor("Back Squat", "squat").values.heightRulerUncertainty).toBe(0.16); // 0.15 until round twenty-five set 3
    expect(cameraTunablesFor("Box Jump").values.heightRulerUncertainty).toBe(0.055); // 0.06 until round twenty-five set 3, 0.05 until its set 4
    expect(cameraTunablesFor("Romanian Deadlift", "deadlift").values.body3DCorrectedUncertainty).toBe(0.15); // 0.16 until round twenty-five set 3, 0.155 until its set 4
    expect(cameraTunablesFor("Conventional Deadlift", "deadlift").values.body3DCorrectedUncertainty).not.toBe(0.15);
    expect(cameraTunablesFor("Depth Jump").values.heightRulerUncertainty).not.toBe(0.06);
  });

  it("a squat rep that stands a whole second at lockout reads its push, not the stand", () => {
    const m = replayCapture(byName("Back Squat")).metrics!;
    expect(m.repBreakdown).toHaveLength(5);
    // OVR rep 5: 0.73 m/s. It read 0.43 on the phone and 0.51 on replay before the fix.
    expect(m.repBreakdown[4].meanVelocityMps).toBeGreaterThan(0.68);
    // OVR set mean 0.75; 0.65 as shipped.
    expect(m.meanVelocityMps).toBeCloseTo(0.74, 2);
    // the range is read off the same reps as before: unchanged.
    expect(m.romCm).toBeCloseTo(75.2, 0);
  });

  it("the box jump counts its five real jumps: no step-down spike, no jump lost in a false flight", () => {
    const f = byName("Box Jump");
    const points = f.barPathTrace.map((p) => ({ t: p.t, x: p.x / 100, y: p.y / 100, z: 0, confidence: p.c ?? 1 }));
    const ev: JumpSegmentationEvent[] = [];
    summarizeJumpSet(points, f.heightIn, 35, null, 1 / 30, ev, { usesBox: true, boxHeightCm: 61 });
    const reps = ev.filter((e) => e.kind === "rep").map((e) => e.value ?? 0);
    expect(reps).toHaveLength(5);
    // every one of them a jump onto the 61cm box (the old second "rep" rose 21.6cm)
    expect(Math.min(...reps)).toBeGreaterThan(30.5);
    expect(ev.some((e) => e.kind === "flight_too_long")).toBe(false);
  });

  it("set 2 (build 833): the squat reads its mean, the box jump counts five, the RDL's walk-bys stay out of the set", () => {
    const set2: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-23-set-2-export.json"), "utf8"));
    const squat = replayCapture(set2.find((x) => x.exerciseName === "Back Squat")!).metrics!;
    expect(squat.repBreakdown).toHaveLength(5);
    expect(squat.meanVelocityMps).toBeGreaterThan(0.74); // OVR 0.77
    const box = set2.find((x) => x.exerciseName === "Box Jump")!;
    const points = box.barPathTrace.map((p) => ({ t: p.t, x: p.x / 100, y: p.y / 100, z: 0, confidence: p.c ?? 1 }));
    const ev: JumpSegmentationEvent[] = [];
    summarizeJumpSet(points, box.heightIn, 35, null, 1 / 30, ev, { usesBox: true, boxHeightCm: 61 });
    expect(ev.filter((e) => e.kind === "rep")).toHaveLength(5);
    const rdl = replayCapture(set2.find((x) => x.exerciseName === "Romanian Deadlift")!).metrics!;
    expect(rdl.repBreakdown).toHaveLength(8);
    // reps 4 and 7 ran through the walk-bys (119 and 88cm); the set's range leaves them out
    expect(rdl.romCm).toBeLessThan(75);
  });
});

describe("round twenty-five, the remaining fixes", () => {
  it("a jump's turning point is read between frames", async () => {
    const { turningPointT } = await import("./jump-tracking");
    // y = (t - 0.53)^2 sampled every 0.1s: the vertex lies between the samples at 0.5 and 0.6
    const pts = [0.3, 0.4, 0.5, 0.6, 0.7].map((t) => ({ t: t * 1000, x: 0, y: (t - 0.53) ** 2, z: 0 }));
    const ys = pts.map((p) => p.y);
    expect(turningPointT(pts, ys, 2)).toBeCloseTo(530, 0);
    // a flat run or an end sample keeps the sample's own time
    expect(turningPointT(pts, ys, 0)).toBe(300);
  });
});
