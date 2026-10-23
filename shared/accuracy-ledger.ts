/** THE ACCURACY LEDGER: one row per sensor-paired take, carrying its INPUTS beside its error.
 *
 * CLAUDE.md asked for this on 2026-10-19 and named the failure it exists to stop: "an RDL that
 * read -3.7% on 10-08 reads +12.0% today with no code change between them ... invisible to every
 * test because no test has a height on file." A camera comparison is a function of its inputs,
 * and every input but the candidate scales was being thrown away the moment the session ended.
 *
 * WHAT WENT WRONG WITHOUT IT, measured 2026-10-23 and the reason this file exists in this shape.
 * Two pinned OVR guards -- `height-ruler-uncertainty.test.ts` and
 * `four-lifts-beside-ovr-2026-10-05.test.ts` -- each hand-rolled a blend from their take's real
 * candidate scales, typed the shoulder ruler's uncertainty as a literal `0.1`, and imported
 * `HEIGHT_RULER_UNCERTAINTY` by name. Both halves were defensible on the day they were written
 * and together they are neither thing:
 *
 *   - the `0.1` is CORRECT HISTORY. `BIACROMIAL_TOLERANCE_FRACTION` was 0.1 from 2026-09-09
 *     (2a19782c) until e70cc096 on 2026-10-06 moved it to 0.2 and made it a FLOOR, and all four
 *     rows below reproduce their shipped scale to 0.0000% at the uncertainties recorded here.
 *     Deleting that literal as "stale" -- which a review proposed -- would have replaced four
 *     faithful records with four fictions.
 *   - and the imported constant is LIVE, so a refit of it silently rewrote a sealed comparison.
 *
 * So each guard asserted a HYBRID: the 10-04 squat read -7.98% as filmed and reads -5.97% today,
 * and the guard asserts +1.21%. No build ever produced that number. The assertion passed 5/5
 * throughout and could not have failed, because the one input a refit can reach was pinned by
 * hand and the one it could not was read live.
 *
 * THE RULE THIS FILE ENFORCES: a sealed take states EVERY uncertainty it was measured with, and
 * is replayed twice -- once as filmed, which must reproduce the scale the phone actually shipped,
 * and once through the live constants, whose answer is RECORDED here. The first proves the row is
 * a record rather than a reconstruction. The second is the ratchet: a refit moves `liveErrorPct`,
 * the replay goes red, and updating it is how a constant's cost on every already-measured take
 * becomes visible in the diff instead of seventeen days later.
 *
 * It records and gates nothing (Rule #1): no capture is refused, no number is corrected, and
 * `FITTED_OVERRIDES` stays empty. A ledger is a mechanism, not a fitted number, so it is SHARED
 * across every movement -- the test CLAUDE.md's own "what 'its own numbers' means" section sets.
 *
 * NO IMPORTS ON PURPOSE. The replay needs `reconcileScaleEstimates` from
 * `client/src/lib/pose-tracking.ts`, which `bundle-budget.test.ts` keeps out of the eager entry;
 * importing it from `shared/` would be a route into that bundle for every page. The data lives
 * here, where the server's export can read it too, and the replay lives in the client test beside
 * the pipeline it replays.
 */

/** A ruler that voted on a take's scale. The string, not a union of the pipeline's type, because
 *  a ledger row is a historical record and a source retired from the pipeline must stay readable
 *  in the rows that used it. */
export type LedgerRulerSource = string;

export type LedgerCandidate = {
  readonly source: LedgerRulerSource;
  /** Metres per unit x1000, exactly as `trackingDiagnostics.calibration.scaleCandidates` carries
   *  it. Scaled by a thousand only so the digits are readable in a diff. */
  readonly scaleX1000: number;
};

export type LedgerRow = {
  /** Stable, sortable, and the thing a note or a commit message cites. */
  readonly id: string;
  /** The day it was filmed, not the day the row was written. */
  readonly date: string;
  /** The iOS build on the phone, from the run list. Null where it was not recorded. */
  readonly build: number | null;
  readonly exercise: string;
  /** The commit the take was filmed ON -- what makes the uncertainties below checkable. */
  readonly filmedOnCommit: string;

  /** Every candidate the blend was handed, as the export carries them. */
  readonly candidates: readonly LedgerCandidate[];
  /** WHAT EACH RULER STATED ON THE DAY. The half that was being thrown away: without it a row
   *  cannot be replayed, and a replay that borrows today's value is not a record of anything. */
  readonly uncertaintiesAsFilmed: Readonly<Record<LedgerRulerSource, number>>;
  /** Whether the height ruler voted. It is a separate fact from its uncertainty, because a
   *  posture LABEL decides it: both RDLs below shipped WITH a height ruler, and the hinge fix of
   *  2026-10-05 means today's pipeline would not admit one at all. A refit and a relabel move a
   *  take by similar amounts and are not the same event. */
  readonly heightRulerVotedAsFilmed: boolean;

  /** The scale the phone really used, x1000. The replay must reproduce this. */
  readonly shippedScaleX1000: number;
  /** What the app reported, and what the sensor beside it read. Their ratio is the only thing
   *  that turns a scale into an error, and neither number alone is enough. */
  readonly reportedRomCm: number;
  readonly sensorRomCm: number;

  /** RECOMPUTED, NEVER FITTED: the error the LIVE constants produce on this take's own
   *  candidates today, in per cent. A refit moves it, the replay goes red, and the diff shows
   *  what the refit cost on every take already measured against a sensor. It is not a target --
   *  nothing is tuned to make it smaller. */
  readonly liveErrorPct: number;

  /** Why this row is here and what it is evidence of. Read in a diff, so it has to stand alone. */
  readonly notes: string;
};

/** The scale the sensor's own range of motion requires: what the app used, corrected by how
 *  wrong its range of motion was. Every error figure in this file goes through here. */
export function sensorScaleX1000(row: LedgerRow): number {
  return row.shippedScaleX1000 * (row.sensorRomCm / row.reportedRomCm);
}

/** A blended scale (x1000) as a per-cent error against this take's sensor. */
export function errorPctAgainstSensor(blendedX1000: number, row: LedgerRow): number {
  return (blendedX1000 / sensorScaleX1000(row) - 1) * 100;
}

/** The rulers a row actually blended, after the height ruler's own admission. */
export function candidatesAsFilmed(row: LedgerRow): readonly LedgerCandidate[] {
  return row.heightRulerVotedAsFilmed
    ? row.candidates
    : row.candidates.filter((c) => c.source !== "height");
}

/* THE ROWS.
 *
 * Four, reconstructed on 2026-10-23 from the two pinned guards' own fixtures -- which are real
 * export numbers, not hand-rolled, and which each reproduce their shipped scale exactly here.
 *
 * STATED LIMIT, so the file is not read as more complete than it is: these four were rebuilt
 * from what those two tests happened to keep, so they carry the candidates, the uncertainties and
 * the two ranges of motion and NOT the rest of what a row should hold -- the athlete's height on
 * file, `spanSpreadFraction`, the grip ratio, `cadenceHeld`, the rep count. Those are in the
 * export and are to be filled in for the next take filmed beside a sensor, not back-guessed for
 * these. A row added from a live export carries them; `heightInOnFile` is deliberately absent
 * rather than assumed, because an invented input is worse than a missing one.
 *
 * AND THE 2026-10-19 SESSION -- THE ONE SCOTT ACTUALLY FILMED -- IS NOT HERE, DELIBERATELY.
 * Its three takes are the rows this file most wants, and `docs/camera-tracking-notes.md` records
 * real candidate scales for two of them (Back Squat set 2: height 0.00339639, shoulder_width
 * 0.00433825, body_3d 0.00412932; RDL set 2: shoulder_width 0.00402663, body_3d 0.00403251,
 * plate 0.00205555, required 0.00359453). **They are not enough for a row, and the replay would
 * have caught it rather than me.** That `body_3d` is the POST-COLLAPSE witness -- the geometric
 * mean of the raw body_3d and depth candidates, which vote once (Rule #2, build 578) -- so the
 * raw `depth` is missing, and with it any chance of reproducing the scale the phone shipped. A
 * row that cannot be replayed is the fiction this file exists to refuse, so prose is not a
 * source for one.
 *
 * WHAT THE NEXT EXPORT HAS TO YIELD for each sensor-paired take, so the entry is mechanical:
 * `calibration.scaleCandidates` (the RAW rows, before the collapse -- `calibration.scaleBlend`
 * carries `blendTrace.inputs`, which is exactly that), `calibration.scaleBlend.rulerUncertainties`
 * (the uncertainty each ruler stated ON THE DAY -- the half that keeps going missing), the take's
 * `scaleFactor`, the reported range of motion and the sensor's own reading, plus
 * `calibration.posture` and `heightIn`. Everything but the sensor's number is already in the
 * admin capture download.
 */
export const ACCURACY_LEDGER: readonly LedgerRow[] = [
  {
    id: "2026-10-04-back-squat",
    date: "2026-10-04",
    build: 609,
    exercise: "Back Squat",
    filmedOnCommit: "9503d966",
    candidates: [
      { source: "body_3d", scaleX1000: 3.969567544340341 },
      { source: "depth", scaleX1000: 4.644838614278044 },
      { source: "height", scaleX1000: 3.3809652356778645 },
      { source: "shoulder_width", scaleX1000: 4.59032418468343 },
    ],
    // HEIGHT_RULER_UNCERTAINTY was 0.05 until 812becb7 (2026-10-05) and
    // BIACROMIAL_TOLERANCE_FRACTION was 0.1 until e70cc096 (2026-10-06).
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.05, shoulder_width: 0.1 },
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 3.6547947529533787,
    reportedRomCm: 68.0,
    sensorRomCm: 73.9,
    liveErrorPct: -5.97,
    notes:
      "The take HEIGHT_RULER_UNCERTAINTY was refit on: at 0.05 the height ruler held 400 units " +
      "of inverse-variance weight against the 3D ruler's 25, so the blend WAS the height ruler " +
      "and the height ruler was the lowest candidate. Read 8.0% low as filmed. The refit to 0.1 " +
      "and the shoulder floor to 0.2 together take it to -6.0%; the 2.0 points are real and the " +
      "+1.2% its own guard asserted was a blend no build produced.",
  },
  {
    id: "2026-10-04-romanian-deadlift",
    date: "2026-10-04",
    build: 609,
    exercise: "Romanian Deadlift",
    filmedOnCommit: "9503d966",
    candidates: [
      { source: "body_3d", scaleX1000: 3.388318439849525 },
      { source: "depth", scaleX1000: 4.113168590661936 },
      { source: "height", scaleX1000: 3.2753940478179103 },
      { source: "shoulder_width", scaleX1000: 3.990397918112161 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.05, shoulder_width: 0.1 },
    // A hinge was classified "standing" until 2026-10-05, so it was offered a stature span
    // measured across a torso that is not upright, and took it.
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 3.43338517946498,
    reportedRomCm: 54.7,
    sensorRomCm: 59.4,
    liveErrorPct: 3.58,
    notes:
      "Read 7.9% low as filmed. Today's pipeline admits NO height ruler here -- the hinge is " +
      "bent_over since 2026-10-05 -- and that relabel plus the shoulder floor take it to +3.6%, " +
      "which crosses zero. The largest live move of the four, and it is a LABEL rather than a " +
      "fitted number, which is the shape CLAUDE.md says to prefer.",
  },
  {
    id: "2026-10-05-back-squat",
    date: "2026-10-05",
    build: 620,
    exercise: "Back Squat",
    filmedOnCommit: "660b025d",
    candidates: [
      { source: "body_3d", scaleX1000: 4.3906832628553705 },
      { source: "depth", scaleX1000: 6.182978508470917 },
      { source: "height", scaleX1000: 3.468957241363022 },
      { source: "shoulder_width", scaleX1000: 5.263465218260532 },
    ],
    // Filmed after 812becb7 refit the height ruler and before e70cc096 floored the shoulder.
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.1, shoulder_width: 0.1 },
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 4.460001794224457,
    reportedRomCm: 78.1,
    sensorRomCm: 73.7,
    liveErrorPct: -3.58,
    notes:
      "The control for the hinge fix: a standing lift keeps its height ruler, so dropping that " +
      "ruler reads 24% HIGH and the fix had to leave this take alone. Read +6.0% as filmed and " +
      "-3.6% today, the whole move being the shoulder floor 0.1 -> 0.2. It changed sign, so " +
      "'the squat is high' and 'the squat is low' are both true of this one take depending on " +
      "which build is asked, which is exactly what Rule #5 is about.",
  },
  {
    id: "2026-10-05-romanian-deadlift",
    date: "2026-10-05",
    build: 620,
    exercise: "Romanian Deadlift",
    filmedOnCommit: "660b025d",
    candidates: [
      { source: "body_3d", scaleX1000: 3.385283084489443 },
      { source: "depth", scaleX1000: 4.393551787195805 },
      { source: "height", scaleX1000: 3.4297664588115316 },
      { source: "shoulder_width", scaleX1000: 4.12703743774313 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.1, shoulder_width: 0.1 },
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 3.7870913839708666,
    reportedRomCm: 60.0,
    sensorRomCm: 64.5,
    liveErrorPct: -1.95,
    notes:
      "The take the hinge fix was made on: the height ruler read 16% below the scale the sensor " +
      "requires while carrying 44.4% of the weight, and dropping it took the take from -7.0% to " +
      "0.0% on that build. It reads -2.0% today, the extra 2 points being the shoulder floor -- " +
      "so the '0.0%' in the note is a fact about build 620 and not a standing property.",
  },
];

/** Every take filmed on a given day, in the order they were added. */
export function ledgerRowsOn(date: string): readonly LedgerRow[] {
  return ACCURACY_LEDGER.filter((r) => r.date === date);
}

export function ledgerRow(id: string): LedgerRow {
  const row = ACCURACY_LEDGER.find((r) => r.id === id);
  if (!row) throw new Error(`No accuracy-ledger row "${id}"`);
  return row;
}
