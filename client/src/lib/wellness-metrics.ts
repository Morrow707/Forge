// Shared "auto-adjusting average" + trend-direction math for the wearable
// recovery metrics (resting HR, HRV, VO2 Max, respiratory rate, body mass,
// sleep). Deliberately never stored -- every caller recomputes this fresh
// from whatever wellness-history rows it already fetched, so the average
// updates itself the moment a new check-in comes in, per the athlete's own
// framing ("auto adjust every time new data is entered, not the running
// totals").

export type TrendDirection = "up" | "down" | "flat";

/** Mean of whatever non-null readings exist -- null if there are none, so
 * callers can render "No data yet" instead of NaN/0. */
export function average(values: (number | null | undefined)[]): number | null {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

/** Compares the average of the oldest third of readings against the newest
 * third to call a direction -- deliberately coarser than a linear
 * regression so a single noisy day doesn't flip the badge. `values` must be
 * chronological ascending (oldest first). Requires at least 6 points so
 * each third has a couple of readings to average over; returns null below
 * that rather than guessing off too little data. */
export function recentTrend(
  values: (number | null | undefined)[],
  flatThresholdPct = 2,
): { direction: TrendDirection; changePct: number } | null {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (present.length < 6) return null;
  const third = Math.floor(present.length / 3);
  const early = average(present.slice(0, third));
  const late = average(present.slice(-third));
  if (early == null || late == null || early === 0) return null;
  const changePct = ((late - early) / Math.abs(early)) * 100;
  if (Math.abs(changePct) < flatThresholdPct) return { direction: "flat", changePct };
  return { direction: changePct > 0 ? "up" : "down", changePct };
}

/** Whether an "up" trend is the good news for this particular metric --
 * used to color the trend badge instead of blindly making "up" green.
 * `null` means direction doesn't carry a good/bad read for this metric
 * (e.g. body mass, sleep hours), so the badge renders neutral. */
export const METRIC_BETTER_DIRECTION: Record<string, TrendDirection | null> = {
  sleepHours: null,
  restingHeartRate: "down",
  hrv: "up",
  vo2Max: "up",
  respiratoryRate: "down",
  bodyMass: null,
  heartRateRecovery: "up",
};
