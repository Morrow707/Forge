import type { AthleteBodyModel, LimbKey } from "@shared/athlete-body-model";
import { foldLimbMeasurement, RULERS_THAT_MAY_TEACH_A_LIMB } from "@shared/athlete-body-model";

/**
 * FOLDING ONE TAKE'S MEASUREMENTS INTO WHAT THIS ATHLETE'S SKELETON IS KNOWN TO BE.
 *
 * Runs on save, server side, and only for a take whose scale came from a ruler the BODY had no
 * hand in producing: a plate measured in frame, the gravity ruler off a flat jump, or a grip the
 * athlete measured with a tape. A limb learned from a scale that was itself derived from a limb
 * is circular, and it would then propagate to every future take wearing the authority of a
 * measurement. That is the single way this feature can make the pipeline worse than not having
 * it, so the gate is strict and refusing is the default.
 *
 * The history is kept alongside each estimate rather than only the summary, because the fold is
 * a MEDIAN: a running mean lets one take with a ruler that slipped through permanently shift a
 * bone, where a median lets later takes outvote it. That only works if the earlier readings are
 * still there to vote.
 */

export type BodyModelWithHistory = AthleteBodyModel & {
  /** Every accepted reading per limb, in metres. The median is computed from these. */
  history?: Partial<Record<LimbKey, number[]>>;
};

/** Enough readings kept to let later takes outvote an early bad one without the column growing
 *  without bound. Oldest dropped first: a skeleton does not change, so recency is not a virtue
 *  here, but an athlete who was thirteen when they joined is a real exception and the window
 *  handles it by simply forgetting far enough back. */
export const MAX_LIMB_HISTORY = 25;

export function learnFromTake(
  existing: BodyModelWithHistory | null | undefined,
  measurements: Partial<Record<LimbKey, number>>,
  scaleSource: string | null | undefined,
): BodyModelWithHistory | null {
  if (!scaleSource) return null;
  if (!(RULERS_THAT_MAY_TEACH_A_LIMB as readonly string[]).includes(scaleSource)) return null;

  const next: BodyModelWithHistory = { ...(existing ?? {}) };
  const history: Partial<Record<LimbKey, number[]>> = { ...(existing?.history ?? {}) };
  let learnedAnything = false;

  for (const [key, metres] of Object.entries(measurements) as [LimbKey, number][]) {
    if (!Number.isFinite(metres) || metres <= 0) continue;
    const prior = history[key] ?? [];
    next[key] = foldLimbMeasurement(existing?.[key], metres, scaleSource, prior);
    history[key] = [...prior, metres].slice(-MAX_LIMB_HISTORY);
    learnedAnything = true;
  }

  if (!learnedAnything) return null;
  next.history = history;
  return next;
}
