// Single source of truth for Free Agent (individual athlete, no coach)
// AI-coach pricing -- a separate track from shared/billing-tiers.ts, which
// prices a coach's whole org. A Free Agent's entitlements are resolved by
// getFreeAgentEntitlements in server/billing.ts, which reuses the exact
// same isBetaAccount/trialExpiresAt safety switches already on the users
// table -- nothing new to keep "off by default" here.

export type FreeAgentTierId = "basic" | "ai_coach" | "ai_coach_video";

export interface FreeAgentTierDef {
  id: FreeAgentTierId;
  label: string;
  monthlyPriceCents: number;
  description: string;
  hasAiChat: boolean;
  hasVideoFormCheck: boolean;
}

export const FREE_AGENT_TIERS: Record<FreeAgentTierId, FreeAgentTierDef> = {
  // The floor of the ladder: logging, and nothing that costs a model call.
  // Nutrition and exercise logging are not gated by any entitlement flag --
  // they never were -- so "both flags false" IS this tier, and no new flag
  // is needed to express it. What it buys is a paid account with no AI chat,
  // no AI program builder and no form-check.
  basic: {
    id: "basic",
    label: "Basic",
    monthlyPriceCents: 499,
    description: "Log your training and your nutrition. No AI coach, no video form-check.",
    hasAiChat: false,
    hasVideoFormCheck: false,
  },
  ai_coach: {
    id: "ai_coach",
    label: "AI Coach",
    monthlyPriceCents: 999,
    description: "AI chat coach and AI program builder.",
    hasAiChat: true,
    hasVideoFormCheck: false,
  },
  ai_coach_video: {
    id: "ai_coach_video",
    label: "AI Coach + Video",
    monthlyPriceCents: 1999,
    description: "Everything in AI Coach, plus AI form-check on your lifts.",
    hasAiChat: true,
    hasVideoFormCheck: true,
  },
};

/**
 * What a SKU includes, with no environment switches in it at all.
 *
 * Separate from server/billing.ts's getFreeAgentEntitlements, which answers a
 * different question: this one is "what does this tier buy", a property of the
 * price list above; that one is "what may this account do right now", which also
 * depends on the beta flag, an active trial and BILLING_ENFORCEMENT_ENABLED.
 *
 * Route gating needs this one inside its own BILLING_LIVE branch. Calling the other
 * there would hand every account unlimited access whenever enforcement is off,
 * which is a different switch from the one that decides whether checkout exists.
 */
export function entitlementsForFreeAgentTier(
  tier: string | null | undefined,
): { hasAiChat: boolean; hasVideoFormCheck: boolean } {
  const def = tier ? FREE_AGENT_TIERS[tier as FreeAgentTierId] : null;
  if (!def) return { hasAiChat: false, hasVideoFormCheck: false };
  return { hasAiChat: def.hasAiChat, hasVideoFormCheck: def.hasVideoFormCheck };
}

// Ordered cheapest-to-priciest, for rendering the /pricing page and the admin assignment
// dropdown in a sensible order without re-sorting.
//
// Family is gone entirely -- the product, the household grouping behind it and the code that
// created groups. Any account still stored on it is moved to AI Coach + Video by a backfill in
// reconcile-schema.ts, which is what Family always resolved to anyway: it never changed what one
// member could do, only how many profiles one payment covered.
export const FREE_AGENT_TIER_ORDER: FreeAgentTierId[] = ["basic", "ai_coach", "ai_coach_video"];

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
 * before Apple IAP can go live (see server/apple-iap.ts) -- basic, ai_coach
 * and ai_coach_video are mutually exclusive (an athlete is only ever on one
 * at a time), which is exactly what belonging to the same StoreKit
 * subscription group enforces. Whatever price is configured for
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
