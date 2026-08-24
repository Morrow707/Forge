// Single source of truth for Free Agent (individual athlete, no coach)
// AI-coach pricing -- a separate track from shared/billing-tiers.ts, which
// prices a coach's whole org. A Free Agent's entitlements are resolved by
// getFreeAgentEntitlements in server/billing.ts, which reuses the exact
// same isBetaAccount/trialExpiresAt safety switches already on the users
// table -- nothing new to keep "off by default" here.

export type FreeAgentTierId = "ai_coach" | "ai_coach_video" | "family";

export interface FreeAgentTierDef {
  id: FreeAgentTierId;
  label: string;
  monthlyPriceCents: number;
  description: string;
  hasAiChat: boolean;
  hasVideoFormCheck: boolean;
  /** null = a single athlete's own subscription. Family only: how many
   * athlete profiles one payment covers -- see users.familyGroupId and
   * storage.createFamilyGroup. Every member gets the same capabilities as
   * ai_coach_video; Family changes who's paying, not what's unlocked. */
  athleteProfileCap: number | null;
}

export const FREE_AGENT_TIERS: Record<FreeAgentTierId, FreeAgentTierDef> = {
  ai_coach: {
    id: "ai_coach",
    label: "AI Coach",
    monthlyPriceCents: 999,
    description: "AI chat coach and AI program builder.",
    hasAiChat: true,
    hasVideoFormCheck: false,
    athleteProfileCap: null,
  },
  ai_coach_video: {
    id: "ai_coach_video",
    label: "AI Coach + Video",
    monthlyPriceCents: 1999,
    description: "Everything in AI Coach, plus AI form-check on your lifts.",
    hasAiChat: true,
    hasVideoFormCheck: true,
    athleteProfileCap: null,
  },
  family: {
    id: "family",
    label: "Family",
    monthlyPriceCents: 4999,
    description: "AI Coach + Video for up to 3 athletes on one household plan.",
    hasAiChat: true,
    hasVideoFormCheck: true,
    athleteProfileCap: 3,
  },
};

// Ordered cheapest-to-priciest, for rendering the /pricing page and the
// admin assignment dropdown in a sensible order without re-sorting.
export const FREE_AGENT_TIER_ORDER: FreeAgentTierId[] = ["ai_coach", "ai_coach_video", "family"];

export type FreeAgentAddOnId = "golf_swing" | "hitting" | "pitching";

export interface FreeAgentAddOnDef {
  id: FreeAgentAddOnId;
  label: string;
  monthlyPriceCents: number;
  description: string;
}

// IMPORTANT: none of these sport-specialist coaches exist yet -- this only
// locks in the pricing structure so the numbers are real, committed code
// instead of a figure that only ever existed in a chat transcript (same
// reasoning as billing-tiers.ts before Stripe existed). Nothing in the app
// gates any route on freeAgentAddOns yet; wire a specific route's paywall
// to one of these ids once that sport's coach actually ships.
export const FREE_AGENT_ADD_ONS: Record<FreeAgentAddOnId, FreeAgentAddOnDef> = {
  golf_swing: {
    id: "golf_swing",
    label: "Golf Swing Coach",
    monthlyPriceCents: 799,
    description: "AI swing analysis and drills for golf.",
  },
  hitting: {
    id: "hitting",
    label: "Hitting Coach",
    monthlyPriceCents: 799,
    description: "AI batting mechanics analysis and drills.",
  },
  pitching: {
    id: "pitching",
    label: "Pitching Coach",
    monthlyPriceCents: 799,
    description: "AI pitching mechanics analysis and drills.",
  },
};

export const FREE_AGENT_ADD_ON_ORDER: FreeAgentAddOnId[] = ["golf_swing", "hitting", "pitching"];
