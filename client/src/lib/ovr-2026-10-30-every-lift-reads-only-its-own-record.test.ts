import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeTrackedSet, DRIVE_ONSET_FRACTION, VELOCITY_SMOOTHING_MS, MAX_PEAK_TO_MEAN_RATIO } from "./bar-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { reconcileScaleEstimates } from "./pose-tracking";
import { cameraTunablesFor, FITTED_OVERRIDES } from "@shared/camera-tunables-by-lift";
import { ledgerRow } from "@shared/accuracy-ledger";
import { reconcileScaleEstimates as blendScales, rejectImplausibleScales } from "./pose-tracking";
import {
  OVR_BENCH_2026_10_30, OVR_PENDLAY_ROW_2026_10_30, OVR_PENDLAY_ROW_SET2_2026_10_30,
  OVR_BARBELL_SHOULDER_PRESS_2026_10_30, OVR_BARBELL_SHOULDER_PRESS_SET2_2026_10_30,
} from "./tracker-ground-truth";

/* THE FIVE TRACED CAPTURES OF THE 2026-10-30 EXPORTS (set 1 of bench press, Pendlay row and
 * barbell shoulder press on build 701; set 2 of the row and the press on 703), replayed through
 * the real summariser with each lift's OWN record, the way the phone runs them. Round four's two
 * per-lift numbers are pinned here in the direction that matters: the Bench Press's own drive
 * onset (0.03) and smoothing (200) reach the bench trace and
 * NOT the row's or the press's, which replay to the peaks the phone shipped to the hundredth; and
 * the Pendlay Row's own depth uncertainty (0.6) reaches the row's scale blend and not the
 * bench's. Scott, 2026-10-29: "any changes you're making to squat should not effect rdl should
 * not effect the jump and vice versa" -- the same sentence, three lifts over.
 * Fixture: client/src/lib/__fixtures__/ovr-2026-10-30-export.json, trimmed from the admin export. */
type Fixture = {
  id: string; exerciseName: string; heightIn: number | null; loadKg: number | null; loggedReps: number | null;
  trackingLevel: string; trackingDiagnostics: any; barPathTrace: any[];
  shipped: { reps: number; peakVelocityMps: number; meanVelocityMps: number; romCm: number; repPeaks: number[]; repMeans: number[]; repRawPeaks: (number | null)[] };
};
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-10-30-export.json"), "utf8"));
const STORED = { x: 0, y: 1 };
const VERTICAL = { x: 0, y: -1 };

/** The harness's own replay, with the record resolved the way the dialog resolves it and an
 *  optional patch for the counterfactual cases below. */
function replay(f: Fixture, patch: Partial<Record<string, number>> = {}) {
  const points = f.barPathTrace.map((p: any) => ({ t: p.t, x: p.x / 100, y: p.y / 100, z: 0, confidence: p.c ?? 1 }));
  const cal = f.trackingDiagnostics?.calibration ?? null;
  const romKind = romBucketForExercise(f.exerciseName);
  const tune = cameraTunablesFor(f.exerciseName, romKind);
  Object.assign(tune.values, patch);
  const m = summarizeTrackedSet(points, f.loadKg ?? undefined, f.heightIn ?? undefined, firstMoveForExercise(f.exerciseName), [],
    cal?.positionScaleCorrection ?? 1, false, romKind, cal?.movementAxis ? STORED : VERTICAL, f.loggedReps ?? null, tune);
  if (!m) throw new Error(`${f.id}: no metrics`);
  return m;
}
/* The three numbers build 701 and 703 ran shared and that this lift now carries its own: reset
 * together, because the reproduction cases below are about the TRACE and a record the phone
 * never had makes them about the record instead. The bench's maxPeakToMeanRatio joined this
 * list on 2026-10-31 (round seven) and its absence was a real failure, not a threshold: set 1's
 * peak replayed 0.08 away from what shipped. */
const SHARED_AS_THE_PHONE_RAN = {
  driveOnsetFraction: DRIVE_ONSET_FRACTION,
  velocitySmoothingMs: VELOCITY_SMOOTHING_MS,
  maxPeakToMeanRatio: MAX_PEAK_TO_MEAN_RATIO,
};
const byName = (n: string) => fixtures.find((f) => f.exerciseName === n)!;
const byId = (id: string) => fixtures.find((f) => f.id === id)!;

describe("the 2026-10-30 export replays through each lift's own record", () => {
  it("holds the five traced captures", () => {
    expect(fixtures.map((f) => f.id).sort()).toEqual([
      "2026-10-30 Barbell Shoulder Press set 1", "2026-10-30 Barbell Shoulder Press set 2",
      "2026-10-30 Bench Press set 1", "2026-10-30 Pendlay Row set 1", "2026-10-30 Pendlay Row set 2",
    ]);
  });

  it("the harness reproduces the shipped reps and range of motion on every take, AT THE SHARED numbers the phone ran", () => {
    // Build 701 ran every lift on the shared window and smoothing; the bench's own numbers landed
    // after this export. So reproduction is asserted with the two bench fields set back to what
    // the phone had, which is also what proves the counterfactual below is the record and not the
    // trace. The row's rep 7 is the one place the harness and the live path disagree (the phone
    // floored its peak to a 1.38 mean over a 0.13s concentric; the harness finds a 0.44s rep), so
    // the row's mean is held to a tenth rather than the 0.03 the 10-29 takes allow.
    for (const f of fixtures) {
      const m = replay(f, SHARED_AS_THE_PHONE_RAN);
      expect(m.repBreakdown.length, f.id).toBe(f.shipped.reps);
      expect(Math.abs((m.romCm ?? NaN) - f.shipped.romCm), f.id).toBeLessThanOrEqual(0.5);
      // The row's set 2 is the take whose bar points were half a lone hand carried (280 of 579), and
      // the live path's segmentation differs from the harness's by up to 0.06 on the set peak
      // (2.44 against 2.50) and 0.09 on the mean; set 1 is inside 0.011 and 0.08. Both are the
      // SAME trace fault the row's notes name, not a number in any record.
      expect(Math.abs((m.peakVelocityMps ?? NaN) - f.shipped.peakVelocityMps), f.id)
        .toBeLessThanOrEqual(f.exerciseName === "Pendlay Row" ? 0.07 : 0.011);
      // THE SHIPPED MEAN IS NO LONGER REPRODUCIBLE, AND THAT IS THE POINT (2026-10-31).
      // Every mean in this export was computed by summing the WHOLE PHASE's distance over the
      // DRIVE window's time -- the pairing `romM`'s own comment in bar-tracking.ts names as the
      // bug, fixed at the rep in 2026-10-06 and left in the set-level aggregation because
      // `driveRomM` was not on the record to sum. So the rule here is the `shippedUnderDefect`
      // one: the corrected mean is AT OR BELOW what the phone shipped on every take and never
      // above it, because a drive window is a subset of its phase and so its distance cannot be
      // the larger. Reps, range of motion and peaks still reproduce exactly, which is what says
      // the harness is sound and only this one aggregation moved. Measured ratios, shipped ->
      // corrected: row 0.909 / 0.907, press 0.986 / 0.944, bench 0.960.
      expect(m.meanVelocityMps!, `${f.id} corrected mean is never above the shipped one`)
        .toBeLessThanOrEqual(f.shipped.meanVelocityMps + 1e-9);
      expect(m.meanVelocityMps! / f.shipped.meanVelocityMps, f.id).toBeGreaterThan(0.85);
    }
  });

  it("the row and the press replay to the shipped peaks exactly: the bench's own numbers never reach them", () => {
    expect(Object.keys(FITTED_OVERRIDES["Bench Press"]).sort()).toEqual(["driveOnsetFraction", "maxPeakToMeanRatio", "velocitySmoothingMs"]);
    // The row carries no window or smoothing number of its own; the press carries its own WINDOW
    // since round five (0.08) and the shared smoothing, so its shipped peaks are replayed with the
    // window set back to the shared 0.04 the phone ran.
    // NEITHER THE ROW NOR THE PRESS CARRIES THE BENCH'S PEAK CAP: round seven's 1.6 is scoped to
    // the one identity it was measured on, so both still state the shared 2.0.
    const rowT = cameraTunablesFor("Pendlay Row", romBucketForExercise("Pendlay Row"));
    expect(rowT.values.maxPeakToMeanRatio).toBe(MAX_PEAK_TO_MEAN_RATIO);
    expect(rowT.values.driveOnsetFraction).toBe(DRIVE_ONSET_FRACTION);
    expect(rowT.values.velocitySmoothingMs).toBe(VELOCITY_SMOOTHING_MS);
    expect(rowT.sources.velocitySmoothingMs).not.toBe("fitted");
    const pressT = cameraTunablesFor("Barbell Shoulder Press", romBucketForExercise("Barbell Shoulder Press"));
    expect(pressT.values.driveOnsetFraction).toBe(0.12);
    expect(pressT.values.velocitySmoothingMs).toBe(VELOCITY_SMOOTHING_MS);
    expect(pressT.values.maxPeakToMeanRatio).toBe(MAX_PEAK_TO_MEAN_RATIO);
    expect(pressT.sources.velocitySmoothingMs).not.toBe("fitted");
    for (const f of fixtures.filter((x) => x.exerciseName !== "Bench Press")) {
      const name = f.exerciseName;
      const m = replay(f, { driveOnsetFraction: DRIVE_ONSET_FRACTION });
      expect(m.repBreakdown.length, f.id).toBe(f.shipped.reps);
      expect(Math.abs((m.peakVelocityMps ?? NaN) - f.shipped.peakVelocityMps), f.id)
        .toBeLessThanOrEqual(name === "Pendlay Row" ? 0.07 : 0.011);
      // Per rep the press reproduces to the hundredth; the row's reps 5-7 are where the live path
      // and the harness segment differently (rep 7's 0.13s concentric on the phone), 0.06-0.18
      // apart, and that predates round four -- the record under test is the SET peak above.
      m.repBreakdown.forEach((r: any, i: number) => {
        expect(Math.abs(r.peakVelocityMps - f.shipped.repPeaks[i]), `${f.id} rep ${i + 1}`)
          .toBeLessThanOrEqual(name === "Pendlay Row" ? 0.2 : 0.011);
      });
      // Same shipped-under-defect rule as the reproduction case above: the corrected mean sums
      // the drive window's distance, so it is at or below what the phone shipped, never above.
      expect(m.meanVelocityMps!, f.id).toBeLessThanOrEqual(f.shipped.meanVelocityMps + 1e-9);
    }
  });

  it("the bench trace reads its own window and smoothing: the mean lands and the peak comes down, with the same eight reps", () => {
    const f = byName("Bench Press");
    const t = cameraTunablesFor("Bench Press", "horizontal_press_or_row");
    expect(t.values.driveOnsetFraction).toBe(0.03);
    expect(t.values.velocitySmoothingMs).toBe(200);
    expect(t.sources.driveOnsetFraction).toBe("fitted");
    expect(t.sources.velocitySmoothingMs).toBe("fitted");
    const sensor = OVR_BENCH_2026_10_30.sensor.reported;
    const shipped = replay(f, SHARED_AS_THE_PHONE_RAN);
    const own = replay(f);
    // Same reps, same range of motion: a window and a smoothing cannot change which reps exist.
    expect(own.repBreakdown.length).toBe(shipped.repBreakdown.length);
    expect(own.romCm).toBeCloseTo(shipped.romCm!, 1);
    // THE MEAN, AND THE BENCH'S OWN DRIVE ONSET IS INERT ON THIS TAKE SINCE 2026-10-31.
    //
    // Round four fitted 0.03 against a set mean that summed the whole phase's distance over the
    // drive window's time, so widening or narrowing the window moved only the DENOMINATOR and a
    // smaller fraction always dragged a too-high mean down. With both sums taken from the drive
    // window the numerator moves with it, and on this take 0.03 and the shared 0.04 return the
    // SAME mean to the hundredth (+5.9% against the sensor at either, where the phone shipped
    // +10.3%). The override is kept because it is still the better value on the 09-29/09-30
    // corpus, where these takes respond to it -- oblique +5.7% against +8.6%, set 7 +2.6%
    // against +7.8%, set 10 -1.3% against +1.3% -- and FITTED_OVERRIDE_EVIDENCE records that
    // re-measured sweep rather than round four's. Asserted as equality on purpose: the day a
    // change makes the bench's window matter on its own paired takes again, this reds and
    // somebody re-reads the evidence instead of inheriting it.
    expect(own.meanVelocityMps!).toBe(shipped.meanVelocityMps!);
    expect(Math.abs(own.meanVelocityMps! / sensor.meanVelocityMps - 1)).toBeLessThan(0.07);
    // THE PEAK, AND THIS LIFT HAS ITS OWN CAP SINCE 2026-10-31 (round seven).
    //
    // The phone shipped +18.6% here at the shared 165ms smoothing and the shared 2.0 cap; the
    // bench's own record brings it down twice over -- 200ms (round four) and maxPeakToMeanRatio
    // 1.6 (round seven, re-swept because the 10-31 set-mean fix changed what a peak-to-mean ratio
    // IS and so voided round four's own rejection of 1.6). It is still a MEASUREMENT and not a
    // number capped to the sensor: it stays above it.
    expect(shipped.peakVelocityMps! / sensor.peakVelocityMps - 1).toBeGreaterThan(0.17);
    expect(own.peakVelocityMps!).toBeLessThan(shipped.peakVelocityMps!);
    expect(own.peakVelocityMps! / sensor.peakVelocityMps - 1).toBeLessThan(0.08);
    expect(own.peakVelocityMps!).toBeGreaterThan(sensor.peakVelocityMps);
    expect(t.values.maxPeakToMeanRatio).toBe(1.6);
    expect(t.sources.maxPeakToMeanRatio).toBe("fitted");
    // THE CAP IS THE BENCH'S ALONE. An incline bench is a different identity and keeps the
    // shared 2.0, which is what says the override is scoped to the one name it was measured on.
    expect(cameraTunablesFor("Incline Barbell Bench Press", "horizontal_press_or_row").values.maxPeakToMeanRatio)
      .toBe(MAX_PEAK_TO_MEAN_RATIO);
    // A CAP CANNOT MOVE A DISTANCE OR A COUNT, and that is the half worth pinning: on all ten
    // stored bench takes the reps, the range of motion and the set mean are identical at 1.6 and
    // at 2.0, which is what makes round four's "1.6 caps half the reps" void rather than merely
    // superseded.
    const capOnly = replay(f, { maxPeakToMeanRatio: MAX_PEAK_TO_MEAN_RATIO });
    expect(own.repBreakdown.length).toBe(capOnly.repBreakdown.length);
    expect(own.romCm!).toBe(capOnly.romCm!);
    expect(own.meanVelocityMps!).toBe(capOnly.meanVelocityMps!);
    expect(own.peakVelocityMps!).toBeLessThan(capOnly.peakVelocityMps!);
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
    // And the bench's blend is byte-for-byte the shipped one: its record still states 0.2 for the
    // depth ruler, and its two new fields are not scale numbers at all.
    const bench = ledgerRow("2026-10-30-bench-press");
    const benchBlend = reconcileScaleEstimates(bench.candidates.map((c) => ({
      source: c.source as "body_3d", scale: c.scaleX1000 / 1000,
      uncertaintyFraction: c.source === "depth"
        ? cameraTunablesFor("Bench Press", "horizontal_press_or_row").values.depthRulerUncertainty
        : bench.uncertaintiesAsFilmed[c.source],
    }))).scale! * 1000;
    expect(Math.abs(benchBlend / bench.shippedScaleX1000 - 1)).toBeLessThan(0.0001);
    // The sensor's own numbers for the row, so the next reader has them beside the fixture.
    expect(OVR_PENDLAY_ROW_2026_10_30.sensor.reported.romIn * 2.54).toBeCloseTo(row.sensorRomCm, 1);
  });

  it("the press trace reads its own drive window: the mean lands on both sets, the peaks and the reps do not move", () => {
    // Round five, 2026-10-30. With the scale inside 2% on set 1, the press's mean read -13.5% at
    // the shared 0.04 (a strict press leaves the collarbone from a dead stop, so the shared window
    // -- fitted 10-07 across five movements -- opens on its slowest centimetres) and set 2 -2.7%.
    // The press's own 0.08 is the first value where neither set nor the 10-02 push-press fixture
    // reads low (see FITTED_OVERRIDE_EVIDENCE). Only the window: smoothing stays shared because
    // 200ms costs the press peaks 6-8 points where it bought the bench 4.
    expect(Object.keys(FITTED_OVERRIDES["Barbell Shoulder Press"])).toEqual(["driveOnsetFraction"]);
    expect(cameraTunablesFor("Barbell Shoulder Press", romBucketForExercise("Barbell Shoulder Press")).values.driveOnsetFraction).toBe(0.12);
    const cases: [Fixture, number, number][] = [
      [byId("2026-10-30 Barbell Shoulder Press set 1"), OVR_BARBELL_SHOULDER_PRESS_2026_10_30.sensor.reported.meanVelocityMps, -0.13],
      [byId("2026-10-30 Barbell Shoulder Press set 2"), OVR_BARBELL_SHOULDER_PRESS_SET2_2026_10_30.sensor.reported.meanVelocityMps, -0.02],
    ];
    for (const [f, sensorMean, sharedReadsBelow] of cases) {
      const shipped = replay(f, { driveOnsetFraction: DRIVE_ONSET_FRACTION });
      const own = replay(f);
      expect(own.repBreakdown.length, f.id).toBe(shipped.repBreakdown.length);
      expect(own.romCm, f.id).toBeCloseTo(shipped.romCm!, 1);
      expect(shipped.meanVelocityMps! / sensorMean - 1, `${f.id} shared`).toBeLessThan(sharedReadsBelow);
      expect(own.meanVelocityMps!, f.id).toBeGreaterThan(shipped.meanVelocityMps!);
      // AND 0.08 WAS REFIT TO 0.12, 2026-10-31 (round seven), BECAUSE THE SET-MEAN FIX VOIDED
      // THE SWEEP THAT CHOSE IT -- not because the press changed.
      //
      // Round five chose 0.08 as the first value where neither set read low, measured against the
      // set mean that summed the whole phase's distance over the drive window's time; narrowing
      // the window moved only the DENOMINATOR there, so a smaller fraction always dragged a mean
      // down. With both sums from the drive window the press reads low at 0.08 on all three of
      // its 10-30 sets AND on the 10-02 fixture, and 0.12 weakly dominates both 0.08 and 0.10 --
      // no take of the four is worse at it than at either (see FITTED_OVERRIDE_EVIDENCE for the
      // sweep). Held as "inside 3% and no longer biased low on both sets", which reds if the
      // refit is reverted (-6.2% and -5.5%).
      expect(Math.abs(own.meanVelocityMps! / sensorMean - 1), `${f.id} own`).toBeLessThan(0.03);
      // A WINDOW MOVES THE MEAN, AND IT CAN MOVE THE PEAK ONLY BY MOVING AN EDGE PAST A REP'S
      // PEAK FRAME, which 0.12 does on one rep of set 1 (0.07) and on none of set 2. Bounded
      // rather than asserted equal, because the bound is the claim: a window must not be able to
      // rewrite the peaks wholesale.
      expect(Math.abs(own.peakVelocityMps! - shipped.peakVelocityMps!), f.id).toBeLessThanOrEqual(0.08);
      // Seven of eight on both sets. The eighth press is in the trace and the segmenter folded it
      // into the lowering to the floor that follows the last press (a press re-racks DOWNWARD, so
      // the last eccentric runs on into the re-rack). That is a RULE question shared with every
      // lift that re-racks downward, and the lift's own record carries nothing for it.
      expect(own.repBreakdown.length, f.id).toBe(7);
      expect(f.loggedReps).toBe(8);
      const lastEnd = own.repBreakdown[own.repBreakdown.length - 1].endT;
      const after = f.barPathTrace.filter((p: any) => p.t > lastEnd && p.t < lastEnd + 2500).map((p: any) => p.y);
      expect(Math.max(...after) - Math.min(...after), f.id).toBeGreaterThan(55);
    }
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
    // the shoulder span alone IS the shipped scale, to the digit
    expect(blendScales(kept.filter((k) => k.source === "shoulder_width"), t.maxScaleAgreementTolerance).scale! * 1000)
      .toBeCloseTo(row.shippedScaleX1000, 9);
    // and the sensor's numbers for set 2 sit beside the fixture
    expect(OVR_PENDLAY_ROW_SET2_2026_10_30.sensor.reported.romIn * 2.54).toBeCloseTo(row.sensorRomCm, 1);
  });
});
