export type AcwrRiskLevel = "green" | "yellow" | "red";

export const ACWR_RISK_LABEL: Record<AcwrRiskLevel, string> = {
  green: "Low risk",
  yellow: "Watch",
  red: "High risk",
};

// The acute:chronic workload ratio -- the standard sports-science signal
// that an athlete's recent training load has spiked (or crashed) relative
// to what their body has actually adapted to, which is when soft-tissue
// injury risk rises the most. acuteLoad is the most recent 7 days' total
// load; chronicLoad is the average WEEKLY load over the most recent 28
// days (the 28-day total divided by 4) -- comparing "this week" against "a
// typical recent week" rather than two totals of different lengths.
//
// Thresholds below come from the applied sports-science literature on
// ACWR and injury risk (e.g. Gabbett, 2016): roughly 0.8-1.3 is the
// "sweet spot," risk climbs above ~1.5 (a spike outpacing recent
// tolerance), and there's some elevated risk well below 0.8 too (a sudden,
// large drop in training, which has its own de-conditioning risk). This is
// a general training-load guideline, not a medical diagnosis, and it only
// reflects logged training volume -- it has no idea about sleep, soreness,
// outside stressors, or actual injury history.
export function computeAcwrRisk(
  acuteLoad: number,
  chronicLoad: number,
): { ratio: number | null; level: AcwrRiskLevel } {
  if (chronicLoad <= 0) return { ratio: null, level: "yellow" };
  const ratio = acuteLoad / chronicLoad;
  const level: AcwrRiskLevel =
    ratio > 1.5 || ratio < 0.5 ? "red" : ratio > 1.3 || ratio < 0.8 ? "yellow" : "green";
  return { ratio, level };
}

export type DailyLoad = { date: string; load: number };
export type AcwrPoint = {
  date: string;
  acuteLoad: number;
  chronicLoad: number;
  ratio: number | null;
  level: AcwrRiskLevel;
};

function isoDateOffset(baseIso: string, offsetDays: number): string {
  const d = new Date(baseIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Turns a sparse list of {date, load} rows (only days with logged training
// -- see getDailyLoadSeriesForAthlete) into a dense day-by-day ACWR series
// covering `days` days up to and including `throughDate`. Callers are
// expected to have already fetched dailyLoads going back at least 28 days
// before the first displayed day, so the very first point's chronic window
// is a real 28-day average rather than an artificially short one -- this
// function doesn't fetch anything itself, just the pure rolling-window math
// over whatever was passed in, so it's usable from both the roster-wide
// summary (one point) and the per-athlete history chart (a full series).
export function buildAcwrSeries(dailyLoads: DailyLoad[], throughDate: string, days: number): AcwrPoint[] {
  const loadByDate = new Map(dailyLoads.map((d) => [d.date, d.load]));
  const points: AcwrPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = isoDateOffset(throughDate, -i);
    let acuteLoad = 0;
    for (let a = 0; a < 7; a++) acuteLoad += loadByDate.get(isoDateOffset(date, -a)) ?? 0;
    let chronicTotal = 0;
    for (let c = 0; c < 28; c++) chronicTotal += loadByDate.get(isoDateOffset(date, -c)) ?? 0;
    const chronicLoad = chronicTotal / 4;
    const { ratio, level } = computeAcwrRisk(acuteLoad, chronicLoad);
    points.push({ date, acuteLoad, chronicLoad, ratio, level });
  }
  return points;
}
