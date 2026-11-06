import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { replayCapture } from "./capture-replay";
import { VELOCITY_SMOOTHING_MS } from "./bar-tracking";
import { cameraTunablesFor, FITTED_OVERRIDES, VELOCITY_OVERRIDES_REMOVED_2026_11_05 } from "@shared/camera-tunables-by-lift";
import { romBucketForExercise } from "./exercise-camera-profile";
import { MAX_PEAK_TO_MEAN_RATIO } from "./bar-tracking";

/* THE FOUR TRACED CAPTURES OF THE 2026-10-29 EXPORT, replayed through the real summariser with
 * each lift's OWN record, the way the phone runs them.
 *
 * REWRITTEN 2026-11-05. Until then this file pinned the harness to what the phone SHIPPED on
 * these takes -- and what the phone shipped was the LOWERING of every rep: the direction rule was
 * inverted from 2026-09-30 to 2026-11-05 (the-concentric-is-the-way-up.test.ts). So "the harness
 * reproduces the shipped mean" was true and was proving the harness inverted the same way. The
 * pins below are the corrected replays, with the sensor's numbers beside them where the take has
 * them, and the one thing Scott asked for in so many words is still the spine of the file ("any
 * changes you're making to squat should not effect rdl should not effect the jump and vice
 * versa"): the squat's own numbers reach the squat traces and NOT the RDL's, and the RDL's reach
 * nobody else.
 *   - the squat's own record now carries a drive window (0.02), the first velocity number ever
 *     fitted on a drive; the RDL's record carries a ruler uncertainty and nothing about velocity.
 *   - the RDL's peak-to-mean cap of 2.5 (round one) is GONE: the peaks it released were the
 *     lowering's. The RDL reads the shared cap, and this file says so instead of asserting 2.5.
 * Fixture: client/src/lib/__fixtures__/ovr-2026-10-29-export.json, trimmed from the admin export;
 * each capture's `shipped` block is what the phone said on its build and is kept as the record of
 * that, not as a line the harness is held to. */
type Fixture = {
  id: string; exerciseName: string; heightIn: number | null; loadKg: number | null; loggedReps: number | null;
  trackingLevel: string; trackingDiagnostics: any; barPathTrace: any[];
  shipped: { reps: number; peakVelocityMps: number; meanVelocityMps: number; romCm: number; repPeaks: number[]; repRawPeaks: (number | null)[] };
};
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-10-29-export.json"), "utf8"));
const replay = (f: Fixture) => replayCapture({ setId: f.id, exerciseName: f.exerciseName, heightIn: f.heightIn, loadKg: f.loadKg, loggedReps: f.loggedReps, trackingLevel: f.trackingLevel, barPathTrace: f.barPathTrace, trackingDiagnostics: f.trackingDiagnostics }).metrics!;
const byId = (id: string) => fixtures.find((x) => x.id === id)!;

/** OVR, set level, from docs/camera-tracking-notes.md: 10-29 squat 0.80 / 1.20; 10-19 squat set 2
 *  0.86 / 1.30; 10-29 RDL 0.90 / 1.54; 10-19 RDL set 2 0.89 / 1.59. */
const SENSOR: Record<string, { mean: number; peak: number; reps: number }> = {
  "2026-10-29 Back Squat set 1": { mean: 0.80, peak: 1.20, reps: 5 },
  "2026-10-19 Back Squat set 2": { mean: 0.86, peak: 1.30, reps: 5 },
  "2026-10-29 Romanian Deadlift set 1": { mean: 0.90, peak: 1.54, reps: 8 },
  "2026-10-19 Romanian Deadlift set 2": { mean: 0.89, peak: 1.59, reps: 8 },
};

/** What the corrected rule reads on each take at each lift's own record (2026-11-05). The range of
 *  motion is the phone's to the half-centimetre -- direction does not change a magnitude -- and the
 *  velocities are the drives'. */
const CORRECTED: Record<string, { reps: number; romCm: number; mean: number; peak: number }> = {
  // Round nine (2026-11-05): the squat's record is the whole travel window (driveOnsetFraction
  // 0) and a 130ms smoothing, the RDL's window 0.02 -- see FITTED_OVERRIDE_EVIDENCE.
  "2026-10-29 Back Squat set 1": { reps: 5, romCm: 71.8, mean: 0.80, peak: 1.16 },
  "2026-10-19 Back Squat set 2": { reps: 5, romCm: 71.8, mean: 0.83, peak: 1.19 },
  "2026-10-29 Romanian Deadlift set 1": { reps: 8, romCm: 84.1, mean: 1.19, peak: 1.82 },
  "2026-10-19 Romanian Deadlift set 2": { reps: 7, romCm: 64.1, mean: 1.12, peak: 2.15 },
};

describe("the 2026-10-29 export replays through each lift's own record", () => {
  it("holds the four traced captures", () => {
    expect(fixtures.map((f) => f.id).sort()).toEqual([
      "2026-10-19 Back Squat set 2", "2026-10-19 Romanian Deadlift set 2",
      "2026-10-29 Back Squat set 1", "2026-10-29 Romanian Deadlift set 1",
    ]);
  });

  for (const f of fixtures) {
    it(`${f.id}: range of motion as the phone shipped it, reps and velocities as the corrected rule reads them`, () => {
      const m = replay(f);
      const c = CORRECTED[f.id];
      // A magnitude -- but the set's range is the MEDIAN of its reps' amplitudes, and which phases
      // are the reps changed, so it is pinned to the corrected replay (the 10-29 RDL moves 2.9cm
      // because its lowerings and its pulls have different medians; the squats move 0.0 and 0.8).
      expect(Math.abs((m.romCm ?? NaN) - c.romCm)).toBeLessThanOrEqual(0.5);
      expect(m.repBreakdown.length).toBe(c.reps);
      expect(Math.abs((m.meanVelocityMps ?? NaN) - c.mean)).toBeLessThanOrEqual(0.015);
      expect(Math.abs((m.peakVelocityMps ?? NaN) - c.peak)).toBeLessThanOrEqual(0.015);
    });
  }

  it("the squats read the sensor: both count five, the 10-19 set recovers the rep the lowering lost, and the means sit inside 4%", () => {
    // 10-29 set 1: 0.80 against 0.80 at the squat's own window (0.84 at the shared 0.04, 0.81 at
    // the 0.02 of round eight); 10-19 set 2: 0.83 against 0.86 (0.87 shared, 0.86 at 0.02). On
    // the lowerings the phone had read 0.72 and 0.84, and found four reps on 10-19 where the
    // sensor counted five. The whole-window step (round nine) costs this take 3.5 points and
    // buys the 2026-11-05 squat 2.4; over the five paired squats the mean error goes +2.0% to
    // -0.4% (see FITTED_OVERRIDE_EVIDENCE).
    for (const id of ["2026-10-29 Back Squat set 1", "2026-10-19 Back Squat set 2"]) {
      const m = replay(byId(id));
      expect(m.repBreakdown.length, id).toBe(SENSOR[id].reps);
      expect(Math.abs(m.meanVelocityMps! / SENSOR[id].mean - 1), id).toBeLessThan(0.04);
      // the peaks read 3-9% under the sensor at the squat's 130ms smoothing (4-9% at 165)
      expect(m.peakVelocityMps! / SENSOR[id].peak, id).toBeGreaterThan(0.88);
      expect(m.peakVelocityMps! / SENSOR[id].peak, id).toBeLessThan(1.0);
      // and every squat rep's drive is faster than its descent, which is what a squat is
      expect(m.eccentricMeanVelocityMps!, id).toBeLessThan(m.meanVelocityMps!);
    }
    expect(byId("2026-10-19 Back Squat set 2").shipped.reps).toBe(4);
  });

  it("the squat's own numbers reach the squat traces and not the RDL's", () => {
    expect(Object.keys(FITTED_OVERRIDES["Back Squat"]).sort()).toEqual(["driveOnsetFraction", "heightRulerUncertainty", "velocitySmoothingMs"]);
    const squat = cameraTunablesFor("Back Squat", "squat");
    expect(squat.values.driveOnsetFraction).toBe(0);
    expect(squat.sources.driveOnsetFraction).toBe("fitted");
    expect(squat.values.velocitySmoothingMs).toBe(130);
    const rdl = cameraTunablesFor("Romanian Deadlift", romBucketForExercise("Romanian Deadlift"));
    // The RDL took its own first window step in round nine (0.04 -> 0.02); it is its own number,
    // not the squat's, and the squat's 0 does not reach it.
    expect(rdl.sources.driveOnsetFraction).toBe("fitted");
    expect(rdl.values.driveOnsetFraction).toBe(0.02);
    expect(rdl.values.velocitySmoothingMs).toBe(VELOCITY_SMOOTHING_MS);
    // The window moves the squat's mean and the smoothing its peak, and nothing else: same reps,
    // same range at the squat's record as at the shared one, on both squat takes.
    for (const id of ["2026-10-29 Back Squat set 1", "2026-10-19 Back Squat set 2"]) {
      const f = byId(id);
      const own = replay(f);
      const shared = replayCapture({ setId: f.id, exerciseName: "Front Squat", heightIn: f.heightIn, loadKg: f.loadKg, loggedReps: f.loggedReps, trackingLevel: f.trackingLevel, barPathTrace: f.barPathTrace, trackingDiagnostics: f.trackingDiagnostics }).metrics!;
      expect(shared.repBreakdown.length, id).toBe(own.repBreakdown.length);
      expect(shared.romCm, id).toBeCloseTo(own.romCm!, 1);
      // the 130ms smoothing lifts the peak by a hundredth or so against the shared 165
      expect(own.peakVelocityMps! - shared.peakVelocityMps!, id).toBeGreaterThanOrEqual(0);
      expect(own.peakVelocityMps! - shared.peakVelocityMps!, id).toBeLessThan(0.03);
      // 0.04 on both takes: the whole travel window against the shared 0.04 trim
      expect(shared.meanVelocityMps! - own.meanVelocityMps!, id).toBeGreaterThan(0.005);
      expect(shared.meanVelocityMps! - own.meanVelocityMps!, id).toBeLessThan(0.06);
      // no squat rep is capped or floored on either take: every peak IS its raw read
      own.repBreakdown.forEach((r: any, i: number) => {
        expect(r.windows?.peakCapped, `${id} rep ${i + 1}`).toBe(false);
        expect(r.windows?.peakFloored, `${id} rep ${i + 1}`).toBe(false);
      });
    }
  });

  it("the RDL reads the shared cap again: the 2.5 it carried released the lowering's peaks, and its drives are open", () => {
    expect(VELOCITY_OVERRIDES_REMOVED_2026_11_05["Romanian Deadlift"]).toEqual(["maxPeakToMeanRatio"]);
    expect("maxPeakToMeanRatio" in FITTED_OVERRIDES["Romanian Deadlift"]).toBe(false);
    expect(cameraTunablesFor("Romanian Deadlift", romBucketForExercise("Romanian Deadlift")).values.maxPeakToMeanRatio).toBe(MAX_PEAK_TO_MEAN_RATIO);
    // On the drives the RDL reads HIGH on both takes -- +32% / +26% on the mean at its own 0.02
    // window (+46% / +30% at the shared 0.04), +18% / +35% on the peak against the sensor -- with
    // its range of motion +35% (10-29, filmed oblique) and +15%
    // (10-19, the 3D-pose collapse) over the sensor's. Those are the scale faults the notes carry;
    // the drive is read right and reads what the scale gives it. Pinned at what it reads (Rule #5:
    // two takes, two different scale faults, no velocity fit). The cap at 2.0 binds on four of
    // the 10-19 drives at the RDL's 0.02 window (three at the shared 0.04) and none of the 10-29 ones.
    const s1 = replay(byId("2026-10-29 Romanian Deadlift set 1"));
    const s2 = replay(byId("2026-10-19 Romanian Deadlift set 2"));
    expect(s1.repBreakdown.length).toBe(8);
    expect(s1.meanVelocityMps! / SENSOR["2026-10-29 Romanian Deadlift set 1"].mean).toBeGreaterThan(1.25);
    expect(s2.meanVelocityMps! / SENSOR["2026-10-19 Romanian Deadlift set 2"].mean).toBeGreaterThan(1.2);
    expect(s2.repBreakdown.filter((r: any) => r.windows?.peakCapped).length).toBe(4);
    expect(s1.repBreakdown.filter((r: any) => r.windows?.peakCapped).length).toBe(0);
    // and on both the drive is faster than the lowering, as a hinge's is
    expect(s1.eccentricMeanVelocityMps!).toBeLessThan(s1.meanVelocityMps!);
    expect(s2.eccentricMeanVelocityMps!).toBeLessThan(s2.meanVelocityMps!);
  });
});
