import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { replayCapture, type StoredCapture } from "./capture-replay";
import { cameraTunablesFor } from "@shared/camera-tunables-by-lift";

/* ROUND TWENTY-THREE (2026-11-20, set 2 on build 807): one fix per lift toward the OVR (RULE #6),
 * each in that lift's own record:
 *  - Back Squat driveOnsetFraction 0.02 -> 0.01: range was right (-0.2%), the mean +5.8% high.
 *  - Romanian Deadlift biacromialToleranceFraction 0.3 -> 0.28: range -6.2% -> about -5.8%.
 *  - Box Jump boxRulerUncertainty 0.05 -> 0.07: the corroborated box ruler pulled the scale low;
 *    mean -5.2% -> about -2.1% (OVR "Jump Squat" reps 2-6, rep 1 the set-up jump). */

type Fixture = StoredCapture & { id: string; loggedReps: number };
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-20-set-2-export.json"), "utf8"));
const byName = (name: string) => fixtures.find((x) => x.exerciseName === name)!;
const OVR_SQUAT_SET2 = { mean: 0.86, peak: 1.36, romCm: 30.7 * 2.54 };

describe("round twenty-three", () => {
  it("the squat's wider window moves set 2's mean toward the sensor and leaves the range and reps alone", () => {
    const m = replayCapture(byName("Back Squat")).metrics!;
    expect(m.repBreakdown).toHaveLength(5);
    expect(m.romCm! / OVR_SQUAT_SET2.romCm - 1).toBeGreaterThan(-0.01);
    // +4.7% at 0.02 on this replay; +2.3% at 0.01.
    expect(m.meanVelocityMps! / OVR_SQUAT_SET2.mean - 1).toBeLessThan(0.03);
  });

  it("each lift's step is its own", () => {
    expect(cameraTunablesFor("Back Squat", "squat").values.driveOnsetFraction).toBe(0.01);
    expect(cameraTunablesFor("Romanian Deadlift", "deadlift").values.biacromialToleranceFraction).toBe(0.28);
    expect(cameraTunablesFor("Box Jump").values.boxRulerUncertainty).toBe(0.07);
    expect(cameraTunablesFor("Front Squat", "squat").values.driveOnsetFraction).not.toBe(0.01);
    expect(cameraTunablesFor("Conventional Deadlift", "deadlift").values.biacromialToleranceFraction).not.toBe(0.28);
    expect(cameraTunablesFor("Depth Jump").values.boxRulerUncertainty).toBe(0.05);
  });

  it("the RDL counted all eight pulls of set 2", () => {
    expect(replayCapture(byName("Romanian Deadlift")).metrics!.repBreakdown).toHaveLength(8);
  });
});
