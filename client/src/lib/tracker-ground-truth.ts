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
      "5'10\" athlete, 135lb, camera at the foot of the bench. Calibration reported success on 121 of 639 frames -- the tracker did not know it had failed, which is the part that matters.",
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
      "155lb bench. The set aggregate is close even though the per-rep figures behind it are not -- see this block's own comment on why that is the signature of a segmentation error rather than a scale error.",
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
