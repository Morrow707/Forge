import type { TrackingDiagnostics } from "../client/src/lib/tracking-diagnostics";

/**
 * WHAT THE FLEET SAYS, WITHOUT ANYBODY MEASURING ANYTHING.
 *
 * Every threshold in the camera pipeline is an admitted guess, and until now the only way to
 * revise one was to film a set beside a bar sensor. That does not scale: an athlete will not put
 * a sensor on every lift, so a calibration plan that needs ground truth is a plan that never
 * runs.
 *
 * Two signals need no ground truth at all, and both are already in every stored take.
 *
 * SELF-CONTRADICTION. Mean velocity times concentric duration is a distance, and it has to be
 * the range of motion. That is arithmetic the take does against itself -- no sensor, no opinion.
 * A take reading 61cm of travel on a 49cm range of motion is wrong about something whatever the
 * truth was. Across enough takes, a constant can be tuned to MINIMISE fleet-wide
 * self-contradiction, which is a real objective function that costs nobody a stopwatch.
 *
 * SOURCE AGREEMENT. When two independent scale rulers land in the same place that is evidence;
 * when one is repeatedly the odd one out, that is evidence too. Which rulers agree with which,
 * across everybody, would have said the shoulder ruler was unreliable without a single sensor
 * reading -- it implied one athlete's shoulders anywhere from 34cm to 47cm across five takes.
 *
 * WANDER. Path length is summed step to step, displacement measured end to end, and only a
 * wandering tracked point separates them. The ratio is a per-take error magnitude with no
 * reference needed.
 *
 * A pure function over rows that are already stored, so it answers retroactively -- every take
 * ever filmed is already evidence, nothing had to be captured differently.
 */

export type CalibrationEvidenceRow = {
  exerciseName: string | null;
  trackingDiagnostics: unknown;
  meanVelocityMps: unknown;
  concentricSeconds: unknown;
  romCm: unknown;
};

/** Distribution rather than a mean: one catastrophic take would drag a mean somewhere no take
 *  actually sits, and the whole point is to describe the TYPICAL one. */
export type Spread = {
  samples: number;
  median: number | null;
  p10: number | null;
  p90: number | null;
};

function spreadOf(values: number[]): Spread {
  const usable = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (usable.length === 0) return { samples: 0, median: null, p10: null, p90: null };
  const at = (f: number) => usable[Math.min(usable.length - 1, Math.floor(usable.length * f))];
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    samples: usable.length,
    median: round(at(0.5)),
    p10: round(at(0.1)),
    p90: round(at(0.9)),
  };
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type CalibrationEvidence = {
  takesConsidered: number;
  /** impliedTravel / rangeOfMotion. 1.0 is a take that agrees with itself. */
  selfContradiction: Spread & { takesOutsideBand: number; bandLow: number; bandHigh: number };
  /** tracePathCm / traceDisplacementCm. 1.0 is a point that never wandered. */
  wander: Spread;
  /** Per scale source: how often it decided the take, and how often it was the odd one out. */
  scaleSources: {
    source: string;
    chosen: number;
    outlier: number;
    /** How far it typically sat from the chosen scale when it lost. 1.0 would be agreement. */
    ratioWhenOutlier: Spread;
  }[];
  /** Two or more independent sources landing in the same place, which is the only corroborated
   *  case this pipeline can produce. */
  corroboratedTakes: number;
  takesWithAnyScale: number;
  /** The measured torso spread, in grip widths, that decides whether a lift's stillness is
   *  usable as a reference. The threshold it is compared against is a guess; this is the
   *  distribution that would revise it. */
  torsoSpreadGrips: Spread;
};

export const SELF_CONTRADICTION_BAND_LOW = 0.75;
export const SELF_CONTRADICTION_BAND_HIGH = 1.25;

export function summariseCalibrationEvidence(rows: CalibrationEvidenceRow[]): CalibrationEvidence {
  const contradiction: number[] = [];
  const wander: number[] = [];
  const torso: number[] = [];
  const chosen = new Map<string, number>();
  const outlier = new Map<string, number[]>();
  let corroborated = 0;
  let withAnyScale = 0;

  for (const row of rows) {
    const d = row.trackingDiagnostics as TrackingDiagnostics | null | undefined;

    const meanV = num(row.meanVelocityMps);
    const concS = num(row.concentricSeconds);
    const rom = num(row.romCm);
    if (meanV && concS && rom && rom > 0) contradiction.push((meanV * concS * 100) / rom);

    const path = num(d?.calibration?.tracePathCm);
    const displacement = num(d?.calibration?.traceDisplacementCm);
    if (path && displacement && displacement > 0) wander.push(path / displacement);

    const spread = num(d?.trace?.torsoSpreadGrips);
    if (spread != null) torso.push(spread);

    const source = d?.calibration?.scaleSource;
    if (source) {
      withAnyScale++;
      // "both" is not a source, it is the reconciliation saying two agreed. Counted as
      // corroboration rather than as a ruler, or it would appear in the table as a phantom
      // fourth source that nothing implements.
      if (source === "both") corroborated++;
      else chosen.set(source, (chosen.get(source) ?? 0) + 1);
    }
    if (d?.calibration?.scaleCorroborated) corroborated++;

    for (const o of d?.calibration?.scaleOutliers ?? []) {
      const ratio = num(o.ratioToChosen);
      const list = outlier.get(o.source) ?? [];
      if (ratio != null) list.push(ratio);
      outlier.set(o.source, list);
    }
  }

  const sources = new Set([...chosen.keys(), ...outlier.keys()]);
  return {
    takesConsidered: rows.length,
    selfContradiction: {
      ...spreadOf(contradiction),
      takesOutsideBand: contradiction.filter(
        (r) => r < SELF_CONTRADICTION_BAND_LOW || r > SELF_CONTRADICTION_BAND_HIGH,
      ).length,
      bandLow: SELF_CONTRADICTION_BAND_LOW,
      bandHigh: SELF_CONTRADICTION_BAND_HIGH,
    },
    wander: spreadOf(wander),
    scaleSources: [...sources]
      .map((source) => ({
        source,
        chosen: chosen.get(source) ?? 0,
        outlier: (outlier.get(source) ?? []).length,
        ratioWhenOutlier: spreadOf(outlier.get(source) ?? []),
      }))
      // Most-used first: the ruler deciding the most takes is the one worth arguing about.
      .sort((a, b) => b.chosen - a.chosen || b.outlier - a.outlier),
    corroboratedTakes: corroborated,
    takesWithAnyScale: withAnyScale,
    torsoSpreadGrips: spreadOf(torso),
  };
}
