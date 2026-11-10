import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeTrackedSet } from "./bar-tracking";
import { reconcileScaleEstimates, rejectImplausibleScales } from "./pose-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { cameraTunablesFor, FITTED_OVERRIDES } from "@shared/camera-tunables-by-lift";
import { ledgerRow } from "@shared/accuracy-ledger";
import {
  OVR_BENCH_PRESS_2026_11_06,
  OVR_DUMBBELL_SHOULDER_PRESS_2026_11_06,
  OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_06,
} from "./tracker-ground-truth";

/* ROUND ELEVEN, 2026-11-06, build 714: the bench and the first two DUMBBELL lifts ever filmed
 * beside the OVR. Scott: "at least one fix per lift ... this is the first time we've ever tested
 * dumbbell exercises though. So we need to check the object detection, are the two camera systems
 * and the ai overwatch working together?"
 *
 * What the export answered about the three systems, pinned here from the fixture so the next
 * session does not re-derive it: overwatch judged every frame of all three takes
 * (recording.overwatch, framesJudged = the frames); the object system ran on all three and asked
 * for the RIGHT class on two (plate on the bench, dumbbell on the press) and the WRONG one on the
 * row (plate, forced by the bent_over posture -- a-dumbbell-lift-asks-for-a-dumbbell.test.ts);
 * the body tracker built every bar point. The fixes, one per lift:
 *  - bench: the stature yardstick stands down on a lying posture (a-supine-span-is-not-a-stature);
 *  - press: its own biacromialToleranceFraction 0.4 (FITTED_OVERRIDES);
 *  - row: the working hand is the point on a unilateral lift (a-unilateral-lift-is-traced-by-...).
 *
 * Fixture: client/src/lib/__fixtures__/ovr-2026-11-06-export.json, trimmed from the admin export
 * the same way as the 11-05 one. */
type Fixture = {
  id: string; exerciseName: string; heightIn: number | null; loadKg: number | null; loggedReps: number | null;
  trackingDiagnostics: any; barPathTrace: any[]; bodyWitnessTrace?: { points: any[] } | null;
  shipped: { reps: number; peakVelocityMps: number | null; meanVelocityMps: number | null; romCm: number | null; repPeaks: number[]; repMeans: number[]; repRoms: (number | null)[] };
};
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-06-export.json"), "utf8"));
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
const BENCH = "2026-11-06 Bench Press set 1", PRESS = "2026-11-06 Dumbbell Shoulder Press set 1", ROW = "2026-11-06 Single-Arm Dumbbell Row set 1";
const sensorRomCm = (romIn: number) => romIn * 2.54;
const candidatesOf = (f: Fixture) =>
  f.trackingDiagnostics.calibration.scaleCandidates.map((x: any) => ({ source: x.source.split(":")[0], scale: x.scale, uncertaintyFraction: x.uncertainty }));

describe("the 2026-11-06 export: three systems on three lifts", () => {
  it("holds the three captures, all on 714, all live path, each with its own record in the export", () => {
    expect(fixtures.map((f) => f.id).sort()).toEqual([BENCH, PRESS, ROW].sort());
    for (const f of fixtures) {
      expect(f.trackingDiagnostics.recording.analysisPath, f.id).toBe("live");
      expect(f.trackingDiagnostics.calibration.liftRecord?.identity ?? f.trackingDiagnostics.calibration.scaleBlend?.identity, f.id).toBe(f.exerciseName);
    }
  });

  it("overwatch judged every frame of every take, and the object system ran on every take", () => {
    for (const f of fixtures) {
      const ow = f.trackingDiagnostics.recording.overwatch;
      expect(ow?.framesJudged, `${f.id}: overwatch`).toBeGreaterThan(300);
      expect(ow.framesFrozenByLandmarks, f.id).toBe(0);
      const os = f.trackingDiagnostics.objectSystem;
      expect(os?.declared, `${f.id}: object system`).toBe("coreml");
    }
    // The class each take asked for: right on two, wrong on the row -- which is the defect
    // a-dumbbell-lift-asks-for-a-dumbbell.test.ts fixes. The fixture records the day as filmed.
    expect(byId(BENCH).trackingDiagnostics.objectSystem.coreMlClass).toBe("plate");
    expect(byId(PRESS).trackingDiagnostics.objectSystem.coreMlClass).toBe("dumbbell");
    expect(byId(ROW).trackingDiagnostics.objectSystem.coreMlClass).toBe("plate");
    expect(byId(ROW).trackingDiagnostics.objectLock.framesLockHeld).toBe(0);
  });

  it("the bench: the trace replays to the shipped numbers at the shared record, and its scale error is the yardstick's", () => {
    const f = byId(BENCH);
    const own = cameraTunablesFor("Bench Press", "horizontal_press_or_row");
    // The SHARED record this take was filmed on: the bench's own window (0.03) and 3D-pose
    // uncertainty (0.25) arrived in round fourteen, 2026-11-10, and are replayed below.
    const m = replay(f, { driveOnsetFraction: 0.04, body3DCorrectedUncertainty: 0.2 });
    expect(m.repBreakdown.length).toBe(8);
    // Within a hundredth: the stored trace is rounded to a hundredth of a unit, and the live
    // path's phone series is not (0.65 against a shipped 0.64 on the mean; the peak and the range
    // agree exactly). The 11-05 squat replayed exactly because it ran on the FILE path.
    expect(Math.abs(m.meanVelocityMps! - f.shipped.meanVelocityMps!)).toBeLessThanOrEqual(0.011);
    expect(Math.abs(m.peakVelocityMps! - f.shipped.peakVelocityMps!)).toBeLessThanOrEqual(0.011);
    expect(m.romCm).toBeCloseTo(f.shipped.romCm!, 1);
    expect(own.values.maxPlateAspectRatio).toBe(1.7);
    // The shipped scale was the collapsed 3D pair alone, the shoulder refused by the stature
    // yardstick on a SUPINE athlete; without that span the three rulers read +2.5% together.
    const cal = f.trackingDiagnostics.calibration;
    expect(cal.scalesRejectedAsImplausible.map((r: any) => r.source)).toEqual(["shoulder_width"]);
    const required = cal.scaleFactor * sensorRomCm(OVR_BENCH_PRESS_2026_11_06.sensor.reported.romIn) / f.shipped.romCm!;
    const withoutSpan = rejectImplausibleScales(candidatesOf(f), null, f.heightIn, cal.gripWidthPx);
    expect(withoutSpan.rejected).toEqual([]);
    const blend = reconcileScaleEstimates(withoutSpan.kept, own.values.maxScaleAgreementTolerance).scale!;
    expect((blend / required - 1) * 100).toBeCloseTo(2.53, 1);
    // And at the bench's own record since round fourteen (3D pose at 0.25): +2.14%.
    const atOwn = reconcileScaleEstimates(
      withoutSpan.kept.map((c: any) => (c.source === "body_3d" ? { ...c, uncertaintyFraction: own.values.body3DCorrectedUncertainty } : c)),
      own.values.maxScaleAgreementTolerance,
    ).scale!;
    expect((atOwn / required - 1) * 100).toBeCloseTo(2.14, 1);
    expect((cal.scaleFactor / required - 1) * 100).toBeCloseTo(-12.61, 1);
    // The ledger row carries the same take.
    expect(ledgerRow("2026-11-06-bench-press-set-1").shippedScaleX1000).toBeCloseTo(cal.scaleFactor * 1000, 9);
  });

  it("the bench's plate was measured 7% small, and admitting it was costed and refused", () => {
    const og = byId(BENCH).trackingDiagnostics.calibration.objectGate;
    expect(og.rejectedReasons).toEqual(["aspect_ratio"]);
    expect(og.plateBoxToExpectedRatio).toBeCloseTo(0.814, 2);
    const required = byId(BENCH).trackingDiagnostics.calibration.scaleFactor * sensorRomCm(13.2) / 29.3;
    expect((og.plateScaleIfAdmitted / required - 1) * 100).toBeCloseTo(7.37, 1);
  });

  it("the press: its own shoulder floor reaches the press and no other lift", () => {
    const f = byId(PRESS);
    const own = cameraTunablesFor("Dumbbell Shoulder Press", "overhead_press");
    expect(own.values.biacromialToleranceFraction).toBe(0.4);
    expect(own.sources.biacromialToleranceFraction).toBe("fitted");
    for (const [name, bucket] of [["Barbell Shoulder Press", "overhead_press"], ["Bench Press", "horizontal_press_or_row"], ["Back Squat", "squat"]] as const) {
      expect(cameraTunablesFor(name, bucket).values.biacromialToleranceFraction, name).toBe(0.2);
    }
    // The export says the day: every ruler high, the record at 0.2, the blend +47%.
    const cal = f.trackingDiagnostics.calibration;
    expect(cal.liftRecord.values.biacromialToleranceFraction).toBe(0.2);
    const required = cal.scaleFactor * sensorRomCm(OVR_DUMBBELL_SHOULDER_PRESS_2026_11_06.sensor.reportedOverOurReps.romIn) / f.shipped.romCm!;
    expect((cal.scaleFactor / required - 1) * 100).toBeCloseTo(46.98, 1);
    const atOwn = reconcileScaleEstimates(
      candidatesOf(f).map((c: any) => (c.source === "shoulder_width" ? { ...c, uncertaintyFraction: own.values.biacromialToleranceFraction } : c)),
      own.values.maxScaleAgreementTolerance,
    ).scale!;
    expect((atOwn / required - 1) * 100).toBeCloseTo(41.76, 1);
    // Loosening the HEIGHT ruler instead makes it worse: the weight lands on the shoulder.
    const heightLoosened = reconcileScaleEstimates(
      candidatesOf(f).map((c: any) => (c.source === "height" ? { ...c, uncertaintyFraction: 0.2 } : c)),
      own.values.maxScaleAgreementTolerance,
    ).scale!;
    expect(heightLoosened).toBeGreaterThan(cal.scaleFactor);
    expect(f.shipped.reps).toBe(7);
    expect(OVR_DUMBBELL_SHOULDER_PRESS_2026_11_06.sensor.reps).toHaveLength(8);
  });

  it("the press's 3D bone median landed on the upper arm while the torso and shin read the sensor", () => {
    const f = byId(PRESS);
    const limbs: { limb: string; scale: number }[] = f.trackingDiagnostics.calibration.body3DRuler.limbs;
    const required = f.trackingDiagnostics.calibration.scaleFactor * sensorRomCm(22.93) / 85.6;
    const err = (limb: string) => (limbs.find((l) => l.limb === limb)!.scale / required - 1) * 100;
    expect(Math.abs(err("torso"))).toBeLessThan(2);
    expect(Math.abs(err("shin"))).toBeLessThan(2);
    expect(err("upperArm")).toBeGreaterThan(10);
    // Recorded, not changed: an even-count median takes the upper middle, and on the bench the
    // upper middle (the torso) was the better bone. The pick is a shared rule and moves every take.
    expect(limbs).toHaveLength(6);
  });

  it("the row: ten reps at half the travel, every point a midpoint or a carry -- the defect the working-hand rule is for", () => {
    const f = byId(ROW);
    const sources = new Set(f.barPathTrace.map((p: any) => p.s));
    expect(sources.has("w"), "the 11-06 row was filmed BEFORE the working-hand rule; its trace is the midpoint").toBe(false);
    const t = f.trackingDiagnostics.trace;
    expect(t.barPointFromLoneHandCarried).toBe(OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_06.forgeOnDevice.barPointFromLoneHandCarried);
    expect(t.barPointFromBothHands).toBe(OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_06.forgeOnDevice.barPointFromBothHands);
    expect(t.unilateralWorkingHand).toBeUndefined();
    expect(f.shipped.reps).toBe(10);
    // The midpoint of a still braced hand and the working hand travels HALF as far as the hand:
    // doubled, the reported range lands between the two arms the sensor read.
    const doubled = f.shipped.romCm! * 2;
    const firstArm = sensorRomCm(OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_06.sensor.reportedOverOurReps.romIn);
    const otherArm = sensorRomCm(OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_06.sensor.otherArm.reduce((s, r) => s + r.romIn, 0) / 8);
    expect(doubled).toBeGreaterThan(firstArm);
    expect(doubled).toBeLessThan(otherArm);
    // The sensor rode the dumbbell across both arms; the camera saw one. Per-side filming is the
    // feature that records which, and until it ships the row has no ledger row (shared/accuracy-ledger.ts).
    expect(OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_06.sensor.reps.length + OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_06.sensor.otherArm.length).toBe(16);
  });
});
