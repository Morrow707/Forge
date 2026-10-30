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

  /** The scale the phone really used, x1000. The replay must reproduce this -- unless
   *  `shippedUnderDefect` names the rule that produced it and has since been fixed. */
  readonly shippedScaleX1000: number;
  /** SET ONLY WHEN THE SHIPPED SCALE CAME OUT OF A RULE THAT WAS WRONG AND IS GONE. A mechanism
   *  fix is the one change the as-filmed replay cannot absorb: the inputs are sealed, the rule is
   *  not, and a row whose shipped number depended on the old rule will never replay to it again.
   *  Such a row keeps its shipped scale as history and says here which rule made it, and the
   *  replay asserts the OPPOSITE of the usual check -- that the fixed pipeline no longer
   *  reproduces the defect. Never set this to excuse a row that simply does not replay. */
  readonly shippedUnderDefect?: string;
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
    liveErrorPct: -4.81,
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
    liveErrorPct: -0.16,
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
    liveErrorPct: -1.74,
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
    liveErrorPct: -6.64,
    notes:
      "The take the hinge fix was made on: the height ruler read 16% below the scale the sensor " +
      "requires while carrying 44.4% of the weight, and dropping it took the take from -7.0% to " +
      "0.0% on that build. It reads -2.0% today, the extra 2 points being the shoulder floor -- " +
      "so the '0.0%' in the note is a fact about build 620 and not a standing property.",
  },
  /* THE 2026-10-19 SESSION, from the admin capture export Scott attached on 2026-10-29 -- the
   * rows the note above said were missing, entered mechanically from `calibration.scaleBlend.inputs`
   * (the RAW rows before the 3D-pose collapse, uncertainties as stated on the day) and
   * `calibration.scaleFactor`. The sensor's range of motion is the OVR's, converted from inches,
   * as docs/camera-tracking-notes.md "Three lifts beside OVR, 2026-10-19" records it. Filmed on
   * build 673 (34574c60); the camera pipeline on it is e40ea299's. `heightIn` was 75 on every row.
   * The shoulder ruler's uncertainty on both squats is the GRIP FLOOR's answer (grip/shoulder 2.49
   * and 2.57 against a 1.85 ceiling), which is why it is not the 0.2 floor; the live replay can
   * only know the floor, so `liveErrorPct` on those two rows is the blend at 0.2, not at what
   * the frames would loosen it to. */
  {
    id: "2026-10-19-back-squat-set-1",
    date: "2026-10-19",
    build: 673,
    exercise: "Back Squat",
    filmedOnCommit: "34574c60",
    candidates: [
      { source: "body_3d", scaleX1000: 3.95753 },
      { source: "depth", scaleX1000: 4.15814 },
      { source: "height", scaleX1000: 3.24164 },
      { source: "shoulder_width", scaleX1000: 4.19401 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.1, shoulder_width: 0.3483303821163719 },
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 3.4534573167314636,
    reportedRomCm: 70.6,
    sensorRomCm: 74.6,
    liveErrorPct: -2.04,
    notes:
      "First session with a height on file (75in). Read -5.3% as filmed. The height ruler carried " +
      "75% of the weight and read 7.5% LOW against the sensor's scale; body_3d read +12.9% and " +
      "shoulder_width +19.6% HIGH. The blend lands because two biases of opposite sign meet in " +
      "the middle, which is not the same as either ruler being right -- the pattern every squat " +
      "on this account repeats.",
  },
  {
    id: "2026-10-19-back-squat-set-2",
    date: "2026-10-19",
    build: 673,
    exercise: "Back Squat",
    filmedOnCommit: "34574c60",
    candidates: [
      { source: "body_3d", scaleX1000: 3.84052 },
      { source: "depth", scaleX1000: 4.43984 },
      { source: "height", scaleX1000: 3.39639 },
      { source: "shoulder_width", scaleX1000: 4.33825 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.1, shoulder_width: 0.3920177678390395 },
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 3.5823291387545777,
    reportedRomCm: 72.6,
    sensorRomCm: 73.7,
    liveErrorPct: 2.07,
    notes:
      "The best standing result on record: -1.5% on range of motion and 0.00 m/s on the mean " +
      "(0.84 against 0.84). The height ruler alone was within 1.5% of the sensor's scale on this " +
      "take; the segmenter found 4 reps of 5. Same shape as set 1 -- height low, the two body " +
      "rulers high -- with the height ruler less low than usual.",
  },
  {
    id: "2026-10-19-romanian-deadlift-set-1",
    date: "2026-10-19",
    build: 673,
    exercise: "Romanian Deadlift",
    filmedOnCommit: "34574c60",
    candidates: [
      { source: "body_3d", scaleX1000: 3.33607 },
      { source: "depth", scaleX1000: 4.54961 },
      { source: "shoulder_width", scaleX1000: 3.93503 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, shoulder_width: 0.2 },
    // bent_over since 2026-10-05: no height ruler is offered to a hinge.
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 3.915452007948545,
    reportedRomCm: 65.2,
    sensorRomCm: 56.0,
    liveErrorPct: 9.67,
    notes:
      "Read +16.4% as filmed, and the whole error is the 3D-pose collapse: body_3d alone was " +
      "-0.8% of the sensor's scale and depth +35.3%, they vote once at their geometric mean " +
      "(+15.8%), and a hinge has no height ruler on the other side to pull it back. Two fixes " +
      "were measured and rejected the same day; see the notes. depth read HIGH on all four takes.",
  },
  {
    id: "2026-10-19-romanian-deadlift-set-2",
    date: "2026-10-19",
    build: 673,
    exercise: "Romanian Deadlift",
    filmedOnCommit: "34574c60",
    candidates: [
      { source: "plate", scaleX1000: 2.05555 },
      { source: "body_3d", scaleX1000: 3.55661 },
      { source: "depth", scaleX1000: 4.5721 },
      { source: "shoulder_width", scaleX1000: 4.02663 },
    ],
    // The plate states the detector's own measured noise (COREML_BOX_LONG_EDGE_UNCERTAINTY 0.056)
    // in quadrature with the 6mm casting tolerance of a 450mm bumper: 0.0576.
    uncertaintiesAsFilmed: { plate: 0.05756542171979441, body_3d: 0.2, depth: 0.2, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 4.0295695742386135,
    reportedRomCm: 64.3,
    sensorRomCm: 57.4,
    liveErrorPct: 6.66,
    notes:
      "Read +12.0% as filmed. The one take of the four with a plate in the vote -- 2.06 against a " +
      "required 3.59, i.e. the box 1.75x too big -- and the lone-plate rule correctly stepped it " +
      "out (0% weight), leaving body_3d (-1.1%) collapsed with depth (+27.1%) at +12.1%. The " +
      "collapse is the error again; the plate was never in a position to help.",
  },

  /* THE 2026-10-29 SESSION. Same athlete, same height on file, filmed on build 695 (039ae04; the
   * camera pipeline is byte-identical to 693's and to e40ea299's). The OVR called the second
   * lift "Deadlift"; Forge logged it as Romanian Deadlift, which is the label that decides the
   * posture and so whether a height ruler is offered. */
  {
    id: "2026-10-29-back-squat",
    date: "2026-10-29",
    build: 695,
    exercise: "Back Squat",
    filmedOnCommit: "039ae04",
    candidates: [
      { source: "body_3d", scaleX1000: 3.99216 },
      { source: "depth", scaleX1000: 4.86174 },
      { source: "height", scaleX1000: 3.16385 },
      { source: "shoulder_width", scaleX1000: 4.03818 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.1, shoulder_width: 0.3387229966186345 },
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 3.452992524721314,
    reportedRomCm: 71.8,
    sensorRomCm: 73.2,
    liveErrorPct: 1.2,
    notes:
      "Read -1.9% as filmed, 5 of 5 reps, cadence held, no dropouts: the control. Against the " +
      "sensor's scale the height ruler read -10.1% at 74.8% of the weight, body_3d +13.4%, " +
      "shoulder_width +14.7%, depth +38.1%. Third squat take in a row with the same signature: the " +
      "height ruler 8-10% low and the two body rulers 13-20% high, cancelling. Its shipped scale " +
      "(3.4530) is the RDL's (3.4496) to three decimals, filmed minutes apart from the same spot.",
  },
  {
    id: "2026-10-29-romanian-deadlift",
    date: "2026-10-29",
    build: 695,
    exercise: "Romanian Deadlift",
    filmedOnCommit: "039ae04",
    candidates: [
      { source: "body_3d", scaleX1000: 3.05709 },
      { source: "depth", scaleX1000: 3.80237 },
      { source: "shoulder_width", scaleX1000: 3.48977 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 3.449596630517205,
    reportedRomCm: 81.2,
    sensorRomCm: 62.2,
    liveErrorPct: 25.16,
    notes:
      "Read +30.5% as filmed, the worst RDL on record, and this time EVERY ruler is high: body_3d " +
      "+15.7%, shoulder_width +32.0% (grip/shoulder 1.77, spread 0.12 -- the span foreshortened on " +
      "a hinge filmed oblique, grip axis 32.6 deg from vertical), depth +43.9%. No height ruler to " +
      "oppose them. Not a clean scale error either: 168 of 611 frames had a wrist under the " +
      "visibility floor, 108 bar points were a lone hand carried, 5 of 7 rep peaks were floored " +
      "to their means, and per-rep ROM ran 62-93cm where the sensor read 59-64. A trace problem " +
      "and a scale problem on one take, which is why nothing was fitted to it.",
  },
  {
    id: "2026-10-29-back-squat-set-2",
    date: "2026-10-29",
    build: 697,
    exercise: "Back Squat",
    filmedOnCommit: "6d8f259",
    candidates: [
      { source: "body_3d", scaleX1000: 4.02739 },
      { source: "depth", scaleX1000: 4.44778 },
      { source: "height", scaleX1000: 3.43669 },
      { source: "shoulder_width", scaleX1000: 4.21316 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.1, shoulder_width: 0.39758842671480643 },
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 3.6255637866370203,
    reportedRomCm: 74.7,
    sensorRomCm: 75.7,
    liveErrorPct: 1.6,
    notes:
      "Read -1.3% as filmed, 5 of 5 reps, cadence 0.991, one dropout, the second squat of the day " +
      "an hour after the first and the best squat on record. Mean +6.0% (0.89 against 0.84) and " +
      "peak +1.6%. The fourth squat take in a row with the one signature: height ruler -6.5% of " +
      "the sensor's scale at 76.1% of the weight, body_3d +9.6%, shoulder_width +14.7% (grip floor " +
      "loosened it to 0.398), depth +21.1%. Rep 1's drive window again opened at the walk-out " +
      "(phase 3.40s, drive 1.07s, mean 0.66 against the sensor's 0.86) while reps 2-5 ran 0.80s " +
      "and read 7-22% HIGH against a sensor whose reps slow from 0.88 to 0.78 and Forge's do not. " +
      "The row the first per-lift squat number (heightRulerUncertainty 0.11) was costed on.",
  },
  {
    id: "2026-10-29-romanian-deadlift-set-2",
    date: "2026-10-29",
    build: 697,
    exercise: "Romanian Deadlift",
    filmedOnCommit: "6d8f259",
    candidates: [
      { source: "plate", scaleX1000: 2.55966 },
      { source: "body_3d", scaleX1000: 3.82238 },
      { source: "depth", scaleX1000: 4.95564 },
      { source: "shoulder_width", scaleX1000: 4.40749 },
    ],
    uncertaintiesAsFilmed: { plate: 0.05756542171979441, body_3d: 0.2, depth: 0.6, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 2.7878659744209606,
    reportedRomCm: 41.1,
    sensorRomCm: 62.5,
    shippedUnderDefect:
      "a plate admitted into the body rulers' cluster from the anchor's end only (0.653 of body_3d " +
      "is inside 0.4; body_3d is 1.53x the plate and is not), at 85.8% of the blend; fixed in " +
      "scalesAgree, 2026-10-29",
    liveErrorPct: -1.75,
    notes:
      "THE FIRST RDL FILMED SQUARE-ON WITH THE LIFT'S OWN RECORD, and it read -34.2% (41.1 against " +
      "62.5) because the barbell plate took the scale: boxed at 175.8px where the body consensus " +
      "expects 108 (plateBoxToExpectedRatio 1.627), stated at 0.058, no gate fired, 85.8% of the " +
      "weight. Without it the two body rulers (shoulder 0.00441, the collapsed pair 0.00392 with " +
      "depth at its new 0.6) blend to 0.00416, -1.9% of the sensor: square-on, the body rulers on " +
      "a hinge are within 2%, where the oblique morning take had every one of them 16-44% high. " +
      "7 of 8 reps found both sets. With the scale right the velocities are still LOW: mean would " +
      "read 0.68 against 0.85, peak 1.23 against 1.43 -- the concentric runs 0.83-0.93s against a " +
      "sensor whose 0.625m at 0.85m/s is 0.74s. The next RDL thing is the window, not the scale.",
  },

  /* THE 2026-10-30 SESSION, round four, build 701 (980fcd4): bench press, Pendlay row and
   * barbell shoulder press, the three lifts NOT under test since 10-20, filmed at Scott's choice
   * ("next I'm doing bench press, pendlay rows, and shoulder press, reps of probably 8"). The
   * press has no row yet: its OVR screen was not sent with the other two, and a row without a
   * sensor range is a reconstruction. */
  {
    id: "2026-10-30-bench-press",
    date: "2026-10-30",
    build: 701,
    exercise: "Bench Press",
    filmedOnCommit: "980fcd4",
    candidates: [
      { source: "plate", scaleX1000: 4.43957 },
      { source: "body_3d", scaleX1000: 3.1213 },
      { source: "depth", scaleX1000: 3.38311 },
      { source: "shoulder_width", scaleX1000: 4.90914 },
    ],
    uncertaintiesAsFilmed: { plate: 0.05756542171979441, body_3d: 0.2, depth: 0.2, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 4.388368159185664,
    reportedRomCm: 36.7,
    sensorRomCm: 35.56,
    liveErrorPct: 3.21,
    notes:
      "Read +3.2% as filmed (36.7 against 14.0in), the first bench on record whose range of motion " +
      "lands, and the first real take where the PLATE was the ruler: locked on 251 of 994 frames, " +
      "boxed 101.4px against the body consensus's 110.3 (plateBoxToExpectedRatio 0.919), admitted " +
      "from both ends, 85.8% of the blend at +4.4% of the sensor's scale -- where every earlier " +
      "bench plate was 2-7x too big and refused. The body rulers were the usual bench pair: " +
      "shoulder_width +15.5%, the collapsed 3D witness -23.6%. 8 of 8 reps, cadence 0.994, rep 8 " +
      "(23.2cm, the re-rack folded in) dropped by repConsistency and odd on the sensor too. The " +
      "velocities are the window, not the scale: mean +10.3% (0.75 against 0.68) and peak +18.6% " +
      "(1.15 against 0.97) with a 0.49s concentric against the sensor's 0.52 -- the same +6..+16% " +
      "mean the three stored benches read, which is what the bench's own driveOnsetFraction (0.03) " +
      "and velocitySmoothingMs (200) were costed on.",
  },
  {
    id: "2026-10-30-pendlay-row",
    date: "2026-10-30",
    build: 701,
    exercise: "Pendlay Row",
    filmedOnCommit: "980fcd4",
    candidates: [
      { source: "body_3d", scaleX1000: 2.96168 },
      { source: "depth", scaleX1000: 1.25511 },
      { source: "shoulder_width", scaleX1000: 4.2704 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 3.0992059950320987,
    reportedRomCm: 46.9,
    sensorRomCm: 52.58,
    liveErrorPct: 0.57,
    notes:
      "Read -10.8% as filmed (46.9 against 20.7in), 8 of 8 reps, cadence 0.948, no plate lock (32 " +
      "CoreML frames at 0.33 confidence, 76 fresh detections all broken on low confidence). The " +
      "depth ruler read 0.00126 against a required 0.00347, -64%, the worst depth read on any take " +
      "in this file, and it collapsed with the in-plane bone (-15%) into one witness at -44% that " +
      "the shoulder span (+23%, grip/shoulder 1.80 inside the ceiling, spread 0.121) was then " +
      "averaged with. The row's own depthRulerUncertainty (0.6) is what this row was costed on: at " +
      "it the blend reads +0.6%. The velocities are a trace fault and not a scale one and get WORSE " +
      "with the scale right: mean +23.6% (1.10 against 0.89) and peak +6% at the shipped scale, " +
      "because the segmented phase (0.45-0.63s) is already shorter than the sensor's concentric " +
      "(0.55-0.66s) -- 172 of 586 frames had a wrist under the visibility floor and 196 bar points " +
      "were a lone hand carried, which is the bottom of a Pendlay rep, hands at the plates.",
  },
];

/* THE THIRD MOVE, 2026-10-30 (round four on build 701): the Pendlay Row's own depthRulerUncertainty
 * (0.2 -> 0.6, FITTED_OVERRIDES) moved the one row row from -10.8% to +0.6% and NO squat, RDL or
 * bench row; the Bench Press's own driveOnsetFraction and velocitySmoothingMs are window and
 * smoothing numbers that the ledger's scale replay never reads, so the bench row's liveErrorPct is
 * its as-filmed +3.2%. The row's number was costed on the three 10-09 row takes as well (their
 * candidates live in the two lone-plate guards, not here, because those rows carry no sensor
 * range): -7.3 -> -2.7, -1.1 -> -2.4, -17.5 -> -15.2.
 *
 * THE SECOND MOVE, 2026-10-29 (evening, round two on build 697): the Back Squat's own
 * heightRulerUncertainty (0.1 -> 0.11, FITTED_OVERRIDES) moved the five squat rows by about one
 * point each and no RDL row -- 10-04 -5.97 -> -4.81, 10-05 -3.58 -> -1.74, 10-19 set 1 -3.09 ->
 * -2.04, 10-19 set 2 1.07 -> 2.07, 10-29 set 1 -0.11 -> 1.20 -- the small step Scott asked for.
 * The same commit made a plate agree from both ends (scalesAgree): no row moved for it, because
 * the only row with an asymmetrically admitted plate is the new 10-29 RDL set 2, which records
 * the defect instead of replaying to it. Making the test symmetric for EVERY ruler was replayed
 * first and rejected: it takes the 10-05 Back Squat from -3.58% to +24.43%, because that take's
 * height ruler was admitted from the body rulers' end and was the one near the sensor.
 *
 * THE FIRST MOVE THIS RATCHET RECORDED, 2026-10-29: the Romanian Deadlift's own record
 * (FITTED_OVERRIDES: depthRulerUncertainty 0.6, with the collapse weighing its pair) moved the
 * five RDL rows and no squat row:
 *   10-04 RDL  +3.58 -> -0.16    10-05 RDL  -1.95 -> -6.64
 *   10-19 RDL s1 +16.43 -> +9.67    10-19 RDL s2 +12.02 -> +6.66    10-29 RDL +30.55 -> +25.16
 * Median |error| on the RDL 12.0% -> 6.7%; the 10-05 take (filmed with no height on file, the
 * one where depth read only +8%) is the cost, 4.7 points, and it is written here rather than
 * averaged away. Every squat row is identical to the hundredth of a point, which is what "a
 * change to one lift reaches one lift" means in this file. */

/** Every take filmed on a given day, in the order they were added. */
export function ledgerRowsOn(date: string): readonly LedgerRow[] {
  return ACCURACY_LEDGER.filter((r) => r.date === date);
}

export function ledgerRow(id: string): LedgerRow {
  const row = ACCURACY_LEDGER.find((r) => r.id === id);
  if (!row) throw new Error(`No accuracy-ledger row "${id}"`);
  return row;
}
