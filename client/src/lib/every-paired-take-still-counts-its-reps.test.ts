import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { summarizeJumpSet } from "./jump-tracking";
import { summarizeTrackedSet } from "./bar-tracking";
import { cameraTunablesFor } from "@shared/camera-tunables-by-lift";
import { romBucketForExercise, firstMoveForExercise } from "./exercise-camera-profile";

/* Scott, 2026-11-16: "It read them all last Monday why did it suddenly stop counting today ...
 * how do we lock it in?" The count is locked by replaying the REAL takes: every box jump filmed
 * beside the sensor is run here both ways the phone can run it (landing gate armed, landing gate
 * off) and must find its five jumps either way, because which way the phone runs is decided by
 * whether the box detector happened to agree with the typed height on that take. Last Monday it
 * disagreed (gate off, counted); today it agreed (gate on, two of five). A take added to the
 * fixtures is covered the day it is added. */
const load = (n: string) => JSON.parse(readFileSync(join(__dirname, "__fixtures__", n), "utf8")) as any[];
const jumps = [...load("ovr-2026-11-05-export.json"), ...load("ovr-2026-11-09-export.json"), ...load("ovr-2026-11-16-export.json")]
  .filter((f) => f.exerciseName === "Box Jump");
const toPoints = (f: any) => f.barPathTrace.map((p: any) => ({ t: p.t, x: p.x / 100, y: p.y / 100, z: 0, confidence: p.c ?? 1 }));
/** Real jumps onto the box: a net rise of at least half the box. A stray hop is not one. */
function realJumps(f: any, armed: boolean): number {
  const points = toPoints(f);
  const ys = points.map((p: any) => p.y).sort((a: number, b: number) => a - b);
  const floor = ys[Math.floor(ys.length * 0.9)];
  const ev: any[] = [];
  summarizeJumpSet(points, f.heightIn, 35, armed ? floor - 0.61 : null, 1 / 30, ev, { usesBox: true, boxHeightCm: 61 });
  return ev.filter((e) => e.kind === "rep" && e.value >= 30.5).length;
}

describe("every box jump filmed beside the sensor still counts its jumps", () => {
  it("has real takes to replay, today's among them", () => {
    expect(jumps.length).toBeGreaterThanOrEqual(3);
    expect(jumps.some((f) => f.id.startsWith("2026-11-16"))).toBe(true);
  });
  for (const f of jumps) {
    it(`${f.id}: the same count with the landing gate on and off`, () => {
      const off = realJumps(f, false);
      const on = realJumps(f, true);
      expect(off).toBeGreaterThanOrEqual(5);
      expect(on).toBe(off);
    });
  }
  it("2026-11-16: five jumps, 64-69cm onto the 61cm box", () => {
    const f = jumps.find((x) => x.id.startsWith("2026-11-16"))!;
    expect(realJumps(f, true)).toBe(5);
  });
});

describe("today's bar takes replay to their logged count", () => {
  const bar = load("ovr-2026-11-16-export.json").filter((f) => f.exerciseName === "Romanian Deadlift");
  for (const f of bar) {
    it(`${f.id}: ${f.loggedReps} of ${f.loggedReps}`, () => {
      const romKind = romBucketForExercise(f.exerciseName);
      const m = summarizeTrackedSet(toPoints(f), f.loadKg ?? undefined, f.heightIn ?? undefined, firstMoveForExercise(f.exerciseName), [],
        f.positionScaleCorrection ?? 1, false, romKind, { x: 0, y: 1 }, f.loggedReps ?? null, cameraTunablesFor(f.exerciseName, romKind))!;
      expect(m.repBreakdown.length).toBe(f.loggedReps);
    });
  }
});
