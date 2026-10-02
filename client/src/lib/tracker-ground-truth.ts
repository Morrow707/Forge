/**
 * Known-correct measurements to check the tracker against.
 *
 * WHY THIS FILE EXISTS
 *
 * Every threshold in the trust scores is uncalibrated, and only back squat,
 * Pendlay row, bench press and box jump have ever been checked against real
 * lifts. That is the ceiling on everything the camera produces, and no amount
 * of AI work moves it. What moves it is measuring the error.
 *
 * The seed entry below is real: a bench set filmed from the foot of the
 * bench, where a bar sensor read 15.3 inches of travel and a broken
 * calibration made the tracker report 181 centimetres. It is already the
 * fixture behind rom-plausibility.test.ts. Written down here as a
 * measurement rather than only as a regression case, it becomes the first
 * row of an error table instead of a one-off bug.
 *
 * HOW TO ADD ONE
 *
 * Film a set with a known value alongside it -- a bar sensor, a tape
 * measure, a timing gate, a loaded jump mat. Record what the instrument said
 * and what the tracker said. The instrument is never assumed perfect; where
 * its own error matters, put it in `instrumentNote`.
 *
 * This is deliberately data and not a test. A test asserts a threshold
 * somebody guessed. This accumulates evidence about what the real error is,
 * which is the thing that has to exist before any threshold can stop being a
 * guess.
 */

export type GroundTruthEntry = {
  id: string;
  exercise: string;
  metric:
    | "romCm"
    | "peakVelocityMps"
    | "meanVelocityMps"
    // How many reps the tracker segmented out of a set, against how many were
    // actually performed. Added because the first paired bench data showed the
    // set's AVERAGE velocity landing within a few percent while the per-rep
    // numbers were wild -- which is a segmentation error, not a scale error,
    // and no velocity metric on its own can tell those two apart.
    | "repCount"
    | "jumpHeightCm"
    | "elapsedSeconds";
  /** What the reference instrument measured. */
  trueValue: number;
  /** What the tracker reported for the same rep or set. */
  trackedValue: number;
  unit: string;
  instrument: string;
  instrumentNote?: string;
  /** Anything about the setup that plausibly explains a discrepancy. */
  setupNote?: string;
  recordedOn: string;
};

export const GROUND_TRUTH: GroundTruthEntry[] = [
  {
    id: "bench-2026-01-foot-of-bench",
    exercise: "Bench Press",
    metric: "romCm",
    trueValue: 38.9,
    trackedValue: 180.5,
    unit: "cm",
    instrument: "bar sensor (OVR)",
    setupNote:
      "5'10\" athlete, 135lb, camera at the foot of the bench. Calibration reported success on 121 of 639 frames, the tracker did not know it had failed, which is the part that matters.",
    recordedOn: "2026-01-01",
  },

  // ---- OVR paired bench, 2026-09-18 ----
  //
  // Two sets of 10 at 155lb, measured on an OVR bar sensor, filmed in the same
  // session as a Forge capture of the same exercise at the same load. OVR's own
  // two sets agree closely with each other (mean 0.70 and 0.71 m/s, peak 0.99
  // on both), which is what makes them usable as a reference rather than one
  // reading.
  //
  // WHAT THIS PAIR ACTUALLY SETTLES, and it is not what was expected. The
  // standing theory was a scale factor read too large -- every distance and so
  // every speed inflated by one factor. The set-level mean says otherwise: 0.73
  // tracked against 0.705 measured is 3.5% high, which for a phone against a
  // bar sensor is close. The scale was fine on this take.
  //
  // What is broken is rep segmentation. Ten reps were performed; the tracker
  // reported fifteen. OVR's per-rep peaks span 0.91 to 1.10 m/s across both
  // sets -- a tight, believable spread for one load -- while the tracker's
  // per-rep figures for the same session ran 0.24 to 1.96, an eightfold range
  // on a set where the bar plainly did not do that. Splitting one rep into two
  // produces exactly this: a fast fragment and a slow fragment whose average is
  // still about right, which is why the set aggregate looked fine and hid it.
  //
  // So the next piece of work is segmentPhases, not the calibration sources.
  // Noted here rather than acted on: one paired session is evidence, not a
  // calibration, and summarizeError's own `usable` floor of five says so.
  {
    id: "bench-2026-09-18-ovr-set1-repcount",
    exercise: "Bench Press",
    metric: "repCount",
    trueValue: 10,
    trackedValue: 15,
    unit: "reps",
    instrument: "OVR bar sensor + rep count performed",
    setupNote:
      "155lb x 10, same session as the Forge capture. The tracker's own banner said 'Tracked 15 reps on a set prescribed at 10', so it knew the count disagreed and reported the numbers built from it anyway.",
    recordedOn: "2026-09-18",
  },
  {
    id: "bench-2026-09-18-ovr-mean-velocity",
    exercise: "Bench Press",
    metric: "meanVelocityMps",
    trueValue: 0.705,
    trackedValue: 0.73,
    unit: "m/s",
    instrument: "bar sensor (OVR)",
    instrumentNote:
      "Mean of OVR's own two sets at the same load (0.70 and 0.71), which agreed to within its own display rounding.",
    setupNote:
      "155lb bench. The set aggregate is close even though the per-rep figures behind it are not, see this block's own comment on why that is the signature of a segmentation error rather than a scale error.",
    recordedOn: "2026-09-18",
  },
  {
    id: "bench-2026-09-18-ovr-peak-velocity",
    exercise: "Bench Press",
    metric: "peakVelocityMps",
    trueValue: 0.99,
    trackedValue: 1.96,
    unit: "m/s",
    instrument: "bar sensor (OVR)",
    instrumentNote:
      "OVR's per-rep peak never left 0.91-1.10 across twenty reps at this load; 0.99 is the set average it reported for both sets.",
    setupNote:
      "The tracked figure is the highest per-rep value the tracker reported for the session. Kept as the worst case on purpose: a set peak is what a coach reads, and a fragment of a rep reported as a whole one is how it gets doubled.",
    recordedOn: "2026-09-18",
  },
];

/** OVR's own readings for the two 2026-09-18 bench sets, kept whole.
 *
 * The entries above are pairs -- one true value against one tracked value --
 * which is the right shape for an error table and throws away the per-rep
 * detail. That detail is the evidence for the segmentation finding, so it is
 * kept here rather than summarised into it. Ten reps per set, in order.
 *
 * Columns as OVR displays them: mean and peak concentric velocity (m/s), range
 * of motion (inches), mean and peak concentric power (W), time to peak velocity
 * (s). EAI is omitted for set 1, which was screenshotted with the column cut
 * off; bar-tracking.ts's own eai comment already documents the formula it was
 * reverse-engineered from.
 */
export const OVR_BENCH_2026_09_18 = {
  loadLb: 155,
  repsPerSet: 10,
  sets: [
    {
      set: 1,
      reps: [
        { meanVelocityMps: 0.71, peakVelocityMps: 1.0, romIn: 14.1, meanW: 492, peakW: 692, tpvS: 0.34 },
        { meanVelocityMps: 0.75, peakVelocityMps: 1.06, romIn: 15.0, meanW: 519, peakW: 730, tpvS: 0.34 },
        { meanVelocityMps: 0.73, peakVelocityMps: 1.0, romIn: 13.9, meanW: 499, peakW: 692, tpvS: 0.34 },
        { meanVelocityMps: 0.71, peakVelocityMps: 1.0, romIn: 13.9, meanW: 492, peakW: 692, tpvS: 0.34 },
        { meanVelocityMps: 0.72, peakVelocityMps: 0.99, romIn: 14.5, meanW: 494, peakW: 683, tpvS: 0.35 },
        { meanVelocityMps: 0.72, peakVelocityMps: 0.98, romIn: 15.2, meanW: 496, peakW: 673, tpvS: 0.35 },
        { meanVelocityMps: 0.76, peakVelocityMps: 1.03, romIn: 14.8, meanW: 522, peakW: 711, tpvS: 0.34 },
        { meanVelocityMps: 0.74, peakVelocityMps: 0.98, romIn: 14.7, meanW: 510, peakW: 674, tpvS: 0.35 },
        { meanVelocityMps: 0.7, peakVelocityMps: 0.95, romIn: 14.6, meanW: 483, peakW: 654, tpvS: 0.35 },
        // Last rep of both sets reads slower with a longer range of motion. OVR
        // shows it too, so it is the lift and not the instrument -- a grindy
        // final rep, or the re-rack travelling further than a press.
        { meanVelocityMps: 0.52, peakVelocityMps: 0.94, romIn: 17.0, meanW: 355, peakW: 645, tpvS: 0.28 },
      ],
      reported: { meanVelocityMps: 0.7, peakVelocityMps: 0.99, romIn: 14.7, meanW: 486, peakW: 684, tpvS: 0.33 },
    },
    {
      set: 2,
      reps: [
        { meanVelocityMps: 0.69, peakVelocityMps: 0.98, romIn: 15.2, meanW: 477, peakW: 673, tpvS: 0.34, eai: 2.85 },
        { meanVelocityMps: 0.76, peakVelocityMps: 1.07, romIn: 14.9, meanW: 520, peakW: 740, tpvS: 0.32, eai: 3.31 },
        { meanVelocityMps: 0.77, peakVelocityMps: 1.1, romIn: 14.4, meanW: 530, peakW: 758, tpvS: 0.31, eai: 3.49 },
        { meanVelocityMps: 0.76, peakVelocityMps: 1.05, romIn: 14.6, meanW: 525, peakW: 721, tpvS: 0.31, eai: 3.32 },
        { meanVelocityMps: 0.71, peakVelocityMps: 0.95, romIn: 13.9, meanW: 491, peakW: 654, tpvS: 0.26, eai: 3.63 },
        { meanVelocityMps: 0.71, peakVelocityMps: 1.02, romIn: 14.9, meanW: 491, peakW: 702, tpvS: 0.33, eai: 3.05 },
        { meanVelocityMps: 0.75, peakVelocityMps: 0.99, romIn: 15.1, meanW: 515, peakW: 683, tpvS: 0.33, eai: 2.97 },
        { meanVelocityMps: 0.69, peakVelocityMps: 0.91, romIn: 14.3, meanW: 473, peakW: 626, tpvS: 0.35, eai: 2.58 },
        { meanVelocityMps: 0.7, peakVelocityMps: 0.94, romIn: 14.8, meanW: 480, peakW: 645, tpvS: 0.27, eai: 3.46 },
        { meanVelocityMps: 0.56, peakVelocityMps: 0.96, romIn: 17.2, meanW: 395, peakW: 664, tpvS: 0.27, eai: 3.56 },
      ],
      reported: { meanVelocityMps: 0.71, peakVelocityMps: 0.99, romIn: 14.9, meanW: 489, peakW: 686, tpvS: 0.3, eai: 3.22 },
    },
  ],
} as const;

/**
 * THE FIRST PAIRED SIDE-ON BENCH. Scott's bar sensor and Forge's camera, same set, 2026-09-22.
 *
 * Every earlier paired set was filmed from the foot of the bench, where the bar points at the
 * lens and nothing about it is measurable. This one was filmed square to the side, and the body
 * tracking was excellent: a body on 719 of 719 frames, both hands most frames, 614 frames giving
 * a bar point. So what is left is not a tracking failure, and that is what makes it worth
 * keeping -- it isolates the two faults underneath.
 *
 * The ratios below say they are TWO faults, not one, and this is the whole reason for recording
 * per-metric rather than a single accuracy number:
 *
 *   ROM              37.3 cm -> 47.8 cm   1.28x
 *   Mean velocity    0.70    -> 1.09      1.56x
 *   Peak velocity    1.01    -> 2.61      2.58x
 *   Reps             10      -> 9         one lost
 *
 * ROM and mean velocity are both a little over 1.3x. That is a SCALE error -- the picture was
 * sized about 30% too large and every distance inherits it. Peak is 2.58x, and scale alone does
 * not get you there: the rest is jitter. At 120fps the per-frame plausibility gate measured
 * speed over 8.3ms, so landmark noise read as enormous instantaneous velocity, 284 reads were
 * thrown out as "impossibly fast", and the survivors were still inflated. A whole rep went into
 * that hole (largest trace gap 1.735s).
 *
 * Forge logged the set at 1 lb -- a typo, the real load was 135 lb -- so the watts on the Forge
 * side of this set are meaningless and are deliberately not recorded as a comparison.
 *
 * TOLERANCE: 10% for ROM, 15% for the velocities, exact for rep count.
 *
 * Not a round number pulled out of the air. The sensor's own per-rep spread across the ten reps
 * of this set is about 8% on ROM (14.0 to 17.2 in) and about 12% on peak velocity (0.85 to 1.14
 * m/s) -- and that is one man doing one set of ten, so it is the floor on what "agreement" can
 * mean at all. A camera that lands inside the instrument's own rep-to-rep variation has nothing
 * left to fix that this fixture can see. Rep count gets no tolerance because a miscounted rep is
 * not a small error in a number, it is a different set.
 */
export const OVR_BENCH_SIDE_ON_2026_09_22 = {
  loadLb: 135,
  repsPerSet: 10,
  camera: "side, level with bar",
  /** What the phone negotiated, because the velocity fault is a frame-rate fault. */
  captureFormat: "1920x1080 @ 120fps",
  tolerance: { romCm: 0.1, meanVelocityMps: 0.15, peakVelocityMps: 0.15, repCount: 0 },
  sensor: {
    reps: [
      { meanVelocityMps: 0.77, peakVelocityMps: 1.14, romIn: 14.4, meanW: 461, peakW: 694, tpvS: 0.31, eai: 3.67 },
      { meanVelocityMps: 0.78, peakVelocityMps: 1.12, romIn: 15.4, meanW: 465, peakW: 677, tpvS: 0.33, eai: 3.38 },
      { meanVelocityMps: 0.73, peakVelocityMps: 1.05, romIn: 14.4, meanW: 436, peakW: 628, tpvS: 0.35, eai: 2.98 },
      { meanVelocityMps: 0.80, peakVelocityMps: 1.09, romIn: 14.4, meanW: 477, peakW: 652, tpvS: 0.27, eai: 4.01 },
      { meanVelocityMps: 0.73, peakVelocityMps: 1.03, romIn: 14.7, meanW: 436, peakW: 619, tpvS: 0.33, eai: 3.09 },
      { meanVelocityMps: 0.70, peakVelocityMps: 0.96, romIn: 14.0, meanW: 422, peakW: 578, tpvS: 0.26, eai: 3.69 },
      { meanVelocityMps: 0.72, peakVelocityMps: 0.98, romIn: 14.9, meanW: 434, peakW: 586, tpvS: 0.32, eai: 3.01 },
      { meanVelocityMps: 0.68, peakVelocityMps: 0.91, romIn: 14.1, meanW: 407, peakW: 545, tpvS: 0.34, eai: 2.65 },
      { meanVelocityMps: 0.72, peakVelocityMps: 0.99, romIn: 14.3, meanW: 434, peakW: 595, tpvS: 0.34, eai: 2.89 },
      // The grindy last rep again, in both instruments and in every set so far. It is the lift.
      { meanVelocityMps: 0.39, peakVelocityMps: 0.85, romIn: 17.2, meanW: 236, peakW: 512, tpvS: 0.27, eai: 3.05 },
    ],
    reported: { meanVelocityMps: 0.70, peakVelocityMps: 1.01, romIn: 14.7, meanW: 420, peakW: 608, tpvS: 0.31, eai: 3.24 },
  },
  /** What Forge produced from the same set, build 493. Watts omitted: the 1 lb typo. */
  forge: {
    romCm: 47.8,
    meanVelocityMps: 1.09,
    peakVelocityMps: 2.61,
    eccentricMeanVelocityMps: 1.27,
    concentricSeconds: 0.63,
    barPathDeviationCm: 18.1,
    repCount: 9,
    velocityLossPercent: 33.1,
  },
  /** The pipeline's own account of the take, for anything reasoning about WHY. */
  diagnostics: {
    framesWithBody: 719,
    framesAnalyzed: 851,
    framesGivingABarPoint: 614,
    framesDroppedAsImpossiblyFast: 284,
    largestTraceGapSeconds: 1.735,
    scaleSource: "shoulder_width",
    scaleFactorMPerUnit: 0.004981024004809343,
    shoulderMeasuredPx: 87.96,
    gripWidthPx: 148,
    plateRejectedReasons: ["size_vs_grip", "too_far_from_athlete"],
    analysisSeconds: 37.92,
    clipSeconds: 28.385,
  },
} as const;

/**
 * THE SAME MAN, THE SAME BENCH, THE SAME DAY, FILMED HEAD-ON. The unusable-framing fixture.
 *
 * Kept deliberately as the counter-example: from the foot of the bench the bar points at the
 * lens, so its travel projects to almost nothing and no framing advice can recover it. Anything
 * claiming to fix the side-on set must NOT start reporting confident numbers here.
 *
 * Its sensor numbers are close to the side-on set's (it is the same lifter doing the same work),
 * which is exactly what makes it a good control: the truth barely moved, so any difference in
 * what Forge produces is the camera angle and nothing else.
 */
export const OVR_BENCH_HEAD_ON_2026_09_22 = {
  loadLb: 135,
  repsPerSet: 10,
  camera: "head-on, from the foot of the bench, unusable framing",
  sensor: { meanVelocityMps: 0.78, peakVelocityMps: 1.10, romIn: 15.2, meanW: 469, peakW: 662, tpvS: 0.28 },
  forge: {
    romCm: 42.9,
    meanVelocityMps: 0.91,
    peakVelocityMps: 2.93,
    repCount: null,
    barPathDeviationCm: 21.2,
  },
  diagnostics: {
    scaleSource: "shoulder_width",
    scaleFactorMPerUnit: 0.0037990873614300075,
    shoulderMeasuredPx: 115.33,
    gripWidthPx: 129.5,
    // The 583px "plate" that is really a rack upright -- see PLATE_DISC_MAX_GRIP_RATIO.
    plateMeasuredPx: 583.94,
    plateAspectRatio: 1.03,
    analysisSeconds: 39.28,
    clipSeconds: 29.85,
  },
} as const;

/** Inches to centimetres, so a fixture can stay in the units its instrument printed. */
export function inchesToCm(inches: number): number {
  return inches * 2.54;
}

/** Signed error as a fraction of the true value. Positive means over-reported. */
export function relativeError(entry: GroundTruthEntry): number {
  if (entry.trueValue === 0) return Number.NaN;
  return (entry.trackedValue - entry.trueValue) / entry.trueValue;
}

/**
 * Error summary per exercise and metric.
 *
 * Median absolute error rather than mean, because a single broken-calibration
 * reading is 360% out and would dominate a mean, hiding whether the tracker
 * is normally good. The count is returned alongside because an error figure
 * from two sets is not a measurement, and the caller has to be able to say so.
 */
export function summarizeError(entries: GroundTruthEntry[] = GROUND_TRUTH) {
  const groups = new Map<string, GroundTruthEntry[]>();
  for (const entry of entries) {
    const key = `${entry.exercise}::${entry.metric}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return [...groups.entries()].map(([key, group]) => {
    const [exercise, metric] = key.split("::");
    const errors = group.map((e) => Math.abs(relativeError(e))).sort((a, b) => a - b);
    const median = errors[Math.floor(errors.length / 2)];
    return {
      exercise,
      metric,
      samples: group.length,
      medianAbsoluteError: Math.round(median * 1000) / 1000,
      worst: Math.round(Math.max(...errors) * 1000) / 1000,
      // Below this nothing here is a measurement, and any threshold derived
      // from it is still a guess wearing a number.
      usable: group.length >= 5,
    };
  });
}

/**
 * BENCH AT AN ANGLE, 2026-09-29, BUILD 560: the take the segmenter got wrong for a new reason.
 *
 * Same lifter, same bench, same 135lb x 10, filmed at roughly 45 degrees from the foot of the
 * bench with the phone on a rack post (cameraPitchDeg 9). The wrists were tracked from the
 * walk-in, so the take's largest reversals were lying down, the un-rack and the re-rack, and
 * the relative gate's ladder took THOSE as the typical rep. Three "reps" at a 116cm range of
 * motion, a scale_suspect banner blaming the camera angle, and the sensor beside it reading
 * ten at 14.4in. See bench-oblique-rack-moves.test.ts for the replay and bar-tracking.ts
 * (expectedReps, isolatedRackMoves) for the two rules it produced.
 */
export const OVR_BENCH_OBLIQUE_2026_09_29 = {
  loadLb: 135,
  repsPerSet: 10,
  camera: "about 45 degrees off the foot of the bench, phone on a rack post, pitched 9 degrees down",
  captureFormat: "1920x1080 @ 120fps (16:9 fallback)",
  sensor: {
    reps: [
      { meanVelocityMps: 0.71, peakVelocityMps: 1.07, romIn: 14.6, meanW: 426, peakW: 644, tpvS: 0.31, eai: 3.40 },
      { meanVelocityMps: 0.71, peakVelocityMps: 1.12, romIn: 13.9, meanW: 429, peakW: 678, tpvS: 0.30, eai: 3.68 },
      { meanVelocityMps: 0.69, peakVelocityMps: 1.02, romIn: 13.5, meanW: 416, peakW: 611, tpvS: 0.28, eai: 3.43 },
      { meanVelocityMps: 0.72, peakVelocityMps: 1.06, romIn: 14.6, meanW: 434, peakW: 636, tpvS: 0.32, eai: 3.27 },
      { meanVelocityMps: 0.70, peakVelocityMps: 0.99, romIn: 14.1, meanW: 420, peakW: 595, tpvS: 0.33, eai: 2.97 },
      { meanVelocityMps: 0.70, peakVelocityMps: 1.05, romIn: 13.9, meanW: 422, peakW: 628, tpvS: 0.32, eai: 3.22 },
      { meanVelocityMps: 0.71, peakVelocityMps: 0.99, romIn: 14.6, meanW: 427, peakW: 595, tpvS: 0.36, eai: 2.75 },
      { meanVelocityMps: 0.70, peakVelocityMps: 0.94, romIn: 13.8, meanW: 418, peakW: 561, tpvS: 0.31, eai: 2.97 },
      { meanVelocityMps: 0.70, peakVelocityMps: 0.95, romIn: 14.6, meanW: 421, peakW: 570, tpvS: 0.32, eai: 2.93 },
      { meanVelocityMps: 0.70, peakVelocityMps: 0.99, romIn: 16.4, meanW: 421, peakW: 595, tpvS: 0.32, eai: 3.05 },
    ],
    reported: { meanVelocityMps: 0.70, peakVelocityMps: 1.01, romIn: 14.4, meanW: 423, peakW: 611, tpvS: 0.31, eai: 3.16 },
  },
  /** What the device reported on the day, build 560. */
  forgeOnDevice: {
    repCount: 3,
    romCm: 116.3,
    meanVelocityMps: 0.87,
    peakVelocityMps: 1.95,
    barPathDeviationCm: 55.7,
    outcome: "scale_suspect",
  },
  /** The same stored trace replayed after the two segmentation rules (see the header). */
  forgeReplayed: {
    repCount: 10,
    romCm: 32.9,
    meanVelocityMps: 0.58,
    peakVelocityMps: 1.63,
    /** Per-rep range of motion ran 22 to 52cm against the sensor's 34 to 42: the tracker, not
     *  the ruler -- 252 frames carried a lone hand and the bar point flipped sides 92 times. */
    perRepRomCmSpread: [22.5, 52.3],
  },
  diagnostics: {
    scaleSource: "shoulder_width",
    scaleFactorMPerUnit: 0.004428638415860077,
    shoulderMeasuredPx: 98.9,
    gripWidthPx: 168.4,
    framesWithBody: 670,
    barPointFromLoneHandCarried: 252,
    barPointSideFlipped: 92,
    framesWithCoreMlImplement: 0,
    bestPlateCandidateConfidence: 0.34,
    liveCoverage: 0.47,
    cameraPitchDeg: 9,
  },
} as const;

/**
 * BUILDS 571 AND 572, 2026-09-29, SETS 5 AND 6: the first two takes on which the scale was
 * within a tenth by two different rulers -- and the reason neither is trusted alone yet.
 *
 * Set 5 (571): the in-plane 3D ruler (0.00342) and the shoulder ruler (0.00424) clustered and
 * were averaged (0.00383); ROM 37.9cm against 36.1. Set 6 (572): in-plane 0.00303 won alone,
 * ROM 26cm against 35 -- the shoulder ruler (0.00408) would have been exact. Mean velocity
 * read 0.81 against 0.84 anyway, because the concentric window was 0.32s against the sensor's
 * 0.42 and the two errors cancelled. The sensor-implied truth (its ROM over the trace's along-
 * axis travel) is 0.00365 and 0.00410; the depth ruler (depthRulerScale) read 8% low on both.
 */
export const OVR_BENCH_SET5_2026_09_29 = {
  build: 571,
  loadLb: 135,
  repsPerSet: 10,
  camera: "foot of the bench, pitched 12.6 degrees down, wrists 2.80m from the lens",
  captureFormat: "1920x1080 @ 120fps (16:9 fallback)",
  sensor: {
    reps: [
      { meanVelocityMps: 0.79, peakVelocityMps: 1.09, romIn: 14.6, meanW: 475, peakW: 652, tpvS: 0.28, eai: 3.66 },
      { meanVelocityMps: 0.75, peakVelocityMps: 1.11, romIn: 13.9, meanW: 452, peakW: 669, tpvS: 0.33, eai: 3.34 },
      { meanVelocityMps: 0.78, peakVelocityMps: 1.11, romIn: 14.0, meanW: 466, peakW: 669, tpvS: 0.31, eai: 3.53 },
      { meanVelocityMps: 0.81, peakVelocityMps: 1.14, romIn: 14.0, meanW: 483, peakW: 694, tpvS: 0.28, eai: 4.01 },
      { meanVelocityMps: 0.82, peakVelocityMps: 1.14, romIn: 14.7, meanW: 489, peakW: 694, tpvS: 0.27, eai: 4.13 },
      { meanVelocityMps: 0.79, peakVelocityMps: 1.07, romIn: 14.0, meanW: 475, peakW: 644, tpvS: 0.28, eai: 3.61 },
      { meanVelocityMps: 0.78, peakVelocityMps: 1.06, romIn: 14.1, meanW: 468, peakW: 636, tpvS: 0.28, eai: 3.56 },
      { meanVelocityMps: 0.75, peakVelocityMps: 1.00, romIn: 14.1, meanW: 451, peakW: 603, tpvS: 0.33, eai: 3.01 },
      { meanVelocityMps: 0.72, peakVelocityMps: 0.92, romIn: 14.5, meanW: 430, peakW: 554, tpvS: 0.24, eai: 3.79 },
      { meanVelocityMps: 0.75, peakVelocityMps: 1.05, romIn: 16.4, meanW: 450, peakW: 628, tpvS: 0.31, eai: 3.32 },
    ],
    reported: { meanVelocityMps: 0.77, peakVelocityMps: 1.07, romIn: 14.4, meanW: 463, peakW: 644, tpvS: 0.28, eai: 3.59 },
  },
  forgeOnDevice: { repCount: 8, meanVelocityMps: 1.11, romCm: 37.9, scaleSource: "both", scale: 0.003827 },
  forgeReplayed: { repCount: 11, meanVelocityMps: 0.73, romCm: 31.3 },
  rulers: { inPlane3D: 0.003417, shoulderWidth: 0.004236, depthRuler: 0.00334, sensorImplied: 0.00365 },
};

export const OVR_BENCH_SET6_2026_09_29 = {
  build: 572,
  loadLb: 135,
  repsPerSet: 10,
  camera: "foot of the bench, pitched 13.8 degrees down, wrists 3.18m from the lens",
  captureFormat: "1920x1080 @ 120fps (16:9 fallback)",
  sensor: {
    reps: [
      { meanVelocityMps: 0.82, peakVelocityMps: 1.14, romIn: 13.5, meanW: 490, peakW: 694, tpvS: 0.24, eai: 4.75 },
      { meanVelocityMps: 0.89, peakVelocityMps: 1.29, romIn: 13.6, meanW: 534, peakW: 776, tpvS: 0.25, eai: 5.13 },
      { meanVelocityMps: 0.89, peakVelocityMps: 1.21, romIn: 13.9, meanW: 536, peakW: 727, tpvS: 0.22, eai: 5.38 },
      { meanVelocityMps: 0.91, peakVelocityMps: 1.28, romIn: 13.6, meanW: 547, peakW: 768, tpvS: 0.25, eai: 5.07 },
      { meanVelocityMps: 0.85, peakVelocityMps: 1.18, romIn: 13.5, meanW: 508, peakW: 710, tpvS: 0.25, eai: 4.69 },
      { meanVelocityMps: 0.79, peakVelocityMps: 1.12, romIn: 13.5, meanW: 476, peakW: 677, tpvS: 0.28, eai: 3.80 },
      { meanVelocityMps: 0.84, peakVelocityMps: 1.20, romIn: 12.7, meanW: 501, peakW: 719, tpvS: 0.24, eai: 4.92 },
      { meanVelocityMps: 0.82, peakVelocityMps: 1.14, romIn: 13.1, meanW: 494, peakW: 694, tpvS: 0.24, eai: 4.75 },
      { meanVelocityMps: 0.81, peakVelocityMps: 1.12, romIn: 13.2, meanW: 486, peakW: 678, tpvS: 0.24, eai: 4.63 },
      { meanVelocityMps: 0.86, peakVelocityMps: 1.14, romIn: 17.7, meanW: 515, peakW: 694, tpvS: 0.31, eai: 3.67 },
    ],
    reported: { meanVelocityMps: 0.84, peakVelocityMps: 1.18, romIn: 13.8, meanW: 508, peakW: 713, tpvS: 0.25, eai: 4.68 },
  },
  forgeOnDevice: {
    repCount: 10,
    meanVelocityMps: 0.81,
    romCm: 26,
    scaleSource: "body_3d",
    scale: 0.003035,
    concentricSeconds: [0.37, 0.33, 0.37, 0.37, 0.33, 0.43, 0.27, 0.4, 0.37, 0.3],
    repMeans: [0.79, 0.74, 0.85, 0.7, 0.78, 0.65, 0.95, 0.67, 0.75, 1.22],
  },
  rulers: { inPlane3D: 0.003035, shoulderWidth: 0.004081, depthRuler: 0.00379, sensorImplied: 0.0041 },
};

export const OVR_BENCH_SET7_2026_09_29 = {
  build: 573,
  loadLb: 135,
  repsPerSet: 10,
  camera: "foot of the bench, wrists 2.67m from the lens, bar tilted 29 degrees",
  captureFormat: "1920x1080 @ 120fps (16:9 fallback)",
  sensor: {
    reps: [
      { meanVelocityMps: 0.75, peakVelocityMps: 1.10, romIn: 13.8, meanW: 450, peakW: 661, tpvS: 0.28, eai: 3.70 },
      { meanVelocityMps: 0.84, peakVelocityMps: 1.25, romIn: 14.3, meanW: 503, peakW: 752, tpvS: 0.27, eai: 4.63 },
      { meanVelocityMps: 0.79, peakVelocityMps: 1.14, romIn: 14.2, meanW: 471, peakW: 694, tpvS: 0.28, eai: 4.01 },
      { meanVelocityMps: 0.76, peakVelocityMps: 1.12, romIn: 13.7, meanW: 454, peakW: 677, tpvS: 0.28, eai: 3.79 },
      { meanVelocityMps: 0.79, peakVelocityMps: 1.11, romIn: 14.1, meanW: 477, peakW: 669, tpvS: 0.28, eai: 3.87 },
      { meanVelocityMps: 0.75, peakVelocityMps: 1.11, romIn: 14.3, meanW: 449, peakW: 669, tpvS: 0.32, eai: 3.43 },
      { meanVelocityMps: 0.78, peakVelocityMps: 1.10, romIn: 14.1, meanW: 468, peakW: 661, tpvS: 0.28, eai: 3.70 },
      { meanVelocityMps: 0.80, peakVelocityMps: 1.11, romIn: 14.5, meanW: 482, peakW: 669, tpvS: 0.30, eai: 3.64 },
      { meanVelocityMps: 0.78, peakVelocityMps: 1.07, romIn: 14.6, meanW: 467, peakW: 644, tpvS: 0.30, eai: 3.50 },
      { meanVelocityMps: 0.70, peakVelocityMps: 0.98, romIn: 16.9, meanW: 421, peakW: 586, tpvS: 0.36, eai: 2.64 },
    ],
    reported: { meanVelocityMps: 0.77, peakVelocityMps: 1.11, romIn: 14.4, meanW: 464, peakW: 668, tpvS: 0.28, eai: 3.69 },
  },
  forgeOnDevice: {
    repCount: 10,
    meanVelocityMps: 0.93,
    romCm: 38.3,
    scaleSource: "both",
    scale: 0.003815,
    concentricSeconds: [0.37, 0.33, 0.37, 0.47, 0.47, 0.37, 0.47, 0.47, 0.47, 1.03],
  },
  rulers: { inPlane3D: 0.0038, shoulderWidth: 0.00383, depthRuler: 0.003176, sensorImplied: 0.00365 },
};

export const OVR_BENCH_SET8_2026_09_29 = {
  build: 574,
  loadLb: 135,
  repsPerSet: 10,
  camera: "foot of the bench, wrists 2.61m from the lens; the grip axis read 78 degrees from vertical",
  captureFormat: "1920x1080 @ 120fps (16:9 fallback)",
  sensor: {
    reps: [
      { meanVelocityMps: 0.75, peakVelocityMps: 1.07, romIn: 14.4, meanW: 452, peakW: 644, tpvS: 0.30, eai: 3.50 },
      { meanVelocityMps: 0.81, peakVelocityMps: 1.12, romIn: 14.4, meanW: 487, peakW: 677, tpvS: 0.30, eai: 3.68 },
      { meanVelocityMps: 0.81, peakVelocityMps: 1.14, romIn: 14.3, meanW: 483, peakW: 694, tpvS: 0.28, eai: 3.89 },
      { meanVelocityMps: 0.75, peakVelocityMps: 1.07, romIn: 13.9, meanW: 452, peakW: 644, tpvS: 0.28, eai: 3.61 },
      { meanVelocityMps: 0.78, peakVelocityMps: 1.09, romIn: 14.0, meanW: 466, peakW: 653, tpvS: 0.30, eai: 3.55 },
      { meanVelocityMps: 0.73, peakVelocityMps: 1.00, romIn: 14.2, meanW: 437, peakW: 603, tpvS: 0.31, eai: 3.18 },
      { meanVelocityMps: 0.76, peakVelocityMps: 1.09, romIn: 14.3, meanW: 456, peakW: 652, tpvS: 0.28, eai: 3.66 },
      { meanVelocityMps: 0.72, peakVelocityMps: 0.99, romIn: 13.8, meanW: 433, peakW: 595, tpvS: 0.32, eai: 3.05 },
      { meanVelocityMps: 0.73, peakVelocityMps: 0.99, romIn: 13.4, meanW: 436, peakW: 595, tpvS: 0.24, eai: 4.07 },
      { meanVelocityMps: 0.77, peakVelocityMps: 1.09, romIn: 16.6, meanW: 460, peakW: 652, tpvS: 0.34, eai: 3.17 },
    ],
    reported: { meanVelocityMps: 0.76, peakVelocityMps: 1.06, romIn: 14.3, meanW: 456, peakW: 640, tpvS: 0.28, eai: 3.53 },
  },
  forgeOnDevice: {
    repCount: 9,
    meanVelocityMps: 2.03,
    romCm: 60.2,
    scaleSource: "both",
    scale: 0.003396,
    // The device rotated the trace onto a grip axis 78 degrees from vertical (see
    // reconcileMovementAxis); the numbers above are what that produced. Segmented along the
    // image vertical the same trace gives 10 reps, 33.9cm, 0.87 m/s.
    axis: { x: 0.9779, y: 0.2091 },
  },
  // sensorImplied from the vertical-axis replay (33.9cm at 0.003396 against the sensor's 36.3cm).
  rulers: { inPlane3D: 0.003099, shoulderWidth: 0.003638, depthRuler: 0.003106, sensorImplied: 0.003636 },
};

export const OVR_BENCH_SET9_2026_09_30 = {
  build: 575,
  loadLb: 135,
  repsPerSet: 10,
  camera: "foot of the bench, oblique, wrists 2.48m from the lens; bar tilted 28 degrees in frame by perspective, phone roll -4.2",
  captureFormat: "1920x1080 @ 120fps (16:9 fallback)",
  sensor: {
    reps: [
      { meanVelocityMps: 0.80, peakVelocityMps: 1.17, romIn: 13.5, meanW: 478, peakW: 702, tpvS: 0.28, eai: 4.09 },
      { meanVelocityMps: 0.82, peakVelocityMps: 1.22, romIn: 13.9, meanW: 491, peakW: 735, tpvS: 0.28, eai: 4.25 },
      { meanVelocityMps: 0.80, peakVelocityMps: 1.17, romIn: 13.3, meanW: 479, peakW: 702, tpvS: 0.30, eai: 3.82 },
      { meanVelocityMps: 0.81, peakVelocityMps: 1.14, romIn: 13.8, meanW: 486, peakW: 694, tpvS: 0.30, eai: 3.77 },
      { meanVelocityMps: 0.83, peakVelocityMps: 1.18, romIn: 13.8, meanW: 498, peakW: 710, tpvS: 0.26, eai: 4.53 },
      { meanVelocityMps: 0.80, peakVelocityMps: 1.12, romIn: 13.7, meanW: 482, peakW: 685, tpvS: 0.26, eai: 4.37 },
      { meanVelocityMps: 0.78, peakVelocityMps: 1.11, romIn: 13.6, meanW: 471, peakW: 669, tpvS: 0.28, eai: 3.87 },
      { meanVelocityMps: 0.80, peakVelocityMps: 1.12, romIn: 14.4, meanW: 479, peakW: 677, tpvS: 0.28, eai: 3.79 },
      { meanVelocityMps: 0.79, peakVelocityMps: 1.10, romIn: 14.9, meanW: 476, peakW: 661, tpvS: 0.34, eai: 3.21 },
      { meanVelocityMps: 0.83, peakVelocityMps: 1.17, romIn: 16.7, meanW: 495, peakW: 702, tpvS: 0.30, eai: 3.82 },
    ],
    reported: { meanVelocityMps: 0.80, peakVelocityMps: 1.14, romIn: 14.1, meanW: 483, peakW: 693, tpvS: 0.28, eai: 3.95 },
  },
  forgeOnDevice: {
    repCount: 7,
    meanVelocityMps: 1.04,
    romCm: 43.4,
    scaleSource: "both",
    scale: 0.003378,
    axis: { x: -0.4703, y: 0.8825 },
    cameraRollDeg: -4.2,
    cameraPitchDeg: 18,
    // Along gravity the same trace: 10 reps, 42.8cm, 1.03 m/s. The hands were lost on 78
    // frames and carried on 139; the trace, not the axis, is what is left on this take.
  },
  // sensorImplied from the gravity-axis replay (42.8cm at 0.003378 against the sensor's 35.8cm);
  // the trace's jitter inflates the replay's range of motion, so this one is soft.
  rulers: { inPlane3D: 0.003482, shoulderWidth: null, depthRuler: 0.002946, sensorImplied: 0.002826 },
};

export const OVR_BENCH_SET10_2026_09_30 = {
  build: 576,
  loadLb: 135,
  repsPerSet: 10,
  camera: "foot of the bench, oblique; phone roll -3.9, pitch 14.2; the first take segmented along gravity",
  captureFormat: "1920x1080 @ 120fps (16:9 fallback)",
  sensor: {
    reps: [
      { meanVelocityMps: 0.78, peakVelocityMps: 1.07, romIn: 14.1, meanW: 469, peakW: 644, tpvS: 0.30, eai: 3.50 },
      { meanVelocityMps: 0.78, peakVelocityMps: 1.11, romIn: 13.6, meanW: 470, peakW: 669, tpvS: 0.28, eai: 3.75 },
      { meanVelocityMps: 0.81, peakVelocityMps: 1.10, romIn: 14.0, meanW: 484, peakW: 661, tpvS: 0.28, eai: 3.82 },
      { meanVelocityMps: 0.84, peakVelocityMps: 1.17, romIn: 15.1, meanW: 502, peakW: 702, tpvS: 0.30, eai: 3.82 },
      { meanVelocityMps: 0.80, peakVelocityMps: 1.12, romIn: 15.3, meanW: 480, peakW: 678, tpvS: 0.31, eai: 3.58 },
      { meanVelocityMps: 0.79, peakVelocityMps: 1.12, romIn: 14.9, meanW: 475, peakW: 677, tpvS: 0.32, eai: 3.48 },
      { meanVelocityMps: 0.81, peakVelocityMps: 1.10, romIn: 15.0, meanW: 487, peakW: 661, tpvS: 0.28, eai: 3.70 },
      { meanVelocityMps: 0.77, peakVelocityMps: 1.07, romIn: 15.1, meanW: 463, peakW: 644, tpvS: 0.30, eai: 3.49 },
      { meanVelocityMps: 0.77, peakVelocityMps: 1.05, romIn: 15.0, meanW: 463, peakW: 628, tpvS: 0.28, eai: 3.52 },
      { meanVelocityMps: 0.72, peakVelocityMps: 1.03, romIn: 16.6, meanW: 434, peakW: 619, tpvS: 0.21, eai: 4.76 },
    ],
    reported: { meanVelocityMps: 0.78, peakVelocityMps: 1.09, romIn: 14.8, meanW: 472, peakW: 658, tpvS: 0.28, eai: 3.74 },
  },
  forgeOnDevice: {
    repCount: 10,
    meanVelocityMps: 0.80,
    peakVelocityMps: 1.34,
    romCm: 38.9,
    medianRomCm: 38.6,
    scaleSource: "both",
    scale: 0.003593,
    axisSource: "gravity",
    gripAxisFromVerticalDeg: 9.5,
    cameraRollDeg: -3.9,
    concentricSeconds: [0.43, 0.6, 0.43, 0.43, 0.47, 0.47, 0.53, 0.57, 0.5, 1.2],
    repMeans: [0.91, 0.52, 0.86, 1.0, 0.91, 0.9, 0.8, 0.79, 0.91, 0.4],
    repPeaks: [1.05, 0.15, 1.26, 0.79, 1.26, 1.1, 1.13, 1.34, 0.93, 0.98],
    meanPowerW: 481,
    peakPowerW: 807,
  },
  // sensorImplied from the device's median rep (38.6cm at 0.003593 against the sensor's 37.6cm).
  // The depth ruler read a wrist depth of 1.7m on this take against 2.5-3.2m on every other
  // bench at the same framing, and reconciliation dropped it as the outlier: right answer,
  // and the first time the ruler has been wrong by more than its zero.
  rulers: { inPlane3D: 0.003424, shoulderWidth: 0.003761, depthRuler: 0.002029, sensorImplied: 0.0035 },
};

export const OVR_BENCH_SET11_2026_09_30 = {
  build: 577,
  loadLb: 135,
  repsPerSet: 10,
  camera: "foot of the bench, oblique, same framing as sets 9 and 10; phone roll -3.8",
  captureFormat: "1920x1080 @ 120fps (16:9 fallback)",
  sensor: {
    reps: [
      { meanVelocityMps: 0.75, peakVelocityMps: 1.06, romIn: 13.7, meanW: 447, peakW: 636, tpvS: 0.31, eai: 3.36 },
      { meanVelocityMps: 0.83, peakVelocityMps: 1.24, romIn: 14.4, meanW: 499, peakW: 744, tpvS: 0.28, eai: 4.30 },
      { meanVelocityMps: 0.78, peakVelocityMps: 1.10, romIn: 13.6, meanW: 468, peakW: 661, tpvS: 0.28, eai: 3.70 },
      { meanVelocityMps: 0.76, peakVelocityMps: 1.07, romIn: 13.8, meanW: 458, peakW: 644, tpvS: 0.31, eai: 3.40 },
      { meanVelocityMps: 0.74, peakVelocityMps: 1.09, romIn: 14.1, meanW: 442, peakW: 652, tpvS: 0.33, eai: 3.26 },
      { meanVelocityMps: 0.72, peakVelocityMps: 0.96, romIn: 13.6, meanW: 434, peakW: 578, tpvS: 0.22, eai: 4.28 },
      { meanVelocityMps: 0.74, peakVelocityMps: 1.02, romIn: 14.0, meanW: 446, peakW: 611, tpvS: 0.32, eai: 3.14 },
      { meanVelocityMps: 0.73, peakVelocityMps: 1.02, romIn: 13.3, meanW: 440, peakW: 611, tpvS: 0.28, eai: 3.53 },
      { meanVelocityMps: 0.73, peakVelocityMps: 0.99, romIn: 14.5, meanW: 437, peakW: 595, tpvS: 0.33, eai: 2.97 },
      { meanVelocityMps: 0.56, peakVelocityMps: 0.87, romIn: 16.5, meanW: 346, peakW: 520, tpvS: 0.23, eai: 3.70 },
    ],
    reported: { meanVelocityMps: 0.73, peakVelocityMps: 1.04, romIn: 14.1, meanW: 441, peakW: 625, tpvS: 0.28, eai: 3.56 },
  },
  forgeOnDevice: {
    repCount: 11,
    meanVelocityMps: 0.49,
    peakVelocityMps: 0.63,
    romCm: 22.2,
    medianRomCm: 21.5,
    scaleSource: "both",
    scale: 0.002843,
    axisSource: "gravity",
    gripWidthPx: 181.9,
    // The two 3D-pose rulers agreed at 0.00294 and 0.00275 and outvoted the shoulder ruler at
    // 0.00391; the shoulder ruler was right. Rep 1 (6.1-10.4s, 11.7cm) is the un-rack.
  },
  // sensorImplied from the grip: set 10 at 199px implied 0.0035, so 182px at the same framing
  // implies 0.0038-0.0039; the device's median rep at that scale is 29cm against the sensor's
  // 35.8, the rest being the un-rack in the rep list and lone-hand windows. Soft to 5%.
  rulers: { inPlane3D: 0.002941, shoulderWidth: 0.003912, depthRuler: 0.002471, sensorImplied: 0.0039 },
};

export const OVR_BENCH_SET12_2026_09_30 = {
  build: 578,
  loadLb: 135,
  repsPerSet: 10,
  camera: "foot of the bench, oblique, same framing as sets 9-11; phone roll -3.4",
  captureFormat: "1920x1080 @ 120fps (16:9 fallback)",
  sensor: {
    reps: [
      { meanVelocityMps: 0.74, peakVelocityMps: 1.12, romIn: 13.4, meanW: 446, peakW: 677, tpvS: 0.30, eai: 3.68 },
      { meanVelocityMps: 0.74, peakVelocityMps: 1.10, romIn: 13.6, meanW: 443, peakW: 661, tpvS: 0.30, eai: 3.59 },
      { meanVelocityMps: 0.72, peakVelocityMps: 1.07, romIn: 13.7, meanW: 431, peakW: 644, tpvS: 0.33, eai: 3.22 },
      { meanVelocityMps: 0.71, peakVelocityMps: 1.05, romIn: 13.3, meanW: 423, peakW: 628, tpvS: 0.28, eai: 3.52 },
      { meanVelocityMps: 0.73, peakVelocityMps: 1.03, romIn: 13.4, meanW: 436, peakW: 619, tpvS: 0.30, eai: 3.37 },
      { meanVelocityMps: 0.74, peakVelocityMps: 1.06, romIn: 13.6, meanW: 444, peakW: 636, tpvS: 0.30, eai: 3.46 },
      { meanVelocityMps: 0.70, peakVelocityMps: 1.05, romIn: 13.6, meanW: 420, peakW: 628, tpvS: 0.33, eai: 3.14 },
      { meanVelocityMps: 0.69, peakVelocityMps: 0.99, romIn: 13.7, meanW: 416, peakW: 595, tpvS: 0.34, eai: 2.89 },
      { meanVelocityMps: 0.70, peakVelocityMps: 1.00, romIn: 13.8, meanW: 417, peakW: 603, tpvS: 0.32, eai: 3.10 },
      { meanVelocityMps: 0.37, peakVelocityMps: 0.85, romIn: 17.4, meanW: 220, peakW: 512, tpvS: 0.25, eai: 3.38 },
    ],
    reported: { meanVelocityMps: 0.68, peakVelocityMps: 1.03, romIn: 13.9, meanW: 409, peakW: 620, tpvS: 0.30, eai: 3.33 },
  },
  forgeOnDevice: {
    repCount: 10,
    meanVelocityMps: 0.71,
    peakVelocityMps: 1.01,
    romCm: 36.7,
    medianRomCm: 40.3,
    scaleSource: "both",
    scale: 0.004007,
    axisSource: "gravity",
    gripWidthPx: 196,
    concentricSeconds: 0.59,
    meanPowerW: 426,
    // The first take through the weighted blend on the device. Count, mean, peak and mean
    // power within 5%; the median rep 14% long because the shoulder ruler read 1.23 this
    // time and now carries the weight, and the concentric window ran 0.59s against the
    // sensor's 0.52 (range over mean), which cancelled it in the mean. Rep 5 (26cm, 0.33) is
    // a hand dropout mid-rep (202 carried points on this take).
  },
  // sensorImplied from the device's median rep (40.3cm at 0.004007 against the sensor's 35.3cm).
  rulers: { inPlane3D: 0.003052, shoulderWidth: 0.004308, depthRuler: 0.002574, sensorImplied: 0.00351 },
};

/** The two Pendlay rows of 2026-09-30, filmed from BEHIND with one arm visible. Count
 *  comparisons only: every body ruler is the wrong way round from there (the athlete bent
 *  over, so the height ruler reads 0.70 of the sensor; one shoulder; one wrist). */
export const OVR_ROW_SETS_2026_09_30 = {
  set1: { build: 577, sensorReps: 9, deviceReps: 9, sensorMeanMps: 1.07, deviceMeanMps: 1.22, sensorRomIn: 21.5, deviceMedianRomCm: 43.4, scale: 0.002596, rulers: { inPlane3D: 0.002696, depthRuler: 0.002486, height: 0.002605, shoulderWidth: 0.003574, plate: 0.001285 } },
  set2: { build: 578, sensorReps: 11, deviceReps: 11, sensorMeanMps: 1.04, deviceMeanMps: 0.84, sensorRomIn: 20.3, deviceMedianRomCm: 40.6, scale: 0.003257, rulers: { inPlane3D: 0.003515, depthRuler: 0.003591, height: 0.002887, shoulderWidth: 0.004662, plate: 0.001526 } },
};

export const OVR_SQUAT_SET1_2026_10_01 = {
  build: 578,
  loadLb: 135,
  repsPerSet: 5,
  camera: "front of the rack, head-on, phone upright (roll 0.4, pitch 5.7); the shoulders carried the bar (602 shoulder points)",
  captureFormat: "1920x1080 @ 120fps (16:9 fallback)",
  sensor: {
    reps: [
      { meanVelocityMps: 1.01, peakVelocityMps: 1.72, romIn: 28.1, meanW: 603, peakW: 1033, tpvS: 0.50, eai: 3.42 },
      { meanVelocityMps: 1.03, peakVelocityMps: 1.61, romIn: 27.4, meanW: 619, peakW: 966, tpvS: 0.48, eai: 3.31 },
      { meanVelocityMps: 1.05, peakVelocityMps: 1.71, romIn: 29.1, meanW: 632, peakW: 1024, tpvS: 0.49, eai: 3.44 },
      { meanVelocityMps: 0.99, peakVelocityMps: 1.51, romIn: 28.4, meanW: 594, peakW: 909, tpvS: 0.53, eai: 2.85 },
      { meanVelocityMps: 0.93, peakVelocityMps: 1.45, romIn: 30.7, meanW: 560, peakW: 867, tpvS: 0.65, eai: 2.19 },
    ],
    reported: { meanVelocityMps: 1.00, peakVelocityMps: 1.60, romIn: 28.7, meanW: 601, peakW: 959, tpvS: 0.53, eai: 3.04 },
  },
  forgeOnDevice: {
    repCount: 5,
    meanVelocityMps: 0.65,
    peakVelocityMps: 1.27,
    romCm: 69.9,
    medianRomCm: 69.6,
    scaleSource: "both",
    scale: 0.0036,
    axisSource: "gravity",
    concentricSeconds: [1.0, 1.2, 1.23, 1.03, 1.1],
    // The range of motion within 4% and the count exact; the concentric window 1.1s against
    // the sensor's 0.73 because the centimetre travel margin counted a dead-flat 0.6s sit in
    // the hole as lifting. The drive window (trimPhaseToDrive, build 579) replays this take at
    // 0.75s and 0.95-0.98 m/s.
  },
  rulers: { inPlane3D: 0.004162, shoulderWidth: 0.004448, depthRuler: 0.004186, height: 0.003353, sensorImplied: 0.00377 },
};

// Back squat set 2 beside OVR, 2026-10-01, filmed oblique from the front of the rack on build
// 578, the same session as set 1. The range of motion and the count land; the mean does not.
// Set 1 replays at 0.95 of the sensor under the drive window and this take replays at 0.83
// UNCHANGED from the phone, because its concentric window is 0.15s wider than the sensor's on
// every rep (0.80-0.93s against 0.70-0.78s) and the velocity curve is a flat plateau at 1.04
// m/s where the sensor saw a 1.56 peak. Replayed at 165, 100 and 66ms of velocity smoothing:
// the mean never moves (it is range over the window) and the peak only climbs with the noise,
// so smoothing is NOT the cause. Open: whether the shoulders, carrying the bar on an oblique
// view (713 shoulder points, 45 equipment-agreement frames), lag the bar in time.
export const OVR_SQUAT_SET2_2026_10_01 = {
  build: 578,
  loadLb: 135,
  repsPerSet: 5,
  camera: "front of the rack, oblique (cameraView.subjectFacing oblique; roll -0.3, pitch 7.1); the shoulders carried the bar (713 shoulder points)",
  captureFormat: "1920x1080 @ 120fps (16:9 fallback)",
  sensor: {
    reps: [
      { meanVelocityMps: 0.92, peakVelocityMps: 1.57, romIn: 26.1, meanW: 554, peakW: 942, tpvS: 0.45, eai: 3.41 },
      { meanVelocityMps: 0.96, peakVelocityMps: 1.62, romIn: 26.6, meanW: 577, peakW: 975, tpvS: 0.47, eai: 3.40 },
      { meanVelocityMps: 0.94, peakVelocityMps: 1.57, romIn: 25.8, meanW: 561, peakW: 942, tpvS: 0.49, eai: 3.17 },
      { meanVelocityMps: 0.94, peakVelocityMps: 1.60, romIn: 27.1, meanW: 566, peakW: 958, tpvS: 0.51, eai: 3.11 },
      { meanVelocityMps: 0.89, peakVelocityMps: 1.46, romIn: 27.2, meanW: 536, peakW: 875, tpvS: 0.56, eai: 2.57 },
    ],
    reported: { meanVelocityMps: 0.93, peakVelocityMps: 1.56, romIn: 26.5, meanW: 558, peakW: 938, tpvS: 0.49, eai: 3.13 },
  },
  forgeOnDevice: {
    repCount: 5,
    meanVelocityMps: 0.77,
    peakVelocityMps: 1.07,
    romCm: 66,
    medianRomCm: 66.4,
    scaleSource: "both",
    scale: 0.003737,
    axisSource: "gravity",
    concentricSeconds: [0.93, 0.8, 0.83, 0.9, 0.93],
  },
  rulers: { inPlane3D: 0.004377, shoulderWidth: 0.004599, depthRuler: 0.004867, height: 0.003466, plate: 0.001135, sensorImplied: 0.00381 },
};

// Jump squat beside OVR, 2026-10-01 (logged as Box Jump set 2, 24in box, 1lb on the sensor's
// side). Scott: "I noticed ovr was a little short, but it also starts about 3 inches above the
// ground, so not a great measurement but, good start." The sensor's range of motion on a jump
// is the tether's travel from the bottom of the countermovement to the apex, which is NOT the
// camera's jump height (takeoff to apex), so the two are recorded and not compared as equals.
// The sensor's peak 3.16 m/s implies 51cm of rise after peak velocity (v^2/2g); the camera's
// reps read 63-69cm with the set reported at 72.3.
export const OVR_JUMP_SQUAT_2026_10_01 = {
  build: 578,
  repsPerSet: 5,
  sensor: {
    reps: [
      { meanVelocityMps: 2.12, peakVelocityMps: 3.36, romIn: 22.6, tpvS: 0.12 },
      { meanVelocityMps: 2.00, peakVelocityMps: 2.97, romIn: 21.9, tpvS: 0.07 },
      { meanVelocityMps: 1.81, peakVelocityMps: 3.11, romIn: 21.1, tpvS: 0.13 },
      { meanVelocityMps: 1.89, peakVelocityMps: 3.30, romIn: 22.1, tpvS: 0.06 },
      { meanVelocityMps: 2.00, peakVelocityMps: 3.11, romIn: 22.0, tpvS: 0.08 },
    ],
    reported: { meanVelocityMps: 1.96, peakVelocityMps: 3.16, romIn: 21.9, tpvS: 0.09 },
  },
  forgeOnDevice: { repCount: 5, jumpHeightCm: 72.3, repJumpHeightsCm: [63.7, 69.3, 64, 63.2, 63.7], boxRiseScaleErrorRatio: 1.045, scale: 0.003126 },
};

// Box jump beside OVR, 2026-10-01, the sensor on a finger with hands on hips (the first jump
// with the sensor at the hip; the laces set above is OVR_JUMP_SQUAT_2026_10_01). OVR "set 2"
// logged 6 reps; Scott: "OVR counted my first rep as me grabbing the cord and setting up for
// box jump. Ignore rep 1." Reps 2-6 below are the five jumps. Filmed on build 580, before the
// countermovement landed (queued), so the camera has takeoff velocity and height per rep and
// no dip or drive window yet; those come with the next paired jump.
//
// The camera's takeoff velocity reads 3.46-3.55 against the sensor's 2.75-3.19 peak at the hip:
// about 20% high on every rep. On a box jump the camera's takeoff velocity is rebuilt from the
// flight time and the net rise ONTO THE BOX (applyBoxRiseCorrection), so it inherits the
// take's scale through the net rise, and the ankle lands on the box with the knee bent, which
// shortens the measured rise and lengthens nothing. A flat jump with the sensor at the hip is
// the take that separates those; the per-rep camera numbers are from the phone's screen.
export const OVR_BOX_JUMP_HIP_2026_10_01 = {
  build: 580,
  boxHeightIn: 24,
  repsPerSet: 5,
  sensor: {
    ignoredRep1: { meanVelocityMps: 1.01, peakVelocityMps: 1.84, romIn: 33.2, tpvS: 0.42 },
    reps: [
      { meanVelocityMps: 1.52, peakVelocityMps: 2.75, romIn: 27.0, tpvS: 0.16 },
      { meanVelocityMps: 1.44, peakVelocityMps: 3.00, romIn: 27.0, tpvS: 0.18 },
      { meanVelocityMps: 1.45, peakVelocityMps: 3.19, romIn: 27.2, tpvS: 0.21 },
      { meanVelocityMps: 1.52, peakVelocityMps: 2.82, romIn: 27.4, tpvS: 0.18 },
      { meanVelocityMps: 1.50, peakVelocityMps: 2.84, romIn: 28.5, tpvS: 0.21 },
    ],
    // The set row on the sensor still averages the ignored rep in.
    reportedIncludingRep1: { meanVelocityMps: 1.40, peakVelocityMps: 2.74, romIn: 28.3, tpvS: 0.22 },
  },
  forgeOnDevice: {
    repCount: 5,
    jumpHeightIn: 29.4,
    reps: [
      { jumpHeightIn: 27.1, takeoffVelocityMps: 3.47 },
      { jumpHeightIn: 26.9, takeoffVelocityMps: 3.46, groundSeconds: 2.735 },
      { jumpHeightIn: 29.0, takeoffVelocityMps: 3.47, groundSeconds: 2.569 },
      { jumpHeightIn: 28.2, takeoffVelocityMps: 3.55, groundSeconds: 2.769 },
      { jumpHeightIn: 29.4, takeoffVelocityMps: 3.51, groundSeconds: 2.802 },
    ],
  },
};

// Back squat set 3 beside OVR, 2026-10-01, same session as sets 1 and 2 (OVR_SQUAT_SET1/SET2),
// the first squat on build 579's drive window ON THE PHONE. Count exact, range of motion within
// 2%, and the mean 1.14 of the sensor: the three squats of the session now sit at 0.95, 0.83
// and 1.14, which is the per-rep window wandering by +-0.1s against the sensor's, not a bias.
// Camera per-rep windows 0.87/0.70/0.67/0.73/0.70s; the sensor's (range over mean)
// 0.83/0.80/0.82/0.82/0.91. The shoulder ruler read 88.3 units here against 98.5 on set 1
// (scale 0.00409 vs 0.00360), and the ROM still landed, which is the depth ruler and the 3D
// shin carrying the blend.
export const OVR_SQUAT_SET3_2026_10_01 = {
  build: 580,
  loadLb: 135,
  repsPerSet: 5,
  forgeOnDevice: {
    repCount: 5,
    meanVelocityMps: 0.97,
    peakVelocityMps: 1.34,
    romCm: 69.8,
    scaleSource: "both",
    scale: 0.004092,
    reps: [
      { meanVelocityMps: 0.81, peakVelocityMps: 1.24, concentricSeconds: 0.87 },
      { meanVelocityMps: 1.01, peakVelocityMps: 1.35, concentricSeconds: 0.7 },
      { meanVelocityMps: 1.08, peakVelocityMps: 1.37, concentricSeconds: 0.67 },
      { meanVelocityMps: 0.95, peakVelocityMps: 1.29, concentricSeconds: 0.73 },
      { meanVelocityMps: 1.05, peakVelocityMps: 1.45, concentricSeconds: 0.7 },
    ],
  },
  rulers: { inPlane3D: 0.004642, shoulderWidth: 0.004962, depthRuler: 0.0053, height: 0.003821, sensorImplied: 0.00398 },
  sensor: {
    reps: [
      { meanVelocityMps: 0.84, peakVelocityMps: 1.35, romIn: 27.3, meanW: 503, peakW: 809, tpvS: 0.56, eai: 2.31 },
      { meanVelocityMps: 0.88, peakVelocityMps: 1.35, romIn: 27.8, meanW: 529, peakW: 809, tpvS: 0.53, eai: 2.54 },
      { meanVelocityMps: 0.89, peakVelocityMps: 1.35, romIn: 28.6, meanW: 533, peakW: 810, tpvS: 0.54, eai: 2.46 },
      { meanVelocityMps: 0.85, peakVelocityMps: 1.25, romIn: 27.4, meanW: 509, peakW: 752, tpvS: 0.56, eai: 2.20 },
      { meanVelocityMps: 0.80, peakVelocityMps: 1.12, romIn: 28.8, meanW: 483, peakW: 677, tpvS: 0.64, eai: 1.74 },
    ],
    reported: { meanVelocityMps: 0.85, peakVelocityMps: 1.28, romIn: 27.9, meanW: 511, peakW: 771, tpvS: 0.56, eai: 2.25 },
  },
};

// Med ball throw beside OVR, 2026-10-01: the sensor on a box with its tether pulled out
// HORIZONTALLY to a finger, 12lb ball, logged on the sensor as "Push Press" 12lb x 12. Scott:
// "rep 1 and rep 7 were setup reps, me just trapping the cord." The ten throws are below. The
// exercise is logged in Forge as 3x5 but is 3x5 EACH SIDE, so a set is ten throws, which is
// what the sensor recorded here; Scott also noted "the sensor only measured 4 reps" of the set
// in question, so the per-set split between the two sides is not known from the sensor. The
// sensor reads the component of the hand's motion along the tether (the room's horizontal), so
// the camera's matching number is medBallRepBreakdown[].peakHorizontalSpeedMps (build 580) and
// the sensor's range of motion is the tether's horizontal travel, which has no camera number.
// Filmed on build 580 -- BY THE BAR TRACKER. The program exercise ("Medicine Ball Rotational
// Throw") was saved under the generic "full" level and the workout page routed on it, so the
// camera reported four bar-path "reps" (0.66, 2.57, 1.46, 2.14 m/s), a 51cm range of motion and
// a scale-suspect outcome, and no med-ball number. Not a tracker fault; the wrong tracker.
// resolve-tracking-mode.ts (queued) sends it to the med-ball tracker; this set has no camera
// side and the next one is the first comparison.
export const OVR_MED_BALL_THROW_2026_10_01 = {
  build: 580,
  ballLb: 12,
  throws: 10,
  sensor: {
    ignoredReps: [
      { rep: 1, meanVelocityMps: 0.65, peakVelocityMps: 1.75, romIn: 34.0 },
      { rep: 7, meanVelocityMps: 0.25, peakVelocityMps: 0.72, romIn: 10.1 },
    ],
    reps: [
      { meanVelocityMps: 2.29, peakVelocityMps: 5.59, romIn: 48.8, meanW: 122, peakW: 298, tpvS: 0.34 },
      { meanVelocityMps: 2.36, peakVelocityMps: 6.55, romIn: 51.1, meanW: 126, peakW: 349, tpvS: 0.34 },
      { meanVelocityMps: 2.27, peakVelocityMps: 6.86, romIn: 53.7, meanW: 121, peakW: 365, tpvS: 0.43 },
      { meanVelocityMps: 2.10, peakVelocityMps: 7.02, romIn: 52.5, meanW: 111, peakW: 374, tpvS: 0.43 },
      { meanVelocityMps: 3.82, peakVelocityMps: 7.07, romIn: 50.1, meanW: 203, peakW: 377, tpvS: 0.18 },
      { meanVelocityMps: 2.84, peakVelocityMps: 6.28, romIn: 51.1, meanW: 151, peakW: 335, tpvS: 0.27 },
      { meanVelocityMps: 2.19, peakVelocityMps: 6.63, romIn: 56.5, meanW: 116, peakW: 354, tpvS: 0.46 },
      { meanVelocityMps: 3.51, peakVelocityMps: 7.15, romIn: 53.4, meanW: 187, peakW: 381, tpvS: 0.18 },
      { meanVelocityMps: 2.00, peakVelocityMps: 6.47, romIn: 52.9, meanW: 106, peakW: 345, tpvS: 0.47 },
      { meanVelocityMps: 1.86, peakVelocityMps: 6.47, romIn: 54.5, meanW: 99, peakW: 345, tpvS: 0.54 },
    ],
    // The set row on the sensor still averages the two setup reps in.
    reportedIncludingSetup: { meanVelocityMps: 2.17, peakVelocityMps: 5.71, romIn: 47.3, meanW: 115, peakW: 304, tpvS: 0.41 },
    // Across the ten throws: peak 6.6 m/s (5.59-7.15), mean 2.5, horizontal travel 52in.
  },
};

// ---- Three lifts beside OVR, 2026-10-02, build 589 ----
//
// Bench 135x10, Pendlay row 135x10, push press 95x10 (logged in Forge as "Barbell Shoulder
// Press"), all filmed on build 589 at 1920x1080 @ 120fps. Every take fell back from the live
// path to the file read (coverage 0.47-0.49). The sensor's range of motion gives the scale the
// camera SHOULD have found (sensorImplied = device scale x camera ROM / sensor ROM). What each
// take settled is in docs/camera-tracking-notes.md, "Three lifts beside OVR, 2026-10-02".
export const OVR_BENCH_2026_10_02 = {
  build: 589,
  loadLb: 135,
  repsPerSet: 10,
  forgeOnDevice: {
    repCount: 10,
    meanVelocityMps: 0.85,
    peakVelocityMps: 1.22,
    romCm: 34.7,
    concentricSeconds: 0.43,
    scaleSource: "both",
    scale: 0.003776,
    movementTypeReceived: null,
    cameraView: "oblique",
    largestGapSeconds: 2.568,
    reps: [
      { meanVelocityMps: 0.29, peakVelocityMps: 0.5, romCm: 25.2, concentricSeconds: 0.83 },
      { meanVelocityMps: 1.22, peakVelocityMps: 1.46, romCm: 35, concentricSeconds: 0.3 },
      { meanVelocityMps: 0.67, peakVelocityMps: 1.34, romCm: 34.2, concentricSeconds: 0.53 },
      { meanVelocityMps: 1.01, peakVelocityMps: 1.25, romCm: 28.2, concentricSeconds: 0.3 },
      { meanVelocityMps: 1.03, peakVelocityMps: 1.26, romCm: 31.8, concentricSeconds: 0.33 },
      { meanVelocityMps: 1.19, peakVelocityMps: 1.28, romCm: 36.2, concentricSeconds: 0.33 },
      { meanVelocityMps: 1.0, peakVelocityMps: 1.35, romCm: 42.1, concentricSeconds: 0.43 },
      { meanVelocityMps: 0.92, peakVelocityMps: 1.26, romCm: 42, concentricSeconds: 0.47 },
      { meanVelocityMps: 0.81, peakVelocityMps: 1.34, romCm: 31.9, concentricSeconds: 0.43 },
      { meanVelocityMps: 1.24, peakVelocityMps: 1.24, romCm: 40, concentricSeconds: 0.33 },
    ],
  },
  rulers: { inPlane3D: 0.003057, depthRuler: 0.001711, shoulderWidth: 0.004148, plate: null, sensorImplied: 0.004035 },
  sensor: {
    reps: [
      { meanVelocityMps: 0.72, peakVelocityMps: 1.11, romIn: 13.3, meanW: 434, peakW: 669, tpvS: 0.31, eai: 3.53 },
      { meanVelocityMps: 0.83, peakVelocityMps: 1.21, romIn: 14.4, meanW: 497, peakW: 727, tpvS: 0.30, eai: 3.95 },
      { meanVelocityMps: 0.79, peakVelocityMps: 1.18, romIn: 14.3, meanW: 476, peakW: 710, tpvS: 0.28, eai: 3.98 },
      { meanVelocityMps: 0.77, peakVelocityMps: 1.10, romIn: 13.8, meanW: 459, peakW: 661, tpvS: 0.30, eai: 3.59 },
      { meanVelocityMps: 0.74, peakVelocityMps: 1.10, romIn: 14.0, meanW: 446, peakW: 661, tpvS: 0.32, eai: 3.39 },
      { meanVelocityMps: 0.82, peakVelocityMps: 1.14, romIn: 14.9, meanW: 495, peakW: 694, tpvS: 0.28, eai: 3.89 },
      { meanVelocityMps: 0.72, peakVelocityMps: 1.02, romIn: 14.3, meanW: 432, peakW: 611, tpvS: 0.34, eai: 2.97 },
      { meanVelocityMps: 0.75, peakVelocityMps: 1.05, romIn: 14.6, meanW: 450, peakW: 628, tpvS: 0.32, eai: 3.22 },
      { meanVelocityMps: 0.72, peakVelocityMps: 1.05, romIn: 15.6, meanW: 435, peakW: 628, tpvS: 0.34, eai: 3.05 },
      { meanVelocityMps: 0.60, peakVelocityMps: 0.88, romIn: 17.4, meanW: 360, peakW: 528, tpvS: 0.37, eai: 2.33 },
    ],
    reported: { meanVelocityMps: 0.74, peakVelocityMps: 1.08, romIn: 14.6, meanW: 448, peakW: 651, tpvS: 0.31, eai: 3.38 },
  },
};

export const OVR_PENDLAY_ROW_2026_10_02 = {
  build: 589,
  loadLb: 135,
  repsPerSet: 10,
  forgeOnDevice: {
    repCount: 11,
    meanVelocityMps: 0.77,
    peakVelocityMps: 0.93,
    romCm: 31.9,
    concentricSeconds: 0.43,
    scaleSource: "both",
    scale: 0.002545,
    cameraView: "oblique",
    // Shoulder ruler and "plate" both rejected as implausible against a body span measured on
    // a hinged torso with the ankles behind the plates; the height ruler, built on that same
    // span, carried a 0.05 uncertainty and was the whole answer at 37% low.
    scalesRejectedAsImplausible: ["plate", "shoulder_width"],
    reps: [
      { meanVelocityMps: 0.53, peakVelocityMps: 0.69, romCm: 26.1, concentricSeconds: 0.53 },
      { meanVelocityMps: 0.67, peakVelocityMps: 0.8, romCm: 28.2, concentricSeconds: 0.43 },
      { meanVelocityMps: 0.96, peakVelocityMps: 1.08, romCm: 31.4, concentricSeconds: 0.37 },
      { meanVelocityMps: 0.37, peakVelocityMps: 0.62, romCm: 26.5, concentricSeconds: 0.7 },
      { meanVelocityMps: 0.81, peakVelocityMps: 1.02, romCm: 34.2, concentricSeconds: 0.47 },
      { meanVelocityMps: 0.63, peakVelocityMps: 0.96, romCm: 30.3, concentricSeconds: 0.5 },
      { meanVelocityMps: 0.82, peakVelocityMps: 0.95, romCm: 32.8, concentricSeconds: 0.43 },
      { meanVelocityMps: 0.91, peakVelocityMps: 1.09, romCm: 30.7, concentricSeconds: 0.37 },
      { meanVelocityMps: 0.93, peakVelocityMps: 1.01, romCm: 34.4, concentricSeconds: 0.4 },
      { meanVelocityMps: 0.96, peakVelocityMps: 1.37, romCm: 35.4, concentricSeconds: 0.4 },
      { meanVelocityMps: 0.7, peakVelocityMps: 0.7, romCm: 27, concentricSeconds: 0.4 },
    ],
  },
  rulers: { inPlane3D: 0.003764, depthRuler: 0.002609, height: 0.002508, shoulderWidth: 0.00475, plate: 0.001307, sensorImplied: 0.003992 },
  sensor: {
    reps: [
      { meanVelocityMps: 0.70, peakVelocityMps: 1.69, romIn: 20.7, meanW: 417, peakW: 1016, tpvS: 0.56, eai: 2.98 },
      { meanVelocityMps: 0.94, peakVelocityMps: 1.54, romIn: 20.5, meanW: 562, peakW: 925, tpvS: 0.37, eai: 4.09 },
      { meanVelocityMps: 0.96, peakVelocityMps: 1.60, romIn: 20.0, meanW: 577, peakW: 958, tpvS: 0.34, eai: 4.69 },
      { meanVelocityMps: 0.94, peakVelocityMps: 1.62, romIn: 19.9, meanW: 564, peakW: 975, tpvS: 0.33, eai: 4.90 },
      { meanVelocityMps: 0.89, peakVelocityMps: 1.60, romIn: 19.2, meanW: 535, peakW: 958, tpvS: 0.35, eai: 4.45 },
      { meanVelocityMps: 0.89, peakVelocityMps: 1.51, romIn: 19.2, meanW: 536, peakW: 909, tpvS: 0.34, eai: 4.45 },
      { meanVelocityMps: 0.80, peakVelocityMps: 1.47, romIn: 19.3, meanW: 482, peakW: 883, tpvS: 0.40, eai: 3.65 },
      { meanVelocityMps: 0.80, peakVelocityMps: 1.49, romIn: 18.6, meanW: 480, peakW: 892, tpvS: 0.42, eai: 3.52 },
      { meanVelocityMps: 0.84, peakVelocityMps: 1.51, romIn: 19.9, meanW: 505, peakW: 908, tpvS: 0.40, eai: 3.75 },
      { meanVelocityMps: 0.80, peakVelocityMps: 1.38, romIn: 20.1, meanW: 482, peakW: 826, tpvS: 0.40, eai: 3.41 },
    ],
    reported: { meanVelocityMps: 0.85, peakVelocityMps: 1.54, romIn: 19.7, meanW: 514, peakW: 925, tpvS: 0.39, eai: 3.98 },
  },
};

// Logged in Forge as "Barbell Shoulder Press" (seated in the library, so no height ruler), done
// as a standing push press and logged on the sensor as such.
export const OVR_PUSH_PRESS_2026_10_02 = {
  build: 589,
  loadLb: 95,
  repsPerSet: 10,
  forgeOnDevice: {
    repCount: 10,
    meanVelocityMps: 1.33,
    peakVelocityMps: 1.76,
    romCm: 81,
    concentricSeconds: 0.63,
    scaleSource: "both",
    scale: 0.005807,
    gripAxisFromVerticalDeg: 25.7,
    // Rep 1 is the un-rack and dip (34cm, 0.23s); the ten presses are reps 2-10 plus one the
    // count trim removed. The sensor's rep 1 is a full press.
    reps: [
      { meanVelocityMps: 1.64, peakVelocityMps: 1.64, romCm: 34.3, concentricSeconds: 0.23 },
      { meanVelocityMps: 1.35, peakVelocityMps: 1.41, romCm: 78.8, concentricSeconds: 0.6 },
      { meanVelocityMps: 1.13, peakVelocityMps: 1.94, romCm: 80.8, concentricSeconds: 0.73 },
      { meanVelocityMps: 1.44, peakVelocityMps: 2.17, romCm: 95.4, concentricSeconds: 0.7 },
      { meanVelocityMps: 1.48, peakVelocityMps: 1.78, romCm: 85.9, concentricSeconds: 0.6 },
      { meanVelocityMps: 1.47, peakVelocityMps: 1.75, romCm: 90, concentricSeconds: 0.63 },
      { meanVelocityMps: 1.4, peakVelocityMps: 1.72, romCm: 88.5, concentricSeconds: 0.63 },
      { meanVelocityMps: 1.15, peakVelocityMps: 1.66, romCm: 81.8, concentricSeconds: 0.74 },
      { meanVelocityMps: 1.28, peakVelocityMps: 1.55, romCm: 82.8, concentricSeconds: 0.67 },
      { meanVelocityMps: 1.21, peakVelocityMps: 1.73, romCm: 86.9, concentricSeconds: 0.73 },
    ],
  },
  rulers: { inPlane3D: 0.003929, depthRuler: 0.003589, shoulderWidth: 0.00632, plate: 0.002105, sensorImplied: 0.004717 },
  sensor: {
    reps: [
      { meanVelocityMps: 1.09, peakVelocityMps: 1.88, romIn: 26.4, meanW: 462, peakW: 796, tpvS: 0.23, eai: 8.05 },
      { meanVelocityMps: 1.28, peakVelocityMps: 2.16, romIn: 26.7, meanW: 540, peakW: 912, tpvS: 0.21, eai: 9.99 },
      { meanVelocityMps: 1.27, peakVelocityMps: 2.16, romIn: 26.6, meanW: 538, peakW: 912, tpvS: 0.27, eai: 8.00 },
      { meanVelocityMps: 0.99, peakVelocityMps: 1.67, romIn: 25.9, meanW: 418, peakW: 703, tpvS: 0.24, eai: 6.85 },
      { meanVelocityMps: 1.00, peakVelocityMps: 1.51, romIn: 25.0, meanW: 420, peakW: 639, tpvS: 0.19, eai: 7.64 },
      { meanVelocityMps: 0.99, peakVelocityMps: 1.62, romIn: 26.1, meanW: 416, peakW: 686, tpvS: 0.21, eai: 7.51 },
      { meanVelocityMps: 1.02, peakVelocityMps: 1.57, romIn: 25.5, meanW: 429, peakW: 663, tpvS: 0.24, eai: 6.45 },
      { meanVelocityMps: 0.95, peakVelocityMps: 1.73, romIn: 26.5, meanW: 400, peakW: 732, tpvS: 0.23, eai: 7.40 },
      { meanVelocityMps: 0.86, peakVelocityMps: 1.49, romIn: 25.9, meanW: 364, peakW: 628, tpvS: 0.25, eai: 5.94 },
      { meanVelocityMps: 1.08, peakVelocityMps: 1.79, romIn: 25.1, meanW: 455, peakW: 756, tpvS: 0.30, eai: 5.88 },
    ],
    reported: { meanVelocityMps: 1.05, peakVelocityMps: 1.75, romIn: 25.9, meanW: 444, peakW: 742, tpvS: 0.23, eai: 7.37 },
  },
};
