import fs from "node:fs";
import path from "node:path";
import { ACCURACY_LEDGER, errorPctAgainstSensor, type LedgerRow } from "@shared/accuracy-ledger";
import { cameraTunablesFor } from "@shared/camera-tunables-by-lift";
import {
  learnLift,
  overwatchSettingsFor,
  replayFrameLog,
  type LearnableTake,
  type LiftLearning,
  type OverwatchFrameLog,
  type OverwatchSettings,
} from "@shared/overwatch-learning";
import { blendX1000, liveUncertainty } from "./ledger-replay";
import { romBucketForExercise } from "./exercise-camera-profile";
import { CALIBRATION_REFERENCES } from "./pose-tracking";

/* SCORING AN OVERWATCH SETTING AGAINST THE OVR, on every sensor-paired take that recorded what
 * overwatch measured (shared/overwatch-learning.ts says why and what the replay can and cannot
 * see).
 *
 * A take is learnable when its ledger row (the OVR's truth and every ruler the blend was handed)
 * matches an export fixture whose plate log carries `frames` -- written by the phone from build
 * 2026-11-23 on. For a setting, the plate's frames are re-judged, the plate's scale is rebuilt
 * from the median box it keeps, and the take's whole blend is re-run through the live pipeline
 * with that plate in place of the one that shipped. The plate is the only object that votes in
 * the scale today, so a take whose object was a dumbbell or a bar is recorded and not scored.
 *
 * Node only (reads the fixture directory): a test and scripts/overwatch-learn.ts, never a page. */

const FIXTURE_DIR = path.join(process.cwd(), "client/src/lib/__fixtures__");
const X1000 = 1000;
const MAX_WALK_DEPTH = 4;
const PLATE = "plate";
/** A row is matched to its capture by the scale the phone shipped, as witness-takes.ts does. */
const SAME_SCALE_TOLERANCE = 1e-6;

type LoggedCapture = {
  scaleFactor?: number;
  trackingDiagnostics: {
    calibration: { scaleFactor?: number };
    objectSystem?: { coreMlClass?: string | null; secondaryCoreMlClass?: string | null };
    objectLock?: { frames?: OverwatchFrameLog } | null;
    objectLockSecondary?: { frames?: OverwatchFrameLog } | null;
  };
};

const isCapture = (o: unknown): o is LoggedCapture =>
  typeof o === "object" && o !== null && "trackingDiagnostics" in o &&
  Boolean((o as LoggedCapture).trackingDiagnostics?.calibration);

function capturesIn(node: unknown, depth = 0): LoggedCapture[] {
  if (typeof node !== "object" || node === null || depth > MAX_WALK_DEPTH) return [];
  if (isCapture(node)) return [node];
  return Object.values(node).flatMap((child) => capturesIn(child, depth + 1));
}

function fixtureCaptures(): LoggedCapture[] {
  return fs
    .readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => {
      try {
        return capturesIn(JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, f), "utf8")));
      } catch {
        return [];
      }
    });
}

/** The plate's per-frame log on this capture, from whichever detector was asked for a plate. */
export function plateFrameLog(capture: LoggedCapture): OverwatchFrameLog | null {
  const sys = capture.trackingDiagnostics.objectSystem;
  if (sys?.coreMlClass === PLATE) return capture.trackingDiagnostics.objectLock?.frames ?? null;
  if (sys?.secondaryCoreMlClass === PLATE) return capture.trackingDiagnostics.objectLockSecondary?.frames ?? null;
  return null;
}

function captureForRow(row: LedgerRow, captures: readonly LoggedCapture[]): LoggedCapture | null {
  return (
    captures.find((c) => {
      const shipped = c.trackingDiagnostics.calibration.scaleFactor ?? c.scaleFactor;
      return shipped != null && Math.abs(shipped * X1000 - row.shippedScaleX1000) / row.shippedScaleX1000 < SAME_SCALE_TOLERANCE;
    }) ?? null
  );
}

function plateDiameterM(): number {
  const plate = CALIBRATION_REFERENCES.find((r) => r.id === "bumper_plate_perform_better");
  if (!plate) throw new Error("the bumper plate reference is gone from CALIBRATION_REFERENCES");
  return plate.nominalSizeM;
}

/** This take's error against the OVR, in per cent, with the plate rebuilt at these settings. Null
 *  when the plate keeps too few boxes at these settings to state a scale. */
export function errorPctWithOverwatch(row: LedgerRow, log: OverwatchFrameLog, settings: OverwatchSettings): number | null {
  const replay = replayFrameLog(log, settings, true);
  if (replay.medianEdgePx == null) return null;
  const plateX1000 = (plateDiameterM() / replay.medianEdgePx) * X1000;
  const candidates = [
    ...row.candidates.filter((c) => c.source !== PLATE),
    { source: PLATE, scaleX1000: plateX1000 },
  ];
  const blended = blendX1000(candidates, (s) => liveUncertainty(s, row.exercise, row));
  return errorPctAgainstSensor(blended, row);
}

export function learnableTakes(rows: readonly LedgerRow[] = ACCURACY_LEDGER): LearnableTake[] {
  const captures = fixtureCaptures();
  return rows.flatMap((row) => {
    const capture = captureForRow(row, captures);
    const log = capture ? plateFrameLog(capture) : null;
    if (!log) return [];
    return [{ id: row.id, exercise: row.exercise, errorPct: (s: OverwatchSettings) => errorPctWithOverwatch(row, log, s) }];
  });
}

/** The settings each lift is running on today: its newest learned version, else the registry. */
export function currentOverwatchSettings(exercise: string): OverwatchSettings {
  const { values } = cameraTunablesFor(exercise, romBucketForExercise(exercise));
  return overwatchSettingsFor(exercise, values).settings;
}

/** Per lift on record, what the learner would do with what is recorded today. */
export function overwatchLearnings(takes: LearnableTake[] = learnableTakes()): LiftLearning[] {
  const lifts = [...new Set(ACCURACY_LEDGER.map((r) => r.exercise))].sort();
  return lifts.map((lift) =>
    learnLift(
      lift,
      takes.filter((t) => t.exercise === lift),
      currentOverwatchSettings(lift),
    ),
  );
}
