import fs from "node:fs";
import path from "node:path";
import { ACCURACY_LEDGER, type LedgerRow } from "@shared/accuracy-ledger";
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
import { errorPctFor } from "./ledger-replay";
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
 *  when the plate keeps too few boxes at these settings to state a scale.
 *
 *  THE REPLAY DOES WHAT THE PHONE DID, EXCEPT FOR THE ONE THING BEING LEARNED (round twenty-six).
 *  The first version put the plate into the vote on every take and blended through its own
 *  uncertainty table, so it ran a different pipeline from the ledger: it admitted plates the phone
 *  had refused for reasons outside overwatch's three checks (the 11-23 RDL set 2: +102% where the
 *  phone read about -6%), and it left out the remembered bones' vote (the RDL set 4). Now the plate
 *  is rebuilt only where the phone let a plate reach the blend, and the rest of the take goes
 *  through the ledger's own live replay (ledger-replay.ts: posture gate, refusals, the bones, the
 *  take's grip floor), so at the settings the phone ran the replay lands where the ledger does. */
export function errorPctWithOverwatch(row: LedgerRow, log: OverwatchFrameLog, settings: OverwatchSettings): number | null {
  const shippedPlate = row.candidates.find((c) => c.source === PLATE);
  if (!shippedPlate) return errorPctFor(row);
  const replay = replayFrameLog(log, settings, true);
  if (replay.medianEdgePx == null) return null;
  // THE REPLAY'S OWN MISS IS MEASURED AND CARRIED, NOT A REASON TO DROP THE TAKE. The frame log
  // keeps every box overwatch judged, and the phone's plate median also leaves out boxes for
  // reasons the log does not record, so on the 11-24 bench the plate rebuilt at the phone's own
  // settings read 5.2% away from the plate that shipped. That ratio is how wrong the replay is
  // about THIS take; scaling every setting's plate by it makes the current settings reproduce the
  // phone exactly, and leaves what a setting CHANGES -- which boxes overwatch keeps -- to move it.
  const atCurrent = replayFrameLog(log, currentOverwatchSettings(row.exercise), true);
  const correction =
    atCurrent.medianEdgePx != null ? shippedPlate.scaleX1000 / ((plateDiameterM() / atCurrent.medianEdgePx) * X1000) : 1;
  const plateX1000 = (plateDiameterM() / replay.medianEdgePx) * X1000 * correction;
  return errorPctFor({
    ...row,
    candidates: [...row.candidates.filter((c) => c.source !== PLATE), { source: PLATE, scaleX1000: plateX1000 }],
  });
}

/** HOW FAR THE REPLAY AT TODAY'S SETTINGS MAY SIT FROM THE LEDGER'S OWN LIVE ERROR, in points.
 *
 *  A REPLAY THAT CANNOT REPRODUCE THE TAKE MAY NOT TEACH FROM IT (round twenty-six, 2026-11-24).
 *  The replay re-judges only overwatch's three checks and then puts the plate into the vote; the
 *  phone also refuses a plate for reasons the frame log does not carry (size against the grip, a
 *  plate nobody agrees with stepping out). On the 11-23 RDL set 2 the phone refused its plate and
 *  read about -6%; the replay admitted it and read +102% at the very settings the phone ran, so
 *  every "better" setting the learner found was better than a take that never happened, and it
 *  proposed a new RDL version on that. At the settings a take was filmed with, its replay has to
 *  land where the ledger says that take lands today, or the take is recorded and not learned from. */
export const MAX_REPLAY_DISAGREEMENT_PCT = 0.5;

export type UnreproducibleTake = { id: string; exercise: string; replayPct: number | null; ledgerPct: number };

function takesWithLogs(rows: readonly LedgerRow[]): { row: LedgerRow; log: OverwatchFrameLog }[] {
  const captures = fixtureCaptures();
  return rows.flatMap((row) => {
    const capture = captureForRow(row, captures);
    const log = capture ? plateFrameLog(capture) : null;
    return log ? [{ row, log }] : [];
  });
}

function reproduces(row: LedgerRow, log: OverwatchFrameLog): { ok: boolean; replayPct: number | null } {
  const replayPct = errorPctWithOverwatch(row, log, currentOverwatchSettings(row.exercise));
  return { ok: replayPct != null && Math.abs(replayPct - row.liveErrorPct) <= MAX_REPLAY_DISAGREEMENT_PCT, replayPct };
}

export function learnableTakes(rows: readonly LedgerRow[] = ACCURACY_LEDGER): LearnableTake[] {
  return takesWithLogs(rows).flatMap(({ row, log }) =>
    reproduces(row, log).ok
      ? [{ id: row.id, exercise: row.exercise, errorPct: (s: OverwatchSettings) => errorPctWithOverwatch(row, log, s) }]
      : [],
  );
}

/** The takes that carry overwatch's record and that the replay cannot reproduce: named in the
 *  learner's output so a take left out is a stated fact, never a silent one. */
export function unreproducibleTakes(rows: readonly LedgerRow[] = ACCURACY_LEDGER): UnreproducibleTake[] {
  return takesWithLogs(rows).flatMap(({ row, log }) => {
    const r = reproduces(row, log);
    return r.ok ? [] : [{ id: row.id, exercise: row.exercise, replayPct: r.replayPct, ledgerPct: row.liveErrorPct }];
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
