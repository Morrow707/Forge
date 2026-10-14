import Stripe from "stripe";
import { storage } from "./storage";
import {
  coachAddOnPriceId,
  coachBasePriceId,
  coachPerAthletePriceId,
  freeAgentAddOnPriceId,
  freeAgentPriceId,
} from "./stripe-prices";
import {
  BILLING_ADD_ONS,
  BILLING_TIERS,
  COACH_PURCHASABLE_ADD_ON_ORDER,
  ORG_BASE_CENTS,
  bandForAthleteCount,
  type AddOnId,
  type BillingTierId,
} from "@shared/billing-tiers";
import {
  FREE_AGENT_ADD_ONS,
  FREE_AGENT_ADD_ON_ORDER,
  FREE_AGENT_TIERS,
  addOnIsOffered,
  entitlementsForFreeAgentTier,
  type FreeAgentAddOnId,
  type FreeAgentTierId,
} from "@shared/free-agent-tiers";
import { entitlementTierForFreeAgentTier } from "./apple-iap";
import { derivePrivacyTier } from "@shared/privacy-tiers";
import { resolveVideoRetentionLimits, type VideoRetentionLimits } from "@shared/video-retention";

// ---------- Entitlements (what an account is allowed to do) ----------
// Resolves what a primary coach's org / Free Agent / video-retention track
// is actually entitled to, independent of whether a real payment has ever
// happened -- see the Stripe integration below for the "how does someone
// pay" half. Both halves of this file used to be two independently-written
// server/billing.ts files (one built the entitlements/gating logic, the
// other built the Stripe integration) that got merged together here with
// zero naming collisions -- they're complementary layers, not competing
// implementations.

// Global kill switch -- deliberately not read from render.yaml (it's not
// added there at all), so production stays off the same way local dev does
// unless someone goes and sets this env var by hand. Combined with
// isBetaAccount below, nothing is ever restricted by accident.
import { activeAddOns, type AddOnTerms } from "@shared/add-on-terms";

export const ENFORCEMENT_ENABLED = process.env.BILLING_ENFORCEMENT_ENABLED === "true";

export interface Entitlements {
  // THERE IS NO ROSTER CAP. Scott, 2026-10-11: "coaches should never have a roster cap as each
  // athlete add on is $4 no matter what." A band is a PRICE and never a wall -- the bill is
  // roster x $4 at every size, so a cap could only ever stop a program growing a bill Forge
  // wants. `athleteCap` lived here until that day and was enforced through
  // subscriptions.seatCap, whose only writer ever set it to 15 for every coach regardless of
  // the band they paid for: a program paying $4,000 a month for a thousand athletes was walled
  // at fifteen, while a coach with no subscription row at all was unlimited. Removed rather
  // than widened, so there is no number left to get wrong.
  hasCustomColors: boolean;
  hasTeamIdentity: boolean;
  hasWorkflowCustomization: boolean;
  hasMultiTeam: boolean;
  /** Gates users.exercisePageTheme (see shared/schema.ts) -- distinct from
   * hasCustomColors, which only governs the org-wide header/nav re-skin. */
  hasPersonalPage: boolean;
  /** Coaches Corner, the coach-education bundle.
   *
   * IT BELONGS HERE RATHER THAN IN routes.ts's own reading of the subscription
   * tier, and that is the fix. hasCoachesCornerAccess used to consult
   * subscriptions.tier === "pro" under BILLING_LIVE and a hardcoded email
   * allowlist otherwise, so it never once asked isBetaAccount -- which meant a
   * beta coach, the only kind of coach that exists today, was locked out of a
   * product nothing could sell them. Every other entitlement on this object gets
   * the beta/trial/enforcement-off short-circuit below for exactly that reason,
   * and this one had been written outside it.
   *
   * The roster comp (COACHES_CORNER_FREE_AT_ATHLETE_COUNT) stays in routes.ts:
   * it needs a roster count, which is a database read this pure function does
   * not do. It is checked alongside this, never instead of it. */
  hasCoachesCorner: boolean;
}

const UNLIMITED_ENTITLEMENTS: Entitlements = {
  hasCustomColors: true,
  hasTeamIdentity: true,
  hasWorkflowCustomization: true,
  hasMultiTeam: true,
  hasPersonalPage: true,
  hasCoachesCorner: true,
};

export interface BillingAccount {
  billingTier: string | null;
  billingAddOns: string[] | null;
  /** When each owned add-on stops being owed (shared/add-on-terms.ts). Optional so a caller
   *  that predates cancellation keeps compiling; absent reads as "no cancellation, no refund",
   *  which is what every account looked like before 2026-10-11. */
  addOnTerms?: AddOnTerms | null;
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
  // ACTIVE, not merely owned. A cancelled add-on stays in the array until its paid month runs
  // out (that is what lets it be turned back on for free) and a refunded one is stamped, so the
  // array alone would keep answering yes to both. shared/add-on-terms.ts is the one rule.
  const addOns = new Set<AddOnId>(
    activeAddOns(account.billingAddOns, account.addOnTerms) as AddOnId[],
  );
  const hasFullBundle = addOns.has("full_bundle");

  return {
    hasCustomColors: Boolean(tier?.includesFullPersonalization) || hasFullBundle || addOns.has("custom_colors"),
    hasTeamIdentity: Boolean(tier?.includesFullPersonalization) || hasFullBundle || addOns.has("team_identity"),
    hasWorkflowCustomization:
      Boolean(tier?.includesFullPersonalization) || hasFullBundle || addOns.has("workflow"),
    hasMultiTeam: Boolean(tier?.includesMultiTeam),
    hasPersonalPage: Boolean(tier?.includesFullPersonalization) || hasFullBundle || addOns.has("personal_page"),
    // Deliberately NOT part of full_bundle and not included in any band: the
    // Corner is coach education sold on its own, and full_bundle is the
    // personalization three at a discount. A band's own comp for a big roster is
    // applied in routes.ts, which is the layer that can count a roster.
    hasCoachesCorner: addOns.has("coaches_corner"),
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
  hasSkills: boolean;
  /** One entry per sport-specialist add-on, always all of them, never only the
   * owned ones. A map with a key missing is a map a caller can read `undefined`
   * from and treat as false by accident; every gate in this app is required to
   * see an explicit true. */
  addOns: Record<FreeAgentAddOnId, boolean>;
}

function addOnMap(owned: Iterable<string> | null | undefined): Record<FreeAgentAddOnId, boolean> {
  const set = new Set(owned ?? []);
  return Object.fromEntries(
    FREE_AGENT_ADD_ON_ORDER.map((id) => [id, set.has(id)]),
  ) as Record<FreeAgentAddOnId, boolean>;
}

const ALL_ADD_ONS: Record<FreeAgentAddOnId, boolean> = addOnMap(FREE_AGENT_ADD_ON_ORDER);
const NO_ADD_ONS: Record<FreeAgentAddOnId, boolean> = addOnMap([]);

const UNLIMITED_FREE_AGENT_ENTITLEMENTS: FreeAgentEntitlements = {
  hasAiChat: true,
  hasVideoFormCheck: true,
  hasSkills: true,
  addOns: ALL_ADD_ONS,
};

const NONE_FREE_AGENT_ENTITLEMENTS: FreeAgentEntitlements = {
  hasAiChat: false,
  hasVideoFormCheck: false,
  hasSkills: false,
  addOns: NO_ADD_ONS,
};

export interface FreeAgentBillingAccount {
  freeAgentTier: string | null;
  /** See BillingAccount.addOnTerms -- the same rule on the athlete side. */
  addOnTerms?: AddOnTerms | null;
  /** The sport-coach add-ons this account actually owns (users.freeAgentAddOns).
   * Optional so an existing caller that only needed the tier flags keeps
   * compiling -- a missing value resolves to owning none, never to owning all. */
  freeAgentAddOns?: string[] | null;
  isBetaAccount: boolean;
  trialExpiresAt: Date | null;
}

// entitlementsForFreeAgentTier lives in shared/free-agent-tiers.ts, next to the
// price list it reads -- it is a property of the SKUs, not of this module, and
// keeping it there lets it be tested without a database.
export function getFreeAgentEntitlements(account: FreeAgentBillingAccount): FreeAgentEntitlements {
  const trialActive = account.trialExpiresAt != null && account.trialExpiresAt.getTime() > Date.now();
  if (!ENFORCEMENT_ENABLED || account.isBetaAccount || trialActive) {
    return UNLIMITED_FREE_AGENT_ENTITLEMENTS;
  }

  return {
    ...entitlementsForFreeAgentTier(account.freeAgentTier),
    // Ownership, not the tier: the three sport coaches are bought one at a time
    // on top of whatever tier an athlete is on, which is why they live in their
    // own column rather than as flags on a SKU.
    addOns: addOnMap(activeAddOns(account.freeAgentAddOns, account.addOnTerms)),
  };
}

// ---------- Form-check video retention ----------
// Independent of both billing tracks above -- applies to ANY athlete (coached or Free Agent),
// keyed off the athlete's own row. Unlike a paywall, this actively deletes data once active, so
// an ADULT stays fully unlimited under the same "don't restrict by accident" conditions as
// everything else: enforcement off, still beta, or an active redeemed trial. A MINOR does not --
// see resolveVideoRetentionLimits for why a data-minimisation promise is not an entitlement.

export interface VideoRetentionAccount {
  hasVideoStorageAddOn: boolean;
  isBetaAccount: boolean;
  trialExpiresAt: Date | null;
  /** Null for an account with no birthdate on file, which is treated as an adult here -- the
   * minor gate refuses those accounts outright, so one cannot be accumulating video anyway. */
  dateOfBirth?: string | Date | null;
}

export function getVideoRetentionLimits(account: VideoRetentionAccount): VideoRetentionLimits {
  // The decision itself lives in shared/video-retention.ts beside the numbers, so it can be
  // tested without a database. This supplies the env switch and the age derivation.
  return resolveVideoRetentionLimits({
    hasVideoStorageAddOn: account.hasVideoStorageAddOn,
    isBetaAccount: account.isBetaAccount,
    trialExpiresAt: account.trialExpiresAt,
    isMinor:
      account.dateOfBirth != null &&
      derivePrivacyTier(account.dateOfBirth) !== "tier3_adult_18plus",
    enforcementEnabled: ENFORCEMENT_ENABLED,
  });
}

// ---------- Stripe integration (how someone actually pays) ----------
// Framework only -- see shared/schema.ts's own comment above the
// subscriptions table. Nothing here is reachable from a real purchase yet:
// there's no Stripe account/products configured, no App Store Connect
// subscription group, and BILLING_LIVE defaults unset, which keeps every
// existing paywall (routes.ts's requirePaidAiAccess/hasCoachesCornerAccess)
// on its current hardcoded-allowlist behavior untouched. Flipping
// BILLING_LIVE to "true" once real Stripe keys and Apple products exist is
// meant to be the entire rollout -- same pattern as
// shared/privacy-tiers.ts's GUARDIAN_NOTICE_LIVE.
export const BILLING_LIVE = process.env.BILLING_LIVE === "true";

/**
 * The one condition under which anybody can be charged.
 *
 * Every Stripe entry point below calls this first. Until this session it was
 * only the absence of STRIPE_SECRET_KEY that stopped a real card being
 * charged -- checkout asked getStripeClient() for a client and, if it got
 * one, created a live session. So pasting a Stripe key into the dashboard to
 * test some unrelated thing would have opened a real till, with nothing else
 * to flip and nothing to notice. That is the wrong shape for "we are in
 * beta, nobody pays": the guarantee should be a switch somebody has to turn
 * ON deliberately, not a secret nobody has got round to setting.
 *
 * BILLING_LIVE is that switch, and it defaults to off. Keys, prices and
 * products can all be configured and tested while it stays off, and nothing
 * can take money until it is deliberately turned on.
 *
 * It does NOT gate Apple In-App Purchase, and could not: a StoreKit purchase
 * is made by the device against Apple, and no server flag can intercept it.
 * What keeps that side free during beta is Apple's own doing -- a TestFlight
 * build transacts against the StoreKit sandbox, where no real money moves.
 * See server/apple-iap.ts.
 */
function chargingClosed(): { error: string } | null {
  if (BILLING_LIVE) return null;
  // SAYS WHAT IS TRUE IN THE STATE IT IS REACHED FROM, which is no longer "beta". This is the
  // refusal every checkout route returns while BILLING_LIVE is off, and with billing live on
  // 2026-10-11 it is unreachable -- but it read "Forge is in beta" until the beta scan's roots
  // were widened to server/ and found it, and a sentence nobody can reach today is exactly the
  // one that gets read on the day somebody turns the switch back off.
  return { error: "Forge isn't taking payments right now. Nothing has been charged." };
}

// Lazy -- STRIPE_SECRET_KEY doesn't exist in any environment yet, and
// importing this module (e.g. from routes.ts) shouldn't throw just because
// billing isn't configured. Every caller below checks this for null first.
let stripeClient: Stripe | null | undefined;
function getStripeClient(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  stripeClient = key ? new Stripe(key) : null;
  return stripeClient;
}

export type AccountType = "free_agent" | "coach";
export type PlanTier = "base" | "pro";
// Coach roster sizes as published on the landing page's pricing card --


// Off-season hibernation is intentionally NOT priced anywhere: it's a free
// status (see subscriptionStatusEnum's "hibernating" value), not a paid
// add-on -- an earlier draft of this pricing had a paid hibernation tier
// and it was deliberately dropped as a retention risk (charging someone to
// merely view their own past data).
//
// There used to be a PRICING const here: a whole second price list for
// Free Agent tiers and four coach seat bands, with a web-vs-iOS split.
// Nothing ever read it. The real numbers live in shared/billing-tiers.ts
// (org base + per-athlete), shared/free-agent-tiers.ts and
// shared/video-retention.ts, which is what /pricing renders, what
// server/pricing-catalog.ts enumerates for the admin editor, and what the
// entitlement functions below resolve against. Deleted rather than kept
// "for reference" because a plausible-looking price list with no readers is
// how the landing page ended up advertising $29.99 for a $9.99 tier. There
// is also no web-vs-iOS price offset in the real model -- an Apple
// subscription Product's own configured price IS the price (see
// appleProductIdForFreeAgentTier's comment).

/** Looks up (and creates on first use) this account's subscription row --
 * every user gets exactly one, defaulting to a 14-day trial. Purely a data
 * shape today; nothing reads currentPeriodEnd/status to actually gate
 * anything until BILLING_LIVE is true (see routes.ts's paywall functions). */
export async function getOrCreateSubscription(
  userId: number,
  accountType: AccountType,
): Promise<{
  accountType: string;
  tier: string;
  seatCap: number | null;
  status: string;
  trialEndsAt: Date | null;
}> {
  const existing = await storage.getSubscriptionForUser(userId);
  if (existing) return existing;
  return storage.createTrialSubscription(userId, accountType);
}

export type CheckoutResult = { url: string } | { error: string };

/** Shared shape for every checkout below: one Stripe customer per user,
 * reused across purchases so a coach's subscription and an athlete's lesson
 * do not each spawn a new customer record. client_reference_id carries the
 * user id back on the webhook; metadata carries everything else, because a
 * webhook cannot see the request that started the session. */
async function baseSessionParams(userId: number, userEmail: string) {
  const existing = await storage.getSubscriptionForUser(userId);
  return existing?.stripeCustomerId
    ? { customer: existing.stripeCustomerId, client_reference_id: String(userId) }
    : { customer_email: userEmail, client_reference_id: String(userId) };
}

/** A Free Agent's own monthly tier, bought on the web.
 *
 * The iOS app must NOT link here -- Apple requires in-app digital purchases
 * to go through StoreKit, which apple-iap.ts already implements for exactly
 * these three tiers. This is the web equivalent, and the route that calls it
 * refuses a request coming from the native app. */
/** THE CHARGE THAT MAKES AN UNDER-13 CONSENT VERIFIABLE. Counsel, 2026-10-03: email-plus is not
 * enough for Forge's data; a monetary transaction on the parent's card is one of the FTC's
 * approved methods, because a child cannot hold an adult's card and its statement for long.
 *
 * Fifty cents, charged to the LINKED GUARDIAN (never the athlete's account), refunded the moment
 * the webhook records it. NOT behind chargingClosed(): this is not something for sale, it is an
 * identity step the account stands on, and it has to work while billing is off. The record it
 * produces is a guardian_payment_verification consent row written by the webhook, which is what
 * athleteGateStatus reads to release the account. */
export const GUARDIAN_VERIFICATION_CHARGE_CENTS = 50;

export async function createGuardianVerificationCheckout(
  guardianId: number,
  guardianEmail: string,
  athleteId: number,
  athleteFirstName: string,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResult> {
  const stripe = getStripeClient();
  if (!stripe) return { error: "Card verification isn't available yet. We'll email you when it is." };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(await baseSessionParams(guardianId, guardianEmail)),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: GUARDIAN_VERIFICATION_CHARGE_CENTS,
          product_data: {
            name: `Parental consent verification for ${athleteFirstName}`,
            description: "A one-time card check required by law for an athlete under 13. Refunded automatically.",
          },
        },
      },
    ],
    payment_intent_data: {
      description: `Forge parental consent verification (athlete ${athleteId}); refunded`,
      metadata: { kind: "guardian_verification", userId: String(guardianId), athleteId: String(athleteId) },
    },
    metadata: { kind: "guardian_verification", userId: String(guardianId), athleteId: String(athleteId) },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  if (!session.url) return { error: "Stripe didn't return a checkout URL." };
  return { url: session.url };
}

export async function createFreeAgentTierCheckout(
  userId: number,
  userEmail: string,
  tier: FreeAgentTierId,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResult> {
  const closed = chargingClosed();
  if (closed) return closed;
  const stripe = getStripeClient();
  if (!stripe) return { error: "Billing isn't configured yet." };
  const priceId = freeAgentPriceId(tier);
  if (!priceId) return { error: `No Stripe price configured for the ${tier} tier yet.` };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(await baseSessionParams(userId, userEmail)),
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { kind: "free_agent_tier", userId: String(userId), tier },
    subscription_data: { metadata: { kind: "free_agent_tier", userId: String(userId), tier } },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  if (!session.url) return { error: "Stripe didn't return a checkout URL." };
  return { url: session.url };
}

/** One sport-specialist coach add-on (Golf Swing / Hitting / Pitching), bought on
 * the web.
 *
 * Deliberately the same shape as createFreeAgentTierCheckout above, including the
 * chargingClosed() call first: while Forge is in beta this refuses exactly like
 * every other checkout, so the whole path can be built, typed and tested without
 * a single card being charged.
 *
 * An add-on is NOT a tier and does not replace one -- an athlete can own any
 * combination of the three on top of whatever tier they are on, which is why the
 * webhook appends to users.freeAgentAddOns rather than writing a column.
 *
 * The iOS app must not link here, same as the tier checkout: Apple requires an
 * in-app digital purchase to go through StoreKit, and requireWebCheckout on the
 * route refuses a request from the native app. */
export async function createFreeAgentAddOnCheckout(
  userId: number,
  userEmail: string,
  addOn: FreeAgentAddOnId,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResult> {
  const closed = chargingClosed();
  if (closed) return closed;
  // A WITHDRAWN ADD-ON IS NOT FOR SALE; this is the route that would take the money.
  // The caller's enum is FREE_AGENT_ADD_ON_ORDER (every add-on that EXISTS, withdrawn
  // ones included so an admin can test them), so without this the only thing stopping a
  // sale was the absence of a Price. Refusing a sale never revokes what someone owns.
  if (!addOnIsOffered(addOn)) {
    return { error: `The ${FREE_AGENT_ADD_ONS[addOn].label} add-on isn't available yet.` };
  }
  const stripe = getStripeClient();
  if (!stripe) return { error: "Billing isn't configured yet." };
  const priceId = freeAgentAddOnPriceId(addOn);
  if (!priceId) {
    return { error: `No Stripe price configured for the ${FREE_AGENT_ADD_ONS[addOn].label} add-on yet.` };
  }
  const metadata = { kind: "free_agent_add_on", userId: String(userId), addOnId: addOn };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(await baseSessionParams(userId, userEmail)),
    line_items: [{ price: priceId, quantity: 1 }],
    metadata,
    subscription_data: { metadata },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  if (!session.url) return { error: "Stripe didn't return a checkout URL." };
  return { url: session.url };
}

/** THE BAND FOLLOWS THE PLAN ONTO THE STRIPE SUBSCRIPTION (2026-10-05). Before this, changing
 * the plan on the coach billing page wrote plannedAthleteCount and nothing else: the Stripe
 * subscription kept its old quantity, so the coach went on paying the old band and the only
 * way to pay for the new one was a second checkout, which made a second subscription. Now a
 * plan change updates the quantity on the per-athlete line of the existing subscription.
 *
 * Up: prorated by Stripe for the rest of the month, so the bigger roster is paid for from the
 * day it is allowed. Down: no credit, the lower quantity simply bills from the next invoice,
 * which is what "a band is a ceiling, not a count" means for money. A coach with no live
 * Stripe subscription (beta, trial, Apple-less and card-less) gets the recorded number and
 * nothing happens here; checkout picks the band up when they subscribe. Returns what it did,
 * for the route's own answer and the log. */
export async function syncCoachSubscriptionBand(
  userId: number,
  athleteCount: number,
): Promise<{ synced: false; reason: string } | { synced: true; previousQuantity: number; quantity: number; prorated: boolean }> {
  const stripe = getStripeClient();
  if (!stripe) return { synced: false, reason: "stripe_not_configured" };
  const perAthletePrice = coachPerAthletePriceId();
  if (!perAthletePrice) return { synced: false, reason: "no_per_athlete_price" };
  const sub = await storage.getSubscriptionForUser(userId);
  if (!sub?.stripeSubscriptionId || sub.accountType !== "coach") return { synced: false, reason: "no_stripe_subscription" };
  if (!["active", "trialing", "past_due"].includes(sub.status)) return { synced: false, reason: `status_${sub.status}` };
  const band = bandForAthleteCount(athleteCount);
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
  const item = stripeSub.items.data.find((i) => i.price.id === perAthletePrice);
  if (!item) return { synced: false, reason: "no_per_athlete_item" };
  const previousQuantity = item.quantity ?? 0;
  const quantity = band.athleteCapIncluded;
  if (quantity === previousQuantity) return { synced: true, previousQuantity, quantity, prorated: false };
  const up = quantity > previousQuantity;
  await stripe.subscriptionItems.update(item.id, {
    quantity,
    proration_behavior: up ? "create_prorations" : "none",
  });
  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    metadata: { band: band.id, bandAthleteCap: String(band.athleteCapIncluded), quotedMonthlyCents: String(band.monthlyPriceCents) },
  });
  await storage.applyCoachSubscriptionBand(userId, band.id, band.athleteCapIncluded);
  await storage.logBillingEvent(userId, "coach.plan.band_synced", { previousQuantity, quantity, band: band.id, prorated: up });
  return { synced: true, previousQuantity, quantity, prorated: up };
}

/** A coach add-on bought by the coach themselves -- Coaches Corner today.
 *
 * Refuses anything not on COACH_PURCHASABLE_ADD_ON_ORDER rather than anything not
 * in BILLING_ADD_ONS: the personalization add-ons are real, assignable, priced
 * ids that simply have no self-serve checkout, so "is this an add-on" and "may
 * this be bought here" are two questions and only the second one belongs in a
 * checkout. Same distinction FREE_AGENT_TIER_ORDER draws against
 * ALL_FREE_AGENT_TIER_IDS. */
/** CANCEL EVERY SUBSCRIPTION AN ACCOUNT ABOUT TO BE DELETED IS STILL PAYING FOR.
 *
 * Handed to storage.deleteOwnAccount, which calls it after the password is accepted and before
 * the row is destroyed -- the only moment the handles still exist, since `subscriptions`
 * cascades from `users` and users.addOnTerms goes with it.
 *
 * `prorate` + `invoice_now` credit the unused remainder, because somebody closing their account
 * should not be left having paid for a month of something they can no longer sign in to. Each
 * id is cancelled on its own so one failure cannot take the others down with it, and the
 * failures come back named rather than thrown: a payment API being down is not a reason to
 * refuse a person their deletion, and the caller logs what needs finishing by hand. */
export async function cancelSubscriptionsForDeletedAccount(handles: {
  stripeSubscriptionIds: string[];
}): Promise<{ cancelled: string[]; failed: string[] }> {
  const stripe = getStripeClient();
  const cancelled: string[] = [];
  const failed: string[] = [];
  if (!stripe) {
    // Nothing configured means nothing to cancel, which is the dev and test case. Reporting the
    // ids as failed would tell an operator to chase subscriptions that do not exist.
    return { cancelled, failed };
  }
  for (const id of handles.stripeSubscriptionIds) {
    try {
      await stripe.subscriptions.cancel(id, { prorate: true, invoice_now: true });
      cancelled.push(id);
    } catch (err) {
      console.error(`deleted account: Stripe subscription ${id} could not be cancelled:`, err);
      failed.push(id);
    }
  }
  return { cancelled, failed };
}

/** CANCEL THE SUBSCRIPTION A NEW PURCHASE HAS JUST REPLACED.
 *
 * Called from checkout.session.completed when the row already carried a DIFFERENT Stripe
 * subscription id. Two live subscriptions on one account means the athlete or the school is
 * billed twice for one thing, and Forge keeps only the newer id, so nothing downstream can
 * ever find the older one again -- not a cancellation, not a refund, not an operator reading
 * the account. The moment to catch it is the moment the replacement arrives.
 *
 * `prorate` + `invoice_now` credit the unused remainder of the superseded period straight
 * away, which is what an upgrade should do and is no worse than right for a downgrade: the
 * alternative is charging for a month of something the account no longer has.
 *
 * BEST-EFFORT, LOGGED BOTH WAYS, and never allowed to throw. The purchase has already
 * succeeded and the entitlement is already written; losing the event here would roll back
 * access somebody has paid for, to fix a billing duplicate. So a failure writes an audit row
 * naming the subscription an operator has to cancel by hand -- the same posture, for the same
 * reason, as the guardian-verification refund above. */
async function cancelSupersededStripeSubscription(userId: number, subscriptionId: string) {
  const stripe = getStripeClient();
  if (!stripe) return;
  try {
    await stripe.subscriptions.cancel(subscriptionId, { prorate: true, invoice_now: true });
    await storage.logBillingEvent(userId, "stripe.subscription.superseded", { subscriptionId });
  } catch (err) {
    console.error(
      `superseded Stripe subscription ${subscriptionId} (user ${userId}) could not be cancelled and needs a hand:`,
      err,
    );
    await storage.logBillingEvent(userId, "stripe.subscription.supersede_failed", {
      subscriptionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** The subscription a refunded invoice was for. Lives here rather than in storage.ts because it
 *  needs the Stripe client, and storage.ts must not import this module (the cycle its own
 *  comment warns about). Null whenever it cannot be established, which makes the refund a no-op
 *  rather than a guess at whose add-on to take away. */
async function subscriptionIdForInvoice(invoiceId: string): Promise<string | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    const sub =
      (invoice as unknown as { subscription?: string | { id: string } }).subscription ??
      invoice.parent?.subscription_details?.subscription;
    return typeof sub === "string" ? sub : (sub?.id ?? null);
  } catch (err) {
    console.error("Could not resolve a refunded invoice's subscription:", (err as Error)?.message);
    return null;
  }
}

/**
 * CANCEL AN ADD-ON AT THE PROVIDER, and report when the paid month runs out.
 *
 * Scott, 2026-10-11: "give them until the next billing cycle to have it as the billing is a
 * month, so if they buy it the 16th, remove it the 1st, they have until the 16th to use it
 * again with no refund." So this is `cancel_at_period_end`, never an immediate cancel: an
 * immediate one would both end access early AND, on Stripe's side, leave a proration credit
 * nobody asked for.
 *
 * Returns the period end so the caller can record it as the add-on's accessUntil. With no
 * subscription id on file (an admin grant, or a purchase made through Apple, which is cancelled
 * by the person in iOS Settings and never by this server) there is nothing to call and the
 * caller falls back to a month from now -- stated rather than guessed at silently.
 */
export async function cancelAddOnAtProvider(
  stripeSubscriptionId: string | undefined,
): Promise<{ periodEnd: Date | null; error?: string }> {
  if (!stripeSubscriptionId) return { periodEnd: null };
  const stripe = getStripeClient();
  if (!stripe) return { periodEnd: null, error: "not_configured" };
  try {
    const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    // Stripe moved the field onto the subscription's first item in newer API versions; read
    // whichever this account's version actually sends rather than assuming one shape.
    const seconds =
      (updated as unknown as { current_period_end?: number }).current_period_end ??
      updated.items?.data?.[0]?.current_period_end;
    return { periodEnd: typeof seconds === "number" ? new Date(seconds * 1000) : null };
  } catch (err) {
    console.error("Could not cancel add-on subscription at Stripe:", (err as Error)?.message);
    return { periodEnd: null, error: "provider_refused" };
  }
}

export async function createCoachAddOnCheckout(
  userId: number,
  userEmail: string,
  addOn: AddOnId,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResult> {
  const closed = chargingClosed();
  if (closed) return closed;
  if (!COACH_PURCHASABLE_ADD_ON_ORDER.includes(addOn)) {
    return { error: `The ${BILLING_ADD_ONS[addOn]?.label ?? addOn} add-on isn't sold here.` };
  }
  const stripe = getStripeClient();
  if (!stripe) return { error: "Billing isn't configured yet." };
  const priceId = coachAddOnPriceId(addOn);
  if (!priceId) {
    return { error: `No Stripe price configured for the ${BILLING_ADD_ONS[addOn].label} add-on yet.` };
  }
  const metadata = { kind: "coach_add_on", userId: String(userId), addOnId: addOn };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(await baseSessionParams(userId, userEmail)),
    line_items: [{ price: priceId, quantity: 1 }],
    metadata,
    subscription_data: { metadata },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  if (!session.url) return { error: "Stripe didn't return a checkout URL." };
  return { url: session.url };
}

/** A coach organisation: the roster band, charged as the per-athlete rate.
 *
 * This is the model shared/billing-tiers.ts describes and that both /pricing and
 * /coach/billing quote: "$4.00/athlete and nothing else", presented in bands
 * because a stepped ladder sells better than "exactly $4.00 x your roster", with
 * every band dividing back out to the same flat rate.
 *
 * It used to line-item coachBasePriceId() alone -- the flat account fee. That fee
 * is ORG_BASE_CENTS, which is 0 ("No flat account fee. There was a $10 one, and
 * dropping it is what makes a small team's price honest"), so a 120-athlete program
 * read "$480/mo" on the billing page and then subscribed to a price unrelated to
 * it. Quoting one number and charging another is the defect; which number wins is
 * decided by billing-tiers.ts, the file that calls itself the single source of
 * truth for this.
 *
 * One Price with a quantity, rather than a Price per band: the rate never changes
 * band to band, so a quantity expresses all of them and re-cutting the bands never
 * means creating Stripe Prices to match. The quantity is the band's CEILING, not
 * the exact headcount -- a customer pays for a band, which is what the page they
 * just read told them.
 */
export async function createCoachSubscriptionCheckout(
  userId: number,
  userEmail: string,
  rosterAthleteCount: number,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResult> {
  const closed = chargingClosed();
  if (closed) return closed;
  const stripe = getStripeClient();
  if (!stripe) return { error: "Billing isn't configured yet." };
  const perAthletePrice = coachPerAthletePriceId();
  if (!perAthletePrice) return { error: "No Stripe price configured for coach plans yet." };
  const band = bandForAthleteCount(rosterAthleteCount);

  const lineItems: { price: string; quantity: number }[] = [
    { price: perAthletePrice, quantity: band.athleteCapIncluded },
  ];
  // Only while there is a fee to charge. Line-iteming a $0 price is how the old
  // behaviour managed to look configured while billing nothing.
  if (ORG_BASE_CENTS > 0) {
    const basePrice = coachBasePriceId();
    if (!basePrice) return { error: "No Stripe price configured for the account fee yet." };
    lineItems.push({ price: basePrice, quantity: 1 });
  }

  const metadata = {
    kind: "coach_subscription",
    userId: String(userId),
    // What they were quoted, recorded on the subscription: a roster that grows past
    // the band later is a different bill, and this is what says which one this was.
    band: band.id,
    bandAthleteCap: String(band.athleteCapIncluded),
    quotedMonthlyCents: String(band.monthlyPriceCents),
  };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(await baseSessionParams(userId, userEmail)),
    line_items: lineItems,
    metadata,
    subscription_data: { metadata },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  if (!session.url) return { error: "Stripe didn't return a checkout URL." };
  return { url: session.url };
}

/** A one-off class-lesson purchase.
 *
 * Built with inline price_data from the lesson's own priceCents rather than
 * a pre-made Stripe Price, so pricing a new lesson never means creating a
 * matching Price and the two can never drift. Mode is "payment", not
 * "subscription" -- this buys one lesson for one athlete, permanently.
 *
 * enrollmentId and lessonId ride in metadata because the webhook has no
 * other way to know which enrolment to credit, and the enrolment is what
 * scopes the purchase to a single athlete. */
export async function createLessonCheckout(
  userId: number,
  userEmail: string,
  input: { enrollmentId: number; lessonId: number; lessonTitle: string; priceCents: number },
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResult> {
  const closed = chargingClosed();
  if (closed) return closed;
  const stripe = getStripeClient();
  if (!stripe) return { error: "Billing isn't configured yet." };
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) {
    return { error: "That lesson isn't a paid lesson." };
  }
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(await baseSessionParams(userId, userEmail)),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.priceCents,
          product_data: { name: input.lessonTitle },
        },
      },
    ],
    metadata: {
      kind: "class_lesson",
      userId: String(userId),
      enrollmentId: String(input.enrollmentId),
      lessonId: String(input.lessonId),
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  if (!session.url) return { error: "Stripe didn't return a checkout URL." };
  return { url: session.url };
}

/** Stripe's own hosted page for changing a card, seeing invoices and
 * cancelling -- none of which is worth rebuilding, and all of which a real
 * subscriber needs. Requires an existing customer, so it is only reachable
 * once something has actually been bought. */
export async function createBillingPortalSession(
  userId: number,
  returnUrl: string,
): Promise<CheckoutResult> {
  const closed = chargingClosed();
  if (closed) return closed;
  const stripe = getStripeClient();
  if (!stripe) return { error: "Billing isn't configured yet." };
  const sub = await storage.getSubscriptionForUser(userId);
  if (!sub?.stripeCustomerId) return { error: "No billing account yet -- nothing to manage." };
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}



/** Verifies the raw webhook body against STRIPE_WEBHOOK_SECRET and returns
 * the parsed event, or null if billing isn't configured/the signature is
 * invalid. Mounted in index.ts on a route registered BEFORE the global
 * express.json() middleware -- Stripe's signature check needs the exact
 * raw request bytes, which a JSON-parsed body no longer is. */
export function verifyStripeWebhook(rawBody: Buffer, signature: string | undefined): Stripe.Event | null {
  const stripe = getStripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret || !signature) return null;
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return null;
  }
}

/** Applies a verified Stripe event to the matching subscription row and
 * appends it to billingAuditLog. Every event type this doesn't recognize
 * is a silent no-op -- Stripe sends dozens of event types, and there's no
 * reason to fail loudly over one this app doesn't act on. client_reference_id
 * (set in createCheckoutSession above) is how a checkout.session.completed
 * event maps back to a Forge userId in the first place; every later event
 * for that subscription is found by stripeSubscriptionId instead. */
// Stripe's subscription.status has a few values this app's own
// subscriptionStatusEnum (shared/schema.ts) has no matching state for --
// "hibernating" is Forge-only and never set by Stripe, and Stripe's
// "incomplete"/"incomplete_expired"/"paused" don't map cleanly onto any of
// the four Stripe-facing values. Those return null here, which the caller
// below turns into undefined -- drizzle's .set() drops undefined keys from
// the update entirely (leaving the column as-is), whereas a literal null
// would try to write SQL NULL and fail the column's NOT NULL constraint.
// Previously this was a two-way ternary that fell through to `undefined`
// for anything besides exactly "past_due"/"active" -- including Stripe's
// "canceled", which meant a subscription Stripe canceled via an *updated*
// event (rather than a separate deleted event) never had its status column
// updated at all and stayed stuck on whatever it was before.
function mapStripeStatus(status: Stripe.Subscription.Status): "trialing" | "active" | "past_due" | "canceled" | null {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return null;
  }
}

/** Shared by every payment completion path, so a new one cannot quietly skip it.
 *
 * Never throws into the caller: a payment has already succeeded by the time this runs, and
 * failing the webhook would make Stripe retry a transaction that went through. A failure here
 * loses a corroborating record, which is worth a loud log and not worth re-charging anybody.
 */
async function recordPaymentVerification(
  payerId: number,
  reference: string,
  amountCents: number | null | undefined,
  source: "stripe" | "apple_iap",
): Promise<void> {
  try {
    await storage.recordPaymentAsParentalVerification({
      payerId,
      reference,
      amountCents: amountCents ?? null,
      source,
    });
  } catch (err) {
    console.error("failed to record payment as parental verification:", err);
  }
}

export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  // Stripe's own delivery guarantee is at-least-once, not exactly-once --
  // a redelivered event (a slow response, a retry after a transient 5xx,
  // Stripe's own dashboard "resend" button) would otherwise re-apply
  // whatever that event does. Every mutating branch below already calls
  // logBillingEvent with event.id, so checking for a prior row with this
  // exact id is enough to make every case here effectively run-once. The
  // stripeEventId column's own UNIQUE constraint is what actually closes
  // the race if two redeliveries of the same event land at nearly the same
  // instant -- both could pass this check, but only one of the two inserts
  // in the block that follows can win, and the loser is a UNIQUE violation
  // Stripe will simply see as an error and retry.
  if (await storage.wasStripeEventProcessed(event.id)) return;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // Number(null) is 0, not NaN -- an isInteger check alone would let a
      // session with no client_reference_id through as "user 0", which
      // then throws a foreign-key violation on the billingAuditLog insert
      // below instead of failing this one event cleanly. Real user ids
      // start at 1, so requiring userId > 0 closes that off directly.
      const userId = session.client_reference_id ? Number(session.client_reference_id) : NaN;
      if (!Number.isInteger(userId) || userId <= 0) break;
      const kind = session.metadata?.kind;
      const customerId = typeof session.customer === "string" ? session.customer : null;

      // A one-off lesson purchase has no subscription at all, so it is
      // handled before the subscription branch rather than being dropped by
      // it. The enrolment is what scopes the purchase to a single athlete --
      // see markLessonPurchased and the classes table's own comment on why a
      // priced lesson is bought per athlete and never shared.
      // THE GUARDIAN'S CARD, CHARGED ONCE AND REFUNDED. The record is written first: the refund
      // is a courtesy, the record is the point, and a refund that fails must not cost the child
      // their account. The refund is best-effort and logged; an operator can finish it by hand.
      if (kind === "guardian_verification") {
        if (session.payment_status !== "paid") break;
        const athleteId = Number(session.metadata?.athleteId);
        const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : null;
        await recordPaymentVerification(userId, paymentIntent ?? session.id, session.amount_total, "stripe");
        await storage.logBillingEvent(
          userId,
          event.type,
          { sessionId: session.id, kind, athleteId: Number.isInteger(athleteId) ? athleteId : null, paymentIntent },
          event.id,
        );
        const stripe = getStripeClient();
        if (stripe && paymentIntent) {
          try {
            await stripe.refunds.create({ payment_intent: paymentIntent });
          } catch (err) {
            console.error(`guardian verification ${paymentIntent}: recorded, refund failed and needs a hand:`, err);
          }
        }
        break;
      }

      if (kind === "class_lesson") {
        const enrollmentId = Number(session.metadata?.enrollmentId);
        const lessonId = Number(session.metadata?.lessonId);
        if (!Number.isInteger(enrollmentId) || !Number.isInteger(lessonId)) break;
        if (session.payment_status !== "paid") break;
        await storage.markLessonPurchased(enrollmentId, lessonId);
        if (customerId) await storage.updateSubscriptionByUserId(userId, { stripeCustomerId: customerId });
        await storage.logBillingEvent(
          userId,
          event.type,
          { sessionId: session.id, enrollmentId, lessonId },
          event.id,
        );
        // Same reasoning as the subscription branch below. A one-off lesson purchase is still a
        // card transaction, and this branch returns before reaching that call.
        await recordPaymentVerification(userId, session.id, session.amount_total, "stripe");
        break;
      }

      // AN ADD-ON IS APPENDED, NEVER WRITTEN OVER. Both branches below buy one
      // thing on top of whatever the account already owns -- a second sport coach
      // does not replace the first, and Coaches Corner does not replace a
      // personalization add-on somebody assigned. The storage helpers do the
      // append (and de-duplicate), so a redelivered event that slips past the
      // wasStripeEventProcessed check cannot double an entry either.
      //
      // The id is validated against the shared list, not trusted: metadata is a
      // string that came back from an external system, and an unrecognised id
      // written onto the account is an entitlement nothing can resolve.
      if (kind === "free_agent_add_on") {
        const addOnId = session.metadata?.addOnId;
        if (!addOnId || !FREE_AGENT_ADD_ON_ORDER.includes(addOnId as FreeAgentAddOnId)) break;
        await storage.addFreeAgentAddOn(userId, addOnId as FreeAgentAddOnId, {
          stripeSubscriptionId:
            typeof session.subscription === "string" ? session.subscription : undefined,
        });
        if (customerId) await storage.updateSubscriptionByUserId(userId, { stripeCustomerId: customerId });
        await storage.logBillingEvent(userId, event.type, { sessionId: session.id, kind, addOnId }, event.id);
        await recordPaymentVerification(userId, session.id, session.amount_total, "stripe");
        break;
      }

      if (kind === "coach_add_on") {
        const addOnId = session.metadata?.addOnId;
        if (!addOnId || !COACH_PURCHASABLE_ADD_ON_ORDER.includes(addOnId as AddOnId)) break;
        await storage.addCoachBillingAddOn(userId, addOnId as AddOnId, {
          stripeSubscriptionId:
            typeof session.subscription === "string" ? session.subscription : undefined,
        });
        if (customerId) await storage.updateSubscriptionByUserId(userId, { stripeCustomerId: customerId });
        await storage.logBillingEvent(userId, event.type, { sessionId: session.id, kind, addOnId }, event.id);
        await recordPaymentVerification(userId, session.id, session.amount_total, "stripe");
        break;
      }

      if (typeof session.subscription !== "string") break;
      // What they actually bought. Without this the subscription row goes
      // active carrying whatever tier it was created with, so a Free Agent
      // who paid for AI Coach + Video would be entitled to the cheapest
      // tier -- the money arrives and the access does not match it.
      //
      // users.freeAgentTier is what every Free Agent AI gate reads, through
      // entitlementsForFreeAgentTier -- base/pro cannot express three SKUs.
      // subscriptions.tier is still written and still read by the coach-side
      // Coaches Corner gate, so both go in. Writing neither, which is what this
      // handler originally did beyond the status flip, left the whole Stripe
      // web-checkout path paying money for no access; the Apple IAP path has
      // always written both (storage.applyAppleIapVerification).
      const purchasedFreeAgentTier =
        kind === "free_agent_tier" && session.metadata?.tier && session.metadata.tier in FREE_AGENT_TIERS
          ? (session.metadata.tier as FreeAgentTierId)
          : null;

      // WHAT THIS PURCHASE REPLACES, READ BEFORE IT IS OVERWRITTEN.
      //
      // subscriptions.userId is UNIQUE, so one account has at most one row and that row holds
      // the TIER's (or the band's) Stripe subscription -- an add-on's id lives in
      // users.addOnTerms and never here, which is what makes this read safe to act on: a
      // different id already on the row can only be an earlier tier or band subscription.
      //
      // Nothing cancelled it. A Free Agent on Basic who bought AI Coach + Video on the web got
      // a SECOND Stripe subscription, this handler overwrote the id with the new one, and the
      // old one went on billing $4.99 a month forever with nothing in Forge remembering it
      // existed. Apple cannot do this to us -- all three tiers share ONE App Store subscription
      // group precisely so a swap replaces instead of stacking (see 2026-10-05, when they were
      // recreated as _v3 for exactly this reason) -- and the web rail had no equivalent.
      //
      // ONE CASE IS STILL OPEN AND IS NAMED RATHER THAN PAPERED OVER: an account holding an
      // APPLE subscription that then buys on the web. There is no Stripe id on the row to find,
      // so nothing here fires, and an Apple subscription cannot be cancelled by this server at
      // all -- only by the person, in iOS Settings. What the row records afterwards is both
      // ids, against a schema comment saying exactly one is ever set. Left alone deliberately:
      // clearing appleOriginalTransactionId would make the Apple notification path unable to
      // find the account, which is a worse failure than a duplicate somebody can see on their
      // own App Store receipt.
      const priorSubscriptionId =
        (await storage.getSubscriptionForUser(userId))?.stripeSubscriptionId ?? null;

      if (purchasedFreeAgentTier) {
        // UPSERT, NOT UPDATE, and this is the Stripe half of a bug that was fixed on the Apple
        // half on 2026-10-05 and left standing here. updateSubscriptionByUserId is a plain
        // UPDATE: for an account with no subscriptions row it matches nothing and writes
        // nothing. The row is only created at signup by createTrialSubscription, which a
        // coached athlete never meets -- so an athlete who lost their coach, or who signed up
        // before that code existed, is a Free Agent with no row.
        //
        // The tier itself was still granted (updateFreeAgentBilling writes users.freeAgentTier,
        // which is what every gate reads), so the purchase LOOKED fine. What was lost was
        // stripeSubscriptionId -- and that is the handle every later event matches on. So
        // customer.subscription.deleted found nothing, the SKU was never cleared, and a
        // cancelled or refunded tier went on working forever. Exactly the bug found on the
        // first live cancellation, in the one case where the fix for it cannot fire at all.
        await storage.upsertSubscriptionByUserId(userId, {
          accountType: "free_agent",
          tier: entitlementTierForFreeAgentTier(purchasedFreeAgentTier),
          status: "active",
          stripeCustomerId: customerId,
          stripeSubscriptionId: session.subscription,
          // A fresh purchase is not a cancelled one: an account that cancelled at period end
          // and came back would otherwise carry cancelAtPeriodEnd from the subscription it
          // just replaced.
          cancelAtPeriodEnd: false,
        });
        await storage.updateFreeAgentBilling(userId, { freeAgentTier: purchasedFreeAgentTier });
      } else if (kind === "coach_subscription") {
        // THE COACH HAS THE SAME HOLE, through a different door. A coach gets a trial row from
        // every SIGNUP path -- but storage.setUserRole, which is an admin's "Change role" on
        // More -> Users, promotes an athlete to coach and creates no subscription row, and a
        // COACHED athlete never had one. So a promoted coach buying their band would have had
        // the band written (applyCoachSubscriptionBand writes users.billingTier directly, which
        // is why it would have looked like it worked) and no stripeSubscriptionId -- leaving
        // syncCoachSubscriptionBand answering "no_stripe_subscription" forever and the
        // cancellation unable to clear the band.
        //
        // tier: "base" is exactly what createTrialSubscription writes for a coach, and nothing
        // reads subscriptions.tier on the coach side any more: the Coaches Corner gate used to
        // consult `tier === "pro"` and was moved onto the entitlements object (see
        // hasCoachesCorner's own comment above), so this is the inert value the row would have
        // carried had signup created it.
        await storage.upsertSubscriptionByUserId(userId, {
          accountType: "coach",
          tier: "base",
          status: "active",
          stripeCustomerId: customerId,
          stripeSubscriptionId: session.subscription,
          cancelAtPeriodEnd: false,
        });
      } else {
        // Anything else that arrives in subscription mode without a kind this handler knows.
        // A plain patch, because there is nothing here to build a row out of -- accountType and
        // tier are both NOT NULL with no default, and guessing either would write a row whose
        // meaning nobody chose.
        await storage.updateSubscriptionByUserId(userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: session.subscription,
          status: "active",
        });
      }

      if (priorSubscriptionId && priorSubscriptionId !== session.subscription) {
        await cancelSupersededStripeSubscription(userId, priorSubscriptionId);
      }

      // THE COACH SIDE OF THE SAME BUG. A school checked out on a band (the quantity and the
      // metadata both say which one -- see createCoachSubscriptionCheckout) and this handler
      // wrote no billingTier at all, so the money arrived and the account still read "no plan
      // assigned": no entitlements once enforcement is on, and no Institutional Service
      // Agreement asked for, since getInstitutionalAgreementStatus keys off billingTier.
      //
      // The band is validated against BILLING_TIERS rather than trusted -- metadata is a string
      // that came back from an external system, and an unknown id would otherwise be written
      // onto the account as a tier nothing can resolve.
      //
      // isBetaAccount is deliberately left alone. It is the one per-account admin switch that
      // comps an account deliberately (see its comment in shared/schema.ts); a completed payment
      // is not an instruction to change it either way. It defaulted TRUE when this was written
      // and has defaulted FALSE since the beta ended on 2026-10-11 -- the sentence here said
      // "defaults true" until then, which is the drift a comment stating a default always
      // invites.
      if (kind === "coach_subscription") {
        const bandId = session.metadata?.band;
        const band = bandId && bandId in BILLING_TIERS ? BILLING_TIERS[bandId] : null;
        if (band) await storage.applyCoachSubscriptionBand(userId, band.id, band.athleteCapIncluded);
      }
      await storage.logBillingEvent(userId, event.type, { sessionId: session.id, kind }, event.id);
      // A card was charged on an account that may belong to, or be responsible for, a minor.
      // The FTC counts that as one of its verifiable-parental-consent methods, so it is recorded
      // -- as corroboration, never as a replacement for the guardian's signed agreement at claim
      // time. Writes nothing for the ordinary case of an adult paying for themselves.
      await recordPaymentVerification(userId, session.id, session.amount_total, "stripe");
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const currentPeriodEndSec = sub.items.data[0]?.current_period_end;
      const updated = await storage.updateSubscriptionByStripeId(sub.id, {
        status: mapStripeStatus(sub.status) ?? undefined,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodEnd: currentPeriodEndSec != null ? new Date(currentPeriodEndSec * 1000) : undefined,
      });
      if (updated) await storage.logBillingEvent(updated.userId, event.type, { subscriptionId: sub.id }, event.id);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const updated = await storage.updateSubscriptionByStripeId(sub.id, { status: "canceled" });
      if (updated) {
        await storage.logBillingEvent(updated.userId, event.type, { subscriptionId: sub.id }, event.id);
        // THE SKU COMES OFF WITH THE SUBSCRIPTION. Found 2026-10-11 on the first live cancellation:
        // the paid gates already closed, because hasAthletePaidForAiAccess reads the subscription
        // row's status first under BILLING_LIVE -- but users.freeAgentTier kept the cancelled SKU,
        // so the upgrade screen went on marking a plan nobody held as "current" and
        // /api/athlete/entitlements reported it. The checkout webhook writes the tier on purchase
        // (above); this is the matching write on the way out. Coach rows carry no freeAgentTier.
        if (updated.accountType === "free_agent") {
          await storage.updateFreeAgentBilling(updated.userId, { freeAgentTier: null });
        }
        // AND THE COACH SIDE, which this missed entirely until 2026-10-11. The branch above was
        // written for the Free Agent SKU and read accountType to avoid touching a coach row --
        // correct as far as it went, except nothing else cleared the coach's band either:
        // `billingTier: null` was never written anywhere in the server. So a program that
        // cancelled kept its band, and with it Full Personalization and multi-team on any band
        // above twenty athletes. Same shape as the Free Agent bug found the same day, on the
        // other side of the same event.
        //
        // plannedAthleteCount is deliberately LEFT ALONE: it is what the school said they have,
        // not something they bought, so it still quotes their price if they come back.
        if (updated.accountType === "coach") {
          await storage.clearCoachBand(updated.userId);
        }
      }

      // AND THE ADD-ON, WHICH NO STRIPE LIFECYCLE EVENT COULD REACH (fixed 2026-10-14).
      //
      // updateSubscriptionByStripeId above matches the `subscriptions` table, and an add-on's
      // subscription id is NOT there -- it lives in users.addOnTerms, because
      // subscriptions.userId is UNIQUE and that one row belongs to the TIER. So `updated` is
      // null for an add-on and this handler did nothing at all: a coach who cancelled Coaches
      // Corner in the Stripe billing portal -- the portal Forge itself opens for them at
      // /api/billing/portal -- kept the add-on forever after the billing stopped, as did anyone
      // whose card failed until Stripe gave up and deleted the subscription. Access nobody was
      // paying for, with no event left to take it away.
      //
      // Found by the billing sweep, and the third in one family: revokeAddOnsForStripeSubscription
      // had exactly ONE caller (charge.refunded), so every other lifecycle event was blind to
      // half the places a subscription id can live.
      //
      // THE PAID MONTH IS HONOURED. A cancellation is not a refund (shared/add-on-terms.ts):
      // a cancelled add-on runs to the end of the month already bought. Stripe reports that
      // period on the subscription it is deleting, so that is what is passed down; an ordinary
      // cancel-at-period-end arrives when the period has already ended and so revokes at once.
      const deletedPeriodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
      const addOnAccessUntil = deletedPeriodEnd ? new Date(deletedPeriodEnd * 1000) : new Date();
      const endedAddOns = await storage.endAddOnsForDeletedStripeSubscription(sub.id, addOnAccessUntil);
      if (endedAddOns.userId) {
        await storage.logBillingEvent(
          endedAddOns.userId,
          event.type,
          {
            subscriptionId: sub.id,
            addOnIds: endedAddOns.addOnIds,
            accessUntil: addOnAccessUntil.toISOString(),
          },
          event.id,
        );
      }
      break;
    }
    // A STRIPE REFUND REVOKES AT ONCE. Scott, 2026-10-11: "if something is refunded then they
    // don't have access obviously." A cancellation runs to the end of the paid month; a refund
    // is the opposite event and must not wait for it. charge.refunded carries the charge, whose
    // invoice names the subscription, which is the handle recorded in users.addOnTerms when the
    // add-on was bought -- the only place it could be recorded, since subscriptions.userId is
    // unique and that row belongs to the tier.
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      // `invoice` is read through a cast: newer Stripe API versions have moved it off the
      // top-level Charge, and this account's version decides which shape actually arrives --
      // the same reason invoice.payment_failed below reads parent.subscription_details.
      const rawInvoice = (charge as unknown as { invoice?: string | { id: string } }).invoice;
      const invoiceId = typeof rawInvoice === "string" ? rawInvoice : rawInvoice?.id;
      const subscriptionId = invoiceId ? await subscriptionIdForInvoice(invoiceId) : null;
      if (!subscriptionId) break;
      const revoked = await storage.revokeAddOnsForStripeSubscription(subscriptionId);
      if (revoked.userId) {
        await storage.logBillingEvent(
          revoked.userId,
          event.type,
          { chargeId: charge.id, addOnIds: revoked.addOnIds },
          event.id,
        );
      }

      // AND THE TIER AND THE BAND, WHICH THIS HANDLER COULD NOT REACH AT ALL (fixed 2026-10-14).
      //
      // revokeAddOnsForStripeSubscription searches users.addOnTerms and nothing else, so a
      // refunded ADD-ON was revoked and a refunded TIER or COACH BAND kept full access: the
      // money went back and the entitlement stayed. Six of the ten dimensions in the billing
      // sweep found this independently, and it is the same shape as the bug it sits beside --
      // a handler written for one of the two places a Stripe subscription id can live.
      //
      // The tier's and the band's id lives on the subscriptions row (userId is UNIQUE, one row
      // per account), so this is the matching lookup. A refund is at least as terminal as a
      // cancellation, so it does exactly what customer.subscription.deleted does -- Scott's
      // rule, in his words: "if something is refunded then they don't have access obviously."
      const refundedSub = await storage.updateSubscriptionByStripeId(subscriptionId, { status: "canceled" });
      if (refundedSub) {
        if (refundedSub.accountType === "free_agent") {
          await storage.updateFreeAgentBilling(refundedSub.userId, { freeAgentTier: null });
        }
        if (refundedSub.accountType === "coach") {
          await storage.clearCoachBand(refundedSub.userId);
        }
        await storage.logBillingEvent(
          refundedSub.userId,
          event.type,
          { chargeId: charge.id, subscriptionId, revoked: refundedSub.accountType === "coach" ? "band" : "tier" },
          event.id,
        );
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      // Stripe moved this off a top-level `subscription` field onto
      // `parent.subscription_details` in newer API versions -- whichever
      // shape the configured account's API version actually sends.
      const subId = invoice.parent?.subscription_details?.subscription;
      if (!subId || typeof subId !== "string") break;
      const updated = await storage.updateSubscriptionByStripeId(subId, { status: "past_due" });
      if (updated) await storage.logBillingEvent(updated.userId, event.type, { invoiceId: invoice.id }, event.id);
      break;
    }
    default:
      break;
  }
}
