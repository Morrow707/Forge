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

export const VIDEO_STORAGE_ADD_ON: VideoRetentionLimits & { monthlyPriceCents: number } = {
  favoritedCap: 10,
  totalCap: 20,
  monthlyPriceCents: 499,
};
