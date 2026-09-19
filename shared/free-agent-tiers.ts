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

// AI COACH + VIDEO IS WITHDRAWN FROM SALE. THE TIER STAYS; THE OFFER DOES NOT.
//
// Scott, 2026-09-19: "our camera doesn't work, it does, but isn't accurate, we need to stall the
// $19.99 package for now, keep it in the code, but don't let it be accessible, remove the price
// point from view, remove the option."
//
// The whole of what that tier adds over AI Coach is `hasVideoFormCheck` -- the camera pipeline.
// Its rep counts were wrong (see docs/camera-tracking-notes.md: a scale read off the wrong plate
// inflated every distance, and eleven bench reps came back as eighteen), and the fixes for that
// have not been validated against real footage yet. Charging ten dollars a month more for the
// half of the product that is currently the least trustworthy is not a thing to leave switched on
// while it gets sorted out.
//
// TWO LISTS, AND THE DIFFERENCE BETWEEN THEM IS THE WHOLE MECHANISM.
//
// FREE_AGENT_TIER_ORDER is now WHAT IS FOR SALE. Every customer-facing surface already reads it
// -- /pricing, the landing page cards, the athlete upgrade page, the StoreKit product list and
// the Stripe price-env requirement -- so a tier leaving this list disappears from all of them at
// once, price included, with no per-page edits and nothing left behind to un-hide later.
//
// ALL_FREE_AGENT_TIER_IDS is WHAT HAS EVER BEEN SOLD, and it is not decoration. An athlete who is
// already paying for AI Coach + Video must keep it: their Apple receipt still has to resolve to a
// tier, their stored `free_agent_tier` still has to validate, and `entitlementsForFreeAgentTier`
// still has to hand back video form-check. Anything that resolves an EXISTING subscription reads
// this list. Anything that SELLS a new one reads the other. Confusing the two silently revokes a
// feature from people who paid for it, which is why
// `shared/withdrawn-tier-stays-off-sale.test.ts` asserts both halves.
//
// NOT DELETED, DELIBERATELY. The definition, the entitlement, the Apple product id and the
// server-side gating all stay exactly as they were. Putting this back on sale is a one-line
// change to FREE_AGENT_TIER_ORDER once the camera has been validated against real lifts.
//
// ONE THING THIS CODE CANNOT DO, AND IT NEEDS A HUMAN. The App Store subscription Product for
// this tier lives in App Store Connect, not in this repo. Removing it from FREE_AGENT_TIER_ORDER
// stops Forge OFFERING it, but the Product itself has to be marked unavailable there or someone
// could still reach it through the App Store. Verification deliberately keeps honouring such a
// purchase -- refusing to grant a tier somebody was genuinely charged for would be worse -- so
// the App Store side is the only place that can actually close it.
export const FREE_AGENT_TIER_ORDER: FreeAgentTierId[] = ["basic", "ai_coach"];

/** Every tier that has ever been sold, withdrawn ones included, cheapest first.
 *
 * Read by anything that has to RECOGNISE a tier rather than offer one: Apple receipt
 * verification, the stored-value schema, the admin assignment screen. See the comment above for
 * why this is a separate list from FREE_AGENT_TIER_ORDER and what breaks if they are merged.
 */
export const ALL_FREE_AGENT_TIER_IDS: FreeAgentTierId[] = ["basic", "ai_coach", "ai_coach_video"];

/** Sold before, not sold now. Rendered with a "not for sale" note where it still has to appear
 * at all, which is the admin screen and nowhere else. */
export const WITHDRAWN_FREE_AGENT_TIERS: readonly FreeAgentTierId[] = ["ai_coach_video"];

/** Tailwind column count for the tier-card grids, sized to however many tiers are on sale.
 *
 * Written as whole literal class names because Tailwind scans source text -- a template string
 * built at runtime produces a class that was never generated. Three cards in a three-column grid
 * and two in a two-column grid; withdrawing a tier without this left a visible hole where the
 * third card used to be, on all three pages that render them.
 */
export const FREE_AGENT_TIER_GRID_COLS =
  FREE_AGENT_TIER_ORDER.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";

/** Whether a new subscription may be started on this tier. Checkout asks this; entitlement
 * resolution never does, because an existing subscriber's access does not depend on whether the
 * tier is still on the price list. */
export function isFreeAgentTierPurchasable(tier: string | null | undefined): boolean {
  return !!tier && (FREE_AGENT_TIER_ORDER as string[]).includes(tier);
}

// Family is gone entirely -- the product, the household grouping behind it and the code that
// created groups. Any account still stored on it is moved to AI Coach + Video by a backfill in
// reconcile-schema.ts, which is what Family always resolved to anyway: it never changed what one
// member could do, only how many profiles one payment covered. That backfill target is now a
// withdrawn tier, which is correct and must not be "fixed": those accounts were paying for what
// AI Coach + Video grants, and moving them down a tier to tidy a list would take a feature away
// from them.

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
