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
  /** Skill programs, the Skill Bank, and skill sessions.
   *
   * ITS OWN FLAG RATHER THAN RIDING ON hasAiChat, which is what it used to do. A skill session
   * is largely a CAMERA session -- sprint timing and mechanics scoring are the whole of what a
   * skill drill measures -- so skills belong with video form-check, not with the AI chat coach.
   * Riding on hasAiChat put the camera-dependent half of the product in the one tier that was
   * explicitly sold without camera access. Scott, 2026-09-19: "The 4.99 and 9.99 should not have
   * access to the skills and skills library, only exercise." */
  hasSkills: boolean;
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
    description:
      "Log your training and your nutrition, and browse the exercise library. No AI coach, no skills, no camera.",
    hasAiChat: false,
    hasVideoFormCheck: false,
    hasSkills: false,
  },
  ai_coach: {
    id: "ai_coach",
    label: "AI Coach",
    monthlyPriceCents: 999,
    description:
      "AI chat coach and AI program builder, over the exercise library. No skills, no camera.",
    hasAiChat: true,
    hasVideoFormCheck: false,
    hasSkills: false,
  },
  ai_coach_video: {
    id: "ai_coach_video",
    label: "AI Coach + Video",
    monthlyPriceCents: 1999,
    description:
      "Everything in AI Coach, plus camera form-check on your lifts and the full skills side: skill programs, the Skill Bank and timed skill sessions.",
    hasAiChat: true,
    hasVideoFormCheck: true,
    hasSkills: true,
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
): { hasAiChat: boolean; hasVideoFormCheck: boolean; hasSkills: boolean } {
  const def = tier ? FREE_AGENT_TIERS[tier as FreeAgentTierId] : null;
  if (!def) return { hasAiChat: false, hasVideoFormCheck: false, hasSkills: false };
  return {
    hasAiChat: def.hasAiChat,
    hasVideoFormCheck: def.hasVideoFormCheck,
    hasSkills: def.hasSkills,
  };
}

// AI COACH + VIDEO IS BACK ON SALE, WITH THE ACCURACY WARNING ATTACHED.
//
// It was withdrawn on 2026-09-19 because the camera it is sold on is not accurate. Same day,
// Scott chose the other answer instead: sell it, and say plainly what the buyer is getting.
// "list a warning for the $19.99, while this does record video, it's not accurate purchase at
// your own risk."
//
// That is a defensible position and the withdrawal was not the only one. The VIDEO genuinely
// works -- it records, it saves, a coach or an athlete can watch a lift back, and for a lot of
// people that alone is the product. What does not work is the NUMBERS derived from it. Selling
// the tier with that stated up front is honest; selling it silently would not be, which is why
// the warning is not optional decoration on this tier. See CAMERA_ACCURACY_PURCHASE_WARNING and
// `client/src/lib/video-tier-warns-before-purchase.test.ts`, which fails if a surface offers
// this tier without it.
//
// FREE_AGENT_TIER_ORDER is WHAT IS FOR SALE. Every customer-facing surface reads it -- /pricing,
// the landing cards, the athlete upgrade page, the StoreKit product list and the Stripe
// price-env requirement -- so this one array is the whole on-sale switch, in both directions.
//
// ALL_FREE_AGENT_TIER_IDS is WHAT HAS EVER BEEN SOLD, and it stays separate even now that
// nothing is withdrawn. The two lists answering different questions is what made the withdrawal
// safe (an existing subscriber's Apple receipt still had to resolve to a tier that was no longer
// on any price list), and collapsing them back into one would mean rebuilding that distinction
// under pressure the next time something is pulled. Anything that SELLS reads the order list;
// anything that RESOLVES AN EXISTING SUBSCRIPTION reads the full one.
//
// NOTE FOR THE APP STORE SIDE: the withdrawal never completed there -- the Product was left
// live in App Store Connect deliberately, so putting the tier back on sale needs nothing doing
// at Apple. If it is ever withdrawn again, that step comes back with it.
export const FREE_AGENT_TIER_ORDER: FreeAgentTierId[] = ["basic", "ai_coach", "ai_coach_video"];

/** Every tier that has ever been sold, withdrawn ones included, cheapest first.
 *
 * Read by anything that has to RECOGNISE a tier rather than offer one: Apple receipt
 * verification, the stored-value schema, the admin assignment screen. See the comment above for
 * why this is a separate list from FREE_AGENT_TIER_ORDER and what breaks if they are merged.
 */
export const ALL_FREE_AGENT_TIER_IDS: FreeAgentTierId[] = ["basic", "ai_coach", "ai_coach_video"];

/** Sold before, not sold now. Empty today -- AI Coach + Video went back on sale the same day it
 * was pulled, once the decision became "sell it with a warning" instead of "stall it".
 *
 * KEPT RATHER THAN DELETED, and not out of sentiment: the machinery around it is what made the
 * withdrawal safe, and it is the difference between a tier being unsellable and a tier being
 * broken for the people already on it. The admin screen labels entries here, the checkout route
 * refuses them, and `entitlementsForFreeAgentTier` deliberately ignores the list entirely so a
 * withdrawal can never revoke a feature somebody is paying for. Next time something is pulled,
 * that is one line here plus one in FREE_AGENT_TIER_ORDER -- not a design exercise under time
 * pressure. */
export const WITHDRAWN_FREE_AGENT_TIERS: readonly FreeAgentTierId[] = [];

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

/** The App Store Connect Product id for a sport-coach add-on.
 *
 * Auto-renewable subscriptions like the tier products, but these must NOT go in
 * the tier subscription group: a Free Agent can own any combination of the three
 * alongside whatever tier they are on, and membership of one StoreKit subscription
 * group is exactly the mutual exclusivity the tiers need and these must not have.
 * Three Products in their own group (or three groups of one), created before
 * APPLE_IAP_LIVE can cover them.
 *
 * The "_v1" suffix has no history behind it, unlike the tiers' "_v2" -- none of
 * these ids has ever been created in App Store Connect. It is there so the first
 * mistake with one costs a suffix bump rather than a dead id. */
export function appleProductIdForFreeAgentAddOn(addOn: FreeAgentAddOnId): string {
  return `${APPLE_BUNDLE_ID}.addon.${addOn}_v1`;
}

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
