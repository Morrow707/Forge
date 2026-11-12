/** A RULER'S TRUST, LEARNED FROM HOW FAR IT HAS ACTUALLY SAT FROM THE SENSOR -- and the test a
 *  learned value has to pass before it may replace the one in a lift's record.
 *
 * The scale blend weights each ruler by 1/uncertainty^2. Those uncertainties began as guesses and
 * have been stepped by hand a round at a time. The ledger holds what each ruler really read on
 * every sensor-paired take, so the uncertainty can be MEASURED per lift: the root-mean-square of
 * the ruler's relative error about the sensor (lean and scatter together, which is what an
 * inverse-variance weight wants to know).
 *
 * WHY A MEASURED VALUE IS NOT SIMPLY ADOPTED. Measured 2026-11-12 on all 35 ledger rows: the
 * learned values are no better than the records as they stand on any lift when judged on sets
 * they were not learned from, and on the Back Squat they are twice as bad (2.2% -> 4.6%). A
 * value that describes the takes it was computed from mostly describes their wobble (Rule #5,
 * and the 2026-11-11 all-sets rule in shared/lift-standing.ts). So the gate is LEAVE-ONE-OUT:
 * each set is scored at the values learned from the lift's OTHER sets, and the learned values
 * ship only if that held-out average beats today's AND the all-sets rule also allows the step.
 *
 * Pure arithmetic. The replay that turns a patch into an error lives with the ledger replay
 * (client/src/lib/learned-trust-verdict.ts), because it needs the scale blend. */
import { MIN_SETS_BEFORE_A_SETTING_MOVES, standingOf, stepVerdict } from "./lift-standing";

/** The four scale settings the ledger replay reads, by the ruler each belongs to. */
export const SETTING_FOR_RULER = {
  height: "heightRulerUncertainty",
  shoulder_width: "biacromialToleranceFraction",
  depth: "depthRulerUncertainty",
  body_3d: "body3DCorrectedUncertainty",
} as const;
export type LearnableRuler = keyof typeof SETTING_FOR_RULER;
export type LearnedPatch = Partial<Record<(typeof SETTING_FOR_RULER)[LearnableRuler], number>>;

/** Fewer readings than this and a root-mean-square is two numbers and a hope. */
export const MIN_READINGS_TO_LEARN = 3;
/** No ruler built on landmarks has earned better than this, whatever a lucky run says. */
export const LEARNED_UNCERTAINTY_FLOOR = 0.05;
/** Past this a ruler is abstaining; a larger value only widens tolerances elsewhere. */
export const LEARNED_UNCERTAINTY_CEILING = 0.8;
const DECIMALS = 2;

/** One ruler's relative errors against the sensor (0.1 is ten per cent high), one per take. */
export function learnedUncertainty(relativeErrors: readonly number[]): number | null {
  if (relativeErrors.length < MIN_READINGS_TO_LEARN) return null;
  const rms = Math.sqrt(relativeErrors.reduce((a, b) => a + b * b, 0) / relativeErrors.length);
  const bounded = Math.min(LEARNED_UNCERTAINTY_CEILING, Math.max(LEARNED_UNCERTAINTY_FLOOR, rms));
  return Number(bounded.toFixed(DECIMALS));
}

/** The settings patch a set of takes teaches, a ruler with too few readings left out. */
export function learnedPatch(
  takes: readonly { readonly rulers: readonly { readonly source: string; readonly relativeError: number }[] }[],
): LearnedPatch {
  return (Object.keys(SETTING_FOR_RULER) as LearnableRuler[]).reduce<LearnedPatch>((patch, ruler) => {
    const errs = takes.flatMap((t) => t.rulers.filter((r) => r.source === ruler).map((r) => r.relativeError));
    const u = learnedUncertainty(errs);
    return u == null ? patch : { ...patch, [SETTING_FOR_RULER[ruler]]: u };
  }, {});
}

export type LearnVerdict = {
  readonly adopt: boolean;
  readonly why: string;
  readonly sets: number;
  readonly todayAvgPct: number;
  readonly heldOutAvgPct: number;
  readonly patch: LearnedPatch;
};

/** Whether a lift's learned settings may ship. `todayPct` is each set's error at the record as
 *  it stands; `heldOutPct` each set's error at the values learned from the OTHER sets;
 *  `allSetsPct` each set's error at the values learned from every set (what would ship). */
export function learnVerdict(
  todayPct: readonly number[],
  heldOutPct: readonly number[],
  allSetsPct: readonly number[],
  patch: LearnedPatch,
): LearnVerdict {
  const today = standingOf(todayPct);
  const heldOut = standingOf(heldOutPct);
  const base = { sets: today.sets, todayAvgPct: today.meanAbsPct, heldOutAvgPct: heldOut.meanAbsPct, patch };
  if (today.sets < MIN_SETS_BEFORE_A_SETTING_MOVES) {
    return { ...base, adopt: false, why: `${today.sets} set(s) on record; learning starts at ${MIN_SETS_BEFORE_A_SETTING_MOVES}.` };
  }
  if (heldOut.meanAbsPct >= today.meanAbsPct) {
    return {
      ...base,
      adopt: false,
      why: `on sets it was not learned from the average is ${heldOut.meanAbsPct}% against ${today.meanAbsPct}% today: not better.`,
    };
  }
  const allSets = stepVerdict(todayPct, allSetsPct);
  if (!allSets.allowed) return { ...base, adopt: false, why: `held out it is better, but ${allSets.why}` };
  return {
    ...base,
    adopt: true,
    why: `held out ${today.meanAbsPct}% -> ${heldOut.meanAbsPct}%, and ${allSets.why}`,
  };
}
