/**
 * A TURNING POINT'S TIME, READ BETWEEN FRAMES (2026-11-23, round twenty-five).
 *
 * The bottom of a dip, the apex of a jump and the two ends of a pull are each found as the sample
 * nearest the turn, so either end of a window can sit up to half a frame from where the turn
 * really was. This is the vertex of the parabola through the turning sample and its two
 * neighbours, at most half a frame from the sample, and the sample's own time next to a gap, at
 * either end of a trace or on a flat run. Used for timing only; distances stay the sampled ones.
 *
 * Measured against the OVR on 2026-11-23: the box jump's rise read 6.2% short on samples and 0.8%
 * short between frames (set 2's five jumps); the RDL's pulls 3.7% -> 1.8% short (set 1) and 1.4% ->
 * 0.3% (set 2, walk-by rep left out).
 */
export function turningPointT(times: readonly number[], ys: readonly number[], idx: number): number {
  if (idx <= 0 || idx >= times.length - 1) return times[idx];
  const [t1, t2, t3] = [times[idx - 1], times[idx], times[idx + 1]];
  const [y1, y2, y3] = [ys[idx - 1], ys[idx], ys[idx + 1]];
  const den = (t1 - t2) * (t1 - t3) * (t2 - t3);
  if (den === 0) return t2;
  const a = (t3 * (y2 - y1) + t2 * (y1 - y3) + t1 * (y3 - y2)) / den;
  const b = (t3 * t3 * (y1 - y2) + t2 * t2 * (y3 - y1) + t1 * t1 * (y2 - y3)) / den;
  if (a === 0) return t2;
  // Not next to a gap: with the neighbours far apart in time the parabola is no longer a
  // sub-frame reading (the first version moved one bench rep's time by a third). Half a frame,
  // at most, from the sample.
  const before = t2 - t1;
  const after = t3 - t2;
  if (before > 2 * after || after > 2 * before) return t2;
  const halfFrame = Math.min(before, after) / 2;
  const tv = -b / (2 * a);
  return Math.abs(tv - t2) <= halfFrame ? tv : t2;
}
