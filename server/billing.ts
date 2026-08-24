import { BILLING_TIERS, type AddOnId, type BillingTierId } from "@shared/billing-tiers";
import { FREE_AGENT_TIERS, type FreeAgentTierId } from "@shared/free-agent-tiers";
import { VIDEO_RETENTION, VIDEO_STORAGE_ADD_ON, type VideoRetentionLimits } from "@shared/video-retention";

// Global kill switch -- deliberately not read from render.yaml (it's not
// added there at all), so production stays off the same way local dev does
// unless someone goes and sets this env var by hand. Combined with
// isBetaAccount below, nothing is ever restricted by accident.
export const ENFORCEMENT_ENABLED = process.env.BILLING_ENFORCEMENT_ENABLED === "true";

export interface Entitlements {
  /** null = unlimited. */
  athleteCap: number | null;
  hasCustomColors: boolean;
  hasTeamIdentity: boolean;
  hasWorkflowCustomization: boolean;
  hasMultiTeam: boolean;
}

const UNLIMITED_ENTITLEMENTS: Entitlements = {
  athleteCap: null,
  hasCustomColors: true,
  hasTeamIdentity: true,
  hasWorkflowCustomization: true,
  hasMultiTeam: true,
};

export interface BillingAccount {
  billingTier: string | null;
  billingAddOns: string[] | null;
  isBetaAccount: boolean;
  trialExpiresAt: Date | null;
}

/** Resolves what a primary coach's org is actually entitled to. Fully
 * unlocked whenever enforcement is globally off, the account is still
 * marked beta, or an active redeemed-code trial hasn't expired yet (see
 * storage.redeemCode) -- all true-by-default-or-temporary, on purpose, so
 * shipping this file doesn't restrict anyone on its own. Only once an
 * admin has explicitly set isBetaAccount=false (via the billing panel),
 * no trial is active, AND BILLING_ENFORCEMENT_ENABLED is set does a real
 * tier/add-on lookup happen. See shared/billing-tiers.ts for what each
 * tier/add-on id actually includes. */
export function getEntitlements(account: BillingAccount): Entitlements {
  const trialActive = account.trialExpiresAt != null && account.trialExpiresAt.getTime() > Date.now();
  if (!ENFORCEMENT_ENABLED || account.isBetaAccount || trialActive) {
    return UNLIMITED_ENTITLEMENTS;
  }

  const tier = account.billingTier ? BILLING_TIERS[account.billingTier as BillingTierId] : null;
  const addOns = new Set<AddOnId>((account.billingAddOns ?? []) as AddOnId[]);
  const hasFullBundle = addOns.has("full_bundle");

  return {
    athleteCap: tier?.athleteCapIncluded ?? 0,
    hasCustomColors: Boolean(tier?.includesFullPersonalization) || hasFullBundle || addOns.has("custom_colors"),
    hasTeamIdentity: Boolean(tier?.includesFullPersonalization) || hasFullBundle || addOns.has("team_identity"),
    hasWorkflowCustomization:
      Boolean(tier?.includesFullPersonalization) || hasFullBundle || addOns.has("workflow"),
    hasMultiTeam: Boolean(tier?.includesMultiTeam),
  };
}

// ---------- Free Agent (individual athlete) AI-coach billing ----------
// A separate track from the coach/org billing above -- see
// shared/free-agent-tiers.ts. Reuses the exact same isBetaAccount/
// trialExpiresAt columns and ENFORCEMENT_ENABLED switch (both live on the
// one users table regardless of role), so there's nothing new to default
// "off" here.

export interface FreeAgentEntitlements {
  hasAiChat: boolean;
  hasVideoFormCheck: boolean;
}

const UNLIMITED_FREE_AGENT_ENTITLEMENTS: FreeAgentEntitlements = {
  hasAiChat: true,
  hasVideoFormCheck: true,
};

const NONE_FREE_AGENT_ENTITLEMENTS: FreeAgentEntitlements = {
  hasAiChat: false,
  hasVideoFormCheck: false,
};

export interface FreeAgentBillingAccount {
  freeAgentTier: string | null;
  isBetaAccount: boolean;
  trialExpiresAt: Date | null;
}

/** Family resolves identically to ai_coach_video -- Family only changes how
 * many athlete profiles one payment covers (see users.familyGroupId), not
 * what any one member can do. */
export function getFreeAgentEntitlements(account: FreeAgentBillingAccount): FreeAgentEntitlements {
  const trialActive = account.trialExpiresAt != null && account.trialExpiresAt.getTime() > Date.now();
  if (!ENFORCEMENT_ENABLED || account.isBetaAccount || trialActive) {
    return UNLIMITED_FREE_AGENT_ENTITLEMENTS;
  }

  const tier = account.freeAgentTier ? FREE_AGENT_TIERS[account.freeAgentTier as FreeAgentTierId] : null;
  if (!tier) return NONE_FREE_AGENT_ENTITLEMENTS;

  return { hasAiChat: tier.hasAiChat, hasVideoFormCheck: tier.hasVideoFormCheck };
}

// ---------- Form-check video retention ----------
// Independent of both billing tracks above -- applies to ANY athlete
// (coached or Free Agent), keyed off the athlete's own row. Unlike a
// paywall, this actively deletes data once active, so it stays fully
// unlimited (no eviction at all) under the exact same "don't restrict by
// accident" conditions as everything else: enforcement off, still beta, or
// an active redeemed trial.

const UNLIMITED_VIDEO_RETENTION: VideoRetentionLimits = {
  favoritedCap: Infinity,
  totalCap: Infinity,
};

export interface VideoRetentionAccount {
  hasVideoStorageAddOn: boolean;
  isBetaAccount: boolean;
  trialExpiresAt: Date | null;
}

export function getVideoRetentionLimits(account: VideoRetentionAccount): VideoRetentionLimits {
  const trialActive = account.trialExpiresAt != null && account.trialExpiresAt.getTime() > Date.now();
  if (!ENFORCEMENT_ENABLED || account.isBetaAccount || trialActive) {
    return UNLIMITED_VIDEO_RETENTION;
  }
  return account.hasVideoStorageAddOn ? VIDEO_STORAGE_ADD_ON : VIDEO_RETENTION;
}
