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
  metric: "romCm" | "peakVelocityMps" | "jumpHeightCm" | "elapsedSeconds";
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
];

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
