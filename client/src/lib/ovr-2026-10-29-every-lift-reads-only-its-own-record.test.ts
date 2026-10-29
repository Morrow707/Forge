import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { replayCapture } from "./capture-replay";
import { cameraTunablesFor, FITTED_OVERRIDES } from "@shared/camera-tunables-by-lift";
import { romBucketForExercise } from "./exercise-camera-profile";

/* THE FOUR TRACED CAPTURES OF THE 2026-10-29 EXPORT, replayed through the real summariser with
 * each lift's OWN record, the way the phone runs them. Two things are pinned here and the second
 * is the one Scott asked for in so many words ("any changes you're making to squat should not
 * effect rdl should not effect the jump and vice versa"):
 *   - the harness reproduces what the phone shipped (reps, range of motion, mean) on every take,
 *     so it is a fair instrument for the next rule;
 *   - the Romanian Deadlift's own peak-to-mean cap (FITTED_OVERRIDES, 2.5) reaches the RDL
 *     traces and NOT the squat traces, which replay to the shipped numbers to the last digit.
 * The 10-19 RDL set 2 is the take the cap was fitted against: three reps the phone wrote down at
 * 2.0x their mean (1.45, 1.53, 1.49) are their own raw peaks now (1.47, 1.57, 1.62), and the set
 * reads 1.43 against the sensor's 1.59 where it read 1.40.
 * Fixture: client/src/lib/__fixtures__/ovr-2026-10-29-export.json, trimmed from the admin export. */
type Fixture = {
  id: string; exerciseName: string; heightIn: number | null; loadKg: number | null; loggedReps: number | null;
  trackingLevel: string; trackingDiagnostics: any; barPathTrace: any[];
  shipped: { reps: number; peakVelocityMps: number; meanVelocityMps: number; romCm: number; repPeaks: number[]; repRawPeaks: (number | null)[] };
};
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-10-29-export.json"), "utf8"));
const replay = (f: Fixture) => replayCapture({ setId: f.id, exerciseName: f.exerciseName, heightIn: f.heightIn, loadKg: f.loadKg, loggedReps: f.loggedReps, trackingLevel: f.trackingLevel, barPathTrace: f.barPathTrace, trackingDiagnostics: f.trackingDiagnostics }).metrics!;

describe("the 2026-10-29 export replays through each lift's own record", () => {
  it("holds the four traced captures", () => {
    expect(fixtures.map((f) => f.id).sort()).toEqual([
      "2026-10-19 Back Squat set 2", "2026-10-19 Romanian Deadlift set 2",
      "2026-10-29 Back Squat set 1", "2026-10-29 Romanian Deadlift set 1",
    ]);
  });
  for (const f of fixtures) {
    it(`${f.id}: the harness reproduces the shipped reps, range of motion and mean`, () => {
      const m = replay(f);
      expect(m.repBreakdown.length).toBe(f.shipped.reps);
      expect(Math.abs((m.romCm ?? NaN) - f.shipped.romCm)).toBeLessThanOrEqual(0.5);
      expect(Math.abs((m.meanVelocityMps ?? NaN) - f.shipped.meanVelocityMps)).toBeLessThanOrEqual(0.03);
    });
  }
  it("the squat traces replay to the shipped peaks exactly: the RDL's override never reaches them", () => {
    // The squat's own record (2026-10-29 evening) holds ONE field, a ruler uncertainty, which the
    // trace replay below never reads: the peaks and the rep gate are shared with every bar lift.
    expect(Object.keys(FITTED_OVERRIDES["Back Squat"] ?? {})).toEqual(["heightRulerUncertainty"]);
    expect(cameraTunablesFor("Back Squat", "squat").sources.maxPeakToMeanRatio).not.toBe("fitted");
    for (const f of fixtures.filter((x) => x.exerciseName === "Back Squat")) {
      const m = replay(f);
      // Within a hundredth: the harness and the phone round a raw 0.915 differently (0.92 against
      // 0.91 on today's rep 1), which predates every change here. No squat rep is capped or
      // floored on either take, so every peak IS its raw read and nothing a cap could touch.
      m.repBreakdown.forEach((r: any, i: number) => {
        expect(Math.abs(r.peakVelocityMps - f.shipped.repPeaks[i]), `${f.id} rep ${i + 1}`).toBeLessThanOrEqual(0.011);
        expect(r.windows?.peakCapped, `${f.id} rep ${i + 1}`).toBe(false);
        expect(r.windows?.peakFloored, `${f.id} rep ${i + 1}`).toBe(false);
      });
      expect(Math.abs((m.peakVelocityMps ?? NaN) - f.shipped.peakVelocityMps)).toBeLessThanOrEqual(0.011);
    }
  });
  it("the RDL traces read their own cap: a rep the phone capped at 2.0x its mean is its raw peak now", () => {
    expect(cameraTunablesFor("Romanian Deadlift", romBucketForExercise("Romanian Deadlift")).values.maxPeakToMeanRatio).toBe(2.5);
    const s2 = fixtures.find((x) => x.id === "2026-10-19 Romanian Deadlift set 2")!;
    const m = replay(s2);
    const peaks = m.repBreakdown.map((r) => r.peakVelocityMps);
    // reps 1, 6 and 7 were capped on the phone (raw 1.467 / 1.575 / 1.624 written as 1.45 / 1.53 / 1.49)
    expect(peaks[0]).toBeCloseTo(1.47, 2);
    expect(peaks[5]).toBeCloseTo(1.57, 2);
    expect(peaks[6]).toBeCloseTo(1.62, 2);
    expect(m.repBreakdown.filter((r: any) => r.windows?.peakCapped).length).toBe(0);
    expect(m.peakVelocityMps).toBeGreaterThan(s2.shipped.peakVelocityMps);
    expect(m.peakVelocityMps).toBeCloseTo(1.43, 2);
    // and a rep whose raw peak was ALREADY below its mean is still floored, not inflated:
    // today's RDL floored 5 of 7 and the cap change cannot touch a floored rep.
    const today = replay(fixtures.find((x) => x.id === "2026-10-29 Romanian Deadlift set 1")!);
    expect(today.repBreakdown.filter((r: any) => r.windows?.peakFloored).length).toBe(5);
    expect(today.peakVelocityMps).toBeCloseTo(1.06, 2);
  });
});
