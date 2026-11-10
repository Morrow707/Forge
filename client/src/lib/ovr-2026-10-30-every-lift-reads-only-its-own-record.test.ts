import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeTrackedSet, DRIVE_ONSET_FRACTION, VELOCITY_SMOOTHING_MS, MAX_PEAK_TO_MEAN_RATIO } from "./bar-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { reconcileScaleEstimates } from "./pose-tracking";
import { cameraTunablesFor, FITTED_OVERRIDES, FITTED_OVERRIDE_EVIDENCE, VELOCITY_OVERRIDES_REMOVED_2026_11_05 } from "@shared/camera-tunables-by-lift";
import { ledgerRow } from "@shared/accuracy-ledger";
import { reconcileScaleEstimates as blendScales, rejectImplausibleScales } from "./pose-tracking";
import {
  OVR_BENCH_2026_10_30, OVR_BENCH_SET3_2026_10_30,
  OVR_PENDLAY_ROW_2026_10_30, OVR_PENDLAY_ROW_SET2_2026_10_30, OVR_PENDLAY_ROW_SET3_2026_10_30,
  OVR_BARBELL_SHOULDER_PRESS_2026_10_30, OVR_BARBELL_SHOULDER_PRESS_SET2_2026_10_30, OVR_BARBELL_SHOULDER_PRESS_SET3_2026_10_30,
} from "./tracker-ground-truth";

/* THE EIGHT TRACED CAPTURES OF THE 2026-10-30 EXPORTS (set 1 of bench press, Pendlay row and
 * barbell shoulder press on build 701; set 2 of the row and the press on 703; set 3 of all three
 * on 705), replayed through the real summariser with each lift's OWN record, the way the phone
 * runs them.
 *
 * REWRITTEN 2026-11-05. Until then this file pinned the harness to what the phone SHIPPED, and
 * what the phone shipped on every one of these takes was the LOWERING of each rep: the direction
 * rule was inverted from 2026-09-30 to 2026-11-05 (the-concentric-is-the-way-up.test.ts). Rounds
 * four and five fitted the bench's window and smoothing (0.03 / 200) and the press's window
 * (0.08) to make the descents match the sensor's drives; those are gone
 * (VELOCITY_OVERRIDES_REMOVED_2026_11_05) and this file now says what each take reads on its
 * DRIVES, beside the sensor, with the per-lift separation Scott asked for still the spine: a
 * number in one lift's record reaches that lift's traces and nobody else's.
 * Each capture's `shipped` block is the record of what the phone said on its build, kept as that.
 * Fixture: client/src/lib/__fixtures__/ovr-2026-10-30-export.json, trimmed from the admin export. */
type Fixture = {
  id: string; exerciseName: string; heightIn: number | null; loadKg: number | null; loggedReps: number | null;
  trackingLevel: string; trackingDiagnostics: any; barPathTrace: any[];
  shipped: { reps: number; peakVelocityMps: number; meanVelocityMps: number; romCm: number; repPeaks: number[]; repMeans: number[]; repRawPeaks: (number | null)[] };
};
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-10-30-export.json"), "utf8"));
/** The phone projects on IMAGE_VERTICAL_AXIS, the identity; a stored trace is replayed the same way. */
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
const byId = (id: string) => fixtures.find((f) => f.id === id)!;

/** What the corrected rule reads at each lift's own record (which, for velocity, is the shared
 *  copy on all three lifts since 2026-11-05). Range of motion is a magnitude and is the phone's. */
const S = (o: any) => ({ mean: o.sensor.reported.meanVelocityMps as number, peak: o.sensor.reported.peakVelocityMps as number });
const CORRECTED: Record<string, { reps: number; romCm: number; mean: number; peak: number; sensor: { mean: number; peak: number } }> = {
  "2026-10-30 Pendlay Row set 1": { reps: 8, romCm: 51.1, mean: 0.75, peak: 1.33, sensor: S(OVR_PENDLAY_ROW_2026_10_30) },
  "2026-10-30 Barbell Shoulder Press set 1": { reps: 7, romCm: 63.9, mean: 0.85, peak: 1.66, sensor: S(OVR_BARBELL_SHOULDER_PRESS_2026_10_30) },
  // The bench's means moved 0.90 -> 0.86 and 0.97 -> 0.95 on 2026-11-10 (round fourteen, its own
  // driveOnsetFraction 0.03, fitted on the DRIVES); its peaks and ranges did not move.
  "2026-10-30 Bench Press set 1": { reps: 8, romCm: 37.1, mean: 0.86, peak: 1.32, sensor: S(OVR_BENCH_2026_10_30) },
  "2026-10-30 Pendlay Row set 2": { reps: 7, romCm: 78.4, mean: 1.18, peak: 1.91, sensor: S(OVR_PENDLAY_ROW_SET2_2026_10_30) },
  "2026-10-30 Barbell Shoulder Press set 2": { reps: 7, romCm: 56.2, mean: 0.71, peak: 1.29, sensor: S(OVR_BARBELL_SHOULDER_PRESS_SET2_2026_10_30) },
  "2026-10-30 Pendlay Row set 3": { reps: 8, romCm: 67.6, mean: 0.90, peak: 1.62, sensor: S(OVR_PENDLAY_ROW_SET3_2026_10_30) },
  "2026-10-30 Barbell Shoulder Press set 3": { reps: 7, romCm: 62.2, mean: 0.84, peak: 1.59, sensor: S(OVR_BARBELL_SHOULDER_PRESS_SET3_2026_10_30) },
  "2026-10-30 Bench Press set 3": { reps: 7, romCm: 42.0, mean: 0.95, peak: 1.51, sensor: S(OVR_BENCH_SET3_2026_10_30) },
};

describe("the 2026-10-30 export replays through each lift's own record", () => {
  it("holds the eight traced captures", () => {
    expect(fixtures.map((f) => f.id).sort()).toEqual([
      "2026-10-30 Barbell Shoulder Press set 1", "2026-10-30 Barbell Shoulder Press set 2", "2026-10-30 Barbell Shoulder Press set 3",
      "2026-10-30 Bench Press set 1", "2026-10-30 Bench Press set 3",
      "2026-10-30 Pendlay Row set 1", "2026-10-30 Pendlay Row set 2", "2026-10-30 Pendlay Row set 3",
    ]);
  });

  it("range of motion as the phone shipped it on every take; reps and velocities as the corrected rule reads them", () => {
    for (const f of fixtures) {
      const m = replay(f);
      const c = CORRECTED[f.id];
      // A magnitude -- but the set's range is the MEDIAN of its reps' amplitudes, and which phases
      // are the reps changed, so it is pinned to the corrected replay; the row's set 1 (51.1 against
      // the lowerings' 46.9) and set 3 (67.6 against 70.1) are the two that re-median visibly.
      expect(Math.abs((m.romCm ?? NaN) - c.romCm), f.id).toBeLessThanOrEqual(0.5);
      expect(m.repBreakdown.length, f.id).toBe(c.reps);
      expect(Math.abs((m.meanVelocityMps ?? NaN) - c.mean), f.id).toBeLessThanOrEqual(0.015);
      expect(Math.abs((m.peakVelocityMps ?? NaN) - c.peak), f.id).toBeLessThanOrEqual(0.015);
    }
  });

  it("no lift on this export carries a velocity number fitted on the lowering: the three are gone, and the bench's one window since is fitted on the drives", () => {
    expect(VELOCITY_OVERRIDES_REMOVED_2026_11_05["Bench Press"]).toEqual(["driveOnsetFraction", "velocitySmoothingMs", "maxPeakToMeanRatio"]);
    expect(VELOCITY_OVERRIDES_REMOVED_2026_11_05["Barbell Shoulder Press"]).toEqual(["driveOnsetFraction"]);
    // Round fourteen (2026-11-10) gave the bench a window again, fitted on the corrected labels and
    // dated after the fix; the smoothing and the cap stay gone.
    expect(FITTED_OVERRIDES["Bench Press"]).toEqual({ body3DCorrectedUncertainty: 0.25, driveOnsetFraction: 0.03 });
    expect(FITTED_OVERRIDE_EVIDENCE["Bench Press"]).toMatch(/^2026-11-10, round fourteen/);
    expect(FITTED_OVERRIDES["Barbell Shoulder Press"]).toBeUndefined();
    expect(Object.keys(FITTED_OVERRIDES["Pendlay Row"])).toEqual(["depthRulerUncertainty"]);
    for (const [name, bucket] of [["Pendlay Row", "horizontal_press_or_row"], ["Barbell Shoulder Press", "overhead_press"]]) {
      const t = cameraTunablesFor(name, bucket);
      expect(t.values.driveOnsetFraction, name).toBe(DRIVE_ONSET_FRACTION);
      expect(t.values.velocitySmoothingMs, name).toBe(VELOCITY_SMOOTHING_MS);
      expect(t.values.maxPeakToMeanRatio, name).toBe(MAX_PEAK_TO_MEAN_RATIO);
      for (const k of ["driveOnsetFraction", "velocitySmoothingMs", "maxPeakToMeanRatio"] as const) expect(t.sources[k], `${name}.${k}`).not.toBe("fitted");
    }
    // And the squat's own window (0.02) does not reach any of these traces: replaying each with
    // the squat's record gives the SAME numbers as its own only where the two records agree, which
    // for velocity they do not -- the squat's window is a different number -- so what is asserted
    // is the registry: a bench, a row and a press trace replayed under their own records never read
    // a window marked fitted.
    expect(cameraTunablesFor("Back Squat", "squat").sources.driveOnsetFraction).toBe("fitted");
  });

  it("the press reads the sensor on its drives at the SHARED window, which is why its 0.08 is gone", () => {
    // Rounds five and seven fitted 0.08 then 0.12 to lift a lowering that read low. The drives at
    // 0.04 read +3.5%, -2.7%, +2.4% on the three sets; at 0.08 they would read +16%, +3%, +17%. The press's peaks
    // are high on every set (+18%, +9%, +26%) and 4-5 of its 7 reps are capped at 2.0x their mean
    // on sets 1 and 3 -- recorded, not fitted (the smoothing and the cap were both fitted on
    // descents and are the next thing to read on a press).
    const errs = ["set 1", "set 2", "set 3"].map((s) => {
      const id = `2026-10-30 Barbell Shoulder Press ${s}`;
      const m = replay(byId(id));
      return { mean: m.meanVelocityMps! / CORRECTED[id].sensor.mean - 1, peak: m.peakVelocityMps! / CORRECTED[id].sensor.peak - 1, capped: m.repBreakdown.filter((r: any) => r.windows?.peakCapped).length, reps: m.repBreakdown.length };
    });
    for (const e of errs) expect(Math.abs(e.mean)).toBeLessThan(0.05);
    expect(errs.map((e) => e.reps)).toEqual([7, 7, 7]);
    expect(errs[0].capped).toBe(5);
    expect(errs[2].capped).toBe(4);
    for (const e of errs) { expect(e.peak).toBeGreaterThan(0.08); expect(e.peak).toBeLessThan(0.3); }
    // at the removed 0.08 every set reads higher than at 0.04, and two of three past +15%
    const at08 = ["set 1", "set 2", "set 3"].map((s) => {
      const id = `2026-10-30 Barbell Shoulder Press ${s}`;
      return replay(byId(id), { driveOnsetFraction: 0.08 }).meanVelocityMps! / CORRECTED[id].sensor.mean - 1;
    });
    at08.forEach((e, i) => expect(e, `set ${i + 1}`).toBeGreaterThan(errs[i].mean));
    expect(at08.filter((e) => e > 0.15).length).toBe(2);
  });

  it("the bench's drives read +29% / +48% at the shared window and the removed 0.03 / 200 would not have changed that", () => {
    // Set 1: 8 of 8, range of motion 37.1 against 37.1 (the plate was the ruler), the drives' mean
    // +34% and peak +35%. Set 3: 7 of 8 (the slow last press meets the edge-duration rule), range
    // +12%, mean +48%, peak +66%. The bench's whole upward phases (0.33-0.60s) match the sensor's
    // 0.55s concentric; the drive window at 0.04 trims the slow start a bench has and the bench
    // alone reads high by it (+6% at onset 0 on set 1). That is the open bench window, recorded in
    // the notes and NOT fitted on a day the labels flipped (Rule #5).
    const s1 = byId("2026-10-30 Bench Press set 1"), s3 = byId("2026-10-30 Bench Press set 3");
    const m1 = replay(s1), m3 = replay(s3);
    expect(m1.repBreakdown.length).toBe(8);
    expect(Math.abs(m1.romCm! / (OVR_BENCH_2026_10_30.sensor.reported.romIn * 2.54) - 1)).toBeLessThan(0.05);
    expect(m1.meanVelocityMps! / CORRECTED[s1.id].sensor.mean - 1).toBeGreaterThan(0.25);
    expect(m3.repBreakdown.length).toBe(7);
    expect(m3.meanVelocityMps! / CORRECTED[s3.id].sensor.mean - 1).toBeGreaterThan(0.4);
    // the pair round four shipped moves set 1 by four points and leaves it 25% high
    const old1 = replay(s1, { driveOnsetFraction: 0.03, velocitySmoothingMs: 200 });
    expect(old1.meanVelocityMps! / CORRECTED[s1.id].sensor.mean - 1).toBeGreaterThan(0.2);
    // and at the whole travel window set 1 is inside 12% -- it was inside 10% until round twelve
    // (2026-11-09) let the reported window end at a SHORT rest the phase ends inside. That only
    // bites at a 0 window, which is exactly the point: with no speed-based close the window is
    // whatever the phase and the rest rule leave it, which is why the squat's 0 was put back to
    // 0.02. The bench ships at the shared 0.04 and does not move (see the corpus diff in
    // docs/camera-tracking-notes.md, "Round twelve": only Back Squat takes moved).
    expect(Math.abs(replay(s1, { driveOnsetFraction: 0 }).meanVelocityMps! / CORRECTED[s1.id].sensor.mean - 1)).toBeLessThan(0.12);
  });

  it("the row's scale reads its own depth uncertainty: -10.8% as filmed, inside 1% at the row's own record, and the bench's blend does not move", () => {
    const row = ledgerRow("2026-10-30-pendlay-row");
    const required = row.shippedScaleX1000 * (row.sensorRomCm / row.reportedRomCm);
    const blend = (exercise: string, depthU: number) =>
      reconcileScaleEstimates(row.candidates.map((c) => ({
        source: c.source as "body_3d", scale: c.scaleX1000 / 1000,
        uncertaintyFraction: c.source === "depth" ? depthU : row.uncertaintiesAsFilmed[c.source],
      }))).scale! * 1000;
    const shared = cameraTunablesFor("Incline Barbell Bench Press", "horizontal_press_or_row").values.depthRulerUncertainty;
    const own = cameraTunablesFor("Pendlay Row", "horizontal_press_or_row").values.depthRulerUncertainty;
    expect(shared).toBe(0.2);
    expect(own).toBe(0.6);
    expect(blend("Pendlay Row", shared) / required - 1).toBeCloseTo(-0.108, 2);
    expect(Math.abs(blend("Pendlay Row", own) / required - 1)).toBeLessThan(0.01);
    const bench = ledgerRow("2026-10-30-bench-press");
    const benchBlend = reconcileScaleEstimates(bench.candidates.map((c) => ({
      source: c.source as "body_3d", scale: c.scaleX1000 / 1000,
      uncertaintyFraction: c.source === "depth"
        ? cameraTunablesFor("Bench Press", "horizontal_press_or_row").values.depthRulerUncertainty
        : bench.uncertaintiesAsFilmed[c.source],
    }))).scale! * 1000;
    expect(Math.abs(benchBlend / bench.shippedScaleX1000 - 1)).toBeLessThan(0.0001);
    expect(OVR_PENDLAY_ROW_2026_10_30.sensor.reported.romIn * 2.54).toBeCloseTo(row.sensorRomCm, 1);
  });

  it("the row's second set: the grip yardstick that convicted two of three rulers stands down, and the row's record lands the scale", () => {
    // Round five, 2026-10-30, build 703. The phone shipped this take 53% high (78.4 against the
    // sensor's 20.2in) because rejectImplausibleScales threw out the 3D bone and the depth ruler
    // on a 52.7-unit grip read -- narrower than the 69.8-unit shoulder span, which no barbell
    // grip is -- and the shoulder span shipped alone. A yardstick that would convict a strict
    // majority of the rulers now abstains, and the two it would have rejected collapse to a
    // witness within 3% of the scale the sensor requires. Driven off the fixture's OWN candidates
    // and grip read, not retyped.
    const f = byId("2026-10-30 Pendlay Row set 2");
    const cal = f.trackingDiagnostics.calibration;
    const row = ledgerRow("2026-10-30-pendlay-row-set-2");
    expect(cal.scalesRejectedAsImplausible.map((r: any) => r.source)).toEqual(["body_3d", "depth"]);
    expect(cal.shoulderRuler.gripToShoulderSpanRatio).toBeLessThan(1);
    const t = cameraTunablesFor("Pendlay Row", "horizontal_press_or_row").values;
    const candidates = cal.scaleCandidates.map((c: any) => ({
      source: c.source.split(":")[0],
      scale: c.scale,
      uncertaintyFraction: c.source === "depth" ? t.depthRulerUncertainty
        : c.source === "shoulder_width" ? cal.shoulderRuler.uncertaintyFraction
        : t.body3DCorrectedUncertainty,
    }));
    const { kept, rejected, abstained } = rejectImplausibleScales(candidates, null, f.heightIn, cal.gripWidthPx);
    expect(rejected).toEqual([]);
    expect(abstained.map((a) => a.yardstick)).toEqual(["grip"]);
    expect(abstained[0].wouldHaveRejected.map((r) => r.source)).toEqual(["body_3d", "depth"]);
    const required = row.shippedScaleX1000 / 1000 * (row.sensorRomCm / row.reportedRomCm);
    const landed = blendScales(kept, t.maxScaleAgreementTolerance).scale!;
    expect(Math.abs(landed / required - 1)).toBeLessThan(0.03);
    expect(blendScales(kept.filter((k) => k.source === "shoulder_width"), t.maxScaleAgreementTolerance).scale! * 1000)
      .toBeCloseTo(row.shippedScaleX1000, 9);
    expect(OVR_PENDLAY_ROW_SET2_2026_10_30.sensor.reported.romIn * 2.54).toBeCloseTo(row.sensorRomCm, 1);
  });

  it("set 3 of the row: the first row whose plate was the ruler, boxed 0.964 of expected, and the take still reads +23% -- recorded, not fitted", () => {
    const f = byId("2026-10-30 Pendlay Row set 3");
    const cal = f.trackingDiagnostics.calibration;
    const row = ledgerRow("2026-10-30-pendlay-row-set-3");
    expect(cal.objectGate.plateBoxToExpectedRatio).toBeCloseTo(0.964, 3);
    expect(cal.scaleBlend.plateSteppedOut).toBe(false);
    expect(cal.scaleCandidates.find((c: any) => c.source === "plate").weightPct).toBeCloseTo(85.8, 1);
    // The ledger replays the row's scale as filmed and reads +23.2% against the sensor; the plate
    // is +23.8% of the scale the sensor requires, the bone -3.3%, the shoulder +46.2%. Round seven's
    // confidence floor (six plate frames at 0.44) de-weights that plate and the live replay reads
    // +20.79%. The row's third paired take and its third different answer (-10.8%, +52.8% under a
    // defect, +23.2%): Rule #5 says the spread is the finding, so no further scale number moves.
    expect(row.liveErrorPct).toBeCloseTo(20.79, 1);
    const required = row.shippedScaleX1000 * (row.sensorRomCm / row.reportedRomCm);
    const plate = row.candidates.find((c) => c.source === "plate")!.scaleX1000;
    expect(plate / required - 1).toBeCloseTo(0.238, 2);
    expect(OVR_PENDLAY_ROW_SET3_2026_10_30.sensor.reported.romIn * 2.54).toBeCloseTo(row.sensorRomCm, 1);
    // 8 of 8 either way round; the pulls read +10% on the mean and +17% on the peak at the shared
    // window -- a lone-hand trace (290 of 543 points carried) on a scale 23% high
    const m = replay(f);
    expect(m.repBreakdown.length).toBe(8);
    expect(m.meanVelocityMps! / CORRECTED[f.id].sensor.mean - 1).toBeGreaterThan(0.05);
    expect(m.meanVelocityMps! / CORRECTED[f.id].sensor.mean - 1).toBeLessThan(0.2);
  });

  it("set 3 of the press: the third press inside 3.2% on range of motion, 7 of 8 because the FIRST press is merged with the clean", () => {
    const f = byId("2026-10-30 Barbell Shoulder Press set 3");
    const row = ledgerRow("2026-10-30-barbell-shoulder-press-set-3");
    expect(row.liveErrorPct).toBeCloseTo(3.1, 1);
    expect(row.heightRulerVotedAsFilmed).toBe(true);
    const m = replay(f);
    expect(m.repBreakdown.length).toBe(7);
    expect(f.loggedReps).toBe(8);
    // Rounds four and five read the missing press as the eighth, folded into the re-rack; on the
    // drives it is the first: one upward phase from the floor to overhead (the clean, a pause at
    // the shoulders, the press) with no reversal between, 2.6m long. The first counted drive
    // starts after it.
    const firstRep = m.repBreakdown[0];
    const beforeIt = f.barPathTrace.filter((p: any) => p.t < firstRep.startT).map((p: any) => p.y);
    expect(Math.max(...beforeIt) - Math.min(...beforeIt)).toBeGreaterThan(200);
    expect(firstRep.startT).toBeGreaterThan(5_000);
  });

  it("set 3 of the bench: the plate was the ruler again (0.849 of expected) and the take reads +5.5%; the phone's eight were lowerings, the drives count seven", () => {
    const f = byId("2026-10-30 Bench Press set 3");
    const row = ledgerRow("2026-10-30-bench-press-set-3");
    expect(f.trackingDiagnostics.calibration.objectGate.plateBoxToExpectedRatio).toBeCloseTo(0.849, 3);
    // +5.5% as filmed; +3.58% through the live constants after round six's MAD-to-sigma correction,
    // and +3.91% since round fourteen's bench 3D-pose uncertainty 0.25 (2026-11-10), which moves the
    // two plate-led bench rows 0.1-0.3 points the wrong way and the two without a plate 0.4-1.6 the right way
    expect(row.liveErrorPct).toBeCloseTo(3.91, 1);
    expect(f.shipped.reps).toBe(8);
    const m = replay(f);
    expect(m.repBreakdown.length).toBe(7);
    // the dropped press is the slow last one: the trace after the seventh drive still travels a
    // bench's range of motion before the re-rack
    const lastEnd = m.repBreakdown[m.repBreakdown.length - 1].endT;
    const after = f.barPathTrace.filter((p: any) => p.t > lastEnd && p.t < lastEnd + 2000).map((p: any) => p.y);
    expect(Math.max(...after) - Math.min(...after)).toBeGreaterThan(30);
    expect(OVR_BENCH_SET3_2026_10_30.sensor.reported.romIn * 2.54).toBeCloseTo(row.sensorRomCm, 1);
  });
});
