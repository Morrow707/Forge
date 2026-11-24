/**
 * EVERY STORED TAKE, REPLAYED AS A 5'1" AND A 6'6" ATHLETE (2026-11-24).
 *
 * Scott can only film himself (75in), and the camera has to read right for "anyone, 5'1" to 6'6",
 * first try". So every bar take on file is rescaled -- the trace and the height both multiplied by
 * k = 61/75 and 78/75, the same lift on a smaller or bigger body at the same tempo -- and replayed
 * through the real summariser. A pipeline with no body-size assumption in it returns the same rep
 * count and a range of motion exactly k times the original.
 *
 * What it found: three thresholds were written in metres and fitted on the 75in athlete -- the
 * travel margin, the 8cm floor of the relative rep gate, and the smoother's noise -- so a short
 * athlete's reps were trimmed by a bigger share. They scale by statureRatioToCalibrationAthlete
 * now (1 for every take on file, so nothing measured moves). Worst range-of-motion error across
 * the runs went from 23% to 10%, and the 10% is one of the takes below.
 *
 * WHAT IT CANNOT SEE, said plainly: real bodies are not scaled copies. A short athlete's arm-to-
 * torso proportions differ, and so do Vision's landmark errors on a smaller figure in the frame.
 * The rulers built on body FRACTIONS (height, shoulder) are invariant by construction and so are
 * not tested here; whether those fractions hold for a given person is what the LiDAR floor ruler
 * and the plate exist to check, on the take itself.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { replayCapture, type StoredCapture } from "./capture-replay";
import { CALIBRATION_ATHLETE_HEIGHT_IN, statureRatioToCalibrationAthlete } from "./bar-tracking";

const SHORT_IN = 61;
const TALL_IN = 78;
const FACTORS = [SHORT_IN / CALIBRATION_ATHLETE_HEIGHT_IN, TALL_IN / CALIBRATION_ATHLETE_HEIGHT_IN];
const MEDIAN_ROM_TOLERANCE = 0.005;
const P90_ROM_TOLERANCE = 0.01;
const P90 = 0.9;
const HALF = 0.5;
/** Takes whose own tracking is already broken, where a different body size tips a fragile split.
 *  This list only shrinks: a take that becomes invariant must leave it, and a new one fails. */
const KNOWN_SIZE_SENSITIVE = new Set([
  "bench-2026-09-29-set2-rerack", // the re-rack read as reps: a speed rule, see the notes
  "bench-set7-2026-09-29-b573",
  "2026-11-06 Single-Arm Dumbbell Row set 1", // the working-hand midpoint take, 12 phases for 8 reps
  "2026-11-24-bench-press", // Vision lost the body at the chest on every press
]);

const dir = join(process.cwd(), "client/src/lib/__fixtures__");
const captures: StoredCapture[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, f), "utf8"));
    return (Array.isArray(parsed) ? parsed : [parsed]) as StoredCapture[];
  })
  .filter((c) => c && Array.isArray(c.barPathTrace));

function asBody(c: StoredCapture, k: number): StoredCapture {
  return {
    ...c,
    heightIn: c.heightIn ? c.heightIn * k : c.heightIn,
    barPathTrace: c.barPathTrace.map((p) => ({ ...p, x: p.x * k, y: p.y * k })),
  };
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)];
}

const runs = captures.flatMap((c) => {
  const base = replayCapture(c);
  if (!base.metrics) return [];
  return FACTORS.map((k) => {
    const r = replayCapture(asBody(c, k));
    return {
      id: String(c.setId ?? ""),
      countChanged: r.repCount !== base.repCount,
      romError:
        r.metrics?.romCm != null && base.metrics?.romCm ? Math.abs(r.metrics.romCm / base.metrics.romCm / k - 1) : 1,
    };
  });
});

describe("the bar pipeline reads a 5'1\" and a 6'6\" athlete like the athlete it was fitted on", () => {
  it("is the identity for the calibration athlete, so no take on file moves", () => {
    expect(statureRatioToCalibrationAthlete(CALIBRATION_ATHLETE_HEIGHT_IN)).toBe(1);
    expect(statureRatioToCalibrationAthlete(null)).toBe(1);
  });

  it("has a corpus", () => {
    expect(runs.length).toBeGreaterThan(100);
  });

  it("returns the same rep count on every take but the known fragile ones", () => {
    const changed = [...new Set(runs.filter((r) => r.countChanged).map((r) => r.id))];
    expect(changed.filter((id) => !KNOWN_SIZE_SENSITIVE.has(id))).toEqual([]);
    // And the list only shrinks: a take that stopped moving has to come off it.
    expect([...KNOWN_SIZE_SENSITIVE].filter((id) => !changed.includes(id))).toEqual([]);
  });

  it("scales the range of motion with the body: median within 0.5%, nine in ten within 1%", () => {
    const errors = runs.map((r) => r.romError);
    expect(quantile(errors, HALF)).toBeLessThan(MEDIAN_ROM_TOLERANCE);
    expect(quantile(errors, P90)).toBeLessThan(P90_ROM_TOLERANCE);
  });
});
