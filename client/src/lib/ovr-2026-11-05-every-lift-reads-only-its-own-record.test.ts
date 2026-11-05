import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  summarizeTrackedSet, repsWithoutStarvation, setRangeOfMotionProvenance,
  SAMPLE_STARVED_GAP_MULTIPLE, SAMPLE_STARVED_MIN_DISTANCE_SHARE, VELOCITY_SMOOTHING_MS, DRIVE_ONSET_FRACTION,
} from "./bar-tracking";
import { summarizeJumpSet } from "./jump-tracking";
import { reconcileScaleEstimates, HEIGHT_RULER_UNCERTAINTY } from "./pose-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { cameraTunablesFor, FITTED_OVERRIDES } from "@shared/camera-tunables-by-lift";
import { ledgerRow } from "@shared/accuracy-ledger";
import {
  OVR_BACK_SQUAT_2026_11_05, OVR_ROMANIAN_DEADLIFT_2026_11_05, OVR_BOX_JUMP_HIP_2026_11_05,
  OVR_BACK_SQUAT_SET2_2026_11_05, OVR_ROMANIAN_DEADLIFT_SET2_2026_11_05, OVR_BOX_JUMP_HIP_SET2_2026_11_05,
} from "./tracker-ground-truth";

/* THE 2026-11-05 SESSION, round nine: back squat, Romanian deadlift and box jump on build 710,
 * the first takes beside the OVR with the direction rule corrected. Scott: "I want at least one
 * fix per lift ... fix every error you find even if it's .001 accuracy."
 *
 * The squat: its own window goes to 0 (the whole travel window) and its own smoothing to 130.
 * The RDL: its own first window step (0.04 -> 0.02) and the SAMPLE-STARVATION rule, written for
 * its rep 1 -- a 0.239s hole inside the drive with 30cm of the pull in it, reported as a 45.6cm
 * rep against the sensor's 61.2. The jump: the hip's drive peak and mean are set-level numbers
 * now, so the sensor's own quantity has something to sit beside.
 *
 * ROUND TEN, the same day, on set 2 of all three (build 712): the RDL's eighth rep (deleted as a
 * re-rack behind a 2.2s stand at lockout -- the rest-at-top rule, restArrivalAfterPeak, and with
 * it the discovery that set 1's "rep 1" was the set-up and ITS eighth had gone the same way),
 * the RDL's window to 0, the squat's one-point scale step (0.11 -> 0.12), and the jump's mean
 * over the sensor's window (dip bottom to the hip's apex, JumpCountermovement.riseToApex*).
 * Fixture: client/src/lib/__fixtures__/ovr-2026-11-05-export.json, trimmed from the admin export;
 * the set-2 jump carries its bodyWitnessTrace. */
type Fixture = {
  id: string; exerciseName: string; heightIn: number | null; loadKg: number | null; loggedReps: number | null;
  trackingLevel: string; boxHeightIn: number | null; trackingDiagnostics: any; barPathTrace: any[]; bodyWitnessTrace?: { points: any[] };
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
const SQUAT2 = "2026-11-05 Back Squat set 2", RDL2 = "2026-11-05 Romanian Deadlift set 2", JUMP2 = "2026-11-05 Box Jump set 2";
const sensorRomCm = (romIn: number) => romIn * 2.54;

describe("the 2026-11-05 export replays through each lift's own record", () => {
  it("holds the six captures: set 1 of each on build 710, set 2 of each on 712", () => {
    expect(fixtures.map((f) => f.id).sort()).toEqual([JUMP, SQUAT, RDL, JUMP2, SQUAT2, RDL2].sort());
    for (const id of [SQUAT2, RDL2, JUMP2]) expect(byId(id).trackingDiagnostics.calibration.liftRecord, id).toBeTruthy();
    expect(byId(SQUAT2).trackingDiagnostics.calibration.liftRecord.values.driveOnsetFraction).toBe(0);
    expect(byId(SQUAT2).trackingDiagnostics.calibration.liftRecord.values.velocitySmoothingMs).toBe(130);
    expect(byId(RDL2).trackingDiagnostics.calibration.liftRecord.values.driveOnsetFraction).toBe(0.02);
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
    // and the squat's two numbers reach no other lift's record (the RDL's own 0 is its own, held
    // on its own record and its own evidence)
    for (const name of ["Front Squat", "Bench Press", "Conventional Deadlift"]) {
      const t = cameraTunablesFor(name, romBucketForExercise(name));
      expect(t.values.velocitySmoothingMs, name).toBe(VELOCITY_SMOOTHING_MS);
      expect(t.values.driveOnsetFraction, name).not.toBe(0);
    }
    expect(cameraTunablesFor("Romanian Deadlift", "deadlift").values.velocitySmoothingMs).toBe(VELOCITY_SMOOTHING_MS);
  });

  it("the RDL's set-up phase is sample-starved and the athlete's count trims it; the eight pulls are reps 1-8 (round ten)", () => {
    // Round nine read this take's first upward phase after the pickup -- 48.6cm with a 0.239s
    // hole holding 61% of it -- as a starved rep 1 and the set as 8 of 8. It sits 2.3s before the
    // first pull where the pulls sit 1.0s apart: it is the set-up, and the real eighth pull had
    // been deleted as a re-rack behind the 1.7s stand at lockout that followed it. The rest-at-top
    // rule returns the eighth; the count then has nine, and a sample-starved edge phase is the
    // least rep-like thing in the set, so the trim takes it first.
    const m = replay(byId(RDL));
    expect(m.repBreakdown.length).toBe(8);
    expect(m.repsSampleStarved).toBe(0);
    expect(m.repBreakdown.every((r: any) => r.windows.sampleStarved === false)).toBe(true);
    // the eighth pull came to rest 1.7s before the segmenter's phase ended (the stand at lockout)
    expect(m.repBreakdown[7].windows!.heldAtTopSeconds).toBeCloseTo(1.739, 2);
    expect(m.repBreakdown.slice(0, 7).every((r: any) => r.windows.heldAtTopSeconds === 0)).toBe(true);
    // rep 1 is the first PULL (64.5cm against the sensor's 61.2), not the 45.6cm set-up
    expect(m.repBreakdown[0].romCm).toBe(64.5);
    expect(sensorRomCm(OVR_ROMANIAN_DEADLIFT_2026_11_05.sensor.reps[0].romIn)).toBeCloseTo(61.2, 1);
    // the set's range over the eight pulls (the phone printed 61.5 with the set-up averaged in
    // and the eighth gone; round nine's 63.8 was over the seven it had)
    expect(m.romCm).toBe(63.4);
    expect(byId(RDL).shipped.romCm).toBe(61.5);
    const prov = setRangeOfMotionProvenance(m.repBreakdown.map((r: any) => ({ repNumber: r.repNumber, romCm: r.romCm, windows: r.windows })));
    expect(prov.sampleStarvedRepNumbers).toEqual([]);
    expect(prov.usedRepNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // and with no count logged the set-up is reported as a ninth rep, starved and out of the set's
    // numbers -- over-counting is the lesser failure (Rule #1), and the count is what fixes it
    const uncounted = replay({ ...byId(RDL), loggedReps: null });
    expect(uncounted.repBreakdown.length).toBe(9);
    expect(uncounted.repsSampleStarved).toBe(1);
    expect(uncounted.repBreakdown[0].romCm).toBe(45.6);
    expect(uncounted.romCm).toBe(63.4);
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

  it("the RDL reads its own whole window (round ten) and nothing else moved: +16.1% at 0, +25.8% at 0.02, +33.3% at the shared 0.04", () => {
    const own = cameraTunablesFor("Romanian Deadlift", "deadlift");
    expect(own.values.driveOnsetFraction).toBe(0);
    expect(own.sources.driveOnsetFraction).toBe("fitted");
    expect(own.values.velocitySmoothingMs).toBe(VELOCITY_SMOOTHING_MS);
    expect(Object.keys(FITTED_OVERRIDES["Romanian Deadlift"]).sort()).toEqual(["depthRulerUncertainty", "driveOnsetFraction"]);
    const s = OVR_ROMANIAN_DEADLIFT_2026_11_05.sensor.reported;
    const m = replay(byId(RDL));
    expect(m.meanVelocityMps! / s.meanVelocityMps - 1).toBeCloseTo(0.161, 2);
    expect(m.peakVelocityMps! / s.peakVelocityMps - 1).toBeCloseTo(0.298, 2);
    const step = replay(byId(RDL), { driveOnsetFraction: 0.02 });
    expect(step.meanVelocityMps! / s.meanVelocityMps - 1).toBeCloseTo(0.258, 2);
    const shared = replay(byId(RDL), { driveOnsetFraction: DRIVE_ONSET_FRACTION });
    expect(shared.meanVelocityMps! / s.meanVelocityMps - 1).toBeCloseTo(0.333, 2);
    for (const other of [step, shared]) {
      expect(other.repBreakdown.length).toBe(m.repBreakdown.length);
      expect(other.romCm).toBe(m.romCm);
    }
    // the phase durations against the sensor's concentric (its range over its mean), pull for
    // pull: five inside 15%, three short by a fifth to a third (a 0.19-0.25s dwell at the bottom
    // in front of each) -- a trace fault, not a window
    const sensorSeconds = OVR_ROMANIAN_DEADLIFT_2026_11_05.sensor.reps.map((r) => (r.romIn * 0.0254) / r.meanVelocityMps);
    const ratios = m.repBreakdown.map((r: any, i: number) => sensorSeconds[i] / r.windows.phaseSeconds);
    expect(ratios.filter((x) => Math.abs(x - 1) < 0.15).length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...ratios)).toBeLessThan(1.4);
    // and the peak on every pull reads 20-50% over the sensor's
    m.repBreakdown.forEach((r: any, i: number) => {
      const err = r.peakVelocityMps / OVR_ROMANIAN_DEADLIFT_2026_11_05.sensor.reps[i].peakVelocityMps - 1;
      expect(err, `rep ${i + 1}`).toBeGreaterThan(0.15);
      expect(err, `rep ${i + 1}`).toBeLessThan(0.55);
    });
  });

  it("the RDL's scale is +3.6% over its eight pulls, and the shoulder-floor step that would take two points off does not ship", () => {
    const row = ledgerRow("2026-11-05-romanian-deadlift");
    expect(row.reportedRomCm).toBe(63.4);
    expect(row.liveErrorPct).toBeCloseTo(3.58, 1);
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

  /* ROUND TEN: SET 2 OF EACH LIFT ON BUILD 712. */

  it("squat set 2: -2.7% / +2.4% / +1.6% as filmed, rep for rep; the one-point scale step reads it -1.7%", () => {
    const f = byId(SQUAT2);
    const s = OVR_BACK_SQUAT_SET2_2026_11_05.sensor;
    const m = replay(f);
    expect(m.repBreakdown.length).toBe(5);
    expect(m.romCm).toBe(71.9);
    expect(m.meanVelocityMps).toBe(0.84);
    expect(m.peakVelocityMps).toBe(1.26);
    expect(m.romCm! / sensorRomCm(s.reported.romIn) - 1).toBeCloseTo(-0.027, 2);
    expect(m.meanVelocityMps! / s.reported.meanVelocityMps - 1).toBeCloseTo(0.024, 2);
    expect(m.peakVelocityMps! / s.reported.peakVelocityMps - 1).toBeCloseTo(0.016, 2);
    m.repBreakdown.forEach((r: any, i: number) => {
      expect(Math.abs(r.meanVelocityMps - s.reps[i].meanVelocityMps), `rep ${i + 1} mean`).toBeLessThan(0.035);
      // the drive window IS the phase, and on four of five reps it is one 33ms sample short of
      // the sensor's concentric (its range over its mean): the whole of the mean's +2.4%
      expect(r.windows.driveSeconds, `rep ${i + 1}`).toBe(r.windows.phaseSeconds);
      const sensorSeconds = (s.reps[i].romIn * 0.0254) / s.reps[i].meanVelocityMps;
      expect(sensorSeconds - r.windows.driveSeconds, `rep ${i + 1} window`).toBeGreaterThanOrEqual(-0.001);
      expect(sensorSeconds - r.windows.driveSeconds, `rep ${i + 1} window`).toBeLessThan(0.05);
      expect(r.windows.heldAtTopSeconds, `rep ${i + 1}`).toBe(0);
      // the drive distance on the smoothed series reads the sensor's rep within 2% -- measured,
      // and NOT the reported range: see the romCm comment in bar-tracking.ts for why
      expect(Math.abs(r.windows.driveRomCm / sensorRomCm(s.reps[i].romIn) - 1), `rep ${i + 1} drive distance`).toBeLessThan(0.02);
    });
    // the scale step: 0.11 -> 0.12 on the squat's record, worth about one point on this take, the
    // same step round two took, and it reaches no other lift
    expect(cameraTunablesFor("Back Squat", "squat").values.heightRulerUncertainty).toBe(0.12);
    expect(cameraTunablesFor("Front Squat", "squat").values.heightRulerUncertainty).toBe(HEIGHT_RULER_UNCERTAINTY);
    const voters = f.trackingDiagnostics.calibration.scaleBlend.voters;
    const at = (u: number) => reconcileScaleEstimates(voters.map((c: any) => ({ source: c.source, scale: c.scale, uncertaintyFraction: c.source === "height" ? u : c.uncertaintyFraction }))).scale!;
    expect(at(0.11)).toBeCloseTo(f.trackingDiagnostics.calibration.scaleFactor, 6);
    const required = f.trackingDiagnostics.calibration.scaleFactor * (sensorRomCm(s.reported.romIn) / m.romCm!);
    expect(at(0.12) / required - 1).toBeCloseTo(-0.017, 2);
    expect(at(0.13) / required - 1).toBeCloseTo(-0.006, 2);
  });

  it("RDL set 2: 8 of 8 under the rest-at-top rule, the eighth pull measured to its rest in front of a 2.2s stand", () => {
    const f = byId(RDL2);
    const s = OVR_ROMANIAN_DEADLIFT_SET2_2026_11_05.sensor;
    expect(f.shipped.reps).toBe(7);
    const m = replay(f);
    expect(m.repBreakdown.length).toBe(8);
    const r8 = m.repBreakdown[7];
    expect(r8.windows!.heldAtTopSeconds).toBeCloseTo(2.226, 2);
    expect(m.repBreakdown.slice(0, 7).every((r: any) => r.windows.heldAtTopSeconds === 0)).toBe(true);
    // the eighth reads 57.7cm against the sensor's 62.7: the rest arrives where the bar creeps
    // under four margins a second, 2cm short of full lockout on this take -- the rule's cost
    expect(r8.romCm).toBe(57.7);
    expect(r8.romCm / sensorRomCm(s.reps[7].romIn) - 1).toBeCloseTo(-0.08, 2);
    expect(r8.windows!.phaseSeconds).toBeCloseTo(0.592, 2);
    // set numbers at the RDL's record (window 0): range +3.6%, mean +15.8%, peak +19.0%
    expect(m.romCm).toBe(66.6);
    expect(m.romCm! / sensorRomCm(s.reported.romIn) - 1).toBeCloseTo(0.036, 2);
    expect(m.meanVelocityMps! / s.reported.meanVelocityMps - 1).toBeCloseTo(0.158, 2);
    expect(m.peakVelocityMps! / s.reported.peakVelocityMps - 1).toBeCloseTo(0.19, 2);
    expect(replay(f, { driveOnsetFraction: 0.02 }).meanVelocityMps! / s.reported.meanVelocityMps - 1).toBeCloseTo(0.2, 2);
    // the set-up phase (89cm from the floor, 0.9s of travel, a 1.6s stand) is cut at its rest
    // too and the athlete's count trims it; with no count it is a ninth rep, not the eighth lost
    expect(replay({ ...f, loggedReps: null }).repBreakdown.length).toBe(9);
    expect(replay({ ...f, loggedReps: null }).repBreakdown[0].romCm).toBeGreaterThan(80);
    // the rule is shared and inert where no rep came to rest: nothing on the two squat takes held
    for (const id of [SQUAT, SQUAT2]) expect(replay(byId(id)).repBreakdown.every((r: any) => r.windows.heldAtTopSeconds === 0), id).toBe(true);
    // and the ledger row for this take replays to the phone's scale
    expect(ledgerRow("2026-11-05-romanian-deadlift-set-2").reportedRomCm).toBe(66.6);
  });

  it("jump set 2: the sensor's mean is the rise from the dip bottom to the hip's apex, read off the hip trace within a sample of the sensor's time", () => {
    const f = byId(JUMP2);
    const gt = OVR_BOX_JUMP_HIP_SET2_2026_11_05;
    const shipped = f.shipped.jumpBreakdown!;
    expect(shipped.length).toBe(5);
    const avg = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length;
    // what 712 shipped: the drive peak +2.6% smoothed / +5.5% raw, the drive-to-takeoff mean +24%
    expect(avg(shipped.map((r: any) => r.countermovement.concentricPeakVelocityMps)) / gt.sensor.reportedOverOurReps.peakVelocityMps - 1).toBeCloseTo(0.026, 2);
    expect(avg(shipped.map((r: any) => r.countermovement.concentricPeakVelocityRawMps)) / gt.sensor.reportedOverOurReps.peakVelocityMps - 1).toBeCloseTo(0.055, 2);
    expect(f.shipped.meanVelocityMps! / gt.sensor.reportedOverOurReps.meanVelocityMps - 1).toBeCloseTo(0.245, 2);
    expect(shipped.every((r: any) => r.countermovement.riseToApexMeanVelocityMps == null)).toBe(true);
    // the replay through the stored hip trace (bodyWitnessTrace: hip px on the trace's clock,
    // every ~51ms -- sparser than the phone's own hip series, so its drive numbers differ from
    // the shipped ones and the APEX window is what this case is about)
    const sc = f.trackingDiagnostics.calibration.scaleFactor;
    const points = f.barPathTrace.map((p: any) => ({ t: p.t, x: p.x / 100, y: p.y / 100, z: 0, confidence: p.c ?? 1 }));
    const hip = f.bodyWitnessTrace!.points.filter((p: any) => p.hp != null).map((p: any) => ({ t: p.t, x: 0, y: p.hp * sc, z: 0, confidence: p.c ?? 1 }));
    const m = summarizeJumpSet(points, f.heightIn, 35, null, 0.025, [], { usesBox: true, boxHeightCm: 61, hipTrace: hip })!;
    expect(m.repBreakdown.length).toBe(5);
    expect(m.boxRiseVerdict?.applied).toBe(true);
    m.repBreakdown.forEach((r: any, i: number) => {
      const c = r.countermovement!;
      const sensorSeconds = (gt.sensor.reps[i].romIn * 0.0254) / gt.sensor.reps[i].meanVelocityMps;
      expect(Math.abs(c.riseToApexSeconds - sensorSeconds), `rep ${i + 1} apex time`).toBeLessThan(0.06);
      expect(c.apexT, `rep ${i + 1}`).toBeGreaterThan(r.takeoffT);
      // the rise: drive share at the floor's scale, flight share divided by the box ratio
      expect(c.uncorrectedRiseToApexCm, `rep ${i + 1}`).toBeGreaterThan(c.riseToApexCm);
      expect(Math.abs(c.riseToApexCm / sensorRomCm(gt.sensor.reps[i].romIn) - 1), `rep ${i + 1} apex rise`).toBeLessThan(0.06);
    });
    // the set: +3.1% against the sensor's mean where the drive-to-takeoff mean reads +24%
    expect(m.hipRiseToApexMeanVelocityMps! / gt.sensor.reportedOverOurReps.meanVelocityMps - 1).toBeCloseTo(0.031, 2);
    expect(m.hipDriveMeanVelocityMps! / gt.sensor.reportedOverOurReps.meanVelocityMps - 1).toBeGreaterThan(0.08);
    // and with no hip trace there is no apex and the fields are null, as before
    const noHip = summarizeJumpSet(points, f.heightIn, 35, null, 0.025, [], { usesBox: true, boxHeightCm: 61 })!;
    expect(noHip.hipRiseToApexMeanVelocityMps).toBeNull();
  });
});
