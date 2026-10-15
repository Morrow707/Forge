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
  // `trialExpiresAt` IS NOT A FREE AGENT TRIAL, and reading it here was a leak (2026-10-15).
  //
  // The only writer of users.trialExpiresAt in this repo is storage.redeemCode, which is called
  // from POST /api/coach/redeem-code behind requireRole("coach") + requirePrimaryCoach: it is a
  // COACH promo code, extending a program's trial. Nothing on the athlete side has ever set it.
  // So this branch could only ever fire for an account that was a coach when it redeemed one --
  // and an admin demoting that coach to athlete handed them the whole $19.99 tier (camera,
  // skills, AI chat) free for the rest of the promo window, which on a 90-day code is a quarter.
  // No real Free Agent could benefit; only a role change could reach it.
  //
  // A Free Agent trial does not exist today. The day one does it gets its own column or a check
  // on the subscription row's accountType, rather than borrowing the coach's -- which is what
  // made this invisible: the column name says "trial" and says nothing about whose.
  //
  // getEntitlements (the COACH side, above) still honours it, because there it is the thing it
  // was written for.
  if (!ENFORCEMENT_ENABLED || account.isBetaAccount) {
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
    allow_promotion_codes: true,
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
    allow_promotion_codes: true,
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
/** RE-BILL A PROGRAM WHOSE ROSTER JUST GREW, at the moment it grew.
 *
 * Added 2026-10-15 from the audit panel's "nothing re-bills a roster that grows".
 * syncCoachSubscriptionBand had exactly one caller -- the coach's own plan page -- so a program
 * that typed 10 at signup and then had 40 athletes join was billed for 10 until somebody
 * happened to open that screen. $4 a head is the whole pricing model, and
 * getBilledAthleteCountForCoach has always said the billed count is the LARGER of the typed
 * number and the roster; nothing was asking it.
 *
 * AT THE JOIN, rather than nightly: a seat claim is a thing a person just did, so the charge
 * moves while somebody is watching, and the coach sees the new band on the billing page
 * immediately rather than at 11:00 UTC. The nightly drift sweep
 * (server/coach-band-drift-job.ts) stays as the backstop for whatever this misses -- a seat
 * taken while Stripe was down, a roster that shrank, an import that bypassed the claim.
 *
 * BEST-EFFORT AND AUDITED, never in the way: an athlete's signup or roster claim must not fail
 * because Stripe refused a quantity change. syncCoachSubscriptionBand already returns a reason
 * rather than throwing, and the reasons that mean "nothing to do" (no subscription, no band
 * change) are the ordinary case -- a coach with no plan, or a join that stays inside the band.
 */
export async function rebillCoachBandAfterJoin(coachId: number): Promise<void> {
  try {
    // THE PRIMARY'S ROW IS THE ONE WITH THE SUBSCRIPTION (fixed 2026-10-15). Both callers in
    // auth.ts pass the coach resolved from the code the athlete TYPED, and a staff coach has a
    // coachCode of their own -- so a join through an assistant's code arrived here with the
    // assistant's id, syncCoachSubscriptionBand read getSubscriptionForUser(assistant), found no
    // row (the program's subscription is on the primary's), and returned
    // `no_stripe_subscription` as an ordinary no-op. The seat counted against the program
    // (claimRosterSeat and getRosterSeatCountForCoach both read the effective coach ids), the
    // Stripe quantity never moved, and the program was under-billed until the primary happened to
    // open the plan page. Found by the 2026-10-15 security review, by two reviewers independently.
    //
    // getBilledAthleteCountForCoach already resolves the primary for the planned number and the
    // effective ids for the roster, so it answers the same either way; it is the sync that has to
    // be handed the row that can carry a subscription.
    const primaryId = await storage.getPrimaryCoachId(coachId);
    // The BILLED count, which is the larger of the typed number and the roster -- the same
    // rule the plan page and the drift sweep use, so three callers cannot disagree about what a
    // program owes (storage.getBilledAthleteCountForCoach).
    const billed = await storage.getBilledAthleteCountForCoach(primaryId);
    const result = await syncCoachSubscriptionBand(primaryId, billed);
    // `synced` is the one that moved money; every `reason` is an ordinary no-op (no plan, no
    // Stripe subscription, the join stayed inside the band) and is not worth an audit row each
    // time an athlete joins.
    if (result.synced) {
      await storage.logBillingEvent(primaryId, "coach.plan.rebilled_on_join", {
        ...result,
        // Named when the join came through an assistant's code, so the row says why the
        // program's quantity moved on a code that is not the primary's.
        ...(primaryId !== coachId ? { joinedThroughCoachId: coachId } : {}),
      });
    }
  } catch (err) {
    console.error(`could not re-bill coach ${coachId} after a roster join:`, err);
    await storage
      .logBillingEvent(coachId, "coach.plan.rebill_on_join_failed", {
        error: err instanceof Error ? err.message : String(err),
      })
      .catch(() => {});
  }
}

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
export async function cancelSupersededStripeSubscription(userId: number, subscriptionId: string) {
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

/**
 * IS THE SUBSCRIPTION THIS CHECKOUT PAID FOR STILL ALIVE?
 *
 * Stripe retries a failed delivery with backoff for up to three days, and does NOT promise
 * ordering between event types. Both facts bite the same way here: a
 * `checkout.session.completed` whose first delivery threw can be re-delivered long after the
 * subscription it created has been cancelled or has died in dunning -- and a
 * `customer.subscription.deleted` for that same subscription can be processed FIRST, since it
 * matches on an id this handler has not written yet, find nothing, and do nothing.
 *
 * The result is a grant with no live subscription behind it and nothing left that can ever take
 * it back: the revocation already ran, and `wasStripeEventProcessed` will refuse to run it again.
 * Free access, permanently, from one transient 500.
 *
 * So the grant asks Stripe for the subscription's CURRENT state rather than trusting the
 * session's age. Terminal statuses only -- `past_due` is recoverable (dunning is still trying,
 * and endStripeSubscription handles it if it ends in `unpaid`) and `trialing` is a live
 * subscription that simply has not charged yet, so neither is refused here.
 *
 * FAIL-OPEN, deliberately and in the direction that costs Forge rather than the buyer. Without a
 * Stripe client, or on a network error, the honest answer is "unknown", and the overwhelmingly
 * common case is a first delivery seconds after a successful checkout. Refusing on unknown would
 * mean a Stripe API blip takes away access somebody has just paid for -- the same posture as the
 * guardian-verification refund and the superseded cancel, both of which record and carry on
 * rather than roll back a purchase that succeeded.
 */
const DEAD_STRIPE_SUBSCRIPTION_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

async function stripeSubscriptionIsDead(subscriptionId: string): Promise<string | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    return DEAD_STRIPE_SUBSCRIPTION_STATUSES.has(sub.status) ? sub.status : null;
  } catch (err) {
    console.error(
      `Could not read Stripe subscription ${subscriptionId} while granting a checkout; ` +
        `granting anyway (a purchase that succeeded must not be undone by a read failure):`,
      (err as Error)?.message,
    );
    return null;
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

/** UN-CANCEL the add-on's own Stripe subscription, which is what a restore has to do.
 *
 *  Added 2026-10-15. Cancelling an add-on sets `cancel_at_period_end: true` at Stripe
 *  (cancelAddOnAtProvider above) and RESTORING it only cleared Forge's own `accessUntil` -- so
 *  the add-on worked again and Stripe still stopped billing at the end of the month. Access
 *  nobody would ever pay for, for good, on the one route whose entire purpose is "I changed my
 *  mind inside the paid month".
 *
 *  A failure is REPORTED, never swallowed: the route restores access either way (the month is
 *  paid for, so withholding it is the wrong error) and says the subscription is still winding
 *  down, which is a thing the buyer can act on and an operator can finish by hand. */
export async function resumeAddOnAtProvider(
  stripeSubscriptionId: string | undefined,
): Promise<{ resumed: boolean; error?: string }> {
  if (!stripeSubscriptionId) return { resumed: false };
  const stripe = getStripeClient();
  if (!stripe) return { resumed: false, error: "not_configured" };
  try {
    await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: false });
    return { resumed: true };
  } catch (err) {
    console.error("Could not resume add-on subscription at Stripe:", (err as Error)?.message);
    return { resumed: false, error: "provider_refused" };
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
    allow_promotion_codes: true,
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
    allow_promotion_codes: true,
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
    allow_promotion_codes: true,
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



/** EVERYTHING A SUBSCRIPTION PAID FOR, TAKEN BACK WHEN THE MONEY IS.
 *
 * Shared by charge.refunded and charge.dispute.created, because a chargeback is a refund the
 * customer forced and the two have no business revoking different sets of things. Written out
 * once for that reason: the refund path was already the ONLY caller of
 * revokeAddOnsForStripeSubscription, and copying it for disputes would have produced the fifth
 * instance of this sweep's recurring defect -- one handler knowing one of the two places a
 * subscription id can live.
 *
 * Both halves, always: an ADD-ON's id lives in users.addOnTerms, and the TIER's or the BAND's
 * on the subscriptions row (userId is UNIQUE, so that row is the tier's). */
async function revokeEverythingForSubscription(
  subscriptionId: string,
  eventType: string,
  eventId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  // ONE ROW PER DELIVERY MAY CARRY THE STRIPE EVENT ID, because
  // billing_audit_log.stripe_event_id is UNIQUE (it is the idempotency check
  // handleStripeWebhookEvent makes). Both halves below can find something -- an add-on's
  // subscription id lives in users.addOnTerms and a tier's in the subscriptions row, and the
  // add-on lookup is a text LIKE over that column -- so whichever writes first takes the id and
  // the other records it in its detail. Latent until 2026-10-14: the second insert would have
  // thrown, 500'd the refund webhook and left Stripe retrying a delivery that had already done
  // half its work.
  let eventIdClaimed = false;
  const claimEventId = () => {
    if (eventIdClaimed) return undefined;
    eventIdClaimed = true;
    return eventId;
  };
  const revoked = await storage.revokeAddOnsForStripeSubscription(subscriptionId);
  if (revoked.userId) {
    await storage.logBillingEvent(
      revoked.userId,
      eventType,
      { ...detail, addOnIds: revoked.addOnIds, stripeEventId: eventId },
      claimEventId(),
    );
  }

  const sub = await storage.updateSubscriptionByStripeId(subscriptionId, { status: "canceled" });
  if (sub) {
    if (sub.accountType === "free_agent") {
      // THE SAME CROSS-RAIL GUARD endStripeSubscription CARRIES (added 2026-10-15). A legacy row
      // holding both handles is an account the App Store may still be paying for; a Stripe
      // refund on it revoked the SKU anyway, which is the error that path calls the worse one.
      // Recorded for an operator, exactly as the cancellation path records it.
      if (sub.appleOriginalTransactionId) {
        console.warn(
          `Stripe subscription ${subscriptionId} (user ${sub.userId}) was refunded or disputed but the ` +
            `row also carries App Store subscription ${sub.appleOriginalTransactionId}; the Free ` +
            `Agent tier is left on file rather than withheld from a possible payer`,
        );
        await storage.logBillingEvent(sub.userId, "subscription.other_rail_still_on_file", {
          endedRail: "stripe",
          stripeEventId: eventId,
          stripeSubscriptionId: subscriptionId,
          appleOriginalTransactionId: sub.appleOriginalTransactionId,
        });
      } else {
        await storage.updateFreeAgentBilling(sub.userId, { freeAgentTier: null });
      }
    }
    if (sub.accountType === "coach") {
      await storage.clearCoachBand(sub.userId);
    }
    await storage.logBillingEvent(
      sub.userId,
      eventType,
      { ...detail, subscriptionId, revoked: sub.accountType === "coach" ? "band" : "tier", stripeEventId: eventId },
      claimEventId(),
    );
  }

  // AND THE SUBSCRIPTION IS CANCELLED AT STRIPE, WHICH NOTHING HERE EVER DID (fixed 2026-10-15).
  //
  // A refund is issued from the Stripe dashboard, and refunding an invoice does not cancel the
  // subscription it was for -- that is a second click, and the one most likely to be skipped on
  // a goodwill refund. Before this, the row above went `canceled` and the SKU came off, while
  // Stripe went on billing the card every month for a product the account no longer had; and the
  // next `customer.subscription.updated` (every renewal is one) wrote the live status straight
  // back onto the row with nothing re-granting the tier. Money taken, nothing given, month after
  // month, from one refund. A dispute is the same shape with the bank doing the refunding. Found
  // by the 2026-10-15 security review.
  //
  // BEST-EFFORT, as every provider call on a webhook is: the revocation above is the thing that
  // must land, and a Stripe API failure here is an audit row naming what an operator has to
  // finish by hand, never a thrown event that Stripe retries into a second revocation. No
  // proration and no final invoice -- the money for this period has already gone back, and a
  // credit note against a refunded invoice is noise on the customer's statement.
  const owner = sub?.userId ?? revoked.userId;
  const stripe = getStripeClient();
  if (stripe && owner) {
    try {
      const live = await stripe.subscriptions.retrieve(subscriptionId);
      if (live.status === "canceled") {
        // Refunded on cancellation, or the operator did click twice: nothing left to stop.
        await storage.logBillingEvent(owner, "stripe.subscription.already_cancelled_at_provider", {
          subscriptionId,
          stripeEventId: eventId,
        });
      } else {
        await stripe.subscriptions.cancel(subscriptionId);
        await storage.logBillingEvent(owner, "stripe.subscription.cancelled_after_revocation", {
          subscriptionId,
          because: eventType,
          stripeEventId: eventId,
        });
      }
    } catch (err) {
      console.error(
        `Stripe subscription ${subscriptionId} (user ${owner}) was revoked on ${eventType} but could not ` +
          `be cancelled at Stripe and is still billing; needs a hand:`,
        err,
      );
      await storage.logBillingEvent(owner, "stripe.subscription.cancel_after_revocation_failed", {
        subscriptionId,
        because: eventType,
        stripeEventId: eventId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
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

/** ONE DELIVERY MAY CLAIM THE STRIPE EVENT ID ONCE -- billing_audit_log.stripe_event_id is
 *  UNIQUE, and it is the idempotency check handleStripeWebhookEvent makes. The first row to ask
 *  gets it; the rest carry it in their detail, where it is just as findable. */
function oneEventId(eventId: string): () => string | undefined {
  let claimed = false;
  return () => {
    if (claimed) return undefined;
    claimed = true;
    return eventId;
  };
}

/**
 * THE CLEAR-DOWN WHEN A STRIPE SUBSCRIPTION STOPS BEING PAID FOR.
 *
 * Factored out of customer.subscription.deleted on 2026-10-15, because that event is NOT the
 * only way a subscription ends and every revocation lived inside it. Two others reach the same
 * state and revoked nothing:
 *
 *   - **Stripe cancels through an `updated` event.** mapStripeStatus' own comment has said so
 *     since it was written ("a subscription Stripe canceled via an *updated* event rather than a
 *     separate deleted event"), and that path recorded the status and stopped -- so the tier, the
 *     band and the add-ons all survived a cancellation Forge had been told about.
 *   - **`unpaid` is where dunning ENDS.** Stripe retries a failed card for weeks and then, on a
 *     subscription set to "mark unpaid" rather than "cancel", stops retrying and never deletes
 *     anything. Nothing cleared the tier, and since 2026-10-11 the gates read
 *     users.freeAgentTier rather than the row's status -- so a card that failed weeks ago was
 *     paying for nothing and still granting everything.
 *
 * The RAW Stripe status is what decides, never the mapped column: mapStripeStatus collapses
 * `unpaid` into `past_due` (the enum has no `unpaid`), so the column cannot tell "still trying"
 * from "given up", and acting on it would revoke an account inside its grace period.
 *
 * `past_due` deliberately does NOT reach here. A failed card inside Stripe's retry window is an
 * account somebody is still trying to pay for, and withholding access from a possible payer is
 * the worse error -- the same posture this file takes on the cross-rail row below.
 */
async function endStripeSubscription(
  sub: Stripe.Subscription,
  eventType: string,
  eventId: string,
  claim: () => string | undefined = oneEventId(eventId),
): Promise<void> {
    const updated = await storage.updateSubscriptionByStripeId(sub.id, { status: "canceled" });
    if (updated) {
      await storage.logBillingEvent(updated.userId, eventType, { subscriptionId: sub.id }, claim());
      // THE SKU COMES OFF WITH THE SUBSCRIPTION. Found 2026-10-11 on the first live cancellation:
      // the paid gates already closed, because hasAthletePaidForAiAccess reads the subscription
      // row's status first under BILLING_LIVE -- but users.freeAgentTier kept the cancelled SKU,
      // so the upgrade screen went on marking a plan nobody held as "current" and
      // /api/athlete/entitlements reported it. The checkout webhook writes the tier on purchase
      // (above); this is the matching write on the way out. Coach rows carry no freeAgentTier.
      //
      // UNLESS THE OTHER RAIL IS ON THE ROW. A row carrying an appleOriginalTransactionId as
      // well is an account that bought on both rails before the takeover rule above existed
      // (a purchase now clears the loser's handle, so this cannot be reached by anything
      // bought after 2026-10-14). Clearing the SKU there would take away a tier the App Store
      // may still be paying for -- and between leaving a tier on file a little too long and
      // withholding access from somebody who is paying, this file's standing posture is that
      // withholding is the worse error. Recorded so an operator can settle it by hand.
      if (updated.accountType === "free_agent") {
        if (updated.appleOriginalTransactionId) {
          console.warn(
            `Stripe subscription ${sub.id} (user ${updated.userId}) was deleted but the row ` +
              `also carries App Store subscription ${updated.appleOriginalTransactionId}; the ` +
              `Free Agent tier is left on file rather than withheld from a possible payer`,
          );
          // The delivery's id is already on the `eventType` row above; see the
          // rail_changed call in checkout.session.completed on why a second row may not
          // claim it. It travels in the detail instead, where it is just as findable.
          await storage.logBillingEvent(updated.userId, "subscription.other_rail_still_on_file", {
            endedRail: "stripe",
            stripeEventId: eventId,
            stripeSubscriptionId: sub.id,
            appleOriginalTransactionId: updated.appleOriginalTransactionId,
          });
        } else {
          await storage.updateFreeAgentBilling(updated.userId, { freeAgentTier: null });
        }
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
    //
    // AND THE PERIOD IS READ OFF THE ITEM, WHICH IS THE ONLY PLACE IT EXISTS (fixed 2026-10-15).
    // The paragraph above has promised the paid month since it was written and never delivered
    // one: Stripe removed `current_period_end` from `Subscription` and moved it to
    // `SubscriptionItem` (SDK 22.5.0, API 2026-07-29.dahlia; the CHANGELOG says so in two lines),
    // so this read was ALWAYS undefined, `addOnAccessUntil` was ALWAYS `new Date()`, and
    // endAddOnsForDeletedStripeSubscription therefore took the `accessUntil <= now` branch on
    // every single cancellation -- revokeAddOnAfterRefund, which strips the add-on from the owned
    // array AND stamps `refundedAt`. So a coach who cancelled Coaches Corner in the Stripe portal
    // lost it that second rather than at the end of the month they had paid for, and the refund
    // stamp meant `restoreAddOn` could not give it back either: only an admin tick clears that.
    // Exactly the opposite of Scott's rule ("give them until the next billing cycle to have it
    // ... with no refund") and of a refund being the thing that stops access dead.
    //
    // `as unknown as` is what hid it: the cast silenced the one compiler error that would have
    // said the field was gone. Two other reads in this file (the add-on resume at ~756 and
    // customer.subscription.updated at ~1624) already fall back to or read the item, so this was
    // the one site left on the removed field -- and the only one whose wrong answer is silent
    // rather than a missing timestamp. The top-level read is KEPT as the first choice, because a
    // webhook endpoint pinned to an older API version still sends it and would otherwise lose the
    // period it does report.
    const deletedPeriodEnd =
      (sub as unknown as { current_period_end?: number }).current_period_end ??
      sub.items?.data?.[0]?.current_period_end;
    // AN UNPAID PERIOD IS NOT A PAID MONTH (fixed 2026-10-15). `unpaid` is where dunning ends:
    // the invoice for the CURRENT period was never paid, and that is the period Stripe reports
    // on the item -- so passing it down here granted every add-on on the subscription the whole
    // month nobody paid for, while the tier on the same event (above) ended at once. The paid
    // month rule in shared/add-on-terms.ts is about a month that was PAID; this one was not.
    const periodWasPaid = sub.status !== "unpaid";
    const addOnAccessUntil =
      periodWasPaid && deletedPeriodEnd ? new Date(deletedPeriodEnd * 1000) : new Date();
    const endedAddOns = await storage.endAddOnsForDeletedStripeSubscription(sub.id, addOnAccessUntil);
    if (endedAddOns.userId) {
      await storage.logBillingEvent(
        endedAddOns.userId,
        eventType,
        {
          subscriptionId: sub.id,
          addOnIds: endedAddOns.addOnIds,
          accessUntil: addOnAccessUntil.toISOString(),
          stripeEventId: eventId,
        },
        claim(),
      );
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

      // A RETRIED OR RE-ORDERED DELIVERY MUST NOT GRANT WHAT NOBODY IS PAYING FOR. See
      // stripeSubscriptionIsDead above for why this is asked of Stripe rather than inferred from
      // the session's age: the revocation for this subscription may already have run and been
      // recorded, and wasStripeEventProcessed will not let it run twice.
      //
      // Placed ABOVE every branch that buys a subscription -- the two add-ons as much as the tier
      // and the band -- because an add-on has its own Stripe subscription (its id lives in
      // users.addOnTerms) and the same two revocation paths, endAddOnsForDeletedStripeSubscription
      // and revokeAddOnAfterRefund, which match on that id and so find nothing on a delivery that
      // has not landed yet. The one-off kinds above this are `payment` mode and carry no
      // subscription at all, so the guard is skipped for them rather than having to exempt them.
      if (typeof session.subscription === "string") {
        const deadStatus = await stripeSubscriptionIsDead(session.subscription);
        if (deadStatus) {
          console.warn(
            `checkout ${session.id} (user ${userId}) arrived for Stripe subscription ` +
              `${session.subscription}, which is already ${deadStatus}; granting nothing`,
          );
          // The delivery's id is claimed here so the event counts as processed and Stripe stops
          // retrying it -- there is nothing a later attempt could do differently.
          await storage.logBillingEvent(
            userId,
            "stripe.checkout_for_dead_subscription",
            { sessionId: session.id, kind, subscriptionId: session.subscription, status: deadStatus },
            event.id,
          );
          break;
        }
      }

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
        // UPSERT, because updateSubscriptionByUserId is a plain UPDATE and an account that
        // bought ONLY an add-on may have no subscriptions row at all (the row is created by
        // createTrialSubscription, which a coached athlete never meets). The customer id is how
        // /api/billing/portal is opened, so dropping it left a paying customer with no way to
        // manage or cancel their own add-on -- the same class as the tier's lost
        // stripeSubscriptionId on 2026-10-11, one column over. The accountType comes from the
        // kind of purchase, and tier "base" is the inert value createTrialSubscription writes.
        if (customerId) {
          await storage.upsertStripeCustomerId(
            userId,
            customerId,
            "free_agent",
          );
        }
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
        const granted = await storage.addFreeAgentAddOn(userId, addOnId as FreeAgentAddOnId, {
          stripeSubscriptionId:
            typeof session.subscription === "string" ? session.subscription : undefined,
        });
        // ONE ACCOUNT, ONE SUBSCRIPTION PER ADD-ON. Re-buying an add-on that already had a live
        // Stripe subscription used to overwrite its id and leave the first one billing forever
        // with nothing left to find it -- the tier's own bug of 2026-10-11, in the other place a
        // subscription id lives. Best-effort and audited, for the same reason as the tier's: the
        // purchase has already succeeded and throwing here would take away access somebody just
        // paid for in order to tidy a duplicate.
        if (granted?.supersededStripeSubscriptionId) {
          await cancelSupersededStripeSubscription(userId, granted.supersededStripeSubscriptionId);
        }
        // UPSERT, because updateSubscriptionByUserId is a plain UPDATE and an account that
        // bought ONLY an add-on may have no subscriptions row at all (the row is created by
        // createTrialSubscription, which a coached athlete never meets). The customer id is how
        // /api/billing/portal is opened, so dropping it left a paying customer with no way to
        // manage or cancel their own add-on -- the same class as the tier's lost
        // stripeSubscriptionId on 2026-10-11, one column over. The accountType comes from the
        // kind of purchase, and tier "base" is the inert value createTrialSubscription writes.
        if (customerId) {
          await storage.upsertStripeCustomerId(
            userId,
            customerId,
            "free_agent",
          );
        }
        await storage.logBillingEvent(userId, event.type, { sessionId: session.id, kind, addOnId }, event.id);
        await recordPaymentVerification(userId, session.id, session.amount_total, "stripe");
        break;
      }

      if (kind === "coach_add_on") {
        const addOnId = session.metadata?.addOnId;
        if (!addOnId || !COACH_PURCHASABLE_ADD_ON_ORDER.includes(addOnId as AddOnId)) break;
        const granted = await storage.addCoachBillingAddOn(userId, addOnId as AddOnId, {
          stripeSubscriptionId:
            typeof session.subscription === "string" ? session.subscription : undefined,
        });
        // ONE ACCOUNT, ONE SUBSCRIPTION PER ADD-ON. Re-buying an add-on that already had a live
        // Stripe subscription used to overwrite its id and leave the first one billing forever
        // with nothing left to find it -- the tier's own bug of 2026-10-11, in the other place a
        // subscription id lives. Best-effort and audited, for the same reason as the tier's: the
        // purchase has already succeeded and throwing here would take away access somebody just
        // paid for in order to tidy a duplicate.
        if (granted?.supersededStripeSubscriptionId) {
          await cancelSupersededStripeSubscription(userId, granted.supersededStripeSubscriptionId);
        }
        // UPSERT, because updateSubscriptionByUserId is a plain UPDATE and an account that
        // bought ONLY an add-on may have no subscriptions row at all (the row is created by
        // createTrialSubscription, which a coached athlete never meets). The customer id is how
        // /api/billing/portal is opened, so dropping it left a paying customer with no way to
        // manage or cancel their own add-on -- the same class as the tier's lost
        // stripeSubscriptionId on 2026-10-11, one column over. The accountType comes from the
        // kind of purchase, and tier "base" is the inert value createTrialSubscription writes.
        if (customerId) {
          await storage.upsertStripeCustomerId(
            userId,
            customerId,
            "coach",
          );
        }
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
      // AND THE CROSS-RAIL CASE, WHICH THIS COMMENT USED TO CALL OPEN AND LEAVE ALONE (closed
      // 2026-10-14). An account holding an APPLE subscription that then buys on the web kept
      // both handles on one row -- and that is not a cosmetic duplicate, which is what the old
      // note had it as. `subscriptions` is UNIQUE on userId, so every lifecycle event finds
      // THIS row by its own rail's handle and then acts as though it owns the tier: the Apple
      // EXPIRED that arrives when the person stops the old subscription in iOS Settings nulls
      // users.freeAgentTier, and the athlete paying Stripe $19.99 a month loses the camera.
      // See one-rail-owns-the-subscription-row.test.ts for both directions.
      //
      // SO A PURCHASE TAKES THE ROW, AND THE ROW NAMES ONE RAIL. The old note's objection was
      // that clearing appleOriginalTransactionId stops the Apple notification path finding the
      // account -- true, and it is the right trade now that the cost of keeping it is measured:
      // the row no longer represents that subscription, so a renewal or expiry notification for
      // it has nothing to update here, and if the athlete comes back to the App Store rail the
      // app's own verification writes the handle back at the next launch
      // (applyAppleIapVerification, which does the mirror of this and clears the Stripe one).
      //
      // WHAT HAPPENS TO THE RAIL THAT LOST THE ROW DEPENDS ON WHETHER FORGE CAN REACH IT: a
      // Stripe subscription is cancelled below, and an App Store subscription can only be
      // stopped by the person who bought it, so that one is warned about and recorded. Same
      // posture, same reason, as the self-serve cancel route's `alsoCancelInAppStore`.
      const priorRow = await storage.getSubscriptionForUser(userId);
      const priorSubscriptionId = priorRow?.stripeSubscriptionId ?? null;
      const supersededAppleTransactionId = priorRow?.appleOriginalTransactionId ?? null;

      // CANCEL BEFORE THE ROW IS OVERWRITTEN, which is what makes a retried delivery safe.
      //
      // This used to run AFTER the upsert, and Stripe retries a delivery whose handler threw.
      // On the retry `priorSubscriptionId` is read back as the id just written, so
      // `prior !== session.subscription` is false, the cancel is skipped, and the FIRST
      // subscription bills forever -- reinstating the exact double bill this call was added to
      // stop (2026-10-11), through the one path nobody exercises by hand. Found by the
      // 2026-10-14 audit panel.
      //
      // Cancel-first is the safe order: if the cancel lands and the grant then fails, the retry
      // grants what was paid for and the cancel is a no-op at Stripe; the other way round
      // leaves two live subscriptions and nothing left in Forge that can find the older one.
      if (priorSubscriptionId && priorSubscriptionId !== session.subscription) {
        await cancelSupersededStripeSubscription(userId, priorSubscriptionId);
      }

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
          // The key is sent ONLY when there is a handle to clear, so an ordinary web purchase
          // does not rewrite a column nobody asked about.
          ...(supersededAppleTransactionId ? { appleOriginalTransactionId: null } : {}),
        });
        await storage.updateFreeAgentBilling(userId, { freeAgentTier: purchasedFreeAgentTier });
        if (supersededAppleTransactionId) {
          // LOUD, because this is money leaving and nothing else in the system will notice: the
          // App Store subscription carries on charging until the person stops it in iOS
          // Settings, and no server call can do it for them.
          console.warn(
            `user ${userId} bought a Free Agent tier on the web while App Store subscription ` +
              `${supersededAppleTransactionId} was on file; the web purchase now owns the row and ` +
              `the App Store subscription has to be stopped by the person in iOS Settings`,
          );
          // NO stripeEventId ON A SECOND ROW FROM ONE DELIVERY. billing_audit_log.stripe_event_id
          // is UNIQUE -- deliberately, since it is the idempotency check handleStripeWebhookEvent
          // makes before processing anything -- so the delivery's id belongs to the one
          // `event.type` row below and a supplementary row like this carries none. Writing it
          // twice would throw on the second insert and 500 the webhook.
          await storage.logBillingEvent(userId, "subscription.rail_changed", {
            to: "stripe",
            stripeEventId: event.id,
            stripeSubscriptionId: session.subscription,
            supersededAppleOriginalTransactionId: supersededAppleTransactionId,
            alsoCancelInAppStore: true,
          });
        }
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
      const claim = oneEventId(event.id);
      const updated = await storage.updateSubscriptionByStripeId(sub.id, {
        status: mapStripeStatus(sub.status) ?? undefined,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodEnd: currentPeriodEndSec != null ? new Date(currentPeriodEndSec * 1000) : undefined,
      });
      if (updated) {
        await storage.logBillingEvent(
          updated.userId,
          event.type,
          { subscriptionId: sub.id },
          claim(),
        );
      }
      // A SUBSCRIPTION CAN END THROUGH THIS EVENT, and until 2026-10-15 ending it here revoked
      // nothing -- see endStripeSubscription for the two shapes (Stripe cancelling through an
      // `updated` event, and dunning finishing in `unpaid` with no deletion ever sent). The RAW
      // status decides; the column collapses `unpaid` into `past_due`.
      if (sub.status === "canceled" || sub.status === "unpaid") {
        await endStripeSubscription(sub, event.type, event.id, claim);
      }
      break;
    }
    case "customer.subscription.deleted": {
      await endStripeSubscription(event.data.object as Stripe.Subscription, event.type, event.id);
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
      // A PARTIAL REFUND IS NOT A REFUND, and treating one as a refund was permanent.
      //
      // Stripe sends charge.refunded for ANY refund, including a $1 goodwill gesture on a
      // $19.99 add-on and a prorated partial. revokeEverythingForSubscription stamps
      // addOnTerms.refundedAt, which addOnIsActive treats as final and the restore route
      // refuses to clear -- so a support credit took the product away for good from a customer
      // who is still being billed for it every month. Scott's rule is "if something is refunded
      // then they don't have access obviously", and a customer who got $1 back out of $19.99
      // has not been refunded.
      //
      // `refunded` is Stripe's own fully-refunded flag; the amounts are checked as well because
      // the flag is what a future API version is most likely to move, and a full refund read as
      // partial would silently stop revoking.
      const fullyRefunded =
        charge.refunded === true || (charge.amount_refunded ?? 0) >= (charge.amount ?? 0);
      if (!fullyRefunded) {
        console.warn(
          `partial refund on charge ${charge.id} (${charge.amount_refunded} of ${charge.amount}): ` +
            `subscription ${subscriptionId} keeps its access and keeps billing`,
        );
        // Recorded against the account that holds the subscription, wherever its id lives --
        // an audit row against a userId nobody has would fail the foreign key and vanish.
        const partialOwner = await storage.accountForStripeSubscription(subscriptionId);
        if (partialOwner) {
          await storage.logBillingEvent(
            partialOwner,
            "stripe.partial_refund_ignored",
            {
              chargeId: charge.id,
              subscriptionId,
              amountRefunded: charge.amount_refunded,
              amount: charge.amount,
              stripeEventId: event.id,
            },
            event.id,
          );
        }
        break;
      }
      await revokeEverythingForSubscription(subscriptionId, event.type, event.id, { chargeId: charge.id });
      break;
    }
    // A CHARGEBACK IS A REFUND THE CUSTOMER FORCED, AND NOTHING HANDLED ONE (added 2026-10-14).
    //
    // There was no dispute branch anywhere in the server: a person could charge back through
    // their bank, get the money, and keep the tier or the add-on indefinitely, because the only
    // thing that revoked anything was a refund Forge itself issued. Found by the billing sweep.
    //
    // REVOKED ON `created`, NOT ON `closed`, and that is a decision rather than impatience: the
    // bank withdraws the funds when the dispute is opened, so access from that moment is access
    // nobody is paying for, and a dispute can run for weeks. The cost is the rare case Forge
    // wins -- there the dispute's closure is logged below with its outcome, and an admin
    // re-grants on /admin/billing, which is a conversation with one customer rather than weeks
    // of unpaid access for every disputer.
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      const rawCharge = dispute.charge;
      const chargeId = typeof rawCharge === "string" ? rawCharge : rawCharge?.id;
      if (!chargeId) break;
      const stripe = getStripeClient();
      if (!stripe) break;
      // A dispute names its CHARGE, not its invoice, so the invoice has to be read off the
      // charge before the same subscription lookup the refund path uses can run.
      let subscriptionId: string | null = null;
      try {
        const charge = await stripe.charges.retrieve(chargeId);
        const rawInvoice = (charge as unknown as { invoice?: string | { id: string } }).invoice;
        const invoiceId = typeof rawInvoice === "string" ? rawInvoice : rawInvoice?.id;
        subscriptionId = invoiceId ? await subscriptionIdForInvoice(invoiceId) : null;
      } catch (err) {
        console.error(`dispute ${dispute.id}: could not resolve charge ${chargeId} to a subscription:`, err);
      }
      if (!subscriptionId) break;
      await revokeEverythingForSubscription(subscriptionId, event.type, event.id, {
        disputeId: dispute.id,
        chargeId,
        reason: dispute.reason ?? null,
      });
      break;
    }
    // The outcome, recorded and never acted on. A dispute Forge WINS does not restore access
    // automatically: re-granting from a webhook would hand back a paid tier on an event that
    // can also arrive for a dispute merely withdrawn, and the account has been revoked for
    // weeks by then anyway. An admin re-grants on /admin/billing. What this is for is making
    // that case findable at all, since a lost dispute and a won one look identical afterwards.
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      console.log(`Stripe dispute ${dispute.id} closed as ${dispute.status}; access was revoked when it opened`);
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
