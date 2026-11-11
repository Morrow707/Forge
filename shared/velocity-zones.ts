/* VELOCITY ZONES: a target bar speed per lift, and the rules every surface reads (2026-11-11).
 *
 * A zone is a low and a high mean concentric velocity in m/s. A camera set's mean velocity is read
 * against it as "in" zone, "slow" or "fast". The tags DESCRIBE a set and nothing in Forge changes a
 * prescription because of one (Scott, building it: the coach makes the call for a coached athlete,
 * and a Free Agent's suggestions change nothing until they tap).
 *
 * Every camera speed is uncalibrated and carries CAMERA_ACCURACY_INLINE wherever it is shown, which
 * is why the weight suggestion below waits for THREE sessions agreeing: one fast or slow day is
 * inside the camera's own take-to-take scatter (CLAUDE.md, Rule #5). Pure, so `npm test` needs no
 * database. */

/** The common bar-speed ranges coaches use, as a starting point that can be changed. Not a Forge
 * measurement. */
/** The edges of the common ranges, slowest first; each goal runs from one edge to the next. */
const RANGE_EDGES_MPS = [0.15, 0.5, 0.75, 1.0, 1.3, 1.6] as const;
const GOAL_NAMES = [
  ["max_strength", "Max strength"],
  ["strength", "Strength"],
  ["strength_speed", "Strength-speed"],
  ["speed_strength", "Speed-strength"],
  ["speed", "Speed"],
] as const;
export const VELOCITY_GOALS = GOAL_NAMES.map(([id, label], i) => ({
  id,
  label,
  lowMps: RANGE_EDGES_MPS[i],
  highMps: RANGE_EDGES_MPS[i + 1],
}));
export type VelocityGoalId = (typeof GOAL_NAMES)[number][0];

/** The highest zone edge anybody can type; well past any barbell or jump speed. */
export const MAX_ZONE_MPS = 3;
/** A speed drop of this share from the day's first set is pointed out (a common VBT stopping rule). */
export const SPEED_DROP_SHARE = 0.2;
/** How many sessions in a row must agree before a weight change is suggested. */
export const SESSIONS_BEFORE_A_SUGGESTION = 3;
/** A coach's dashboard flags a lift when at least this share of the week's sets were slow. */
export const SLOW_SHARE_FLAG = 0.5;
/** A drop needs a first set and at least one after it. */
const SETS_FOR_A_DROP = 2;
const PERCENT = 100;

export type ZoneVerdict = "in" | "slow" | "fast";
export type Zone = { lowMps: number; highMps: number };

export const ZONE_VERDICT_LABEL: Record<ZoneVerdict, string> = { in: "In zone", slow: "Slow", fast: "Fast" };

export function zoneVerdict(speedMps: number, zone: Zone): ZoneVerdict {
  if (speedMps < zone.lowMps) return "slow";
  if (speedMps > zone.highMps) return "fast";
  return "in";
}

/** How far a set fell from the day's first set, as a share (0.24 = 24% slower). Null for the first
 * set, or when the first set has no speed. */
export function speedDropShare(firstMps: number | null | undefined, speedMps: number): number | null {
  if (firstMps == null || firstMps <= 0) return null;
  return (firstMps - speedMps) / firstMps;
}

export function isValidZone(zone: Zone): boolean {
  return (
    Number.isFinite(zone.lowMps) &&
    Number.isFinite(zone.highMps) &&
    zone.lowMps >= 0 &&
    zone.highMps <= MAX_ZONE_MPS &&
    zone.lowMps < zone.highMps
  );
}

/** One earlier session's first camera set on a lift. */
export type FirstSet = { date: string; load: string | null; speedMps: number };

export type WeightSuggestion =
  | { kind: "add_weight"; sessions: FirstSet[] }
  | { kind: "hold_weight"; sessions: FirstSet[] };

/** A Free Agent's weight suggestion: only when the last SESSIONS_BEFORE_A_SUGGESTION sessions'
 * first sets ALL sat on the same side of the zone. Never a zone change: the zone is the athlete's
 * goal, so they set it. `sessions` is newest first. */
export function weightSuggestion(sessions: FirstSet[], zone: Zone): WeightSuggestion | null {
  const last = sessions.slice(0, SESSIONS_BEFORE_A_SUGGESTION);
  if (last.length < SESSIONS_BEFORE_A_SUGGESTION) return null;
  if (last.every((s) => zoneVerdict(s.speedMps, zone) === "fast")) return { kind: "add_weight", sessions: last };
  if (last.every((s) => zoneVerdict(s.speedMps, zone) === "slow")) return { kind: "hold_weight", sessions: last };
  return null;
}

export type CoachFlag = { kind: "drop" | "slow" | "fast"; sets: number; slow: number; fast: number; avgMps: number; dropShare: number | null };

/** What the coach's "Bar Speed" card says about one athlete's lift this week, or null when the
 * lift is in zone (the card lists only athletes worth a look). `days` is the week's sets grouped by
 * session, each in set order. A drop inside one session outranks a slow week, which outranks a
 * fast one. */
export function coachFlag(days: number[][], zone: Zone): CoachFlag | null {
  const all = days.flat();
  if (all.length === 0) return null;
  const slow = all.filter((v) => zoneVerdict(v, zone) === "slow").length;
  const fast = all.filter((v) => zoneVerdict(v, zone) === "fast").length;
  const avgMps = all.reduce((sum, v) => sum + v, 0) / all.length;
  const dropShare = days.reduce<number | null>((worst, d) => {
    if (d.length < SETS_FOR_A_DROP) return worst;
    const share = speedDropShare(d[0], Math.min(...d.slice(1)));
    return share != null && (worst == null || share > worst) ? share : worst;
  }, null);
  const base = { sets: all.length, slow, fast, avgMps, dropShare };
  if (dropShare != null && dropShare > SPEED_DROP_SHARE) return { kind: "drop", ...base };
  if (slow / all.length >= SLOW_SHARE_FLAG) return { kind: "slow", ...base };
  if (fast === all.length) return { kind: "fast", ...base };
  return null;
}

/** Share of sets in zone, 0-100, or null when no set was filmed. */
export function inZonePercent(speeds: number[], zone: Zone): number | null {
  if (speeds.length === 0) return null;
  return Math.round((speeds.filter((v) => zoneVerdict(v, zone) === "in").length / speeds.length) * PERCENT);
}
