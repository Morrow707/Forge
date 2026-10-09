/** HOW FAR APART THE SAME LIFT LANDS ON DIFFERENT TAKES.
 *
 * Added 2026-10-09. Scott, reading three sessions of comparisons against the OVR: "I just feel
 * like we're starting over everytime."
 *
 * He was right, and nothing in this pipeline had ever written the reason down. Every calibration
 * session since 2026-10-04 has measured a BIAS -- the bench reads 39% low, then 26% low, then
 * 21% low, then 11% low -- and proposed or declined a constant to move it. None of them measured
 * the SCATTER, and the scatter is the same size as the bias:
 *
 *     Pendlay Row, 135lb, three takes:      42.6, 46.9, 71.6 cm   (1.68x)
 *     Bench Press, 135lb, four takes:       25.7, 28.4, 32.0, 32.5 (1.26x)
 *     Shoulder Press, 65lb, four takes:     63.0, 68.1, 71.4, 75.4 (1.20x)
 *
 * The athlete's real range of motion does not change by 68% between sets of the same lift at the
 * same load. And this is not drift between builds or between sessions: on 2026-10-07 three bench
 * sets filmed on ONE build, minutes apart, read 25.7, 28.4 and 32.5.
 *
 * That is why fitting has not converged. A bias of 10-25% cannot be fitted out of a measurement
 * whose take-to-take spread is 6-24%, because each new session's single take lands somewhere in
 * that cloud and reads as a regression or a win depending on where. Until the spread comes down,
 * every constant fitted on one session is fitted to noise, and this file exists so that the next
 * reader sees that before proposing one. Read it beside "WHAT 'ITS OWN NUMBERS' MEANS" in
 * CLAUDE.md: the spread is a property of the MECHANISM, shared across lifts, not a number to
 * split per movement.
 *
 * Where the spread comes from, measured on the same 20 captures (median coefficient of variation
 * across lift/load groups, so lower is steadier):
 *
 *     height          7%      present on 9 of 20 captures
 *     body_3d         7%      present on 20 of 20
 *     shoulder_width 12%      present on 19 of 20
 *     depth          12%      present on 19 of 20
 *
 * On the Pendlay Row specifically, body_3d's spread is 1% and shoulder_width's is 17-21%.
 *
 * IT RECORDS AND GATES NOTHING (Rule #1). It reads captures that already exist and changes no
 * number any athlete sees. It rides in the admin capture export so the question "is this lift
 * repeatable yet" is answerable from the file rather than from an afternoon of re-deriving it,
 * which is how 2026-10-09 found it.
 */

/** The fields this needs off a capture row. Deliberately structural rather than importing the
 *  export's own type: this is a measure over numbers, and tying it to one caller's shape would
 *  stop the replay harness running it offline over a corpus. */
export type RepeatabilityInput = {
  athlete?: string | null;
  exerciseName?: string | null;
  loadRaw?: number | string | null;
  loadUnit?: string | null;
  romCm?: number | null;
  scaleFactor?: number | null;
  date?: string | null;
};

export type RepeatabilityGroup = {
  athlete: string;
  exerciseName: string;
  load: string;
  takes: number;
  dates: string[];
  romCm: number[];
  /** Largest reported range of motion over the smallest. 1.0 is perfect repeatability. */
  romHiLoRatio: number | null;
  /** Coefficient of variation, as a percentage. The headline number. */
  romSpreadPct: number | null;
  scaleFactors: number[];
  scaleHiLoRatio: number | null;
  /** True when every take in the group is from one day, so no build change can be blamed for the
   *  spread. These are the groups that settle whether the scatter is in the code or the camera. */
  sameDay: boolean;
};

const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

function spreadPct(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!(mean > 0)) return null;
  const variance =
    values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return Math.round((Math.sqrt(variance) / mean) * 1000) / 10;
}

function hiLo(values: number[]): number | null {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (!(lo > 0)) return null;
  return Math.round((hi / lo) * 100) / 100;
}

/** Group by athlete + exercise + load and report how far apart the takes landed.
 *
 *  Load is part of the key on purpose: the same lift at a different load is a different range of
 *  motion for real reasons (a heavier bar is not racked from the same height, a push press at
 *  65lb is not the same dip as at 95lb), so pooling across loads would manufacture spread that
 *  is not a measurement problem. Groups of one take are dropped -- a single take has no spread,
 *  and reporting it as 0% would read as perfect repeatability. */
export function summarizeCaptureRepeatability(
  captures: RepeatabilityInput[],
): { groups: RepeatabilityGroup[]; worstRomHiLoRatio: number | null; medianRomSpreadPct: number | null } {
  const byKey = new Map<string, RepeatabilityInput[]>();
  for (const c of captures) {
    if (!c.exerciseName) continue;
    if (c.romCm == null || !(c.romCm > 0)) continue;
    const athlete = c.athlete ?? "unknown";
    const load = c.loadRaw == null ? "bodyweight" : `${c.loadRaw}${c.loadUnit ?? ""}`;
    const key = `${athlete}\u0000${c.exerciseName}\u0000${load}`;
    const list = byKey.get(key);
    if (list) list.push(c);
    else byKey.set(key, [c]);
  }

  const groups: RepeatabilityGroup[] = [];
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    const [athlete, exerciseName, load] = key.split("\u0000");
    const roms = list.map((c) => c.romCm as number);
    const scales = list.map((c) => c.scaleFactor).filter((s): s is number => s != null && s > 0);
    const dates = Array.from(new Set(list.map((c) => c.date ?? "unknown")));
    groups.push({
      athlete,
      exerciseName,
      load,
      takes: list.length,
      dates,
      romCm: roms.map((r) => Math.round(r * 10) / 10),
      romHiLoRatio: hiLo(roms),
      romSpreadPct: spreadPct(roms),
      scaleFactors: scales.map((s) => Math.round(s * 1e8) / 1e8),
      scaleHiLoRatio: hiLo(scales),
      sameDay: dates.length === 1,
    });
  }

  // Worst first: the group that disagrees with itself most is the one to look at.
  groups.sort((a, b) => (b.romHiLoRatio ?? 0) - (a.romHiLoRatio ?? 0));
  const spreads = groups
    .map((g) => g.romSpreadPct)
    .filter((s): s is number => s != null);
  return {
    groups,
    worstRomHiLoRatio: groups.length ? (groups[0].romHiLoRatio ?? null) : null,
    medianRomSpreadPct: spreads.length ? med(spreads) : null,
  };
}
