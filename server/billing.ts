import Stripe from "stripe";
import { storage } from "./storage";
import { coachBasePriceId, freeAgentPriceId } from "./stripe-prices";
import { BILLING_TIERS, type AddOnId, type BillingTierId } from "@shared/billing-tiers";
import { FREE_AGENT_TIERS, type FreeAgentTierId } from "@shared/free-agent-tiers";
import { entitlementTierForFreeAgentTier } from "./apple-iap";
import { VIDEO_RETENTION, VIDEO_STORAGE_ADD_ON, type VideoRetentionLimits } from "@shared/video-retention";

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
export const ENFORCEMENT_ENABLED = process.env.BILLING_ENFORCEMENT_ENABLED === "true";

export interface Entitlements {
  /** null = unlimited. */
  athleteCap: number | null;
  hasCustomColors: boolean;
  hasTeamIdentity: boolean;
  hasWorkflowCustomization: boolean;
  hasMultiTeam: boolean;
  /** Gates users.exercisePageTheme (see shared/schema.ts) -- distinct from
   * hasCustomColors, which only governs the org-wide header/nav re-skin. */
  hasPersonalPage: boolean;
}

const UNLIMITED_ENTITLEMENTS: Entitlements = {
  athleteCap: null,
  hasCustomColors: true,
  hasTeamIdentity: true,
  hasWorkflowCustomization: true,
  hasMultiTeam: true,
  hasPersonalPage: true,
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
    hasPersonalPage: Boolean(tier?.includesFullPersonalization) || hasFullBundle || addOns.has("personal_page"),
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
// null seatCap means "no roster" (a Free Agent).
export type CoachSeatCap = 15 | 50 | 100 | 250;

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
export async function createFreeAgentTierCheckout(
  userId: number,
  userEmail: string,
  tier: FreeAgentTierId,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResult> {
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

/** A coach organisation: the flat account fee, and nothing per athlete.
 *
 * ORG_PER_ATHLETE_CENTS is deliberately NOT billed here. That number is an
 * internal unit-cost figure -- what one athlete is modelled to cost Forge in
 * storage -- and it is used to sanity-check margin, not to charge per head.
 * Billing it as a Stripe seat line turned a cost metric into a price, which
 * is not the model. A coach pays one flat fee whatever their roster size.
 *
 * There is consequently nothing to keep in sync with the roster: no seat
 * quantity exists on the subscription for a roster change to move. */
export async function createCoachSubscriptionCheckout(
  userId: number,
  userEmail: string,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResult> {
  const stripe = getStripeClient();
  if (!stripe) return { error: "Billing isn't configured yet." };
  const basePrice = coachBasePriceId();
  if (!basePrice) return { error: "No Stripe price configured for coach plans yet." };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(await baseSessionParams(userId, userEmail)),
    line_items: [{ price: basePrice, quantity: 1 }],
    metadata: { kind: "coach_subscription", userId: String(userId) },
    subscription_data: { metadata: { kind: "coach_subscription", userId: String(userId) } },
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
        break;
      }

      if (typeof session.subscription !== "string") break;
      // What they actually bought. Without this the subscription row goes
      // active carrying whatever tier it was created with, so a Free Agent
      // who paid for AI Coach + Video would be entitled to the cheapest
      // tier -- the money arrives and the access does not match it.
      //
      // subscriptions.tier is the column every gate actually reads
      // (hasAthletePaidForAiAccess and hasCoachesCornerAccess in routes.ts both
      // test sub.tier === "pro"); users.freeAgentTier is read back by the admin
      // screens but gates nothing. Writing only freeAgentTier left the whole
      // Stripe web-checkout path paying money for no access -- the Apple IAP
      // path has always written both (storage.applyAppleIapVerification), so
      // this mirrors it rather than inventing a second vocabulary.
      const purchasedFreeAgentTier =
        kind === "free_agent_tier" && session.metadata?.tier && session.metadata.tier in FREE_AGENT_TIERS
          ? (session.metadata.tier as FreeAgentTierId)
          : null;
      await storage.updateSubscriptionByUserId(userId, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: session.subscription,
        status: "active",
        ...(purchasedFreeAgentTier
          ? {
              accountType: "free_agent" as const,
              tier: entitlementTierForFreeAgentTier(purchasedFreeAgentTier),
            }
          : {}),
      });
      if (purchasedFreeAgentTier) {
        await storage.updateFreeAgentBilling(userId, { freeAgentTier: purchasedFreeAgentTier });
      }
      await storage.logBillingEvent(userId, event.type, { sessionId: session.id, kind }, event.id);
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
      if (updated) await storage.logBillingEvent(updated.userId, event.type, { subscriptionId: sub.id }, event.id);
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
