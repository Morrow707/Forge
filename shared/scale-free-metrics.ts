/**
 * WHICH CAMERA NUMBERS ARE ALREADY CORRECT, AND SAYING SO.
 *
 * Every camera metric currently carries the same warning, because the scale the pipeline derives
 * is uncalibrated and a wrong scale is wrong by the same factor everywhere. On the 40 stored
 * takes on hand, the typical one claims 45% more travel than its own range of motion.
 *
 * But that factor does not reach every number. A metric built from TIME is measured in frames,
 * and frames carry no scale. A metric that is a RATIO of two distances has the scale in both the
 * numerator and the denominator, where it cancels exactly. Those numbers are as right today as
 * they will ever be, and telling a coach not to trust them is throwing away the only camera
 * output that is currently true.
 *
 * Velocity loss across a set is the one that matters most. It is the headline number of
 * velocity-based training -- how much the bar slowed from the first rep to the last -- and it is
 * a ratio of two velocities from the same take at the same scale. It is CORRECT. A coach can act
 * on it today while absolute velocity is still 45% out.
 *
 * The test beside this file asserts the classification against how each metric is actually
 * computed, so a metric cannot be quietly promoted by someone who wants a cleaner-looking screen.
 */

export type MetricScaleDependence =
  /** Frames or ratios only. The scale never enters, or enters twice and cancels. */
  | "scale_free"
  /** Multiplied by the derived scale, so it inherits every bit of the scale's error. */
  | "scale_dependent";

export const METRIC_SCALE_DEPENDENCE: Record<string, MetricScaleDependence> = {
  // TIME. Measured in frames, which have no scale.
  concentricSeconds: "scale_free",
  eccentricSeconds: "scale_free",
  timeToPeakVelocitySeconds: "scale_free",
  groundContactSeconds: "scale_free",
  flightSeconds: "scale_free",

  // RATIOS. The scale is in both halves and cancels exactly.
  velocityLossPercent: "scale_free",
  // Eccentric over concentric duration. Two times, no distance anywhere.
  tempoRatio: "scale_free",

  // COUNTS.
  repsFound: "scale_free",

  // EVERYTHING MEASURED IN METRES, and everything derived from one.
  romCm: "scale_dependent",
  peakVelocityMps: "scale_dependent",
  meanVelocityMps: "scale_dependent",
  eccentricMeanVelocityMps: "scale_dependent",
  barPathDeviationCm: "scale_dependent",
  jumpHeightCm: "scale_dependent",
  jumpDistanceCm: "scale_dependent",
  // Power is force times velocity and velocity carries the scale, so power carries it too --
  // and load being hand-logged and exact does not rescue it.
  peakPowerWatts: "scale_dependent",
  meanPowerWatts: "scale_dependent",
  // Eccentric:concentric AMPLITUDE index. It reads as a ratio and is not one -- see
  // summarizeTrackedSet, where it is built from a velocity and a distance.
  meanEai: "scale_dependent",
  reactiveStrengthIndex: "scale_dependent",
};

export function metricIsScaleFree(metric: string): boolean {
  return METRIC_SCALE_DEPENDENCE[metric] === "scale_free";
}

/** The sentence a scale-free number gets INSTEAD of the accuracy caveat. It is not a weaker
 *  warning, it is the absence of one, and it has to say why or it reads as an oversight. */
export const SCALE_FREE_METRIC_NOTE =
  "Measured in frames rather than in centimetres, so this one does not depend on the camera " +
  "working out real-world scale -- it is unaffected by the accuracy warning on the distance " +
  "and velocity numbers.";
