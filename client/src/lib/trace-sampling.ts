// HOW WELL THE CAMERA ACTUALLY SAMPLED THE TAKE, measured the same way for every capture mode.
//
// A rep measured on five samples and a rep measured on twenty read identically in every field a
// capture has ever exported. That is not hypothetical: replaying the 2026-10-07 Pendlay row off
// its own stored trace, rep 8 spans 0.550 seconds and holds FIVE samples -- an effective 9Hz
// inside one rep, on a take whose median cadence is 29.4Hz. Every number for that rep (its mean,
// its peak, its window) is computed over those five points, and nothing in the export said so.
//
// `liveCoverage` already counts frames the capture discarded, but it is a property of the whole
// TAKE and is only written by the native AV path. This is a property of the TRACE, derived from
// the timestamps the trace already carries, so every mode can report it -- the web trackers, the
// skill drills and the native ones alike -- and a replay offline computes the identical thing.
//
// MEASURED, NEVER ACTED ON (Rule #1). Nothing here gates a take, drops a rep or moves a number.

export type TraceSampling = {
  /** Points in the trace. */
  samples: number;
  spanSeconds: number;
  /** The cadence the take actually ran at, as the median gap between samples. The median and not
   *  the mean, because one 1.9-second dropout drags a mean into meaninglessness. */
  medianIntervalSeconds: number;
  effectiveHz: number;
  largestGapSeconds: number;
  /** Gaps past three times the median. A frame missed here and there is the cadence; three times
   *  the median is the sampler having slept, and that is the thing worth counting separately. */
  dropouts: number;
  /** Seconds of the take that fell inside those gaps -- the part of the lift nobody measured. */
  secondsInDropouts: number;
  /** 1.0 when the take held its own median cadence throughout; below that by the share of the
   *  span lost to dropouts. Not the native path's liveCoverage (frames the CAPTURE discarded
   *  against a nominal rate) -- this is what survived into the trace, against the trace's own
   *  cadence, and the two answer different questions. */
  cadenceHeld: number;
};

const DROPOUT_MULTIPLE = 3;

/** TAKES SECONDS, and every caller converts at the boundary rather than this guessing.
 *
 *  The two trace shapes in the app disagree on units -- a stored bar-path point carries `t` in
 *  MILLISECONDS and a native pose frame carries `timestamp` in SECONDS -- and a function that
 *  sniffed which it had been handed would be wrong on a one-second take. `fromMillis` and
 *  `fromSeconds` below are the two boundaries; nothing else should call this directly.
 *
 *  Null for a trace too short to have a cadence at all -- two points is one gap, which is a
 *  measurement of nothing. A caller records the null rather than substituting a guess. */
export function measureSamplingSeconds(times: number[] | null | undefined): TraceSampling | null {
  const points = times;
  if (!points || points.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const gap = points[i] - points[i - 1];
    // A non-monotonic timestamp is a bug somewhere upstream, but it is not this function's to
    // report and a negative gap would poison the median. Skipped, and the sample count still
    // says how many points there were.
    if (gap > 0 && Number.isFinite(gap)) gaps.push(gap);
  }
  if (gaps.length < 2) return null;
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!(median > 0)) return null;
  const threshold = median * DROPOUT_MULTIPLE;
  let dropouts = 0;
  let secondsInDropouts = 0;
  for (const gap of gaps) {
    if (gap > threshold) {
      dropouts++;
      // The EXCESS over the cadence, not the whole gap: the sampler was always going to take one
      // median interval to get to the next point, and that part is not lost time.
      secondsInDropouts += gap - median;
    }
  }
  const spanSeconds = points[points.length - 1] - points[0];
  const round = (v: number, places: number) => {
    const f = 10 ** places;
    return Math.round(v * f) / f;
  };
  return {
    samples: points.length,
    spanSeconds: round(spanSeconds, 3),
    medianIntervalSeconds: round(median, 4),
    effectiveHz: round(1 / median, 1),
    largestGapSeconds: round(Math.max(...gaps), 3),
    dropouts,
    secondsInDropouts: round(secondsInDropouts, 3),
    cadenceHeld: spanSeconds > 0 ? round(Math.max(0, 1 - secondsInDropouts / spanSeconds), 3) : 1,
  };
}

/** A stored bar-path point or any trace whose `t` is in milliseconds. */
export function measureTraceSampling(
  points: { t: number }[] | null | undefined,
): TraceSampling | null {
  if (!points) return null;
  return measureSamplingSeconds(points.map((p) => p.t / 1000));
}

/** A native pose frame, whose `timestamp` the Swift side writes in seconds. */
export function measureFrameSampling(
  frames: { timestamp: number }[] | null | undefined,
): TraceSampling | null {
  if (!frames) return null;
  return measureSamplingSeconds(frames.map((f) => f.timestamp));
}
