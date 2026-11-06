import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeTrackedSet } from "./bar-tracking";
import { reconcileScaleEstimates, rejectImplausibleScales } from "./pose-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { cameraTunablesFor, FITTED_OVERRIDES, FITTED_OVERRIDE_EVIDENCE } from "@shared/camera-tunables-by-lift";
import { ledgerRow } from "@shared/accuracy-ledger";
import {
  OVR_BENCH_PRESS_SET2_2026_11_06,
  OVR_DUMBBELL_SHOULDER_PRESS_SET2_2026_11_06,
  OVR_SINGLE_ARM_DUMBBELL_ROW_SET2_2026_11_06,
} from "./tracker-ground-truth";

/* ROUND TWELVE, 2026-11-06 evening, build 716: set 2 of the bench, the dumbbell shoulder press and
 * the single-arm dumbbell row -- the row as TWO captures, one per arm, the first ever traced by the
 * working hand. Scott: "Remember at least one fix per exercise, we need to get as close to 0% to
 * the OVR, even if it's a .001 change, we are getting very close with bench."
 *
 * One step per lift, each in FITTED_OVERRIDES with its evidence, each costed here on the take it
 * came from and on the other lifts' records:
 *  - bench: its own count-trim floor 1.2 -- the camera found all NINE presses Scott did on purpose
 *    and the logged eight trimmed the first ("camera didn't catch 9? Maybe?" -- it did);
 *  - press: its own height 0.2 and depth 0.6 (+46.7 -> +38.8%), plus heightRulerFraming in the
 *    export, because the error is the height ruler reading an ankle the frame barely holds;
 *  - row: its own depth 0.6 (-20.1 -> -5.7% and -14.0 -> -4.6%), the RDL's and Pendlay's statement.
 *
 * Fixture: client/src/lib/__fixtures__/ovr-2026-11-06-set2-export.json, trimmed from the admin
 * export the same way as the 11-06 one; the four captures are the newest four in that export, and
 * their filming order (newest first in the export) is what names the arms. */
type Fixture = {
  id: string; exerciseName: string; heightIn: number | null; loadKg: number | null; loggedReps: number | null;
  trackingDiagnostics: any; barPathTrace: any[];
  shipped: { reps: number; peakVelocityMps: number | null; meanVelocityMps: number | null; romCm: number | null };
};
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-06-set2-export.json"), "utf8"));
const byId = (id: string) => fixtures.find((f) => f.id === id)!;
const STORED = { x: 0, y: 1 };
function replay(f: Fixture, patch: Partial<Record<string, number>> = {}, loggedReps: number | null | undefined = undefined) {
  const points = f.barPathTrace.map((p: any) => ({ t: p.t, x: p.x / 100, y: p.y / 100, z: 0, confidence: p.c ?? 1 }));
  const cal = f.trackingDiagnostics?.calibration ?? null;
  const romKind = romBucketForExercise(f.exerciseName);
  const tune = cameraTunablesFor(f.exerciseName, romKind);
  Object.assign(tune.values, patch);
  const m = summarizeTrackedSet(points, f.loadKg ?? undefined, f.heightIn ?? undefined, firstMoveForExercise(f.exerciseName), [],
    cal?.positionScaleCorrection ?? 1, false, romKind, STORED, loggedReps === undefined ? (f.loggedReps ?? null) : loggedReps, tune);
  if (!m) throw new Error(`${f.id}: no metrics`);
  return m;
}
const BENCH = "2026-11-06 Bench Press set 2", PRESS = "2026-11-06 Dumbbell Shoulder Press set 2";
const ROW_FIRST = "2026-11-06 Single-Arm Dumbbell Row set 3", ROW_SECOND = "2026-11-06 Single-Arm Dumbbell Row set 4";
const sensorRomCm = (romIn: number) => romIn * 2.54;
const candidatesOf = (f: Fixture) =>
  f.trackingDiagnostics.calibration.scaleCandidates.map((x: any) => ({ source: x.source.split(":")[0], scale: x.scale, uncertaintyFraction: x.uncertainty }));
/** The take's candidates at THIS lift's record, the shoulder keeping whatever the phone loosened it
 *  to beyond the floor (its spread or the grip rule, both facts about the take). */
function atRecord(f: Fixture) {
  const own = cameraTunablesFor(f.exerciseName, romBucketForExercise(f.exerciseName)).values;
  return candidatesOf(f).map((c: any) => {
    if (c.source === "height") return { ...c, uncertaintyFraction: own.heightRulerUncertainty };
    if (c.source === "depth") return { ...c, uncertaintyFraction: own.depthRulerUncertainty };
    if (c.source === "body_3d") return { ...c, uncertaintyFraction: own.body3DCorrectedUncertainty };
    if (c.source === "shoulder_width") return { ...c, uncertaintyFraction: Math.max(own.biacromialToleranceFraction, c.uncertaintyFraction) };
    return c;
  });
}
function blendAtRecord(f: Fixture) {
  const cal = f.trackingDiagnostics.calibration;
  const own = cameraTunablesFor(f.exerciseName, romBucketForExercise(f.exerciseName)).values;
  const kept = rejectImplausibleScales(atRecord(f), cal.impliedBodyLengthUnits ?? null, f.heightIn, cal.gripWidthPx ?? null).kept;
  return reconcileScaleEstimates(kept, own.maxScaleAgreementTolerance).scale!;
}
const errPct = (scale: number, f: Fixture, sensorCm: number) => (scale / (f.trackingDiagnostics.calibration.scaleFactor * sensorCm / f.shipped.romCm!) - 1) * 100;

describe("the 2026-11-06 set-2 export: three systems on four captures", () => {
  it("holds the four captures on 716, each carrying its own record in the export", () => {
    expect(fixtures.map((f) => f.id).sort()).toEqual([BENCH, PRESS, ROW_FIRST, ROW_SECOND].sort());
    for (const f of fixtures) expect(f.trackingDiagnostics.calibration.liftRecord.identity, f.id).toBe(f.exerciseName);
    // The bench's live analysis fell back to the file; the other three ran live.
    expect(byId(BENCH).trackingDiagnostics.recording.analysisPath).toBe("file");
    for (const id of [PRESS, ROW_FIRST, ROW_SECOND]) expect(byId(id).trackingDiagnostics.recording.analysisPath, id).toBe("live");
  });

  it("overwatch judged every frame and the object system asked for the right class on every take -- the row's dumbbell fix on its first outing", () => {
    for (const f of fixtures) {
      const ow = f.trackingDiagnostics.recording.overwatch;
      expect(ow.framesJudged, f.id).toBeGreaterThan(500);
      expect(ow.framesFrozenByLandmarks, f.id).toBe(0);
      expect(f.trackingDiagnostics.objectSystem.declared, f.id).toBe("coreml");
    }
    expect(byId(BENCH).trackingDiagnostics.objectSystem.coreMlClass).toBe("plate");
    expect(byId(PRESS).trackingDiagnostics.objectSystem.coreMlClass).toBe("dumbbell");
    expect(byId(ROW_FIRST).trackingDiagnostics.objectSystem.coreMlClass).toBe("dumbbell");
    expect(byId(ROW_SECOND).trackingDiagnostics.objectSystem.coreMlClass).toBe("dumbbell");
    // The plate held a lock and was the bench's ruler; the dumbbell class saw candidates on all
    // three dumbbell takes and held NO lock on any -- the detector's open item, recorded.
    expect(byId(BENCH).trackingDiagnostics.objectLock.framesLockHeld).toBe(224);
    for (const id of [PRESS, ROW_FIRST, ROW_SECOND]) {
      expect(byId(id).trackingDiagnostics.objectLock.framesLockHeld, id).toBe(0);
      expect(byId(id).trackingDiagnostics.objectLock.candidatesSeenOfClass, id).toBeGreaterThan(0);
    }
  });

  it("the bench: the plate was the ruler (+0.6%), the camera found nine, and the bench's own trim floor keeps the ninth", () => {
    const f = byId(BENCH);
    const cal = f.trackingDiagnostics.calibration;
    const sensor = sensorRomCm(OVR_BENCH_PRESS_SET2_2026_11_06.sensor.reported.romIn);
    expect(errPct(cal.scaleFactor, f, sensor)).toBeCloseTo(0.61, 1);
    const plate = cal.scaleCandidates.find((c: any) => c.source === "plate");
    expect(plate.weightPct).toBeCloseTo(73.9, 0);
    expect(cal.objectGate.plateBoxToExpectedRatio).toBeCloseTo(1.035, 2);
    expect(cal.referenceObject.aspectRatio).toBeCloseTo(0.98, 1);
    expect(errPct(plate.scale, f, sensor)).toBeCloseTo(-0.3, 0);
    // As the phone ran it (the shared floor 1, logged 8): eight reps, rep 1 trimmed. The replay
    // reproduces the shipped numbers exactly, because this take ran on the FILE path.
    const shared = replay(f, { minCountTrimOddness: 1 });
    expect(shared.repBreakdown.length).toBe(8);
    expect(shared.romCm).toBeCloseTo(f.shipped.romCm!, 1);
    expect(shared.meanVelocityMps).toBeCloseTo(f.shipped.meanVelocityMps!, 2);
    // At the bench's own floor the ninth press is a rep, at the logged eight and with no count.
    const own = cameraTunablesFor("Bench Press", "horizontal_press_or_row");
    expect(own.values.minCountTrimOddness).toBe(1.2);
    expect(own.sources.minCountTrimOddness).toBe("fitted");
    expect(FITTED_OVERRIDES["Bench Press"]).toEqual({ minCountTrimOddness: 1.2 });
    expect(FITTED_OVERRIDE_EVIDENCE["Bench Press"]).toMatch(/minCountTrimOddness 1 -> 1\.2/);
    const atOwn = replay(f);
    expect(atOwn.repBreakdown.length).toBe(9);
    expect(replay(f, {}, null).repBreakdown.length).toBe(9);
    expect(OVR_BENCH_PRESS_SET2_2026_11_06.sensor.reps).toHaveLength(9);
    expect(atOwn.romCm).toBeCloseTo(34.5, 1);
    // The velocities are the open item: +26% on the mean with the scale inside 1%.
    expect(atOwn.meanVelocityMps! / OVR_BENCH_PRESS_SET2_2026_11_06.sensor.reported.meanVelocityMps).toBeCloseTo(1.26, 1);
    expect(ledgerRow("2026-11-06-bench-press-set-2").shippedScaleX1000).toBeCloseTo(cal.scaleFactor * 1000, 9);
    // The floor reaches no other lift's record.
    for (const [name, bucket] of [["Barbell Shoulder Press", "overhead_press"], ["Pendlay Row", "horizontal_press_or_row"], ["Back Squat", "squat"]] as const) {
      expect(cameraTunablesFor(name, bucket).values.minCountTrimOddness, name).toBe(1);
    }
  });

  it("the press: its own height and depth uncertainties move both sets the same way, and reach no other lift", () => {
    const f = byId(PRESS);
    const cal = f.trackingDiagnostics.calibration;
    const sensor = sensorRomCm(OVR_DUMBBELL_SHOULDER_PRESS_SET2_2026_11_06.sensor.reportedOverOurReps.romIn);
    expect(errPct(cal.scaleFactor, f, sensor)).toBeCloseTo(46.67, 1);
    // The export says the day: the round-eleven record (shoulder 0.4) and every ruler high.
    expect(cal.liftRecord.values.biacromialToleranceFraction).toBe(0.4);
    expect(cal.liftRecord.values.heightRulerUncertainty).toBe(0.1);
    expect(cal.liftRecord.values.depthRulerUncertainty).toBe(0.2);
    for (const c of cal.scaleCandidates) expect(errPct(c.scale, f, sensor), c.source).toBeGreaterThan(15);
    const own = cameraTunablesFor("Dumbbell Shoulder Press", "overhead_press");
    expect(own.values.heightRulerUncertainty).toBe(0.2);
    expect(own.values.depthRulerUncertainty).toBe(0.6);
    expect(own.sources.heightRulerUncertainty).toBe("fitted");
    expect(own.sources.depthRulerUncertainty).toBe("fitted");
    expect(errPct(blendAtRecord(f), f, sensor)).toBeCloseTo(38.78, 1);
    expect(ledgerRow("2026-11-06-dumbbell-shoulder-press-set-2").liveErrorPct).toBeCloseTo(38.78, 1);
    expect(ledgerRow("2026-11-06-dumbbell-shoulder-press-set-1").liveErrorPct).toBeCloseTo(35.62, 1);
    // The mechanism the next take will show: the 3D shin is a third shorter than on any other
    // take in the two 11-06 exports, which is where an ankle read up the leg lands.
    const shin = cal.body3DRuler.limbs.find((l: any) => l.limb === "shin");
    expect(shin.metres).toBeLessThan(0.36);
    for (const id of [BENCH, ROW_FIRST, ROW_SECOND]) {
      const s = byId(id).trackingDiagnostics.calibration.body3DRuler.limbs.find((l: any) => l.limb === "shin");
      expect(s.metres, id).toBeGreaterThan(0.43);
    }
    expect(f.shipped.reps).toBe(8);
    for (const [name, bucket] of [["Barbell Shoulder Press", "overhead_press"], ["Bench Press", "horizontal_press_or_row"]] as const) {
      expect(cameraTunablesFor(name, bucket).values.heightRulerUncertainty, name).toBe(0.1);
      expect(cameraTunablesFor(name, bucket).values.depthRulerUncertainty, name).toBe(0.2);
    }
  });

  it("the row: two arms, each traced by its working hand, and the row's own depth uncertainty lands both inside 6%", () => {
    const first = byId(ROW_FIRST), second = byId(ROW_SECOND);
    // Which arm is which: the filming order (set 3 first) and the hand the rule chose.
    expect(first.trackingDiagnostics.trace.unilateralWorkingHand).toBe("right");
    expect(second.trackingDiagnostics.trace.unilateralWorkingHand).toBe("left");
    for (const f of [first, second]) {
      const t = f.trackingDiagnostics.trace;
      expect(t.barPointFromWorkingHand, f.id).toBeGreaterThan(400);
      expect(t.barPointFromBothHands, f.id).toBe(0);
      expect(t.barPointFromLoneHandCarried, f.id).toBe(0);
      expect(t.declaredSide, f.id).toBeNull();
      // Every measured point is the working hand ("w"); the rest are the interpolated fills ("i").
      const sources = new Set(f.barPathTrace.map((p: any) => p.s));
      expect(sources.has("w"), f.id).toBe(true);
      expect([...sources].filter((x) => x !== "w" && x !== "i"), f.id).toEqual([]);
    }
    const gt = OVR_SINGLE_ARM_DUMBBELL_ROW_SET2_2026_11_06;
    const firstCm = sensorRomCm(gt.sensor.reportedFirstArm.romIn), secondCm = sensorRomCm(gt.sensor.reportedSecondArm.romIn);
    expect(firstCm).toBeCloseTo(47.69, 1);
    expect(secondCm).toBeCloseTo(42.45, 1);
    expect(errPct(first.trackingDiagnostics.calibration.scaleFactor, first, firstCm)).toBeCloseTo(-20.11, 1);
    expect(errPct(second.trackingDiagnostics.calibration.scaleFactor, second, secondCm)).toBeCloseTo(-14.03, 1);
    // The depth reading is the whole error on both arms; the bone reads the sensor on the first.
    const depthOf = (f: Fixture) => f.trackingDiagnostics.calibration.scaleCandidates.find((c: any) => c.source === "depth").scale;
    const boneOf = (f: Fixture) => f.trackingDiagnostics.calibration.scaleCandidates.find((c: any) => c.source.startsWith("body_3d")).scale;
    expect(errPct(depthOf(first), first, firstCm)).toBeLessThan(-30);
    expect(errPct(depthOf(second), second, secondCm)).toBeLessThan(-30);
    expect(Math.abs(errPct(boneOf(first), first, firstCm))).toBeLessThan(2);
    const own = cameraTunablesFor("Single-Arm Dumbbell Row", "horizontal_press_or_row");
    expect(own.values.depthRulerUncertainty).toBe(0.6);
    expect(own.sources.depthRulerUncertainty).toBe("fitted");
    expect(errPct(blendAtRecord(first), first, firstCm)).toBeCloseTo(-5.75, 1);
    expect(errPct(blendAtRecord(second), second, secondCm)).toBeCloseTo(-4.62, 1);
    expect(ledgerRow("2026-11-06-single-arm-dumbbell-row-first-arm").liveErrorPct).toBeCloseTo(-5.75, 1);
    expect(ledgerRow("2026-11-06-single-arm-dumbbell-row-second-arm").liveErrorPct).toBeCloseTo(-4.62, 1);
    // The first arm found seven: reps 5 and 6 merged into one 83.8cm phase the outlier rule drops.
    expect(first.shipped.reps).toBe(7);
    expect(second.shipped.reps).toBe(8);
    const m = replay(first);
    expect(m.repBreakdown.length).toBe(7);
    expect(Math.max(...m.repBreakdown.map((r: any) => r.romCm))).toBeGreaterThan(80);
    expect(m.romCm).toBeCloseTo(38.1, 1);
    // The row's depth reaches the row and neither the bench nor the press's twin barbell lifts.
    for (const [name, bucket] of [["Bench Press", "horizontal_press_or_row"], ["Barbell Shoulder Press", "overhead_press"], ["Back Squat", "squat"]] as const) {
      expect(cameraTunablesFor(name, bucket).values.depthRulerUncertainty, name).toBe(0.2);
    }
  });
});
