import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeTrackedSet, IMAGE_VERTICAL_AXIS, concentricIsUpward, type TrackedPoint } from "./bar-tracking";
import { worldVerticalSign, POSE_LANDMARKS } from "./pose-tracking";

type Landmark = Parameters<typeof worldVerticalSign>[0][number];
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { cameraTunablesFor } from "@shared/camera-tunables-by-lift";
import e29 from "./__fixtures__/ovr-2026-10-29-export.json";

/* THE CONCENTRIC IS THE WAY UP, AND THE TRACE'S y GROWS DOWNWARD.
 *
 * From 2026-09-30 (the gravity axis, build 576) to 2026-11-05 every native bar take reported its
 * LOWERING as its lift. The direction rule in summarizeTrackedSet read `y[end] > y[start]` as the
 * bar rising, and the trace is y-DOWN: vision-body-landmarks.ts writes y = -(joint.y * frameHeight)
 * from Vision's bottom-up normalized y, so a larger y is LOWER. The phone projects on
 * IMAGE_VERTICAL_AXIS (the identity), so nothing undid it on the device; the replay harness
 * flipped an axis-less trace the other way (VERTICAL_AXIS was { x: 0, y: -1 }) and so was right
 * where the phone was wrong, which is how a month of sensor pairings compared the descent to the
 * OVR's concentric and fitted windows to it. It did not fail loudly because a controlled lowering
 * and a drive have similar speeds.
 *
 * Three pins. The synthetic case is the one that cannot be argued with: a bench whose way UP is
 * fast and whose way DOWN is slow, in the trace's real polarity, through the real summariser with
 * the phone's own axis -- the reported mean has to be the fast half. The real-data case is the
 * 2026-10-29 Back Squat set 1, whose corrected drives read the sensor rep for rep. And the
 * polarity premises are pinned where they live, so a change to either convention reds this file
 * before it reaches a number. */

const BENCH = "Bench Press";

/** Six bench reps in metres, y-DOWN: 0 is the lockout, +0.40 is the chest. Each rep lowers
 *  over `downS` seconds and presses back up over `upS`. */
function bench(downS: number, upS: number): TrackedPoint[] {
  const pts: TrackedPoint[] = [];
  const dt = 1000 / 30;
  let t = 0;
  const push = (y: number) => { pts.push({ t, x: 0, y, z: 0, confidence: 1 }); t += dt; };
  for (let i = 0; i < 30; i++) push(0);
  for (let r = 0; r < 6; r++) {
    const nd = Math.round((downS * 1000) / dt), nu = Math.round((upS * 1000) / dt);
    for (let i = 1; i <= nd; i++) push((0.4 * i) / nd); // y grows: the bar comes DOWN to the chest
    for (let i = 1; i <= nu; i++) push(0.4 * (1 - i / nu)); // y shrinks: the bar goes UP to lockout
    for (let i = 0; i < 15; i++) push(0);
  }
  return pts;
}

function summarize(points: TrackedPoint[], axis: { x: number; y: number } | null) {
  const romKind = romBucketForExercise(BENCH);
  return summarizeTrackedSet(points, 61, 75, firstMoveForExercise(BENCH), [], 1, false, romKind, axis, 6,
    cameraTunablesFor(BENCH, romKind))!;
}

describe("the concentric is the way up", () => {
  it("the premises: the phone's axis is the identity, the trace is y-down, and every lift but a vertical pull drives up", () => {
    expect(IMAGE_VERTICAL_AXIS).toEqual({ x: 0, y: 1 });
    // worldVerticalSign returns +1 when the shoulders read a SMALLER y than the hips -- the
    // y-down convention it exists to pin -- and the dialog multiplies the trace by it.
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
    lm[POSE_LANDMARKS.LEFT_SHOULDER] = { x: 0, y: -1.5, z: 0, visibility: 1 };
    lm[POSE_LANDMARKS.RIGHT_SHOULDER] = { x: 0.4, y: -1.5, z: 0, visibility: 1 };
    lm[POSE_LANDMARKS.LEFT_HIP] = { x: 0, y: -1.0, z: 0, visibility: 1 };
    lm[POSE_LANDMARKS.RIGHT_HIP] = { x: 0.4, y: -1.0, z: 0, visibility: 1 };
    expect(worldVerticalSign(lm)).toBe(1);
    const bridge = readFileSync(join(__dirname, "vision-body-landmarks.ts"), "utf8");
    expect(bridge).toMatch(/y: -\(joint\.y \* frame\.frameHeight\)/);
    expect(concentricIsUpward("horizontal_press_or_row")).toBe(true);
    expect(concentricIsUpward("squat")).toBe(true);
    expect(concentricIsUpward("vertical_pull")).toBe(false);
  });

  it("a fast way up and a slow way down: the reported mean is the fast half, with the phone's own axis", () => {
    const fastUp = summarize(bench(2.0, 0.5), { ...IMAGE_VERTICAL_AXIS });
    expect(fastUp.repBreakdown.length).toBe(6);
    // 0.40m in 0.5s is 0.80 m/s; the lowering is 0.20. Before 2026-11-05 this read 0.17.
    expect(fastUp.meanVelocityMps).toBeGreaterThan(0.6);
    expect(fastUp.eccentricMeanVelocityMps).toBeLessThan(0.3);
    expect(fastUp.concentricSeconds).toBeLessThan(fastUp.eccentricSeconds);
    // And a slow grind up with a quick lowering is STILL the way up -- direction, not speed.
    const slowUp = summarize(bench(0.5, 2.0), { ...IMAGE_VERTICAL_AXIS });
    expect(slowUp.repBreakdown.length).toBe(6);
    expect(slowUp.meanVelocityMps).toBeLessThan(0.3);
    expect(slowUp.eccentricMeanVelocityMps).toBeGreaterThan(0.6);
    expect(slowUp.concentricSeconds).toBeGreaterThan(slowUp.eccentricSeconds);
    // A rep's position curve is HEIGHT GAINED: it climbs over the concentric.
    const curve = fastUp.repBreakdown[1].velocityCurve!;
    expect(curve[0].positionCm).toBeCloseTo(0, 5);
    expect(curve[curve.length - 1].positionCm).toBeGreaterThan(30);
  });

  it("the 2026-10-29 Back Squat reads the sensor rep for rep on its drives, not its descents", () => {
    const f = (e29 as any[]).find((c) => c.id === "2026-10-29 Back Squat set 1");
    const points = f.barPathTrace.map((p: any) => ({ t: p.t, x: p.x / 100, y: p.y / 100, z: 0, confidence: p.c ?? 1 }));
    const romKind = romBucketForExercise("Back Squat");
    const tune = cameraTunablesFor("Back Squat", romKind);
    // At the whole travel window, so the comparison is phase against phase and not a drive trim.
    tune.values.driveOnsetFraction = 0;
    const m = summarizeTrackedSet(points, f.loadKg, f.heightIn, firstMoveForExercise("Back Squat"), [], 1, false, romKind,
      { ...IMAGE_VERTICAL_AXIS }, f.loggedReps, tune)!;
    // OVR, 2026-10-29, 135 x 5, per rep: 0.87 0.83 0.82 0.77 0.74 (set 0.80).
    const sensor = [0.87, 0.83, 0.82, 0.77, 0.74];
    expect(m.repBreakdown.length).toBe(5);
    m.repBreakdown.forEach((r, i) => {
      expect(Math.abs(r.meanVelocityMps - sensor[i]), `rep ${i + 1}`).toBeLessThan(0.08);
    });
    // and the descents, which the phone reported as the lift until 2026-11-05, are the slow half
    expect(m.eccentricMeanVelocityMps).toBeLessThan(m.meanVelocityMps! * 0.85);
    // Every reported rep climbs: the concentric window goes UP the image.
    for (const r of m.repBreakdown) {
      const curve = r.velocityCurve!;
      expect(curve[curve.length - 1].positionCm, `rep ${r.repNumber}`).toBeGreaterThan(50);
    }
  });

  it("the rule is written in the trace's polarity, and the old spelling is forbidden", () => {
    const src = readFileSync(join(__dirname, "bar-tracking.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(src).toMatch(/const wentUp = ySmoothed\[phase\.endIdx\] < ySmoothed\[phase\.startIdx\];/);
    expect(src).toMatch(/return wentUp === concentricGoesUp;/);
    expect(src).not.toMatch(/ySmoothed\[phase\.endIdx\] > ySmoothed\[phase\.startIdx\]/);
    // The replay harness hands the summariser the same polarity the phone does.
    const replay = readFileSync(join(__dirname, "capture-replay.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(replay).toMatch(/const VERTICAL_AXIS = \{ x: 0, y: 1 \};/);
    expect(replay).not.toMatch(/y: -1/);
  });
});
