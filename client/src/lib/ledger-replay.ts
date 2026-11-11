import {
  candidatesAsFilmed,
  errorPctAgainstSensor,
  type LedgerRow,
} from "@shared/accuracy-ledger";
import {
  reconcileScaleEstimates,
  coreMlBoxUncertaintyForConfidence,
  CALIBRATION_REFERENCES,
} from "./pose-tracking";
import { postureForExercise, postureAllowsHeightCalibration, romBucketForExercise } from "./exercise-camera-profile";
import { cameraTunablesFor } from "@shared/camera-tunables-by-lift";

/* THE LEDGER REPLAY, moved out of the-ledger-replays-every-paired-take.test.ts on 2026-11-11 so
 * the same code that PINS every sealed take also SWEEPS a proposed setting across them
 * (scripts/sweep-lift-setting.ts). Two copies of a replay would be two measurements; this is one.
 *
 * WHY THE SWEEP EXISTS. Scott, 2026-11-11: "every week we start high, get it dialed in, then the
 * next week they are high again". The settings were holding -- the ledger proves it -- but each
 * week's step was chosen on that week's one or two takes, and the same lift reads 10-20% apart
 * between takes with nothing changed (bench 11-06 +2% against 11-10 -9% at one record). A step
 * chosen on one take is mostly that take's wobble. `errorPctFor` with a patch answers what a
 * proposed setting does to EVERY take of the lift, which is the number a step is chosen on now
 * (shared/lift-standing.ts holds the rule).
 *
 * Read by a test and a script, never by a page. */

/** A proposed change to one lift's scale settings: the four the replay reads. */
export type LedgerSettingsPatch = Partial<{
  heightRulerUncertainty: number;
  biacromialToleranceFraction: number;
  depthRulerUncertainty: number;
  body3DCorrectedUncertainty: number;
}>;

/** The live pipeline's uncertainty for a ruler, EVERY ONE READ BY NAME so a refit of any of the
 *  four reaches this file. The first draft typed `0.2` for the two 3D rulers, which is the same
 *  defect this file is about -- a frozen value beside live constants -- in the file that exists
 *  to catch it. `shoulder_width` takes BIACROMIAL_TOLERANCE_FRACTION because that is its FLOOR
 *  (e70cc096 made it `max(floor, spanSpreadFraction, gripFloor)`), and a sealed row carries no
 *  frames, so the floor is the most this replay can know. */
/* THE LIVE UNCERTAINTIES ARE THIS LIFT'S OWN, read off the registry exactly as the bar dialog
 * reads them, because since 2026-10-29 a lift can carry a FITTED_OVERRIDES entry and a replay
 * that read the module constants would certify a blend no phone produces -- the hybrid this
 * file exists to refuse, one layer up. The module constants are still imported and asserted
 * below so the registry's defaults cannot drift from them unnoticed. */
export function liveUncertainty(source: string, exercise: string, row?: LedgerRow, patch: LedgerSettingsPatch = {}): number {
  const t = { ...cameraTunablesFor(exercise, romBucketForExercise(exercise)).values, ...patch };
  if (source === "height") return t.heightRulerUncertainty;
  // The floor is the constant; the span's own spread on the day is a fact about the take, and the
  // phone states the larger of the two (the 10-30 row set 2 shipped at 0.317 over a 0.2 floor).
  if (source === "shoulder_width") return Math.max(t.biacromialToleranceFraction, row?.shoulderSpanSpreadFraction ?? 0);
  if (source === "depth") return t.depthRulerUncertainty;
  if (source === "plate") {
    // What `computeReferenceObjectScale` states for a bumper plate the detector boxed: the casting
    // tolerance over the nominal diameter, in quadrature with the detector's own measured noise.
    // The 2026-10-19 RDL set 2 row is the one take so far with a plate in the vote.
    const plate = CALIBRATION_REFERENCES.find((r) => r.id === "bumper_plate_perform_better");
    if (!plate) throw new Error("the bumper plate reference is gone from CALIBRATION_REFERENCES");
    // FLOORED BY THE BAND THIS TAKE'S OWN CONFIDENCE EARNED since 2026-10-31. Read off the row,
    // never a constant: the floor is a fact about the take in exactly the way the shoulder span's
    // spread is, and a replay through the pooled value alone would weight the 10-30 row's six
    // frames at 0.44 as if they were the bench's 205 at 0.93. A row with no plate in the vote
    // never reaches this branch, so the missing field decides nothing.
    return Math.hypot(
      plate.toleranceM / plate.nominalSizeM,
      coreMlBoxUncertaintyForConfidence(row?.plateMeanCoreMlConfidence ?? null),
    );
  }
  return t.body3DCorrectedUncertainty;
}

export function blendX1000(
  candidates: readonly { source: string; scaleX1000: number }[],
  uncertaintyFor: (source: string) => number,
): number {
  const verdict = reconcileScaleEstimates(
    candidates.map((c) => ({
      source: c.source as "body_3d",
      scale: c.scaleX1000 / 1000,
      uncertaintyFraction: uncertaintyFor(c.source),
    })),
  );
  if (verdict.scale == null) throw new Error("the blend returned no scale");
  return verdict.scale * 1000;
}

/** The take as the build that filmed it saw it. */
export function asFilmedX1000(row: LedgerRow): number {
  return blendX1000(candidatesAsFilmed(row), (s) => {
    const u = row.uncertaintiesAsFilmed[s];
    if (u == null) throw new Error(`${row.id}: no as-filmed uncertainty for "${s}"`);
    return u;
  });
}

/** The same candidates through the pipeline as it stands, posture gate included -- because a
 *  relabel moves a take as far as a refit does and is a different event. */
export function liveX1000(row: LedgerRow, patch: LedgerSettingsPatch = {}): number {
  const heightVotesToday = postureAllowsHeightCalibration(postureForExercise(row.exercise));
  // THE STATURE YARDSTICK RUNS EXACTLY WHERE THE HEIGHT RULER VOTES (2026-11-06), so a candidate it
  // convicted on a posture where it no longer runs is admitted today; a grip refusal stands, since
  // a sealed row carries no span to re-judge it with. See LedgerRow.rejectedAsFilmed.
  const stillRefused = new Set(
    (row.rejectedAsFilmed ?? [])
      .filter((r) => r.yardstick === "grip" || heightVotesToday)
      .map((r) => r.source),
  );
  const candidates = (heightVotesToday
    ? row.candidates
    : row.candidates.filter((c) => c.source !== "height")
  ).filter((c) => !stillRefused.has(c.source));
  return blendX1000(candidates, (s) => liveUncertainty(s, row.exercise, row, patch));
}

/** The take's error against its sensor, in per cent, through the live pipeline with an optional
 *  proposed patch to its lift's settings. */
export function errorPctFor(row: LedgerRow, patch: LedgerSettingsPatch = {}): number {
  return errorPctAgainstSensor(liveX1000(row, patch), row);
}
