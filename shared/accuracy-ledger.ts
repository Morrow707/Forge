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
  /** A CANDIDATE THE PHONE REFUSED BEFORE THE BLEND, AND WHICH YARDSTICK REFUSED IT. Listed in
   *  `candidates` (it was measured) and excluded from the as-filmed blend (it never voted), so the
   *  row still replays to the shipped scale. The live replay re-admits a `height` refusal on a
   *  posture where the stature yardstick no longer runs (since 2026-11-06 it runs only where the
   *  height ruler may vote, `postureAllowsHeightCalibration`): the 11-06 bench's shoulder ruler,
   *  convicted by a supine athlete's "stature" of 163.6in, is the case. A `grip` refusal stands
   *  either way, because a sealed row has no span to re-judge it with. */
  readonly rejectedAsFilmed?: readonly { source: LedgerRulerSource; yardstick: "height" | "grip"; impliedHeightIn?: number }[];
  /** THE SHOULDER SPAN'S OWN SCATTER ON THIS TAKE, where the export carries it
   *  (`shoulderRuler.spanSpreadFraction`). A property of the TAKE, not a constant: the shoulder
   *  ruler states `max(floor, spread, gripFloor)`, and a replay through the live floor alone would
   *  weight a jittery span as if it were steady. Set only where the spread exceeded the floor on
   *  the day (the 10-30 row set 2, 0.317 against 0.2); absent means the floor was what shipped. */
  readonly shoulderSpanSpreadFraction?: number;
  /** THE DETECTOR'S OWN MEAN CONFIDENCE ON THIS TAKE, where a plate joined the vote
   *  (`objectDetection.avgCoreMlConfidence`). A property of the TAKE, like the span's spread
   *  above, and for the identical reason: since 2026-10-31 the plate's uncertainty is FLOORED by
   *  the band its confidence earned on held-out images, so a replay through the pooled constant
   *  alone would weight the 10-30 row's six frames at 0.44 as if the detector had been as sure of
   *  them as of the bench's 205 frames at 0.93. Set on every row whose candidates include a
   *  plate; absent means no plate was in the vote and the field decides nothing. */
  readonly plateMeanCoreMlConfidence?: number;

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
  const refused = new Set((row.rejectedAsFilmed ?? []).map((r) => r.source));
  return (row.heightRulerVotedAsFilmed
    ? row.candidates
    : row.candidates.filter((c) => c.source !== "height")
  ).filter((c) => !refused.has(c.source));
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
    liveErrorPct: -3.69,
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
    liveErrorPct: 0.01,
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
    plateMeanCoreMlConfidence: 0.84,
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
    liveErrorPct: -1.03,
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
    liveErrorPct: 3.03,
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
    plateMeanCoreMlConfidence: 0.83,
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
    liveErrorPct: 2.45,
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
    liveErrorPct: 2.49,
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
    plateMeanCoreMlConfidence: 0.84,
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
    plateMeanCoreMlConfidence: 0.72,
    shippedScaleX1000: 4.388368159185664,
    reportedRomCm: 36.7,
    sensorRomCm: 35.56,
    liveErrorPct: 0.13,
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

/** 2026-10-30, round five, set 2 of the row, on 703 (the export's ruler uncertainties carry the
 *  row's own depth 0.6, so the row's record was on the phone). Filmed oblique again
 *  (axisForeshortening 1.575). THE GRIP YARDSTICK CONVICTED THE TWO GOOD RULERS: the grip read
 *  52.7 units against a 69.8-unit shoulder span (grip/shoulder 0.755, the only ratio under 1 on
 *  any take in the corpus; 280 of 579 bar points a lone hand carried, 105 wrist frames under the
 *  floor), so the 3D bone and the depth ruler "implied" 7.5in and 4in grips and were rejected,
 *  and the shoulder span alone shipped the take 53% high. */
  {
    id: "2026-10-30-pendlay-row-set-2",
    date: "2026-10-30",
    build: 703,
    exercise: "Pendlay Row",
    filmedOnCommit: "87aa268",
    candidates: [
      { source: "body_3d", scaleX1000: 3.635733273396519 },
      { source: "depth", scaleX1000: 1.9111024480728291 },
      { source: "shoulder_width", scaleX1000: 6.278493176066047 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.6, shoulder_width: 0.317 },
    shoulderSpanSpreadFraction: 0.317,
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 6.278493176066048,
    shippedUnderDefect:
      "the grip yardstick rejected 2 of the 3 rulers (body_3d at an implied 7.5in grip, depth at 4in) " +
      "off a 52.7-unit grip read on a 69.8-unit shoulder span, and the shoulder span shipped alone; " +
      "fixed in rejectImplausibleScales (a yardstick that would convict a strict majority stands " +
      "down), 2026-10-30 round five",
    reportedRomCm: 78.4,
    sensorRomCm: 51.31,
    liveErrorPct: 2.85,
    notes:
      "Read +52.8% as filmed (78.4 against 20.2in), 8 of 8 reps, cadence 0.943, the plate seen but " +
      "refused too_far_from_athlete (box 1.391 of expected; plateScaleIfAdmitted 0.004514 would have " +
      "read +10%). The shipped scale was the shoulder span ALONE at 100% because the grip yardstick " +
      "threw out the other two rulers: the grip read 52.7 units, narrower than the shoulders (0.755), " +
      "which no real barbell grip is -- the hands were at the plates for half the take and the " +
      "yardstick measured whatever the tracker carried. The two rulers it rejected collapse to a " +
      "witness within 3% of the scale the sensor requires (0.004109). The defect is a RULE and is " +
      "fixed as one: a yardstick that would convict a strict majority of the rulers abstains. The " +
      "velocities at the shipped scale read mean 1.61 against 0.85 and peak 2.50 against 1.48, which " +
      "is the scale error (x1.53) on top of the row's window fault; at the corrected scale the mean " +
      "would read ~+27% and the peak ~+10%, the same trace fault set 1 carries.",
  },

/** 2026-10-30, round five: the Barbell Shoulder Press beside the OVR for the first time. The OVR
 *  labels the lift "Push Press"; Scott pressed it standing, strict, 65lb x 8. The sensor counted a
 *  NINTH rep (35.0in of travel at 0.61 m/s) that is the bar being lowered from the shoulders to the
 *  floor, and it is excluded from the sensor's range here (the eight real reps average 24.51in).
 *  Filmed head-on (facing_camera), live path, cadence 0.949. Forge found 7 of the 8: the eighth
 *  press is in the trace and was folded into the lowering that follows it. */
  {
    id: "2026-10-30-barbell-shoulder-press-set-1",
    date: "2026-10-30",
    build: 701,
    exercise: "Barbell Shoulder Press",
    filmedOnCommit: "980fcd4",
    candidates: [
      { source: "body_3d", scaleX1000: 3.4734 },
      { source: "depth", scaleX1000: 3.84733 },
      { source: "height", scaleX1000: 3.38781 },
      { source: "shoulder_width", scaleX1000: 3.90989 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.1, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 3.519451709909543,
    reportedRomCm: 63.0,
    sensorRomCm: 62.26,
    liveErrorPct: 1.19,
    notes:
      "Read +1.3% as filmed (63.0 against the eight real reps' 24.51in) with four body rulers and no " +
      "plate seen, the height ruler at two-thirds of the weight -- a standing lift keeps its height " +
      "ruler, and this one lands. The error on the day was the WINDOW: mean 0.71 against 0.82 " +
      "(-13.5%) and peak 1.30 against 1.40 (-7.2%) at the shared drive onset 0.04; the press's own " +
      "driveOnsetFraction 0.08 reads the mean at -3.8% on this take, 0.0% on set 2 and +2.9% on the " +
      "10-02 push-press fixture. Seven of eight reps: the eighth (a 68cm rise at 19.0-19.8s) is " +
      "folded into the 2.7m lowering to the floor that follows -- a press re-racks DOWNWARD, so the " +
      "last eccentric runs on into the re-rack; the RDL loses one rep per take the same way.",
  },

/** 2026-10-30, round five, set 2 of the press at 85lb x 8, head-on, live path. The plate was
 *  seen (box 1.482 of expected, every frame admitted by the gates) and its 0.00241 sat at 0.65-0.7
 *  of the body rulers; the blend's two-ended plate test kept it out and the four body rulers
 *  shipped the take. 28 dropouts and 206 wrist frames under the floor on this one. */
  {
    id: "2026-10-30-barbell-shoulder-press-set-2",
    date: "2026-10-30",
    build: 703,
    exercise: "Barbell Shoulder Press",
    filmedOnCommit: "87aa268",
    candidates: [
      { source: "plate", scaleX1000: 2.4145460285527074 },
      { source: "body_3d", scaleX1000: 3.725433047257267 },
      { source: "depth", scaleX1000: 4.757256405341153 },
      { source: "height", scaleX1000: 3.310957189949788 },
      { source: "shoulder_width", scaleX1000: 4.022723382239999 },
    ],
    uncertaintiesAsFilmed: { plate: 0.05756542171979441, body_3d: 0.2, depth: 0.2, height: 0.1, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: true,
    plateMeanCoreMlConfidence: 0.57,
    shippedScaleX1000: 3.579400420433846,
    reportedRomCm: 56.7,
    sensorRomCm: 61.72,
    liveErrorPct: -8.13,
    notes:
      "Read -8.1% as filmed (56.7 against 24.3in), 7 of 8 reps again (the eighth at 26.4-27.4s " +
      "folded into the lowering), cadence 0.906 with 28 dropouts and 206 wrist frames under the " +
      "floor -- the trace, not the scale, is the likelier reason the range came up short, since the " +
      "shipped scale (0.003579) is within 2% of set 1's (0.003519) from the same spot and set 1 " +
      "landed. The plate was boxed 1.48x too big (the retrained detector's third oversized plate on " +
      "a non-bench) and correctly kept out from both ends. At the shared window the mean read -2.7% " +
      "and the peak +0.8%; at the press's own 0.08 the mean reads 0.0%. Rep-by-rep the sensor's " +
      "peaks run 0.91-1.34 and Forge's 0.97-1.48 at the shared smoothing.",
  },
/** 2026-10-30, round SIX: set 3 of the bench on build 705, the first bench take filmed through
 *  the round-five pipeline. Square-ish to the side, live path, cadence 0.979 with 4 dropouts, 8
 *  of 8 reps found -- the cleanest trace of the three set-3 takes by a wide margin. The plate was
 *  the ruler again and it was an EARNED read: the lock held 256 of 865 tracked frames, 206 plate
 *  frames at 0.93 average confidence, 3 fresh detections and 1 low-confidence break all take. */
  {
    id: "2026-10-30-bench-press-set-3",
    date: "2026-10-30",
    build: 705,
    exercise: "Bench Press",
    filmedOnCommit: "bfcc130",
    candidates: [
      { source: "plate", scaleX1000: 4.249 },
      { source: "body_3d", scaleX1000: 3.15079 },
      { source: "depth", scaleX1000: 4.05365 },
      { source: "shoulder_width", scaleX1000: 3.63684 },
    ],
    uncertaintiesAsFilmed: { plate: 0.05756542171979441, body_3d: 0.2, depth: 0.2, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    plateMeanCoreMlConfidence: 0.93,
    shippedScaleX1000: 4.15751295357763,
    reportedRomCm: 39.4,
    sensorRomCm: 37.338,
    liveErrorPct: 3.56,
    notes:
      "Read +5.5% as filmed (39.4 against 14.7in), up from set 1's +3.2% on the same lift two " +
      "builds earlier. THE PLATE CARRIES 86% OF THIS BLEND and that is arithmetic rather than a " +
      "reading: at 0.0576 against the body rulers' 0.2 its inverse-variance weight is 12x theirs, " +
      "and the weighted mean of these four candidates after the collapse is 4.157e-3 against a " +
      "shipped 4.15751e-3. Both body rulers sit BELOW the sensor's required 3.9399e-3 (shoulder " +
      "3.637e-3, -7.7%; the collapsed pair 3.574e-3, -9.3%) and the plate sits above it at " +
      "+7.8%, so the plate is what the +5.5% is. Its box measured 105.9px where 114.2px would " +
      "have hit the sensor -- 7.3% too SMALL, the opposite direction from the pre-retrain model's " +
      "2-7x too large -- and plateBoxToExpectedRatio read 0.849. Window and smoothing: mean +12.1% " +
      "(0.74 against 0.66) and peak +25.3% (1.14 against 0.91) at this lift's own drive onset 0.03 " +
      "and smoothing 200. The export says 165 for the smoothing and that is the RECORD being " +
      "wrong, not the pipeline: av-bar-tracker-dialog.tsx wrote the shared module constant into " +
      "the diagnostic while bar-tracking.ts read tune.velocitySmoothingMs, fixed in the same " +
      "commit as this row. axisForeshortening 1.112, so some of the travel was along the lens. " +
      "AND THE +12.1% MEAN WAS A BUG, FOUND ON THIS TAKE AND FIXED 2026-10-31: the SET mean summed " +
      "the whole PHASE's distance over the DRIVE window's time -- the pairing `romM`'s own comment " +
      "in bar-tracking.ts names, fixed at the rep on 2026-10-06 and left in the set-level " +
      "aggregation because `driveRomM` was not on the record to sum. A mean error 2.5x the distance " +
      "error is not scale, it is the clock, exactly as that comment argues. Summing the drive " +
      "window's distance reads this take at +2.9%; the shipped 0.74 was never reproducible after " +
      "the fix and is kept here as history. What is LEFT on this take is the SCALE (+5.5%, a plate " +
      "boxed 7.3% small carrying 86% of the blend) and the PEAK (+19.8% at the bench's own 200ms, " +
      "which is the sweep's own minimum across seven bench takes -- so the peak is not the " +
      "smoothing, and it is open).",
  },

/** 2026-10-30, round SIX: set 3 of the Pendlay row on 705. Round five's yardstick rule is NOT
 *  what this take is about -- scaleYardstickAbstained and scalesRejectedAsImplausible are both
 *  empty, nothing was rejected, and all three witnesses voted. The error moved from set 2's
 *  +52.8% to +23.2% and changed cause entirely: a plate measured off a detector that never once
 *  held a lock took 86% of the blend. Cadence 0.937, 16 dropouts, 8 of 8 reps. */
  {
    id: "2026-10-30-pendlay-row-set-3",
    date: "2026-10-30",
    build: 705,
    exercise: "Pendlay Row",
    filmedOnCommit: "bfcc130",
    candidates: [
      { source: "plate", scaleX1000: 4.86486 },
      { source: "body_3d", scaleX1000: 3.79838 },
      { source: "depth", scaleX1000: 2.49038 },
      { source: "shoulder_width", scaleX1000: 5.74208 },
    ],
    uncertaintiesAsFilmed: { plate: 0.05756542171979441, body_3d: 0.2, depth: 0.6, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    plateMeanCoreMlConfidence: 0.44,
    shippedScaleX1000: 4.840255324542491,
    reportedRomCm: 70.1,
    sensorRomCm: 56.896,
    liveErrorPct: 20.79,
    notes:
      "Read +23.2% as filmed (70.1 against 22.4in), and THE PLATE IS THE WHOLE OF IT: 4.865e-3 " +
      "against the sensor's required 3.9285e-3, +23.8%, carrying 86% of the blend at its 0.0576 " +
      "while the collapsed 3D pair (3.641e-3, -7.3%) and the shoulder span (5.742e-3, +46.2%) hold " +
      "7% each. The weighted mean of the three is 4.840e-3 against a shipped 4.84026e-3, so the " +
      "blend did exactly what its weights said. THE PLATE STATED THE SAME UNCERTAINTY AS THE BENCH " +
      "TAKE ABOVE AND HAD NOTHING LIKE THE EVIDENCE: objectLock.framesLockHeld 0, 20 plate frames " +
      "of 663 tracked at 0.44 average confidence, and all 59 fresh detections broken on low " +
      "confidence -- 5 samples clears MIN_CALIBRATION_SAMPLES, so a median off 20 jittery frames " +
      "asserts the detector's held-out median noise. That is the shoulder ruler's old bug one " +
      "instrument over, and the cure this repo already uses is a floor that can only loosen -- " +
      "WHICH IS WHAT ROUND SEVEN SHIPPED, 2026-10-31: the plate's box uncertainty is now floored " +
      "by the band its own take-mean confidence earned on the same 41 held-out images (conf < 0.55 " +
      "reads sigma 0.211 over 24 plate boxes against 0.075 over 53 above it), so this take's 0.44 " +
      "states 0.212 instead of 0.084, the plate's weight falls six-fold, and the row reads +20.79%. " +
      "It is the ONLY ledger row below the split, so nothing else moved: 1 better, 0 worse, 19 " +
      "unchanged. The remaining +20.8% is still the plate -- a floor de-weights a bad ruler, it " +
      "does not make a box 19.2% too small right. " +
      "plateBoxToExpectedRatio read 0.964, which looks like a perfect box and is not evidence: it " +
      "divides by the blend with the plate removed, and that pair spans 58% here, so a plate 24% " +
      "high lands near its midpoint and scores as corroborated. Box 92.5px where 114.5px hits the " +
      "sensor, 19.2% too small. Peak +46.0% (2.03 against 1.39); the sensor's Avg field is cut off " +
      "on the screen for this set, so no mean comparison. gripToShoulderSpanRatio 1.962 and " +
      "spanSpreadFraction 0.165, both under what would loosen the 0.2 floor.",
  },

/** 2026-10-30, round SIX: set 3 of the press on 705, 85lb x 8. THE OVR LABELS THIS LIFT "PUSH
 *  PRESS" AND THAT IS THE OVR'S OWN VOCABULARY, NOT A SECOND MOVEMENT. Scott, 2026-10-31, asked
 *  directly: "The push press is the shoulder press, they don't have another name." So all three
 *  press takes are one identity's record and round five's `driveOnsetFraction` 0.08, fitted across
 *  sets 1 and 2 and the 10-02 fixture, is fitted on this lift rather than across two. This
 *  CORRECTS the 2026-10-07 note that held a push press out of the press's evidence until one was
 *  filmed without the dip: the concern there was GEOMETRY (that take's axisForeshortening was
 *  1.452) and it stands as a geometry caveat, which is a reason to weigh a take, never a reason to
 *  call it a different lift. No plate was seen at all here (plateMeasuredPx null), so this is the
 *  one set-3 take decided entirely by body rulers, and it is also the most accurate. */
  {
    id: "2026-10-30-barbell-shoulder-press-set-3",
    date: "2026-10-30",
    build: 705,
    exercise: "Barbell Shoulder Press",
    filmedOnCommit: "bfcc130",
    candidates: [
      { source: "body_3d", scaleX1000: 3.74773 },
      { source: "depth", scaleX1000: 4.73345 },
      { source: "height", scaleX1000: 3.74643 },
      { source: "shoulder_width", scaleX1000: 3.94121 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.1, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 3.8564646965464013,
    reportedRomCm: 61.8,
    sensorRomCm: 59.944,
    liveErrorPct: 3.1,
    notes:
      "Read +3.1% as filmed (61.8 against 23.6in as the screen displays it). The height ruler " +
      "landed on the sensor almost exactly -- 3.74643e-3 against a required 3.7406e-3, +0.16% -- " +
      "and carries half the blend at its 0.1; the shoulder span is +5.4% and the collapsed 3D pair " +
      "+12.6%, so the +3.1% is those two pulling a correct height ruler up. Every pairwise test " +
      "agreed, nothing was rejected, no plate was found. Mean -2.4% (0.80 against 0.82) and peak " +
      "+12.7% (1.42 against 1.26) at this lift's own drive onset 0.08, which is the window round " +
      "five fitted and it holds on a take it was not fitted on. Seven of eight reps for the third " +
      "press take running: cadence 0.822, 18 dropouts, 4.228s lost and a largest gap of 2.885s, " +
      "the worst trace of the three. axisForeshortening 1.188 -- 1.56m of the 2.89m travel is " +
      "along the lens, against 1.007 on the row and 1.112 on the bench -- so the range of motion " +
      "landing inside 3.1% is partly luck and this take is NOT a candidate to fit anything to. " +
      "The lift is ONE identity (see the note above): the OVR's \"push press\" label is its own " +
      "vocabulary for the same movement.",
  },

  /* THE 2026-11-05 SESSION, round nine, build 710 (4c30e37): back squat, Romanian deadlift and
   * box jump, the three lifts under test, the first takes on the corrected direction rule. The
   * box jump has no row: a ledger row is a scale blend with a sensor range beside it, and the
   * jump's sensor is on the hip while its rulers are on the ankle (its numbers are in
   * tracker-ground-truth.ts, OVR_BOX_JUMP_HIP_2026_11_05). */
  {
    id: "2026-11-05-back-squat",
    date: "2026-11-05",
    build: 710,
    exercise: "Back Squat",
    filmedOnCommit: "4c30e37",
    candidates: [
      { source: "body_3d", scaleX1000: 3.99977457432818 },
      { source: "depth", scaleX1000: 4.32610111255794 },
      { source: "height", scaleX1000: 3.4052851219247026 },
      { source: "shoulder_width", scaleX1000: 4.447818301521822 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.11, shoulder_width: 0.3778601361518843 },
    heightRulerVotedAsFilmed: true,
    shoulderSpanSpreadFraction: 0.044,
    shippedScaleX1000: 3.6334879618557616,
    reportedRomCm: 73.0,
    sensorRomCm: 74.42,
    // -1.91% as filmed; the live replay reads +1.07% because a sealed row has no frames, so it can
    // only state the shoulder ruler's floor (0.2) and not the 0.378 the grip floor loosened it to
    // on the phone -- the limit the ledger's own header records.
    liveErrorPct: 2.09,
    notes:
      "135x5 beside the OVR, filmed from the front of the rack (shoulders carried the bar, 708 " +
      "shoulder points), analysed on the FILE path (live coverage 0.84 fell under the gate). 5 of 5. " +
      "Range of motion -1.9%: the height ruler at 72.1% of the blend reads 6.3% under the scale the " +
      "sensor requires, the collapsed 3D pair +14%, the shoulder ruler +22% with its uncertainty " +
      "loosened to 0.378 by the grip floor (grip 2.55 shoulder spans against a 1.85 ceiling). Per rep " +
      "the drive-window distances are 72.7 / 74.6 / 73.6 / 75.0 / 75.6 against the sensor's 73.7 / " +
      "73.4 / 73.7 / 74.9 / 76.7 -- inside 1.6% every rep -- while the set's number is the mean of " +
      "the reps' RAW-endpoint distances (71.5 / 72.9 / 72.4 / 73.7 / 74.6), 1.5cm under the smoothed " +
      "phase on every rep. Recorded, not changed: which of the two is the set's range is a rule for " +
      "every lift. Velocities at the squat's own record after this round (window 0, smoothing 130): " +
      "mean +2.4%, peak -3.9%, rep for rep 0.84 / 0.90 / 0.82 / 0.90 / 0.79 against 0.85 / 0.87 / " +
      "0.81 / 0.84 / 0.79.",
  },
  {
    id: "2026-11-05-romanian-deadlift",
    date: "2026-11-05",
    build: 710,
    exercise: "Romanian Deadlift",
    filmedOnCommit: "4c30e37",
    candidates: [
      { source: "body_3d", scaleX1000: 3.2740642593701843 },
      { source: "depth", scaleX1000: 4.408099971921619 },
      { source: "shoulder_width", scaleX1000: 4.11927765644125 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.6, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    shoulderSpanSpreadFraction: 0.124,
    shippedScaleX1000: 3.7460894387513865,
    // 63.4 is what the trace reads over the EIGHT pulls under round ten's rules (the rest-at-top
    // rule returned the eighth, deleted as a re-rack behind its 1.7s stand at lockout; the
    // athlete's count then trimmed the set-up phase -- a 0.239s hole holding 61% of a 48.6cm
    // phase -- that round nine had read as a starved rep 1 and set 63.8 over "reps 2-8" from).
    // The phone printed 61.5 with the set-up averaged in and the eighth pull gone. The scale's
    // error is the eight pulls', so that is the range this row holds the scale against.
    reportedRomCm: 63.4,
    sensorRomCm: 61.21,
    liveErrorPct: 3.58,
    notes:
      "135x8 beside the OVR, square to the side, live path (cadence 0.939, 18 dropouts, 99 wrist " +
      "frames under the visibility floor, 43 points carried from a lone hand). 8 of 8 since round " +
      "ten (the phone's 8 was the set-up plus seven pulls; see the reportedRomCm comment). Scale +3.6% " +
      "over the eight pulls (+4.2% over the seven round nine read, the figure the rest of this note " +
      "was written against): the shoulder ruler +14% against the scale the sensor requires, the 3D " +
      "bone -9%, the depth ruler at 0.6 carrying 0%, the collapse and the blend splitting the two " +
      "50/50. Per rep the phase distances scatter +1 / +13 / +12 / 0 / +8 / -6 / +15% against the " +
      "sensor's reps, where the sensor's own rep-to-rep spread is 5%: the trace's noise on a hinge is " +
      "larger than its bias (Rule #5), so no scale number moved; a shoulder-floor step was replayed " +
      "on all six RDL rows and was a wash (see FITTED_OVERRIDE_EVIDENCE). Velocities: the phase " +
      "durations match the sensor's concentric within 12% on reps 3, 4, 6, 7 and 8 and read 1.35-1.38x " +
      "short on reps 1, 2 and 5 (rep 1 the hole; reps 2 and 5 a 0.50s and a 0.49s phase against the " +
      "sensor's 0.69 and 0.66, each with a 0.19-0.25s dwell at the bottom in front of it), and the peaks read +26 to +54% on every rep with the distance " +
      "right -- a more peaked profile on the same distance, not a window. Mean +35.5% at the shared " +
      "window, +29.0% at the RDL's own 0.02 after this round; peak +35%. Open: whether the hands " +
      "move faster than the body on a hinge, which the export's new bodyWitnessTrace is for.",
  },
  /* SET 2 OF THE SAME SESSION, round ten, build 712 (3ac2b34): the back squat and the Romanian
   * deadlift again, filmed in the afternoon. Set 1's rows had already been deleted from the server
   * by the stale-cache day wipe (see CLAUDE.md) when these were filmed; the fixture is the only
   * copy of either. The box jump has no row for the reason set 1's note gives. */
  {
    id: "2026-11-05-back-squat-set-2",
    date: "2026-11-05",
    build: 712,
    exercise: "Back Squat",
    filmedOnCommit: "3ac2b34",
    candidates: [
      { source: "body_3d", scaleX1000: 4.28219 },
      { source: "depth", scaleX1000: 4.85248 },
      { source: "height", scaleX1000: 3.47491 },
      { source: "shoulder_width", scaleX1000: 4.88205 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.11, shoulder_width: 0.39676562596294773 },
    heightRulerVotedAsFilmed: true,
    shoulderSpanSpreadFraction: 0.054,
    shippedScaleX1000: 3.790943613931826,
    reportedRomCm: 71.9,
    sensorRomCm: 73.91,
    liveErrorPct: 2.55,
    notes:
      "135x5 beside the OVR, the afternoon's set 2, file path, cadence 1.0 and no dropouts (the " +
      "cleanest squat trace in the corpus). 5 of 5. Range of motion -2.7% as filmed at the squat's " +
      "0.11: the height ruler reads 8.6% under the scale the sensor requires, the collapsed 3D pair " +
      "+20%, the shoulder ruler +28% at a grip-loosened 0.397 (grip 2.58 spans). The one-point step " +
      "to 0.12 shipped in round ten reads this take -1.7% (see FITTED_OVERRIDE_EVIDENCE). Velocities " +
      "at the squat's record: mean +2.4% (0.84 against 0.82, rep for rep 0.79 / 0.92 / 0.86 / 0.84 / " +
      "0.78 against 0.79 / 0.90 / 0.83 / 0.84 / 0.78), peak +1.6% (1.26 against 1.24). The drive " +
      "windows run one 33ms sample short of the sensor's concentric on four of five reps, which is " +
      "the whole of the mean's +2.4%; the drive distances on the smoothed series read the sensor's " +
      "reps within 2% every rep (68.7 / 73.7 / 74.9 / 75.8 / 75.6 against 68.6 / 73.2 / 75.7 / 76.7 / " +
      "76.5) while the reported range reads 1.5-2cm under each -- measured as a candidate rule and " +
      "rejected, because the same series reads 2-12 points HIGH on every bench, row, press and RDL " +
      "beside a sensor (the Kalman smoother overshoots a fast reversal).",
  },
  {
    id: "2026-11-05-romanian-deadlift-set-2",
    date: "2026-11-05",
    build: 712,
    exercise: "Romanian Deadlift",
    filmedOnCommit: "3ac2b34",
    candidates: [
      { source: "plate", scaleX1000: 1.83617 },
      { source: "body_3d", scaleX1000: 3.50179 },
      { source: "depth", scaleX1000: 4.61839 },
      { source: "shoulder_width", scaleX1000: 4.31702 },
    ],
    // The plate: casting tolerance in quadrature with the band its 0.77 mean confidence earned.
    uncertaintiesAsFilmed: { plate: 0.08408828195392086, body_3d: 0.2, depth: 0.6, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    shoulderSpanSpreadFraction: 0.087,
    plateMeanCoreMlConfidence: 0.77,
    shippedScaleX1000: 3.958541816426069,
    // 66.6 over the EIGHT pulls under round ten's rules; the phone printed 67.8 over seven, the
    // eighth deleted as a re-rack behind its 2.2s stand at lockout (restArrivalAfterPeak).
    reportedRomCm: 66.6,
    sensorRomCm: 64.26,
    liveErrorPct: 3.64,
    notes:
      "135x8 beside the OVR, square to the side, live path (cadence 0.937, 18 dropouts, 123 wrist " +
      "frames under the visibility floor). The phone printed 7 of 8 -- the eighth pull merged with a " +
      "2.2s stand at lockout and deleted as a re-rack -- and reads 8 of 8 under the rest-at-top rule " +
      "this take produced. Scale +3.6% over the eight pulls: the shoulder ruler +9% against the scale " +
      "the sensor requires, the 3D bone -12%, the depth ruler +17% at 0.6 (0% of the blend), the " +
      "collapse at -9% and the blend splitting shoulder and collapse 50/50. A plate was boxed 2.156x " +
      "too big (plateBoxToExpectedRatio) and carried nothing: outside the agreement cluster by the " +
      "plate rule of round two. Velocities at the RDL's record after round ten (window 0): mean " +
      "+15.8% (1.10 against 0.95; +20.0% at 0.02, +23.2% at the shared 0.04), peak +19.0% (1.88 " +
      "against 1.58, not fitted). The eighth pull reads 57.7cm against the sensor's 62.7: the rest " +
      "arrives where the bar creeps under 4cm a second, which is 2cm short of full lockout on this " +
      "take -- the cost of the rule, recorded. The set-up phase before rep 1 (89cm from the floor, " +
      "0.9s of travel, then a 1.6s stand) is cut at its rest too and trimmed by the athlete's count; " +
      "with no count logged it would have been reported as a ninth rep.",
  },
  /* ROUND ELEVEN, 2026-11-06, build 714 (5003fef): the bench, and the first two DUMBBELL lifts ever
   * filmed beside the OVR. The Single-Arm Dumbbell Row (70lb x8, OVR "Pendlay Row" x18 with reps 1-2
   * the set-up and the other arm's eight after) has NO ROW HERE, on purpose: its reported range
   * (21.9cm against the sensor's 41.3 on the first arm and 47.1 on the second -- which arm the camera
   * saw is not recorded, which is what per-side filming is for) was built from the MIDPOINT of a
   * braced hand and the working hand (537 lone-hand carries, 84 midpoints, 11 bare), which halves the
   * travel exactly, so a row would score its scale against a range that half-measured the hand -- a
   * point-rule defect, not a scale one, and `shippedUnderDefect` is a statement about the scale. The
   * fix is the working-hand rule in bar-tracking.ts (workingHandForUnilateral); the next row take,
   * filmed on it, gets the row. Its candidates for the record: body_3d (upper arm) 1.75979, depth
   * 2.33829, shoulder_width 1.93722, all at 0.2, shipped 1.982872; doubled under a still braced hand
   * the range reads 43.8cm, between the two arms. */
  {
    id: "2026-11-06-bench-press-set-1",
    date: "2026-11-06",
    build: 714,
    exercise: "Bench Press",
    filmedOnCommit: "5003fef",
    candidates: [
      { source: "body_3d", scaleX1000: 3.17939 },
      { source: "depth", scaleX1000: 2.93212 },
      { source: "shoulder_width", scaleX1000: 4.11144 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    // The stature yardstick read a SUPINE athlete's nose-to-ankle span (1011 units) as a stature
    // and convicted the shoulder ruler at an implied 163.6in; at the scale the sensor requires that
    // same span is a 139-inch man, so the yardstick was the thing that was wrong. It stands down on
    // a lying posture since this round, which is what re-admits the shoulder in the live replay.
    rejectedAsFilmed: [{ source: "shoulder_width", yardstick: "height", impliedHeightIn: 163.6 }],
    shoulderSpanSpreadFraction: 0.099,
    shippedScaleX1000: 3.053252770384875,
    reportedRomCm: 29.3,
    sensorRomCm: 33.53,
    liveErrorPct: -2.77,
    notes:
      "135x8 beside the OVR, live path, 8 of 8, filmed from the foot of the bench as every bench in " +
      "this repo. Range of motion -12.6% as filmed: the shoulder ruler (+17.8% against the sensor) was " +
      "refused by the stature yardstick and the scale fell to the collapsed 3D pair alone (-12.5%); " +
      "with the yardstick standing down on a lying posture the two bracket the sensor and read +2.5%. " +
      "THE PLATE WAS FOUND AND MEASURED SMALL: 724 samples at 0.90 mean confidence, the lock held on " +
      "866 of 994 frames, boxed 60.85 x 119.96 px (aspect 1.96, a disc seen about 59 degrees off its " +
      "face) and refused on aspect_ratio alone; plateBoxToExpectedRatio 0.814, plateScaleIfAdmitted " +
      "3.751e-3 against the 3.491e-3 the sensor requires (+7.4%), a box 7% too SMALL -- the direction " +
      "the 10-31 note predicted for the retrained detector. Admitting it at a per-lift aspect ceiling " +
      "of 2.0 was built, costed and NOT shipped: with the shoulder admitted it reads +6.2% (the plate " +
      "at 73.9% of the blend) against +2.5% without, and with the stature yardstick still running the " +
      "plate is convicted by it too (implied 149in), so the ceiling alone moves nothing. Velocities at " +
      "the shared record: mean 0.64 against 0.70 (-8.6%), peak 1.08 against 1.01 (+6.9%), rep for rep " +
      "0.60 / 0.66 / 0.68 / 0.65 / 0.66 / 0.65 / 0.60 / 0.60 against 0.71 / 0.73 / 0.74 / 0.73 / 0.72 / " +
      "0.72 / 0.66 / 0.64 -- the mean's error is the scale's -12.6% and a window reading long, which the " +
      "corrected scale alone would take to about +4%.",
  },
  {
    id: "2026-11-06-dumbbell-shoulder-press-set-1",
    date: "2026-11-06",
    build: 714,
    exercise: "Dumbbell Shoulder Press",
    filmedOnCommit: "5003fef",
    candidates: [
      { source: "body_3d", scaleX1000: 2.29978 },
      { source: "depth", scaleX1000: 2.60016 },
      { source: "height", scaleX1000: 2.9282 },
      { source: "shoulder_width", scaleX1000: 3.72107 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.1, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: true,
    shoulderSpanSpreadFraction: 0.088,
    shippedScaleX1000: 2.979875841056815,
    reportedRomCm: 85.6,
    sensorRomCm: 58.24,
    liveErrorPct: 21.60,
    notes:
      "35lb x8 beside the OVR (its \"Push Press\" x10, reps 1-2 the set-up and ignored on Scott's word), " +
      "live path, 7 of 8, the first dumbbell press ever paired. Range of motion +47.0% as filmed and " +
      "EVERY ruler high: the shoulder ruler +84% (a 117.7-unit span that is 0.239m at the sensor's scale " +
      "against this athlete's 0.438m biacromial breadth -- the landmarks collapsed to 55% with the arms " +
      "overhead, the collapse the 10-09 grip rule catches on a barbell press at grip/shoulder 2.06 and " +
      "misses at a dumbbell's 1.735), the height ruler +44% (noseToAnkleFrames 418 of 741, the ankle " +
      "landmark wandering 420px while the wrists sat at the top edge of the frame), the collapsed 3D " +
      "pair +21% (the bone median landed on the upper arm, 2.300e-3, where the torso 2.060e-3 and shin " +
      "2.004e-3 read the sensor within 2%; forearm 1.522e-3, femur 2.571e-3, shoulderWidth 2.542e-3). " +
      "The per-rep wrist travel in the body witness is 287px, which at the torso's scale IS the sensor's " +
      "range: the travel is right and the 2D rulers are wrong. The press's own biacromialToleranceFraction " +
      "0.4 (FITTED_OVERRIDE_EVIDENCE) reads it +41.8%; loosening the height ruler instead reads +49.5%, " +
      "because the weight lands on the shoulder. Velocities at the shared record: mean 1.52 against " +
      "0.834 and peak 2.78 against 1.36, the scale's +47% and nothing else to read until the scale is " +
      "right. Object system: class dumbbell (correct), 100 CoreML frames at 0.60, the lock held on 30 " +
      "of 741 with 70 breaks on low confidence; overwatch judged every frame, 69 body-suspect.",
  },
  /* ROUND FOURTEEN, 2026-11-10, build 728 beside the OVR: bench, dumbbell shoulder press and the
   * single-arm row filmed one side at a time. See docs/camera-tracking-notes.md "Round fourteen". */
  {
    id: "2026-11-10-bench-press-set-1",
    date: "2026-11-10",
    build: 728,
    exercise: "Bench Press",
    filmedOnCommit: "45e1102",
    candidates: [
      { source: "body_3d", scaleX1000: 3.508695846152925 },
      { source: "depth", scaleX1000: 4.849835762687241 },
      { source: "shoulder_width", scaleX1000: 3.8942636216131583 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 4.009690815724052,
    reportedRomCm: 32.6,
    sensorRomCm: 36.32,
    liveErrorPct: -4.84,
    notes:
      "135x8 beside the OVR, FILE path (the live path fell back: coverage 0.83, drop rate 3.13), 8 of 8. " +
      "Range of motion -10.2% as filmed: the collapsed 3D pair read -7.7% (the femur -21.5%, depth +8.6%) " +
      "and the shoulder -12.8%; the six 3D bones scatter from -16% to -39%. The bench's own 3D-pose " +
      "uncertainty 0.25 (round fourteen) reads it -8.6%. Velocities: mean 0.88 against 0.72 (+22.2%), peak " +
      "1.27 against 1.02 (+24.5%); with the scale divided out the mean reads +36% -- the drive window is " +
      "short on this take, and the bench's own 0.03 takes the shipped mean to +19.4%.",
  },
  {
    id: "2026-11-10-dumbbell-shoulder-press-set-1",
    date: "2026-11-10",
    build: 728,
    exercise: "Dumbbell Shoulder Press",
    filmedOnCommit: "45e1102",
    candidates: [
      { source: "body_3d", scaleX1000: 2.4621745723320404 },
      { source: "depth", scaleX1000: 3.224406760139486 },
      { source: "height", scaleX1000: 3.059902692774408 },
      { source: "shoulder_width", scaleX1000: 3.0193164835347567 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, height: 0.1, shoulder_width: 0.4 },
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 3.011823293512697,
    reportedRomCm: 80,
    sensorRomCm: 54.61,
    liveErrorPct: 25.10,
    notes:
      "30lb beside the OVR (its \"Push Press\" x12, reps 1-4 the set-up and ignored on Scott's word: \"the .91 " +
      "seems like the start\"), live path, 8 of 8. Range of motion +46.5% as filmed -- the same +47% as 11-06, " +
      "so a bias, not scatter. Every ruler high: height +48.8%, shoulder +46.9%, depth +56.8%, the 3D bone " +
      "median (shoulder width) +19.8% with the torso at +5.8%. The body says why the height ruler is wrong: " +
      "hip-to-ankle over shoulder-to-hip is 1.12 here and 1.09 on 11-06 against 1.26-1.96 on every other take, " +
      "so the nose-to-ankle span is not a stature on this lift. Round fourteen's height 0.4 and depth 0.6 read " +
      "it +31.3% (and 11-06 +31.2%). Velocities: mean 1.55 against 0.902, peak 2.50 against 1.53 -- the scale, " +
      "plus a window reading +17% short with the scale divided out.",
  },
  {
    id: "2026-11-10-single-arm-dumbbell-row-left",
    date: "2026-11-10",
    build: 728,
    exercise: "Single-Arm Dumbbell Row",
    filmedOnCommit: "45e1102",
    candidates: [
      { source: "body_3d", scaleX1000: 2.0194258633313 },
      { source: "depth", scaleX1000: 1.1307907218700822 },
      { source: "shoulder_width", scaleX1000: 4.148279610466687 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 2.8297104554308476,
    reportedRomCm: 42.6,
    sensorRomCm: 46.81,
    liveErrorPct: -2.65,
    notes:
      "70lb, the LEFT arm filmed on its own row (Set 1 · Left), ten reps on purpose (logged 8); the OVR's reps " +
      "1-10. Live path, 9 of 10, the working-hand rule on the left wrist as declared. The first single-arm row " +
      "in this ledger: the 11-06 take traced the midpoint of the two hands and has none. Range of motion " +
      "-9.0% as filmed: shoulder +33.4%, 3D (upper arm) -35.1%, depth -63.6%. Velocities: mean 1.16 against " +
      "0.954, peak 1.78 against 1.499.",
  },
  {
    id: "2026-11-10-single-arm-dumbbell-row-right",
    date: "2026-11-10",
    build: 728,
    exercise: "Single-Arm Dumbbell Row",
    filmedOnCommit: "45e1102",
    candidates: [
      { source: "body_3d", scaleX1000: 1.7187361543671295 },
      { source: "depth", scaleX1000: 1.527559396210462 },
      { source: "shoulder_width", scaleX1000: 3.0600579305026273 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.2, shoulder_width: 0.2 },
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 2.3401943129134663,
    reportedRomCm: 47.5,
    sensorRomCm: 43.51,
    liveErrorPct: 11.00,
    notes:
      "70lb, the RIGHT arm on its own row (Set 1 · Right), ten reps (logged 8); the OVR's reps 11-20. Live path, " +
      "9 of 10, the working hand the right wrist as declared. Range of motion +9.2% as filmed: shoulder +42.8%, " +
      "3D (forearm) -19.8%, depth -28.7%. The two sides need scales 1.45x apart (the phone at a different " +
      "distance from each arm), so no one constant closes both (Rule #5). Velocities: mean 1.04 against 0.894, " +
      "peak 1.87 against 1.446.",
  },
  {
    id: "2026-11-10-bench-press-set-2",
    date: "2026-11-10",
    build: 730,
    exercise: "Bench Press",
    filmedOnCommit: "44e6722",
    candidates: [
      { source: "body_3d", scaleX1000: 3.661 },
      { source: "depth", scaleX1000: 4.35123 },
      { source: "shoulder_width", scaleX1000: 3.92835 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.25, depth: 0.2, shoulder_width: 0.209 },
    shoulderSpanSpreadFraction: 0.209,
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 4.001042514321255,
    reportedRomCm: 31.6,
    sensorRomCm: 37.08,
    liveErrorPct: -13.12,
    notes:
      "135x8 beside the OVR, the first bench on round fourteen's record (build 730), 8 of 8. Range of motion " +
      "-14.8% as filmed against set 1's -8.6% on the same record: one camera, minutes apart, six points of " +
      "scatter (Rule #5). Every ruler low: the 3D pair, the shoulder (spread 0.209) and the depth ruler the " +
      "highest of the three. Velocities: mean 0.74 against 0.78, peak 1.23 against 1.11; with the scale " +
      "divided out the mean reads +11% (set 1 +33%).",
  },
  {
    id: "2026-11-10-dumbbell-shoulder-press-set-2",
    date: "2026-11-10",
    build: 730,
    exercise: "Dumbbell Shoulder Press",
    filmedOnCommit: "44e6722",
    candidates: [
      { source: "body_3d", scaleX1000: 3.2173 },
      { source: "depth", scaleX1000: 4.57078 },
      { source: "height", scaleX1000: 4.04132 },
      { source: "shoulder_width", scaleX1000: 4.01038 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.6, height: 0.4, shoulder_width: 0.4 },
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 3.5634683803538096,
    reportedRomCm: 59.1,
    sensorRomCm: 53.7,
    liveErrorPct: 4.32,
    notes:
      "30lb beside the OVR (its \"Push Press\" x11; the first rows are set-up and the set starts at the 0.92 rep " +
      "on Scott's word, which leaves eight, the eight logged), the first press on round fourteen's record " +
      "(build 730), 8 of 8. Range of motion +10.1% as filmed against set 1's +46.5% on 728 -- the round-fourteen " +
      "record working on a take it was not fitted on. The 3D pair is again the lowest ruler (3.22 against " +
      "4.01-4.57). Velocities: mean 1.21 against 0.971, peak 2.08 against 1.564; with the scale divided out " +
      "the mean reads +15%, the same as set 1.",
  },
  {
    id: "2026-11-10-dumbbell-shoulder-press-set-3",
    date: "2026-11-10",
    build: 732,
    exercise: "Dumbbell Shoulder Press",
    filmedOnCommit: "68158cd",
    candidates: [
      { source: "body_3d", scaleX1000: 2.71098 },
      { source: "depth", scaleX1000: 3.85924 },
      { source: "height", scaleX1000: 3.4931300000000003 },
      { source: "shoulder_width", scaleX1000: 3.50532 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.15, depth: 0.6, height: 0.4, shoulder_width: 0.4 },
    heightRulerVotedAsFilmed: true,
    shippedScaleX1000: 2.92842384910565,
    reportedRomCm: 60.8,
    sensorRomCm: 53.91,
    liveErrorPct: 10.25,
    notes:
      "30lb beside the OVR (its \"Push Press\" x11; the first three set-up on Scott's word, the eight from the 1.07 rep " +
      "read), build 732, live path, 7 of 8. Range of motion +12.8% as filmed. The 3D pair again the lowest " +
      "ruler and the nearest the sensor (2.71 against 3.49-3.86). Mean 1.29 against 1.03; with the scale " +
      "divided out +10.8% at 0.01 and +7.3% at the drive onset of 0.",
  },
  {
    id: "2026-11-10-single-arm-dumbbell-row-set-3-left",
    date: "2026-11-10",
    build: 732,
    exercise: "Single-Arm Dumbbell Row",
    filmedOnCommit: "68158cd",
    candidates: [
      { source: "body_3d", scaleX1000: 1.84015 },
      { source: "depth", scaleX1000: 1.19956 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.4 },
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 1.6892226733963025,
    reportedRomCm: 28.1,
    sensorRomCm: 45.4,
    liveErrorPct: -35.4,
    notes:
      "70lb, Set 3 Left on build 732 (the OVR's reps 1-8 of 17, the 17th the set-down), live path. FOUR of " +
      "eight on the phone: the pickup swallowed the first pull, the working wrist went unseen for 1.36s " +
      "(one pull lost inside the hole, which no rule recovers), the rep before the hole was deleted as a " +
      "rack move (round sixteen's trace-hole rule returns it, five of eight), and the last merged with " +
      "the set-down. Range -39% as filmed: no shoulder ruler (refused, spread 0.444) and the 3D pair -33%.",
  },
  {
    id: "2026-11-10-single-arm-dumbbell-row-set-3-right",
    date: "2026-11-10",
    build: 732,
    exercise: "Single-Arm Dumbbell Row",
    filmedOnCommit: "68158cd",
    candidates: [
      { source: "body_3d", scaleX1000: 1.84619 },
      { source: "depth", scaleX1000: 1.21808 },
      { source: "shoulder_width", scaleX1000: 5.97696 },
    ],
    uncertaintiesAsFilmed: { body_3d: 0.2, depth: 0.4, shoulder_width: 0.6219027197185618 },
    shoulderSpanSpreadFraction: 0.6219027197185618,
    heightRulerVotedAsFilmed: false,
    shippedScaleX1000: 2.099838671099803,
    reportedRomCm: 28.7,
    sensorRomCm: 41.28,
    liveErrorPct: -28.31,
    notes:
      "70lb, Set 3 Right on build 732 (the OVR's reps 9-16 of 17), file path after the live gate, 8 of 8. " +
      "Range -31% as filmed: the shoulder ruler voted at a spread of 0.62 (2x the sensor's scale) and " +
      "the 3D pair read -39%. The row's body rulers read -20% to -39% on every take.",
  },
];

/* THE ROUND-EIGHT MOVE, 2026-11-05: a RULE, and it touches NO scale number on any row.
 * summarizeTrackedSet's direction rule had the trace's polarity backwards from 2026-09-30 to
 * 2026-11-05 -- a larger y is LOWER, and the rule read a rise in y as the bar going up -- so every
 * native take reported its LOWERING as its lift (the-concentric-is-the-way-up.test.ts). This
 * ledger replays SCALE, which is direction-agnostic (a range of motion is the same magnitude either
 * way round), so every liveErrorPct here is unchanged by the fix and every scale change rounds six
 * and seven made (the plate's MAD-to-sigma, the confidence floor, the three set-3 rows above)
 * stands. Every VELOCITY figure quoted in the notes on these rows -- means, peaks, the windows and
 * caps fitted to them in rounds four through seven -- was read off the descent and is re-stated in
 * docs/camera-tracking-notes.md "Round eight". The velocity overrides fitted on the descent
 * (bench 0.03 / 200 / 1.6, press 0.12, RDL cap 2.5) are gone from FITTED_OVERRIDES; the squat
 * carries the first drive window fitted on an actual drive (0.02).
 *
 * THE SEVENTH MOVE, 2026-10-31 (round seven): ONE SMALL STEP ON EACH OF THE THREE LIFTS FILMED
 * ON 10-30, which is Scott's standing instruction for this loop ("change something on all lifts
 * after this round ... until we get to 0% I want to keep making small adjustments on everything").
 * Round six shipped two SHARED mechanism fixes, so the bench improved, the row moved only as a
 * side effect and the PRESS came out worse than it went in -- which is what this round answers.
 *
 *   BENCH PRESS, its own `maxPeakToMeanRatio` 2.0 -> 1.6. A peak cap, so it moves no ledger row
 *   (the ledger replays SCALE). Re-swept because the set-mean fix changed what a peak-to-mean
 *   ratio is and so voided round four's own rejection of 1.6: on the six bench takes with a
 *   sensor peak the bias goes +8.5% -> +3.8%, median |err| 9.45 -> 5.40, and the SPREAD is at its
 *   own minimum (24.3 -> 20.4 points); 1.5 and 1.4 buy the last of the bias by paying it back in
 *   spread, so they are the next steps and not this one. On all ten stored bench takes the reps,
 *   the range of motion and the set mean are identical at 1.6 and at 2.0.
 *
 *   BARBELL SHOULDER PRESS, its own `driveOnsetFraction` 0.08 -> 0.12. Also a window, so no
 *   ledger row moves. Round five's 0.08 was fitted against the pre-fix mean, where narrowing the
 *   window moved only the denominator; with both sums from the drive window the press reads low
 *   at 0.08 on all three 10-30 sets AND the 10-02 fixture, and 0.12 weakly dominates 0.08 and
 *   0.10 -- no take of the four is worse at it than at either. Bias -4.4% -> -1.6%, median |err|
 *   5.20 -> 1.85, spread 5.2 -> 2.7. Rep counts unchanged at every value.
 *
 *   PENDLAY ROW, and every lift, through a shared RULE rather than a number: the plate's box
 *   uncertainty is FLOORED by the band its own take-mean detection confidence earned on the 41
 *   held-out val images. Measured the same day on the same 77 plate boxes the pooled MAD comes
 *   from: conf >= 0.55 reads sigma 0.075 over 53 boxes, conf < 0.55 reads 0.211 over 24, and the
 *   step sits between the 0.40-0.55 and 0.55-0.70 bins in the plate class AND in all 145 boxes,
 *   so the split is read off the measurement rather than off this ledger. The 10-30 row's set 3
 *   is the only row below it (six plate frames at 0.44 take-mean confidence, stating the same
 *   0.084 as the bench take beside it whose plate held 205 frames at 0.93): **22.68% -> 20.79%,
 *   1 better, 0 worse, 19 unchanged.** A FLOOR, never a substitution -- the confident bin's 0.075
 *   is inside its own noise over 53 boxes, and tightening the one ruler that already dominates
 *   every blend it joins on that evidence is not a step this corpus supports; costed as a
 *   two-sided band it is 1 better and 3 WORSE. A detector property, like the pooled MAD, so it is
 *   shared across all 270 identities and FITTED_OVERRIDES is untouched by it.
 *
 * Every row with a plate in its vote now carries `plateMeanCoreMlConfidence`, read off the raw
 * exports' `objectDetection.avgCoreMlConfidence`, which is what makes the rule replayable on
 * takes filmed long before it existed rather than only on the next one.
 */

/* THE SIXTH MOVE, 2026-10-31 (round six): a STATISTIC corrected, not a number fitted.
 * `COREML_BOX_LONG_EDGE_UNCERTAINTY` was the detector's relative MAD (0.056) handed straight to
 * an inverse-variance blend, which needs a SIGMA -- so the plate's weight was overstated by
 * 1.4826^2 = 2.2x, 12.1 times a body ruler's where the measurement supports 5.7. Converting it
 * (MAD / 0.6745 = 0.083) moves the THREE rows whose plate actually joined the cluster and no
 * others: bench set 1 +3.21 -> +2.20, bench set 3 +5.52 -> +3.58, row set 3 +23.21 -> +22.68.
 * Seventeen rows unchanged, NONE worse. Found on the bench's set 3, whose plate had done nothing
 * wrong: 205 frames at 0.60-1.00 confidence, aspect 0.93, and a box 7.3% small -- 1.26 sigma of
 * what the constant states. An ordinary draw carrying 86% of the blend, which is the finding.
 *
 * THE FIFTH MOVE, 2026-10-31 (round six): the SET mean sums the DRIVE window's distance rather
 * than the whole phase's. Not a scale number, so no row's liveErrorPct moves for it; the bench
 * set 3 row's note carries the +10.4% -> +2.9% and the twelve-take costing. */

/* THE FOURTH MOVE, 2026-10-30 (round five, on the set-2 takes of 703): a RULE, not a number. The
 * grip yardstick in rejectImplausibleScales stands down when it would convict a strict majority
 * of the rulers, which is what it did on the row's set 2 (2 of 3, off a grip read narrower than
 * the shoulders). That row records the defect (shippedUnderDefect) and reads +2.85% through the
 * fixed pipeline at the row's record; NO other row moves, because the only other take in the
 * corpus with a rejection is the 10-01 squat set 2 fixture at 1 of 5. The Barbell Shoulder
 * Press's own driveOnsetFraction (0.08) is a window number the scale replay never reads, so its
 * two rows' liveErrorPct are their as-filmed +1.19% and -8.13%. The row's set-2 shoulder spread
 * (0.317) is on the row and the live replay states max(floor, spread) for the shoulder ruler,
 * which is what the phone does; every other row's spread was under the floor and is unaffected.
 *
 * THE THIRD MOVE, 2026-10-30 (round four on build 701): the Pendlay Row's own depthRulerUncertainty
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
