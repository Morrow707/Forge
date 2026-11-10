import { describe, it, expect } from "vitest";
import { summarizeTrackedSet, DRIVE_ONSET_FRACTION, VELOCITY_SMOOTHING_MS } from "./bar-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { cameraTunablesFor } from "@shared/camera-tunables-by-lift";
import * as GT from "./tracker-ground-truth";
import benchSet7 from "./__fixtures__/bench-set7-2026-09-29.json";
import benchSet9 from "./__fixtures__/bench-set9-2026-09-30.json";
import benchSet10 from "./__fixtures__/bench-set10-2026-09-30.json";
import benchOblique from "./__fixtures__/bench-oblique-2026-09-29.json";
import row1002 from "./__fixtures__/pendlay-row-set2-2026-10-02.json";
import pushPress from "./__fixtures__/push-press-set2-2026-10-02.json";
import squat1 from "./__fixtures__/squat-set1-2026-10-01.json";

// WHY 0.04 AND NOT 0.07, AND WHY IT IS ALLOWED TO MOVE EVERY LIFT AT ONCE.
//
// DRIVE_ONSET_FRACTION decides the window the reported mean velocity is measured over. It was
// fitted on six sets in build 579 and refitted on 2026-10-07 across thirteen sensor-paired sets
// with NO NEW FILMING -- every one of them stores its own trace, so the fit is a replay. Scott:
// "calibrate the numbers so we can get more accurate without lifts."
//
// This file is the ratchet on the two properties that made the refit safe, not a restatement of
// the sweep (that is in DRIVE_ONSET_FRACTION's own comment, with the table).
/** The phone projects on IMAGE_VERTICAL_AXIS, the identity; a stored trace is replayed the same
 *  way. Until 2026-11-05 an axis-less trace was flipped here (y: -1), which compensated for the
 *  inverted direction rule on the harness side only -- see capture-replay.ts, VERTICAL_AXIS. */
const STORED = { x: 0, y: 1 };
const VERTICAL = { x: 0, y: 1 };
/** Median |drive duration - sensor concentric| / sensor over the seven sets, ON THE DRIVES,
 *  measured 2026-11-05 with the direction rule corrected. */
const DRIVE_TABLE_ON_THE_DRIVES: Record<number, number> = { 0: 0.059, 0.04: 0.168 };

type Fixture = { capture: any; ovr: any; tag: string };
const SETS: Fixture[] = [
  { tag: "bench-set7", capture: (benchSet7 as any[])[0], ovr: (GT as any).OVR_BENCH_SET7_2026_09_29 },
  { tag: "bench-set9", capture: (benchSet9 as any[])[0], ovr: (GT as any).OVR_BENCH_SET9_2026_09_30 },
  { tag: "bench-set10", capture: (benchSet10 as any[])[0], ovr: (GT as any).OVR_BENCH_SET10_2026_09_30 },
  { tag: "bench-oblique", capture: (benchOblique as any[])[0], ovr: (GT as any).OVR_BENCH_OBLIQUE_2026_09_29 },
  { tag: "row-10-02", capture: (row1002 as any[])[0], ovr: (GT as any).OVR_PENDLAY_ROW_2026_10_02 },
  { tag: "push-press-10-02", capture: (pushPress as any[])[0], ovr: (GT as any).OVR_PUSH_PRESS_2026_10_02 },
  { tag: "squat-set1", capture: (squat1 as any[])[0], ovr: (GT as any).OVR_SQUAT_SET1_2026_10_01 },
];

function replay(capture: any, driveOnsetFraction: number) {
  const points = capture.barPathTrace.map((p: any) => ({
    t: p.t, x: p.x / 100, y: p.y / 100, z: 0, confidence: p.c ?? 1,
  }));
  const calibration = capture.trackingDiagnostics?.calibration ?? null;
  const romKind = romBucketForExercise(capture.exerciseName);
  const tunables = cameraTunablesFor(capture.exerciseName, romKind);
  tunables.values.driveOnsetFraction = driveOnsetFraction;
  // The 10-07 sweep was run at the SHARED smoothing, and this file is the record of that sweep.
  // Since 2026-10-30 the Bench Press's record carries its own smoothing (200), which moves where
  // the drive window's peak index lands on the four bench fixtures; replaying them at that value
  // would make this a record of a sweep nobody ran. The bench's own numbers are costed in
  // ovr-2026-10-30-every-lift-reads-only-its-own-record.test.ts.
  tunables.values.velocitySmoothingMs = VELOCITY_SMOOTHING_MS;
  return summarizeTrackedSet(
    points,
    capture.loadKg ?? undefined,
    capture.heightIn ?? undefined,
    firstMoveForExercise(capture.exerciseName),
    [],
    calibration?.positionScaleCorrection ?? 1,
    false,
    romKind,
    calibration?.movementAxis ? STORED : VERTICAL,
    capture.loggedReps ?? null,
    tunables,
  );
}

/** The sensor's own concentric duration: its range of motion over its mean velocity. None of
 *  Forge's scale is in it, which is the whole point -- the scale error and the timing error were
 *  read as one thing for three sessions before this separated them. */
function sensorConcentricSeconds(ovr: any): number {
  const reps: any[] = ovr.sensor.reps;
  const each = reps
    .filter((r) => r.romIn != null && r.meanVelocityMps > 0)
    .map((r) => (r.romIn * 0.0254) / r.meanVelocityMps);
  return each.reduce((a, b) => a + b, 0) / each.length;
}

function meanDriveSeconds(metrics: any): number {
  const reps = metrics.repBreakdown;
  return reps.reduce((s: number, r: any) => s + (r.windows?.driveSeconds ?? 0), 0) / reps.length;
}

describe("the drive window was fitted on thirteen sensor-paired sets", () => {
  it("is the value the sweep chose", () => {
    expect(DRIVE_ONSET_FRACTION).toBe(0.04);
    // The registry hands every one of the 269 filmable things a COPY of it, and the two may not
    // drift -- camera-tunables-are-a-copy.test.ts owns that check; this is the reason it matters
    // here: a refit that moved one and not the other would be invisible on every lift but one.
    // A lift with no entry of its own reads the copy. (The Bench Press read it from 2026-11-05,
    // when round four's 0.03 -- fitted on the lowering -- was removed, until 2026-11-10, when round
    // fourteen fitted 0.03 again on the DRIVES; see FITTED_OVERRIDE_EVIDENCE["Bench Press"].)
    expect(cameraTunablesFor("Incline Barbell Bench Press", "horizontal_press_or_row").values.driveOnsetFraction)
      .toBe(DRIVE_ONSET_FRACTION);
  });

  it("reads the concentric closer to the sensor than 0.07 did, across the corpus", () => {
    const errAt = (fraction: number) =>
      SETS.map((s) => {
        const m: any = replay(s.capture, fraction);
        expect(m, `${s.tag} produced no metrics`).toBeTruthy();
        return Math.abs(meanDriveSeconds(m) - sensorConcentricSeconds(s.ovr)) / sensorConcentricSeconds(s.ovr);
      });
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const shipped = median(errAt(DRIVE_ONSET_FRACTION));
    const previous = median(errAt(0.07));
    expect(shipped).toBeLessThan(previous);
    // THE 10-07 SWEEP WAS RUN ON THE LOWERINGS. The direction rule was inverted from 2026-09-30 to
    // 2026-11-05 (the-concentric-is-the-way-up.test.ts), so the "concentric duration" this fit
    // matched to the sensor's was the descent's. Until 2026-11-05 this case asserted the shipped
    // median under 0.1 and it was (0.059); on the DRIVES the same seven sets read the table below,
    // and 0.0 (the whole travel window) is the sweep's own minimum. The shared value is left at
    // 0.04 on purpose this round -- a constant refitted the same day a month of labels flipped is
    // how a bad one gets in, and Scott's order is per-lift steps -- and the Back Squat carries the
    // first drive-fitted window (0.02). The table is pinned so the refit, when it comes, is made
    // against numbers already written down rather than re-derived.
    expect(shipped).toBeCloseTo(DRIVE_TABLE_ON_THE_DRIVES[0.04], 2);
    expect(median(errAt(0))).toBeCloseTo(DRIVE_TABLE_ON_THE_DRIVES[0], 2);
    expect(median(errAt(0))).toBeLessThan(shipped);
  });

  it("CANNOT change which reps exist, at any fraction", () => {
    // The drive window is REPORTED; the travel window is what every phantom and rack-move filter
    // was fitted on. If this ever stops holding, the refit stopped being a reporting change and
    // became a segmentation change, which is a different review.
    for (const s of SETS) {
      const counts = new Set(
        [0.1, 0.07, 0.05, 0.04, 0.03, 0.02, 0.01].map(
          (f) => (replay(s.capture, f) as any).repBreakdown.length,
        ),
      );
      expect(counts.size, `${s.tag} changed its rep count with the drive fraction`).toBe(1);
    }
  });

  it("never withholds a number, whatever the fraction (Rule #1)", () => {
    for (const s of SETS) {
      for (const f of [0.1, 0.04, 0.01]) {
        const m: any = replay(s.capture, f);
        expect(m, `${s.tag} at ${f} returned nothing`).toBeTruthy();
        expect(m.repBreakdown.length).toBeGreaterThan(0);
        expect(Number.isFinite(m.meanVelocityMps)).toBe(true);
        expect(m.meanVelocityMps).toBeGreaterThan(0);
      }
    }
  });

  it("stays the SHARED default for every lift that has not been fitted apart -- and the squat's own is written down", () => {
    // The registry exists so a number fitted on one movement cannot leak to another. The 0.04 was
    // fitted ACROSS five movements and stays the shared default. The Bench Press (0.03, round four)
    // and the Barbell Shoulder Press (0.08 then 0.12, rounds five and seven) each carried their own;
    // all were fitted on the lowering and were removed 2026-11-05 (VELOCITY_OVERRIDES_REMOVED_2026_11_05).
    // The Back Squat carries the first window fitted on an actual drive (0.02 in round eight, the
    // whole travel window, 0, in round nine: five paired squats reading +2.0% on average at 0.02
    // and -0.4% at 0); the Romanian Deadlift took its own first step in round nine (0.04 -> 0.02)
    // and the whole window in round ten (0). Each is marked fitted, reaches its own lift, and
    // reaches nobody else -- the Conventional Deadlift shares the RDL's bucket and not its window.
    const squat = cameraTunablesFor("Back Squat", "squat");
    // 0 from round nine until round twelve (2026-11-09), which put it back to 0.02: at 0 the
    // reported window has no speed-based close at all, so a lockout the athlete stands in lands
    // inside the rep. See FITTED_OVERRIDE_EVIDENCE["Back Squat"].
    expect(squat.values.driveOnsetFraction).toBe(0.02);
    expect(squat.sources.driveOnsetFraction).toBe("fitted");
    const rdl = cameraTunablesFor("Romanian Deadlift", "deadlift");
    expect(rdl.values.driveOnsetFraction).toBe(0);
    expect(rdl.sources.driveOnsetFraction).toBe("fitted");
    // Round fourteen (2026-11-10): the bench 0.03, the dumbbell press 0.02, the single-arm row 0.02.
    for (const [name, value] of [["Bench Press", 0.03], ["Dumbbell Shoulder Press", 0.01], ["Single-Arm Dumbbell Row", 0.01]] as const) {
      const own = cameraTunablesFor(name, romBucketForExercise(name));
      expect(own.values.driveOnsetFraction, name).toBe(value);
      expect(own.sources.driveOnsetFraction, name).toBe("fitted");
    }
    for (const [name, bucket] of [["Barbell Shoulder Press", "overhead_press"], ["Conventional Deadlift", "deadlift"], ["Pendlay Row", "horizontal_press_or_row"], ["Front Squat", "squat"]]) {
      const other = cameraTunablesFor(name, bucket);
      expect(other.values.driveOnsetFraction, name).toBe(DRIVE_ONSET_FRACTION);
      expect(other.sources.driveOnsetFraction, name).not.toBe("fitted");
    }
  });
});
