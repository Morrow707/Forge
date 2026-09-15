// Single source of truth for form-check video retention -- storage is cheap
// but not free (a Render persistent disk, billed per GB), and unlike an AI
// paywall a retention limit actively deletes data once it's on, so getting
// these numbers right matters more than most. Applies per (athlete,
// exercise) pair, to BOTH Free Agents and coached athletes alike -- see
// getVideoRetentionLimits in server/billing.ts, which reuses the same
// isBetaAccount/trialExpiresAt/ENFORCEMENT_ENABLED switches as the rest of
// billing so nothing here deletes anything by accident while still in beta.

export interface VideoRetentionLimits {
  /** How many videos per exercise can be marked favorited -- exempt from
   * the rolling deletion below. */
  favoritedCap: number;
  /** Total videos kept per exercise (favorited + rolling combined) --
   * once a new video would push the count over this, the oldest
   * non-favorited video for that exercise is deleted. */
  totalCap: number;
}

export const VIDEO_RETENTION: VideoRetentionLimits = {
  favoritedCap: 5,
  totalCap: 10,
};

export const UNLIMITED_VIDEO_RETENTION: VideoRetentionLimits = {
  favoritedCap: Number.POSITIVE_INFINITY,
  totalCap: Number.POSITIVE_INFINITY,
};

export const VIDEO_STORAGE_ADD_ON: VideoRetentionLimits & { monthlyPriceCents: number } = {
  favoritedCap: 10,
  totalCap: 20,
  // Doubling the cap roughly doubles the storage this athlete uses -- at
  // Render's persistent-disk rate, the marginal 10-videos-per-item this
  // add-on unlocks costs a few dollars a month by itself (see the cost
  // model this session worked out). $9.99 covers that with real margin,
  // unlike $4.99 which was close to breakeven on storage alone.
  monthlyPriceCents: 999,
};


/** Which caps apply to one account, given whether billing enforcement is on at all.
 *
 * Pure on purpose: this is the decision, and it lives beside the numbers rather than in
 * server/billing.ts so it can be tested without a database. billing.ts supplies the env switch
 * and nothing else.
 *
 * THE FREE UNLOCKS DO NOT APPLY TO A MINOR'S FOOTAGE. Beta, trial and enforcement-off exist so
 * that shipping billing never restricts anyone by accident, which is the right default for a paid
 * entitlement: the cost of being wrong is an athlete losing a feature they were promised. A
 * retention cap on a child's video is not an entitlement. It is a data-minimisation promise, and
 * being wrong about it runs the other way -- footage of a twelve-year-old accumulating without
 * limit because a billing flag defaulted generous.
 *
 * The tier purge in server/data-retention-job.ts is the load-bearing protection and has never
 * been gated on any of this: a Tier 1 athlete's video goes at 30 days and a Tier 2 athlete's at
 * 90, whatever the cap says. This is the narrower promise inside that window -- a minor who films
 * fifty back squats in a fortnight keeps ten of them, not fifty.
 *
 * The paid add-on is still honoured for a minor. The exemption is from the free unlocks, not from
 * what somebody bought.
 */
export function resolveVideoRetentionLimits(input: {
  hasVideoStorageAddOn: boolean;
  isBetaAccount: boolean;
  trialExpiresAt: Date | null;
  /** True when this athlete is under 18. Callers derive it from derivePrivacyTier; an account
   * with no birthdate is not a known minor, and the minor gate refuses those outright, so one
   * cannot be accumulating video anyway. */
  isMinor: boolean;
  enforcementEnabled: boolean;
  now?: Date;
}): VideoRetentionLimits {
  const asOf = input.now ?? new Date();
  const trialActive =
    input.trialExpiresAt != null && input.trialExpiresAt.getTime() > asOf.getTime();
  if (!input.isMinor && (!input.enforcementEnabled || input.isBetaAccount || trialActive)) {
    return UNLIMITED_VIDEO_RETENTION;
  }
  return input.hasVideoStorageAddOn ? VIDEO_STORAGE_ADD_ON : VIDEO_RETENTION;
}
