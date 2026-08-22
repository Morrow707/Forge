import Stripe from "stripe";
import { storage } from "./storage";

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

// Target pricing shown on the landing page and used to create Stripe
// Prices once a real account exists -- cents, since Stripe (and money in
// general) shouldn't be represented as floats. iOS prices are higher than
// the web/Stripe price for the same tier, the standard "offset Apple's
// ~30% commission" pattern -- see server/apple-iap.ts for the App Store
// side of this. Off-season hibernation is intentionally NOT priced here:
// it's a free status (see subscriptionStatusEnum's "hibernating" value),
// not a paid add-on -- an earlier draft of this pricing had a paid
// hibernation tier and it was deliberately dropped as a retention risk
// (charging someone to merely view their own past data).
export const PRICING = {
  free_agent: {
    base: { web_cents: 2999, ios_cents: 3999 },
    pro: { web_cents: 3999, ios_cents: 4999 },
  },
  coach: {
    15: { base_cents: 4999, pro_cents: 7999 },
    50: { base_cents: 9999, pro_cents: 14999 },
    100: { base_cents: 14999, pro_cents: 24999 },
    250: { base_cents: 29999, pro_cents: 49999 },
  },
} as const;

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

/** Scaffolding for a real Stripe Checkout redirect -- unusable until
 * STRIPE_SECRET_KEY and real Stripe Price IDs exist for each tier (see
 * PRICING above; this function doesn't create Prices, a real launch would
 * set those up once in the Stripe dashboard and reference the ids here). */
export async function createCheckoutSession(
  userId: number,
  userEmail: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string } | { error: string }> {
  const stripe = getStripeClient();
  if (!stripe) return { error: "Billing isn't configured yet." };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: userEmail,
    client_reference_id: String(userId),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  if (!session.url) return { error: "Stripe didn't return a checkout URL." };
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
export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = Number(session.client_reference_id);
      if (!Number.isInteger(userId) || typeof session.subscription !== "string") break;
      await storage.updateSubscriptionByStripeId(session.subscription, {
        stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
        stripeSubscriptionId: session.subscription,
        status: "active",
      });
      await storage.logBillingEvent(userId, event.type, { sessionId: session.id });
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const updated = await storage.updateSubscriptionByStripeId(sub.id, {
        status: sub.status === "past_due" ? "past_due" : sub.status === "active" ? "active" : undefined,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodEnd: new Date(sub.items.data[0]?.current_period_end * 1000),
      });
      if (updated) await storage.logBillingEvent(updated.userId, event.type, { subscriptionId: sub.id });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const updated = await storage.updateSubscriptionByStripeId(sub.id, { status: "canceled" });
      if (updated) await storage.logBillingEvent(updated.userId, event.type, { subscriptionId: sub.id });
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
      if (updated) await storage.logBillingEvent(updated.userId, event.type, { invoiceId: invoice.id });
      break;
    }
    default:
      break;
  }
}
