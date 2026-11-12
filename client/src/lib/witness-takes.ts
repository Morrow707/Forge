import fs from "node:fs";
import path from "node:path";
import { ACCURACY_LEDGER, sensorScaleX1000, type LedgerRow } from "@shared/accuracy-ledger";
import type { WitnessTake } from "@shared/witness-memory";

/* EVERY SENSOR-PAIRED TAKE AS THE WITNESS MEMORY READS IT: the ledger row for what each ruler
 * said, and the export fixture the row came from for what the ledger does not carry -- each 3D
 * bone and the object detector's telemetry.
 *
 * A row is matched to its capture by the scale the phone shipped, which both hold to full
 * precision; nothing else in an export names a ledger row. A row with no fixture (the 10-04 to
 * 10-29 takes were sealed from what two tests kept) still contributes its rulers and says so by
 * carrying no bones and a null object -- never back-guessed (the ledger's own stated limit).
 *
 * Node only: read by a test and by scripts, never by a page (it reads the fixture directory). */

const FIXTURE_DIR = path.join(process.cwd(), "client/src/lib/__fixtures__");
const MAX_WALK_DEPTH = 4;
const SAME_SCALE_TOLERANCE = 1e-6;
const X1000 = 1000;
const PCT = 100;
const HALF = 2;

type Limb = { limb: string; scale: number; samples: number };
type Capture = {
  scaleFactor?: number;
  trackingDiagnostics: {
    calibration: { scaleFactor?: number; body3DRuler?: { limbs?: Limb[] } };
    objectSystem?: { coreMlClass?: string | null };
    objectDetection?: { framesWithCoreMlImplement?: number };
    objectLock?: { framesTracked?: number; framesLockHeld?: number } | null;
  };
};

const isCapture = (o: unknown): o is Capture =>
  typeof o === "object" && o !== null && "trackingDiagnostics" in o &&
  Boolean((o as Capture).trackingDiagnostics?.calibration);

function capturesIn(node: unknown, depth = 0): Capture[] {
  if (typeof node !== "object" || node === null || depth > MAX_WALK_DEPTH) return [];
  if (isCapture(node)) return [node];
  return Object.values(node).flatMap((child) => capturesIn(child, depth + 1));
}

function parsed(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), "utf8"));
  } catch {
    return null;
  }
}

export function fixtureCaptures(): Capture[] {
  return fs
    .readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => capturesIn(parsed(f)));
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / HALF);
  return s.length % HALF === 1 ? s[mid] : (s[mid - 1] + s[mid]) / HALF;
}

const errorPct = (scale: number, needed: number): number => (scale / needed - 1) * PCT;

function captureFor(row: LedgerRow, captures: readonly Capture[]): Capture | null {
  return (
    captures.find((c) => {
      const shipped = c.trackingDiagnostics.calibration.scaleFactor ?? c.scaleFactor;
      return shipped != null && Math.abs(shipped * X1000 - row.shippedScaleX1000) / row.shippedScaleX1000 < SAME_SCALE_TOLERANCE;
    }) ?? null
  );
}

/** A take's 3D bones as scales comparable with the sensor's: the export stores each bone before
 *  the stature correction, and the row's `body_3d` candidate is their median after it, so the
 *  ratio of the two is the correction this take applied. */
export function bonesOf(row: LedgerRow, capture: Capture | null): { limb: string; scale: number; samples: number }[] {
  const limbs = capture?.trackingDiagnostics.calibration.body3DRuler?.limbs ?? [];
  const body3d = row.candidates.find((c) => c.source === "body_3d");
  if (limbs.length === 0 || !body3d) return [];
  const correction = body3d.scaleX1000 / X1000 / median(limbs.map((l) => l.scale));
  return limbs.map((l) => ({ limb: l.limb, scale: l.scale * correction, samples: l.samples }));
}

export function witnessTakes(rows: readonly LedgerRow[] = ACCURACY_LEDGER): WitnessTake[] {
  const captures = fixtureCaptures();
  return rows.map((row) => {
    const needed = sensorScaleX1000(row) / X1000;
    const capture = captureFor(row, captures);
    const lock = capture?.trackingDiagnostics.objectLock ?? null;
    return {
      id: row.id,
      lift: row.exercise,
      rulers: row.candidates.map((c) => ({ source: c.source, errorPct: errorPct(c.scaleX1000 / X1000, needed) })),
      bones: bonesOf(row, capture).map((b) => ({ limb: b.limb, errorPct: errorPct(b.scale, needed) })),
      object: lock
        ? {
            asked: capture?.trackingDiagnostics.objectSystem?.coreMlClass ?? null,
            framesTracked: lock.framesTracked ?? 0,
            framesWithObject: capture?.trackingDiagnostics.objectDetection?.framesWithCoreMlImplement ?? 0,
            framesLockHeld: lock.framesLockHeld ?? 0,
          }
        : null,
    };
  });
}

export { captureFor };
