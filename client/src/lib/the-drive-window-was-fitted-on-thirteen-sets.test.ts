import { describe, it, expect } from "vitest";
import { summarizeTrackedSet, DRIVE_ONSET_FRACTION } from "./bar-tracking";
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
const STORED = { x: 0, y: 1 };
const VERTICAL = { x: 0, y: -1 };

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
    expect(cameraTunablesFor("Bench Press", "horizontal_press_or_row").values.driveOnsetFraction)
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
    // Stated as an absolute bar too, so a future change that makes BOTH worse while keeping the
    // inequality cannot pass.
    expect(shipped).toBeLessThan(0.1);
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

  it("stays a SHARED default -- no lift has been given its own", () => {
    // The registry exists so a number fitted on one movement cannot leak to another. This one was
    // fitted ACROSS five movements and is a property of how a bar sensor defines a concentric, so
    // it belongs in the shared default and not in an override. See CLAUDE.md.
    const bench = cameraTunablesFor("Bench Press", "horizontal_press_or_row");
    const squat = cameraTunablesFor("Back Squat", "squat");
    expect(bench.values.driveOnsetFraction).toBe(squat.values.driveOnsetFraction);
    expect(bench.sources.driveOnsetFraction).not.toBe("fitted");
    expect(squat.sources.driveOnsetFraction).not.toBe("fitted");
  });
});
