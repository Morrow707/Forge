/**
 * A SET REPEATS ITSELF, AND THAT IS A LABEL NOBODY HAD TO WRITE.
 *
 * An athlete's range of motion on a bench press does not change between rep 3 and rep 4. Their
 * arms are the same length and the bar goes to the same chest. So the SPREAD of per-rep range of
 * motion within one set is not information about the athlete -- it is a measurement of the
 * tracker's own noise, available on every set ever filmed, with no sensor and no ground truth.
 *
 * And a single rep off by a third is not a short rep. It is a segmentation error: two reps fused
 * into one, or one split into two. That distinction matters because the two have opposite fixes
 * and the reported rep count cannot tell them apart -- a set logged at 10 and tracked at 7 could
 * be three reps missed or three pairs fused, and the ROM spread says which.
 *
 * This is deliberately NOT a refusal. A set with an inconsistent ROM still reports every number
 * it computed (RULE #1); this hands back a number that says how much to trust them, and gives
 * the tuner something to minimise that costs nobody a stopwatch.
 *
 * MEDIAN ABSOLUTE DEVIATION over the range, for the reason it always is here: one fused rep is
 * exactly the outlier this exists to catch, and a range-based spread would let that one rep
 * define the answer and then call the whole set uniformly bad.
 */

export type RepConsistency = {
  repsMeasured: number;
  medianRomCm: number;
  /** MAD as a fraction of the median. 0 is a set whose reps were identical. */
  spreadFraction: number;
  /** Reps further than REP_ROM_OUTLIER_FRACTION from the median -- candidates for a fused or
   *  split rep rather than a short one. */
  outlierReps: number[];
};

/** A rep this far from the set's median did not happen that way. Generous: a genuine last rep
 *  really does shorten as an athlete fatigues, and a check that fires on honest fatigue gets
 *  ignored like every other over-eager flag in this pipeline. */
export const REP_ROM_OUTLIER_FRACTION = 0.3;

/** Two reps cannot establish what is typical -- either one is equally the outlier. */
export const MIN_REPS_FOR_CONSISTENCY = 3;

export function repConsistency(
  reps: { repNumber: number; romCm: number | null | undefined }[],
): RepConsistency | null {
  const usable = reps.filter(
    (r): r is { repNumber: number; romCm: number } =>
      r.romCm != null && Number.isFinite(r.romCm) && r.romCm > 0,
  );
  if (usable.length < MIN_REPS_FOR_CONSISTENCY) return null;

  const mid = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const median = mid(usable.map((r) => r.romCm));
  if (!(median > 0)) return null;

  const mad = mid(usable.map((r) => Math.abs(r.romCm - median)));
  return {
    repsMeasured: usable.length,
    medianRomCm: Math.round(median * 10) / 10,
    spreadFraction: Math.round((mad / median) * 1000) / 1000,
    outlierReps: usable
      .filter((r) => Math.abs(r.romCm - median) / median > REP_ROM_OUTLIER_FRACTION)
      .map((r) => r.repNumber),
  };
}

/** The sentence for the report. Names the likely CAUSE rather than just the number, because
 *  "spread 0.42" tells a reader nothing about what to do next. */
export function repConsistencyFlag(c: RepConsistency | null, loggedReps: number | null): string | null {
  if (!c || c.outlierReps.length === 0) return null;
  const which = c.outlierReps.join(", ");
  const fused =
    loggedReps != null && c.repsMeasured < loggedReps
      ? " Fewer reps were found than were logged, so the likely cause is two reps read as one rather than a short rep."
      : "";
  return (
    `Rep ${which} covered a different distance from the rest of the set (typical ${c.medianRomCm}cm, ` +
    `spread ${Math.round(c.spreadFraction * 100)}%). An athlete's range of motion does not change ` +
    `mid-set, so this is the tracker disagreeing with itself rather than the lift changing.${fused}`
  );
}
