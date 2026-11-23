/* OVERWATCH LEARNS BETWEEN TAKES, NEVER DURING ONE.
 *
 * Scott, 2026-11-23: "why doesn't the overwatch remember between takes? ... how does the
 * overwatch learn and get better if its wiping its memory between takes? a 1000 takes later and
 * we can make the over watch a master vidoegrapher why aren't we?" Then: "yes build it".
 *
 * WHAT STAYS THE SAME. During a take overwatch judges each frame from that take alone, with
 * settings that do not move. That is what keeps three things true: a take replays to the same
 * answer next month (the ledger's whole value), a run of bad takes cannot teach it to trust a bad
 * reading, and it stays the one referee that owns no sensor (Rule #2).
 *
 * WHAT IS NEW. Its SETTINGS are learned. The three thresholds it compares against -- how far the
 * object may sit from the hands, how big a plate may be, how fast the body's span may change, all
 * in grip widths -- were admitted guesses nothing could revise, because no take wrote down what
 * each check MEASURED. Since 2026-11-23 the phone records it, per box (AvOverwatchFrameLog in
 * AvBodyTrackingPlugin.swift, carried as `objectLock.frames`). Between takes this module replays
 * the same three checks on every recorded take at other settings, client/src/lib/
 * overwatch-learning-score.ts scores each setting against the OVR through the real scale blend,
 * and scripts/overwatch-learn.ts writes a NEW NUMBERED VERSION to shared/overwatch-versions-on-
 * record.json when one beats the current settings held out. The bar dialog sends the newest
 * version for that lift to the phone with every capture and records which version ran.
 *
 * PER LIFT, because a threshold fitted on takes is a NUMBER somebody fitted (CLAUDE.md, "what its
 * own numbers means"): a bench's lock distance must not move a squat's. The referee is still one
 * referee; only what it compares against is the lift's own.
 *
 * NEVER BLOCKS (Rule #1). A version can only change which boxes the object system keeps; every
 * take still writes its numbers. A lift with too few recorded takes stays on the registry's
 * settings and says so -- "recording, not deciding yet".
 *
 * WHAT THE REPLAY CAN AND CANNOT SEE, stated so it is not over-read. It re-judges every box the
 * phone recorded: a box a looser setting would have kept is kept, a box a tighter one would have
 * broken is dropped. It cannot see what Vision would have tracked AFTER a lock the phone broke --
 * that frame was never computed -- and it cannot see the box on a frame overwatch abstained on
 * (the lock was not asked). Both are counted (`unreplayable`), so a setting whose evidence is
 * mostly guesswork reads as that.
 *
 * Pure: no imports from the client, so `npm test` needs nothing and a page can read the versions. */

import versionsOnRecord from "./overwatch-versions-on-record.json";

/** The three thresholds overwatch's object checks compare against, in grip widths (the third is
 *  a ratio of spans). Mirrors AvTrackerArbiter.Tunables in Swift and the registry's fields. */
export type OverwatchSettings = {
  maxLockDistanceInYardsticks: number;
  maxPlateSizeInYardsticks: number;
  maxYardstickDeviationRatio: number;
};

export const OVERWATCH_SETTING_KEYS = [
  "maxLockDistanceInYardsticks",
  "maxPlateSizeInYardsticks",
  "maxYardstickDeviationRatio",
] as const satisfies readonly (keyof OverwatchSettings)[];

/** The phone's per-frame record, exactly as AvOverwatchFrameLog writes it. -1 = not measurable. */
export type OverwatchFrameLog = {
  v: number;
  /** frame index within the take */
  f: number[];
  /** kind, see FRAME_KIND */
  k: number[];
  /** box long edge, px */
  e: number[];
  /** long edge in grip widths */
  s: number[];
  /** distance from the hands, grip widths */
  d: number[];
  /** body span against its recent history (1 = unchanged) */
  r: number[];
  /** confidence */
  c: number[];
  /** yardstick source: 0 grip, 1 shoulders, -1 none */
  y: number[];
  dropped: number;
};

/** The kind codes, IN THE ORDER the Swift log numbers them (index = code). */
export const FRAME_KIND_ORDER = [
  "held",
  "freshPick",
  "reclassifyPick",
  "brokenByDistance",
  "brokenByJump",
  "brokenByMotion",
  "candidate",
  "lowConfidencePick",
  "abstained",
] as const;
export type FrameKind = (typeof FRAME_KIND_ORDER)[number];
export const FRAME_KIND = Object.fromEntries(FRAME_KIND_ORDER.map((k, i) => [k, i])) as Record<FrameKind, number>;

/** A box the phone REPORTED this frame (what the scale median is built from). */
const REPORTED = new Set<number>([
  FRAME_KIND.held,
  FRAME_KIND.freshPick,
  FRAME_KIND.reclassifyPick,
  FRAME_KIND.lowConfidencePick,
]);

export type ReplayResult = {
  /** Long edges, px, of the boxes these settings keep -- one per frame. */
  keptEdgesPx: number[];
  /** Frames whose box these settings would have kept and the phone never measured. */
  unreplayable: number;
  medianEdgePx: number | null;
};

const MIN_EDGES_FOR_A_MEDIAN = 5;
const HALF = 2;
/** Two settings closer than this are the same setting (floating-point grid values). */
const SAME_SETTING_EPSILON = 1e-9;
const DISPLAY_DECIMALS = 2;
const RECORD_DECIMALS = 3;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / HALF);
  return s.length % HALF ? s[m] : (s[m - 1] + s[m]) / HALF;
}

/** Would these settings let this box through? A measurement the phone could not take (-1)
 *  passes, exactly as the native gate passes what it cannot judge. */
function passes(log: OverwatchFrameLog, i: number, settings: OverwatchSettings, isPlate: boolean): boolean {
  const d = log.d[i];
  const s = log.s[i];
  const r = log.r[i];
  if (d >= 0 && d > settings.maxLockDistanceInYardsticks) return false;
  if (isPlate && s >= 0 && s > settings.maxPlateSizeInYardsticks) return false;
  if (r >= 0 && r > settings.maxYardstickDeviationRatio) return false;
  return true;
}

/** RE-JUDGE EVERY RECORDED BOX AT OTHER SETTINGS. Per frame: the box the phone reported, or the
 *  one a distance break threw away, if these settings keep it; otherwise the most confident
 *  candidate a fresh search weighed that these settings keep. Breaks by the jump and motion checks
 *  stay broken -- those are not learned here. */
export function replayFrameLog(log: OverwatchFrameLog, settings: OverwatchSettings, isPlate: boolean): ReplayResult {
  const byFrame = new Map<number, number[]>();
  log.f.forEach((frame, i) => {
    const list = byFrame.get(frame) ?? [];
    list.push(i);
    byFrame.set(frame, list);
  });
  const keptEdgesPx: number[] = [];
  let unreplayable = 0;
  byFrame.forEach((entries) => {
    const primary = entries.find((i) => REPORTED.has(log.k[i]) || log.k[i] === FRAME_KIND.brokenByDistance);
    if (primary != null && log.e[primary] > 0 && passes(log, primary, settings, isPlate)) {
      keptEdgesPx.push(log.e[primary]);
      return;
    }
    const candidates = entries
      .filter((i) => log.k[i] === FRAME_KIND.candidate && log.e[i] > 0 && passes(log, i, settings, isPlate))
      .sort((a, b) => log.c[b] - log.c[a]);
    if (candidates.length > 0) {
      keptEdgesPx.push(log.e[candidates[0]]);
      return;
    }
    const abstained = entries.find((i) => log.k[i] === FRAME_KIND.abstained);
    if (abstained != null && log.r[abstained] >= 0 && log.r[abstained] <= settings.maxYardstickDeviationRatio) {
      unreplayable += 1;
    }
  });
  return {
    keptEdgesPx,
    unreplayable,
    medianEdgePx: keptEdgesPx.length >= MIN_EDGES_FOR_A_MEDIAN ? median(keptEdgesPx) : null,
  };
}

/** The settings a learner tries. Each spans the registry default on both sides; the grid is
 *  small on purpose -- three numbers, a few values each -- so a choice is never a fit to noise in
 *  a fine grid. */
/* The grid lives beside the versions in overwatch-versions-on-record.json, so the values a
 * learner may try are data, recorded with what it chose. */
export const OVERWATCH_GRID = (versionsOnRecord as { grid: { readonly [K in keyof OverwatchSettings]: readonly number[] } }).grid;

export function overwatchGrid(): OverwatchSettings[] {
  return OVERWATCH_GRID.maxLockDistanceInYardsticks.flatMap((a) =>
    OVERWATCH_GRID.maxPlateSizeInYardsticks.flatMap((b) =>
      OVERWATCH_GRID.maxYardstickDeviationRatio.map((c) => ({
        maxLockDistanceInYardsticks: a,
        maxPlateSizeInYardsticks: b,
        maxYardstickDeviationRatio: c,
      })),
    ),
  );
}

/** A take as the learner sees it: its lift and a function that scores a setting against the OVR
 *  (per-cent error of the blended scale; null when this take's object cannot vote at that
 *  setting). Built by client/src/lib/overwatch-learning-score.ts from the ledger and the export. */
export type LearnableTake = {
  id: string;
  exercise: string;
  errorPct: (settings: OverwatchSettings) => number | null;
};

/** Fewer recorded takes than this and a lift only records. Three is the least that can be held
 *  out at all; it is a floor for leave-one-out to mean anything, not a waiting period (Rule #6
 *  is about the registry's per-take fix, which this does not replace). */
export const MIN_TAKES_TO_DECIDE = 3;

export type LiftLearning = {
  exercise: string;
  takes: number;
  status: "recording" | "hold" | "adopt";
  current: OverwatchSettings;
  /** Mean |error| % across the takes at the current settings. */
  currentMeanAbsPct: number | null;
  proposed: OverwatchSettings | null;
  proposedMeanAbsPct: number | null;
  /** Mean |error| % of each take scored by the setting chosen WITHOUT it. */
  heldOutMeanAbsPct: number | null;
  why: string;
};

function sameSettings(a: OverwatchSettings, b: OverwatchSettings): boolean {
  return OVERWATCH_SETTING_KEYS.every((k) => Math.abs(a[k] - b[k]) < SAME_SETTING_EPSILON);
}

function meanAbs(takes: LearnableTake[], s: OverwatchSettings): number | null {
  const errs = takes.map((t) => t.errorPct(s));
  if (errs.some((e) => e == null)) return null;
  return (errs as number[]).reduce((a, e) => a + Math.abs(e), 0) / errs.length;
}

function bestOf(takes: LearnableTake[], current: OverwatchSettings): { s: OverwatchSettings; m: number } | null {
  const currentM = meanAbs(takes, current);
  const start: { s: OverwatchSettings; m: number } | null = currentM == null ? null : { s: current, m: currentM };
  return overwatchGrid().reduce<{ s: OverwatchSettings; m: number } | null>((best, s) => {
    const m = meanAbs(takes, s);
    // Strictly better only: a tie keeps the setting already running.
    return m != null && (best == null || m < best.m - SAME_SETTING_EPSILON) ? { s, m } : best;
  }, start);
}

/** THE RULE A NEW VERSION HAS TO CLEAR, per lift: enough recorded takes, a setting that lowers the
 *  mean error across ALL of them (never just the newest -- the "starting high every week" lesson),
 *  and the same choice holding up when each take is scored by a setting chosen without it. */
export function learnLift(exercise: string, takes: LearnableTake[], current: OverwatchSettings): LiftLearning {
  const base: LiftLearning = {
    exercise,
    takes: takes.length,
    status: "recording",
    current,
    currentMeanAbsPct: meanAbs(takes, current),
    proposed: null,
    proposedMeanAbsPct: null,
    heldOutMeanAbsPct: null,
    why: "",
  };
  if (takes.length < MIN_TAKES_TO_DECIDE) {
    return { ...base, why: `${takes.length} of ${MIN_TAKES_TO_DECIDE} recorded takes with the OVR: recording, not deciding yet` };
  }
  const best = bestOf(takes, current);
  if (!best || base.currentMeanAbsPct == null) {
    return { ...base, status: "hold", why: "the object could not vote on every take at the current settings" };
  }
  const heldOut = takes.map((t, i) => {
    const others = takes.filter((_, j) => j !== i);
    const chosen = bestOf(others, current)?.s ?? current;
    const e = t.errorPct(chosen);
    return e == null ? null : Math.abs(e);
  });
  const heldOutMean = heldOut.some((h) => h == null)
    ? null
    : (heldOut as number[]).reduce((a, b) => a + b, 0) / heldOut.length;
  const proposedSame = sameSettings(best.s, current);
  const result = {
    ...base,
    proposed: proposedSame ? null : best.s,
    proposedMeanAbsPct: best.m,
    heldOutMeanAbsPct: heldOutMean,
  };
  if (proposedSame) return { ...result, status: "hold", why: "the current settings are already the best on record" };
  if (heldOutMean == null || heldOutMean >= base.currentMeanAbsPct) {
    return {
      ...result,
      status: "hold",
      why: `better on all takes (${best.m.toFixed(DISPLAY_DECIMALS)}% vs ${base.currentMeanAbsPct.toFixed(DISPLAY_DECIMALS)}%) but not held out (${heldOutMean == null ? "n/a" : heldOutMean.toFixed(DISPLAY_DECIMALS)}%)`,
    };
  }
  return {
    ...result,
    status: "adopt",
    why: `mean error ${base.currentMeanAbsPct.toFixed(DISPLAY_DECIMALS)}% -> ${best.m.toFixed(DISPLAY_DECIMALS)}% on ${takes.length} takes, ${heldOutMean.toFixed(DISPLAY_DECIMALS)}% held out`,
  };
}

/* THE VERSIONS ON RECORD. Append-only: a version is never edited, a newer one supersedes it, and
 * rolling back is appending the older settings as a newer version. */
export type OverwatchVersion = {
  /** "<lift slug>-v<n>" */
  id: string;
  exercise: string;
  createdAt: string;
  settings: OverwatchSettings;
  takes: number;
  beforeMeanAbsPct: number;
  afterMeanAbsPct: number;
  heldOutMeanAbsPct: number;
};

export const OVERWATCH_VERSIONS: readonly OverwatchVersion[] =
  (versionsOnRecord as { versions: OverwatchVersion[] }).versions;

/** The id a capture records when no learned version exists for its lift. */
export const REGISTRY_SETTINGS_VERSION = "registry";

/** WHAT THE PHONE IS HANDED FOR THIS LIFT: the newest learned version, or the registry's own
 *  values when the lift has none. Read by the bar dialog at every capture. */
export function overwatchSettingsFor(
  exercise: string,
  registryValues: OverwatchSettings,
  versions: readonly OverwatchVersion[] = OVERWATCH_VERSIONS,
): { settings: OverwatchSettings; version: string } {
  const mine = versions.filter((v) => v.exercise === exercise);
  const newest = mine[mine.length - 1];
  if (!newest) {
    return {
      settings: {
        maxLockDistanceInYardsticks: registryValues.maxLockDistanceInYardsticks,
        maxPlateSizeInYardsticks: registryValues.maxPlateSizeInYardsticks,
        maxYardstickDeviationRatio: registryValues.maxYardstickDeviationRatio,
      },
      version: REGISTRY_SETTINGS_VERSION,
    };
  }
  return { settings: { ...newest.settings }, version: newest.id };
}

/** "Back Squat" -> "back-squat". The first pattern matches every run of characters that is not
 *  a lowercase letter or digit (" ", " (", "-"), the second a leading or trailing dash
 *  ("-bench" matches at the start, "bench" does not):
 *  https://regex101.com/?regex=%5B%5Ea-z0-9%5D%2B&testString=back%20squat */
export function liftSlug(exercise: string): string {
  return exercise.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** The next version a learning that reads "adopt" appends. */
export function nextVersion(
  learning: LiftLearning,
  createdAt: string,
  versions: readonly OverwatchVersion[] = OVERWATCH_VERSIONS,
): OverwatchVersion | null {
  if (learning.status !== "adopt" || !learning.proposed || learning.currentMeanAbsPct == null) return null;
  if (learning.proposedMeanAbsPct == null || learning.heldOutMeanAbsPct == null) return null;
  const n = versions.filter((v) => v.exercise === learning.exercise).length + 1;
  return {
    id: `${liftSlug(learning.exercise)}-v${n}`,
    exercise: learning.exercise,
    createdAt,
    settings: learning.proposed,
    takes: learning.takes,
    beforeMeanAbsPct: Number(learning.currentMeanAbsPct.toFixed(RECORD_DECIMALS)),
    afterMeanAbsPct: Number(learning.proposedMeanAbsPct.toFixed(RECORD_DECIMALS)),
    heldOutMeanAbsPct: Number(learning.heldOutMeanAbsPct.toFixed(RECORD_DECIMALS)),
  };
}
