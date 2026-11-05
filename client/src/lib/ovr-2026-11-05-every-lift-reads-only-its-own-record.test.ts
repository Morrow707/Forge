import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  summarizeTrackedSet, repsWithoutStarvation, setRangeOfMotionProvenance,
  SAMPLE_STARVED_GAP_MULTIPLE, SAMPLE_STARVED_MIN_DISTANCE_SHARE, VELOCITY_SMOOTHING_MS, DRIVE_ONSET_FRACTION,
} from "./bar-tracking";
import { summarizeJumpSet } from "./jump-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { cameraTunablesFor, FITTED_OVERRIDES } from "@shared/camera-tunables-by-lift";
import { ledgerRow } from "@shared/accuracy-ledger";
import { OVR_BACK_SQUAT_2026_11_05, OVR_ROMANIAN_DEADLIFT_2026_11_05, OVR_BOX_JUMP_HIP_2026_11_05 } from "./tracker-ground-truth";

/* THE 2026-11-05 SESSION, round nine: back squat, Romanian deadlift and box jump on build 710,
 * the first takes beside the OVR with the direction rule corrected. Scott: "I want at least one
 * fix per lift ... fix every error you find even if it's .001 accuracy."
 *
 * The squat: its own window goes to 0 (the whole travel window) and its own smoothing to 130.
 * The RDL: its own first window step (0.04 -> 0.02) and the SAMPLE-STARVATION rule, written for
 * its rep 1 -- a 0.239s hole inside the drive with 30cm of the pull in it, reported as a 45.6cm
 * rep against the sensor's 61.2. The jump: the hip's drive peak and mean are set-level numbers
 * now, so the sensor's own quantity has something to sit beside.
 * Fixture: client/src/lib/__fixtures__/ovr-2026-11-05-export.json, trimmed from the admin export. */
type Fixture = {
  id: string; exerciseName: string; heightIn: number | null; loadKg: number | null; loggedReps: number | null;
  trackingLevel: string; boxHeightIn: number | null; trackingDiagnostics: any; barPathTrace: any[];
  shipped: { reps: number; peakVelocityMps: number | null; meanVelocityMps: number | null; romCm: number | null; jumpHeightCm: number | null; repPeaks: number[]; repMeans: number[]; repRoms: (number | null)[]; jumpBreakdown: any[] | null };
};
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-05-export.json"), "utf8"));
const byId = (id: string) => fixtures.find((f) => f.id === id)!;
const STORED = { x: 0, y: 1 };
function replay(f: Fixture, patch: Partial<Record<string, number>> = {}) {
  const points = f.barPathTrace.map((p: any) => ({ t: p.t, x: p.x / 100, y: p.y / 100, z: 0, confidence: p.c ?? 1 }));
  const cal = f.trackingDiagnostics?.calibration ?? null;
  const romKind = romBucketForExercise(f.exerciseName);
  const tune = cameraTunablesFor(f.exerciseName, romKind);
  Object.assign(tune.values, patch);
  const m = summarizeTrackedSet(points, f.loadKg ?? undefined, f.heightIn ?? undefined, firstMoveForExercise(f.exerciseName), [],
    cal?.positionScaleCorrection ?? 1, false, romKind, STORED, f.loggedReps ?? null, tune);
  if (!m) throw new Error(`${f.id}: no metrics`);
  return m;
}
const SQUAT = "2026-11-05 Back Squat set 1", RDL = "2026-11-05 Romanian Deadlift set 1", JUMP = "2026-11-05 Box Jump set 1";
const sensorRomCm = (romIn: number) => romIn * 2.54;

describe("the 2026-11-05 export replays through each lift's own record", () => {
  it("holds the three captures, and all three ran on build 710", () => {
    expect(fixtures.map((f) => f.id).sort()).toEqual([JUMP, SQUAT, RDL].sort());
    // The squat's drive windows open at 0.5-4.9% of the peak with drive = phase on reps 1 and 2:
    // only the 0.02 window of round eight does that, so this is 710 and not 707 -- the question
    // the export's new calibration.liftRecord answers directly from the next take on.
    const shipped = byId(SQUAT).shipped;
    expect(replay(byId(SQUAT), { driveOnsetFraction: 0.02, velocitySmoothingMs: 165 }).meanVelocityMps).toBe(shipped.meanVelocityMps);
    expect(replay(byId(SQUAT), { driveOnsetFraction: 0.02, velocitySmoothingMs: 165 }).peakVelocityMps).toBe(shipped.peakVelocityMps);
    expect(byId(SQUAT).trackingDiagnostics.recording.analysisPath).toBe("file");
    expect(byId(RDL).trackingDiagnostics.recording.analysisPath).toBe("live");
  });

  it("the squat: the whole travel window and a 130ms smoothing, +2.4% / -3.9% against the sensor, rep for rep", () => {
    const own = cameraTunablesFor("Back Squat", "squat");
    expect(own.values.driveOnsetFraction).toBe(0);
    expect(own.values.velocitySmoothingMs).toBe(130);
    expect(own.sources.velocitySmoothingMs).toBe("fitted");
    const m = replay(byId(SQUAT));
    const s = OVR_BACK_SQUAT_2026_11_05.sensor;
    expect(m.repBreakdown.length).toBe(5);
    expect(m.romCm).toBe(73.0);
    expect(m.meanVelocityMps).toBe(0.85);
    expect(m.peakVelocityMps).toBe(1.22);
    expect(m.meanVelocityMps! / s.reported.meanVelocityMps - 1).toBeCloseTo(0.024, 2);
    expect(m.peakVelocityMps! / s.reported.peakVelocityMps - 1).toBeCloseTo(-0.039, 2);
    m.repBreakdown.forEach((r: any, i: number) => {
      expect(Math.abs(r.meanVelocityMps - s.reps[i].meanVelocityMps), `rep ${i + 1} mean`).toBeLessThan(0.07);
      expect(r.peakVelocityMps, `rep ${i + 1} peak`).toBeLessThan(s.reps[i].peakVelocityMps);
      expect(r.peakVelocityMps / s.reps[i].peakVelocityMps, `rep ${i + 1} peak`).toBeGreaterThan(0.93);
      // the drive-window distance is inside 2% of the sensor's rep on every rep ...
      expect(Math.abs(r.windows.driveRomCm / sensorRomCm(s.reps[i].romIn) - 1), `rep ${i + 1} drive distance`).toBeLessThan(0.02);
      // ... and the whole window IS the phase now
      expect(r.windows.driveSeconds, `rep ${i + 1}`).toBe(r.windows.phaseSeconds);
      expect(r.windows.sampleStarved, `rep ${i + 1}`).toBe(false);
    });
    // The step's size, so nobody re-derives it: at 0.02 / 165 (round eight's record, what the
    // phone shipped) the take read +4.8% / -5.5%; between 0.02 and 0 nothing moves, because the
    // only samples the trim removes at any positive fraction are the zero-speed turnaround ones.
    for (const onset of [0.015, 0.01, 0.005]) expect(replay(byId(SQUAT), { driveOnsetFraction: onset, velocitySmoothingMs: 165 }).meanVelocityMps, `onset ${onset}`).toBe(0.87);
    expect(replay(byId(SQUAT), { driveOnsetFraction: 0, velocitySmoothingMs: 165 }).meanVelocityMps).toBe(0.85);
    // and the smoothing is a time window over 33ms samples: 140 and 150 read as 165, 100 as 130
    for (const sm of [140, 150]) expect(replay(byId(SQUAT), { velocitySmoothingMs: sm }).peakVelocityMps, `smoothing ${sm}`).toBe(1.20);
    expect(replay(byId(SQUAT), { velocitySmoothingMs: 100 }).peakVelocityMps).toBe(1.22);
    // and the squat's two numbers reach no other lift's record
    for (const name of ["Front Squat", "Romanian Deadlift", "Bench Press"]) {
      const t = cameraTunablesFor(name, romBucketForExercise(name));
      expect(t.values.velocitySmoothingMs, name).toBe(VELOCITY_SMOOTHING_MS);
      expect(t.values.driveOnsetFraction, name).not.toBe(0);
    }
  });

  it("the RDL's rep 1 is sample-starved: a 0.239s hole holding 61% of the pull, kept in the breakdown and out of the set", () => {
    const m = replay(byId(RDL));
    expect(m.repBreakdown.length).toBe(8);
    const r1 = m.repBreakdown[0].windows!;
    expect(r1.largestGapSeconds).toBe(0.239);
    expect(r1.distanceInLargestGapShare).toBeGreaterThan(SAMPLE_STARVED_MIN_DISTANCE_SHARE);
    expect(r1.largestGapSeconds! / r1.sampleIntervalSeconds!).toBeGreaterThan(SAMPLE_STARVED_GAP_MULTIPLE);
    expect(r1.sampleStarved).toBe(true);
    expect(m.repBreakdown.slice(1).every((r: any) => r.windows.sampleStarved === false)).toBe(true);
    expect(m.repsSampleStarved).toBe(1);
    // the fragment itself: 45.6cm against the sensor's 61.2
    expect(m.repBreakdown[0].romCm).toBe(45.6);
    expect(sensorRomCm(OVR_ROMANIAN_DEADLIFT_2026_11_05.sensor.reps[0].romIn)).toBeCloseTo(61.2, 1);
    // the set's range over the seven whole reps, where the phone (which averaged rep 1 in) printed 61.5
    expect(m.romCm).toBe(63.8);
    expect(byId(RDL).shipped.romCm).toBe(61.5);
    const prov = setRangeOfMotionProvenance(m.repBreakdown.map((r: any) => ({ repNumber: r.repNumber, romCm: r.romCm, windows: r.windows })));
    expect(prov.sampleStarvedRepNumbers).toEqual([1]);
    expect(prov.usedRepNumbers).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(prov.valueCm).toBe(63.8);
    // and the per-rep flags still count every rep
    expect(m.repPeaksFlooredToMean).toBe(1);
  });

  it("the starvation rule needs BOTH the gap and the distance, and never empties a set", () => {
    // On the 2026-10-30 fixture (eight sensor-paired takes) no rep is starved: the bench and the
    // press carry 0.2-0.33s holes that the bar sat still through. The gap alone is not the rule.
    const oct30: any[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-10-30-export.json"), "utf8"));
    let gapsPastTheLine = 0;
    for (const f of oct30) {
      const m = replay(f);
      for (const r of m.repBreakdown) {
        const w = r.windows!;
        if (w.largestGapSeconds! > SAMPLE_STARVED_GAP_MULTIPLE * w.sampleIntervalSeconds!) gapsPastTheLine++;
        expect(w.sampleStarved, `${f.id} rep ${r.repNumber}`).toBe(false);
      }
    }
    expect(gapsPastTheLine).toBeGreaterThan(0);
    // RULE #1: with every rep starved there is nothing to prefer and the set keeps all of them
    const all = [1, 2, 3].map((n) => ({ repNumber: n, romCm: 50 + n, windows: { sampleStarved: true } }));
    expect(repsWithoutStarvation(all)).toBe(all);
    expect(setRangeOfMotionProvenance(all).sampleStarvedRepNumbers).toEqual([]);
    expect(setRangeOfMotionProvenance(all).usedRepNumbers).toEqual([1, 2, 3]);
  });

  it("the RDL reads its own first window step and nothing else moved: +29% at 0.02, +35.5% at the shared 0.04, the peak +35% at either", () => {
    const own = cameraTunablesFor("Romanian Deadlift", "deadlift");
    expect(own.values.driveOnsetFraction).toBe(0.02);
    expect(own.sources.driveOnsetFraction).toBe("fitted");
    expect(own.values.velocitySmoothingMs).toBe(VELOCITY_SMOOTHING_MS);
    expect(Object.keys(FITTED_OVERRIDES["Romanian Deadlift"]).sort()).toEqual(["depthRulerUncertainty", "driveOnsetFraction"]);
    const s = OVR_ROMANIAN_DEADLIFT_2026_11_05.sensor.reported;
    const m = replay(byId(RDL));
    expect(m.meanVelocityMps! / s.meanVelocityMps - 1).toBeCloseTo(0.29, 2);
    expect(m.peakVelocityMps! / s.peakVelocityMps - 1).toBeCloseTo(0.354, 2);
    const shared = replay(byId(RDL), { driveOnsetFraction: DRIVE_ONSET_FRACTION });
    expect(shared.meanVelocityMps! / s.meanVelocityMps - 1).toBeCloseTo(0.355, 2);
    expect(shared.repBreakdown.length).toBe(m.repBreakdown.length);
    expect(shared.romCm).toBe(m.romCm);
    // the whole-window step, 0, is the next (+17.2%); recorded, not taken this round
    expect(replay(byId(RDL), { driveOnsetFraction: 0 }).meanVelocityMps! / s.meanVelocityMps - 1).toBeCloseTo(0.172, 2);
    // the phase durations against the sensor's concentric (its range over its mean), rep by rep:
    // reps 3, 4, 6, 7 and 8 inside 12%, reps 1, 2 and 5 short by a third (rep 1 the hole, reps 2
    // and 5 a 0.19-0.25s dwell at the bottom in front of the phase) -- a trace fault, not a window
    const sensorSeconds = OVR_ROMANIAN_DEADLIFT_2026_11_05.sensor.reps.map((r) => (r.romIn * 0.0254) / r.meanVelocityMps);
    m.repBreakdown.forEach((r: any, i: number) => {
      const ratio = sensorSeconds[i] / r.windows.phaseSeconds;
      if ([0, 1, 4].includes(i)) expect(ratio, `rep ${i + 1}`).toBeGreaterThan(1.3);
      else expect(Math.abs(ratio - 1), `rep ${i + 1}`).toBeLessThan(0.12);
    });
    // and the peak on every whole rep reads 26-54% over the sensor's
    m.repBreakdown.slice(1).forEach((r: any, i: number) => {
      const err = r.peakVelocityMps / OVR_ROMANIAN_DEADLIFT_2026_11_05.sensor.reps[i + 1].peakVelocityMps - 1;
      expect(err, `rep ${i + 2}`).toBeGreaterThan(0.25);
      expect(err, `rep ${i + 2}`).toBeLessThan(0.55);
    });
  });

  it("the RDL's scale is +4.2% over its whole reps, and the shoulder-floor step that would take two points off does not ship", () => {
    const row = ledgerRow("2026-11-05-romanian-deadlift");
    expect(row.reportedRomCm).toBe(63.8);
    expect(row.liveErrorPct).toBeCloseTo(4.22, 1);
    expect(cameraTunablesFor("Romanian Deadlift", "deadlift").sources.biacromialToleranceFraction).not.toBe("fitted");
  });

  it("the jump: the hip's drive peak is the sensor's within 2% and its drive mean is a different window", () => {
    const gt = OVR_BOX_JUMP_HIP_2026_11_05;
    const shipped = byId(JUMP).shipped.jumpBreakdown!;
    expect(shipped.length).toBe(5);
    const avg = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length;
    const peaks = shipped.map((r: any) => r.countermovement.concentricPeakVelocityMps);
    const raws = shipped.map((r: any) => r.countermovement.concentricPeakVelocityRawMps);
    const means = shipped.map((r: any) => r.countermovement.concentricMeanVelocityMps);
    expect(avg(peaks) / gt.sensor.reportedOverOurReps.peakVelocityMps - 1).toBeCloseTo(0.021, 2);
    expect(avg(raws) / gt.sensor.reportedOverOurReps.peakVelocityMps - 1).toBeCloseTo(0.003, 2);
    expect(avg(means) / gt.sensor.reportedOverOurReps.meanVelocityMps - 1).toBeCloseTo(0.28, 1);
    // the net rise the box ruler corrected lands on the sensor's hip range to the centimetre
    expect(byId(JUMP).shipped.jumpHeightCm).toBe(69.7);
    expect(sensorRomCm(gt.sensor.reportedOverOurReps.romIn)).toBeCloseTo(69.3, 1);
    // the set-level fields exist, are the reps' average, and are null without a hip trace
    const f = byId(JUMP);
    const points = f.barPathTrace.map((p: any) => ({ t: p.t, x: p.x / 100, y: p.y / 100, z: 0, confidence: p.c ?? 1 }));
    const noHip = summarizeJumpSet(points, f.heightIn, 35, null, 0.025, [], { usesBox: true, boxHeightCm: 61 });
    expect(noHip).not.toBeNull();
    expect(noHip!.hipDrivePeakVelocityMps).toBeNull();
    expect(noHip!.hipDriveMeanVelocityMps).toBeNull();
  });
});
