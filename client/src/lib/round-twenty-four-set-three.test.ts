import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { replayCapture, type StoredCapture } from "./capture-replay";
import { cameraTunablesFor } from "@shared/camera-tunables-by-lift";

/* ROUND TWENTY-FOUR (2026-11-20, set 3 on build 809, in shorts): one fix per lift (RULE #6).
 *  - Back Squat heightRulerUncertainty 0.14 -> 0.13 (range +4.0% -> about +3.2%). A window step
 *    under 0.01 was refused: it brings back the 11-09 lockout-stand bug.
 *  - Box Jump heightRulerUncertainty 0.1 -> 0.08 (mean +10.0% -> about +7.9%, OVR reps 2-6).
 *  - Romanian Deadlift: set 3 (filmed at 0.5x) saved four seconds after the export was taken, so
 *    it is not in this file; its fix waits on the next export. */

type Fixture = StoredCapture & { id: string; loggedReps: number };
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-20-set-3-export.json"), "utf8"));
const byName = (name: string) => fixtures.find((x) => x.exerciseName === name)!;

describe("round twenty-four", () => {
  it("each lift's step is its own", () => {
    expect(cameraTunablesFor("Back Squat", "squat").values.heightRulerUncertainty).toBe(0.13);
    expect(cameraTunablesFor("Back Squat", "squat").values.driveOnsetFraction).toBe(0.01);
    expect(cameraTunablesFor("Box Jump").values.heightRulerUncertainty).toBe(0.08);
    expect(cameraTunablesFor("Depth Jump").values.heightRulerUncertainty).not.toBe(0.08);
    expect(cameraTunablesFor("Front Squat", "squat").values.heightRulerUncertainty).not.toBe(0.13);
  });

  it("the squat's set 3 counts its five reps and keeps the range it shipped", () => {
    const m = replayCapture(byName("Back Squat")).metrics!;
    expect(m.repBreakdown).toHaveLength(5);
    expect(m.romCm).toBeCloseTo(81.6, 0);
  });
});
