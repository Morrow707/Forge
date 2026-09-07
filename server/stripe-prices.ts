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

/** Env var name for a Free Agent tier's monthly Price. */
export function freeAgentPriceEnvVar(tier: FreeAgentTierId): string {
  return `STRIPE_PRICE_FREE_AGENT_${tier.toUpperCase()}`;
}

export function freeAgentPriceId(tier: FreeAgentTierId): string | null {
  return process.env[freeAgentPriceEnvVar(tier)]?.trim() || null;
}

/** The coach organisation's flat monthly account fee (ORG_BASE_CENTS). */
export const COACH_BASE_PRICE_ENV = "STRIPE_PRICE_COACH_BASE";
/** Per-athlete monthly seat (ORG_PER_ATHLETE_CENTS), billed by quantity. */
export const COACH_SEAT_PRICE_ENV = "STRIPE_PRICE_COACH_SEAT";

export function coachBasePriceId(): string | null {
  return process.env[COACH_BASE_PRICE_ENV]?.trim() || null;
}
export function coachSeatPriceId(): string | null {
  return process.env[COACH_SEAT_PRICE_ENV]?.trim() || null;
}

/** Everything the operator still has to create in Stripe, by env var name --
 * powers the admin readiness check so this is visible without reading code. */
export function missingPriceEnvVars(): string[] {
  const missing: string[] = [];
  for (const tier of FREE_AGENT_TIER_ORDER) {
    if (!freeAgentPriceId(tier)) missing.push(freeAgentPriceEnvVar(tier));
  }
  if (!coachBasePriceId()) missing.push(COACH_BASE_PRICE_ENV);
  if (!coachSeatPriceId()) missing.push(COACH_SEAT_PRICE_ENV);
  return missing;
}
