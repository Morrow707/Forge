// Stripe Price IDs, resolved from the environment.
//
// A Price ID is per-Stripe-account AND per-mode: the ids you create in test
// mode do not exist in live mode. Hardcoding them would either pin the app
// to one mode or ship live ids into a test deploy, so every id is read from
// an environment variable and the whole surface reports itself unconfigured
// until they are set. Nothing here throws on a missing id -- the checkout
// routes return a clear "not configured" error instead, the same posture
// getStripeClient() takes for the secret key.
//
// Only recurring subscriptions need pre-made Prices. A one-off class-lesson
// purchase is built inline with price_data from the lesson's own priceCents
// (see createLessonCheckoutSession), so adding a priced lesson never means
// creating a Stripe Price to match it -- one less place for the two to drift.
import { FREE_AGENT_TIER_ORDER, type FreeAgentTierId } from "@shared/free-agent-tiers";
import { ORG_BASE_CENTS } from "@shared/billing-tiers";

/** Env var name for a Free Agent tier's monthly Price. */
export function freeAgentPriceEnvVar(tier: FreeAgentTierId): string {
  return `STRIPE_PRICE_FREE_AGENT_${tier.toUpperCase()}`;
}

export function freeAgentPriceId(tier: FreeAgentTierId): string | null {
  return process.env[freeAgentPriceEnvVar(tier)]?.trim() || null;
}

/** The coach organisation's per-athlete monthly rate (ORG_PER_ATHLETE_CENTS).
 *
 * One recurring Price at $4.00, charged with quantity = the roster band's
 * ceiling. That is exactly what shared/billing-tiers.ts sells: "the whole bill is
 * now roster x rate and nothing else... every band divides back out to exactly
 * $4.00 an athlete". One Price expresses every band, so adding or re-cutting a
 * band never means creating a Stripe Price to match it -- the same
 * one-less-place-to-drift reasoning as the inline lesson price above.
 *
 * This replaced billing the flat account fee alone. ORG_BASE_CENTS is 0 (the $10
 * fee was dropped so a five-athlete team stops paying $30 for five seats), so a
 * checkout that line-itemed only the base fee charged nothing while /coach/billing
 * and /pricing both quoted the band. */
export const COACH_PER_ATHLETE_PRICE_ENV = "STRIPE_PRICE_COACH_PER_ATHLETE";

export function coachPerAthletePriceId(): string | null {
  return process.env[COACH_PER_ATHLETE_PRICE_ENV]?.trim() || null;
}

/** The flat monthly account fee (ORG_BASE_CENTS), which is currently 0.
 *
 * Kept because the model allows one and the formula still adds it, but it is only
 * billed, and only required to be configured, while ORG_BASE_CENTS > 0. */
export const COACH_BASE_PRICE_ENV = "STRIPE_PRICE_COACH_BASE";

export function coachBasePriceId(): string | null {
  return process.env[COACH_BASE_PRICE_ENV]?.trim() || null;
}

/** Everything the operator still has to create in Stripe, by env var name --
 * powers the admin readiness check so this is visible without reading code. */
export function missingPriceEnvVars(): string[] {
  const missing: string[] = [];
  for (const tier of FREE_AGENT_TIER_ORDER) {
    if (!freeAgentPriceId(tier)) missing.push(freeAgentPriceEnvVar(tier));
  }
  if (!coachPerAthletePriceId()) missing.push(COACH_PER_ATHLETE_PRICE_ENV);
  // Only a real requirement while there is a flat fee to charge.
  if (ORG_BASE_CENTS > 0 && !coachBasePriceId()) missing.push(COACH_BASE_PRICE_ENV);
  return missing;
}
