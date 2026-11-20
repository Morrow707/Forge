import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { replayCapture, type StoredCapture } from "./capture-replay";
import { cameraTunablesFor } from "@shared/camera-tunables-by-lift";

/* ROUND TWENTY-TWO (2026-11-20, build 797, in sweatpants): Back Squat 135x5, Romanian Deadlift
 * 135x8 and a Box Jump (the OVR's "Jump Squat", its rep 1 the set-up jump and skipped). One fix per
 * lift toward the OVR (RULE #6), each in that lift's own record:
 *  - RDL maxPeakToMeanRatio 1.75 -> 1.66: every rep's peak sat at the cap; the OVR's own
 *    peak/mean on this set averages 1.66. Peak 1.60 -> 1.51 against the OVR's 1.49.
 *  - Back Squat heightRulerUncertainty 0.13 -> 0.14: range -2.14% -> -1.55% as the phone stated it.
 *  - Box Jump: none. Four of five jumps read inside +-3.5%; jump 1's takeoff was placed early so
 *    the box correction shrank more of its rise, and no box-jump setting reaches that rule or
 *    replays from the export. Recorded in docs/camera-tracking-notes.md. */

type Fixture = StoredCapture & { id: string; loggedReps: number };
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-20-export.json"), "utf8"));
const byName = (name: string) => {
  const f = fixtures.find((x) => x.exerciseName === name);
  if (!f) throw new Error(`no fixture ${name}`);
  return f;
};
const OVR_RDL = { peak: 1.49, mean: 0.9, romCm: 59.69 };

describe("round twenty-two", () => {
  it("the RDL's peak lands near the OVR's, and its range and mean do not move", () => {
    const rdl = byName("Romanian Deadlift");
    const m = replayCapture(rdl).metrics!;
    expect(m.repBreakdown).toHaveLength(8);
    expect(Math.abs(m.peakVelocityMps! / OVR_RDL.peak - 1)).toBeLessThan(0.02);
    // As filmed the phone read 1.60 (+7.4%); the range and mean are what it shipped.
    expect(m.romCm).toBeCloseTo(59.5, 1);
    expect(m.meanVelocityMps).toBeCloseTo(0.91, 2);
  });

  it("each lift's number is its own: the squat's and RDL's steps reach no other lift", () => {
    expect(cameraTunablesFor("Romanian Deadlift", "deadlift").values.maxPeakToMeanRatio).toBe(1.66);
    expect(cameraTunablesFor("Back Squat", "squat").values.heightRulerUncertainty).toBe(0.13); // 0.14 in round twenty-two, 0.13 since round twenty-four
    expect(cameraTunablesFor("Back Squat", "squat").values.maxPeakToMeanRatio).not.toBe(1.66);
    expect(cameraTunablesFor("Conventional Deadlift", "deadlift").values.maxPeakToMeanRatio).not.toBe(1.66);
    expect(cameraTunablesFor("Front Squat", "squat").values.heightRulerUncertainty).not.toBe(0.13);
  });

  it("the box jump counted the same five jumps as the OVR's 2-6 (its set-up jump skipped)", () => {
    const jump = byName("Box Jump");
    expect(jump.loggedReps).toBe(5);
    expect(replayCapture(jump).repCount).toBe(5);
  });
});
