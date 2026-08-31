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

// The app's real bundle id (see ios/App/App.xcodeproj) -- StoreKit 2 Product
// ids are conventionally namespaced under it. Shared here (not just in
// server/apple-iap.ts) so the client's purchase UI and the server's
// verification both derive the same product id from the same tier id
// instead of two hand-typed strings drifting apart, which is exactly what
// happened to the "base"/"pro" placeholder ids this replaced.
export const APPLE_BUNDLE_ID = "com.foreperformancesystems.forge";

/** The App Store Connect subscription Product id for a Free Agent tier.
 * These three ids must be created as real, priced auto-renewable
 * subscription Products in ONE subscription group in App Store Connect
 * before Apple IAP can go live (see server/apple-iap.ts) -- ai_coach,
 * ai_coach_video, and family are mutually exclusive (an athlete is only
 * ever on one at a time), which is exactly what belonging to the same
 * StoreKit subscription group enforces. Whatever price is configured for
 * each Product in App Store Connect IS the real price shown to the
 * customer (via StoreKit's own Product.displayPrice) -- this file's
 * monthlyPriceCents is what that configuration should match, not a value
 * the app needs to independently re-charge or display on iOS.
 *
 * The "_v2" suffix exists because the original unsuffixed ids
 * (...freeagent.ai_coach etc.) were briefly created in App Store Connect as
 * the wrong product type (Consumable) and deleted -- Apple permanently
 * reserves a Product ID the moment it's created, even after deletion, so
 * those exact strings can never be reused for the real subscription
 * Products. Don't drop the suffix later; the original ids are dead. */
export function appleProductIdForFreeAgentTier(tier: FreeAgentTierId): string {
  return `${APPLE_BUNDLE_ID}.freeagent.${tier}_v2`;
}

export type FreeAgentAddOnId = "golf_swing" | "hitting" | "pitching";

export interface FreeAgentAddOnDef {
  id: FreeAgentAddOnId;
  label: string;
  monthlyPriceCents: number;
  description: string;
}

// All three sport-specialist coaches are live -- see requireFreeAgentAddOn
// in routes.ts (which gates /api/athlete/coach/:addOnId/chat on
// users.freeAgentAddOns) and storage.sendSportCoachChatMessage. This still
// locks in the pricing structure as real, committed code (same reasoning as
// billing-tiers.ts before Stripe existed), it just no longer describes
// unbuilt features.
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

// Which of the three above have an actual feature behind them -- same
// "framework only, don't sell what doesn't exist" gate the Skill Bank
// sport-unlock already enforces (see getSportsWithSkillContent in
// storage.ts). All three ship as of this add -- this is what actually
// flips each checkbox from disabled to assignable in the admin billing UI
// and lifts the 400 the billing route used to throw for them. Kept as an
// explicit Set (not just "always all three") so a future fourth add-on can
// land here framework-first, same as these three originally did.
export const BUILT_FREE_AGENT_ADD_ONS: Set<FreeAgentAddOnId> = new Set([
  "golf_swing",
  "hitting",
  "pitching",
]);

export const FREE_AGENT_ADD_ON_ORDER: FreeAgentAddOnId[] = ["golf_swing", "hitting", "pitching"];

// Skill Bank sport-unlock pricing -- a separate dimension from the add-ons
// above (those are 3 specific unbuilt AI specialties; this is "any of the
// SPORTS taxonomy's sports"). A Free Agent's Skill Bank is free for their
// own signup sport (users.signupSport) plus the cross-sport bucket
// (skillExercises.crossSportFree); unlocking any other sport's drills
// costs this per sport, same "framework only, admin assigns it via
// users.unlockedSkillSports until a real purchase flow exists" posture as
// everything else in this file. NOT every SPORTS entry actually has real
// drill content behind it yet -- see storage.getSportsWithSkillContent,
// which the admin billing tool uses to only offer an unlock for a sport
// that has something real to unlock.
export const SKILL_SPORT_UNLOCK_MONTHLY_PRICE_CENTS = 999;
