/**
 * REDEEMING A PROMO CODE: who may carry it, what it gives, which rail bills the account.
 *
 * shared/promo-codes.ts is the vocabulary (two audiences, two kinds) and the reason it exists;
 * shared/promo-trial.ts is the arithmetic of free time; storage.ts holds the queries; billing.ts
 * the Stripe half. This module is the one place the rules meet, called by the signup handler,
 * the coach's redeem route and the Free Agent's.
 *
 * The outcomes, each one a sentence the person sees:
 *
 *   - an account nobody bills            free time -> the trial column moves out
 *                                        percent off -> "type it at checkout" (nothing to discount yet)
 *   - an account billed by CARD          free time -> a 100% coupon for the months, on every live
 *                                                     Stripe subscription (the card is not charged)
 *                                        percent off -> the coupon on every live Stripe subscription
 *   - an account billed by the APP STORE both -> "use the App Store code sheet": only Apple can
 *                                                discount an Apple subscription, and saying so beats
 *                                                recording a redemption that changed nothing
 *
 * A redemption row is written only when something was given or applied, so a refusal never
 * spends a limited code.
 */
import { storage } from "./storage";
import { applyStripeCouponToSubscriptions, liveStripeSubscriptionIdsFor } from "./billing";
import { promoTrialEndFromSignup, promoTrialFor } from "@shared/promo-trial";
import {
  NEW_ACCOUNT_WINDOW_DAYS,
  promoAudienceOf,
  promoDiscountMonths,
  promoKindOf,
  promoPercentOff,
} from "@shared/promo-codes";

export type RedeemOutcome =
  | {
      ok: true;
      /** When full access now runs to, when the code moved a trial. Null when it discounted a card. */
      trialExpiresAt: Date | null;
      applied: "trial" | "card_discount";
      message: string;
    }
  | { ok: false; message: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function dateWord(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export async function redeemPromoCode(userId: number, code: string, now: Date = new Date()): Promise<RedeemOutcome> {
  const found = await storage.findRedeemableCode(code);
  if (!found.ok) return found;
  const record = found.record;
  if (await storage.hasRedeemedCode(userId, record.id)) {
    return { ok: false, message: "You've already redeemed this code" };
  }
  const user = await storage.getUser(userId);
  if (!user) return { ok: false, message: "That code isn't valid" };

  const audience = promoAudienceOf(record);
  const kind = promoKindOf(record);

  // WHO CAN CARRY IT. A program's plan is the head coach's row, and a coached athlete's plan is
  // their program's -- on neither does a code have anything to unlock.
  if (user.role === "coach") {
    if ((await storage.getPrimaryCoachId(userId)) !== userId) {
      return { ok: false, message: "Your program's head coach holds the plan. Ask them to redeem it." };
    }
  } else if (user.role === "athlete") {
    if ((await storage.getCoachesForAthlete(userId)).length > 0) {
      return { ok: false, message: "Your coach's program covers your plan, so there's nothing for this code to unlock." };
    }
  } else {
    return { ok: false, message: "That code isn't valid for this account" };
  }

  // WHICH RAIL BILLS THIS ACCOUNT. A card subscription Forge can discount; an App Store one
  // only Apple can.
  const sub = await storage.getSubscriptionForUser(userId);
  const paying = sub != null && (sub.status === "active" || sub.status === "past_due");
  const onApple = paying && Boolean(sub!.appleOriginalTransactionId) && !sub!.stripeSubscriptionId;
  const cardSubscriptions = await liveStripeSubscriptionIdsFor(userId);

  if (kind === "percent_off") {
    if (audience === "new_accounts" && now.getTime() - user.createdAt.getTime() > NEW_ACCOUNT_WINDOW_DAYS * DAY_MS) {
      return {
        ok: false,
        message: `This code is for accounts in their first ${NEW_ACCOUNT_WINDOW_DAYS} days, and yours is older than that.`,
      };
    }
    if (onApple) {
      return {
        ok: false,
        message: "Your plan is billed through the App Store, so Forge can't discount it here. Use the App Store code button in the app instead.",
      };
    }
    if (cardSubscriptions.length === 0) {
      return {
        ok: false,
        message: `This code takes ${promoPercentOff(record)}% off a plan. Enter it on the checkout page when you buy one.`,
      };
    }
    if (!record.stripeCouponId) {
      return { ok: false, message: "This code isn't set up for card billing yet. Ask Forge support." };
    }
    const result = await applyStripeCouponToSubscriptions(userId, cardSubscriptions, record.stripeCouponId, record.code);
    if (result.applied.length === 0) {
      return { ok: false, message: "Couldn't apply the discount to your plan right now, try again." };
    }
    await storage.recordCodeRedemption(userId, record.id);
    const months = promoDiscountMonths(record);
    return {
      ok: true,
      trialExpiresAt: null,
      applied: "card_discount",
      message: `Code applied: ${promoPercentOff(record)}% off your plan for the next ${months} month${months === 1 ? "" : "s"}.`,
    };
  }

  // FREE TIME.
  if (onApple) {
    return {
      ok: false,
      message: "Your plan is billed through the App Store, so Forge can't give free time on it here. Use the App Store code button in the app instead.",
    };
  }
  if (paying && cardSubscriptions.length > 0) {
    // A card is being charged: the free time is a 100% coupon for the months, so the charge
    // stops rather than access being extended on top of a bill that keeps coming.
    if (!record.stripeCouponId) {
      return { ok: false, message: "This code isn't set up for card billing yet. Ask Forge support." };
    }
    const result = await applyStripeCouponToSubscriptions(userId, cardSubscriptions, record.stripeCouponId, record.code);
    if (result.applied.length === 0) {
      return { ok: false, message: "Couldn't apply the free time to your plan right now, try again." };
    }
    await storage.recordCodeRedemption(userId, record.id);
    const months = promoDiscountMonths(record);
    return {
      ok: true,
      trialExpiresAt: null,
      applied: "card_discount",
      message: `Code applied: your plan is free for the next ${months} month${months === 1 ? "" : "s"}.`,
    };
  }

  // Nobody bills this account: the free time is the trial column.
  let end: Date;
  if (audience === "new_accounts") {
    // Anchored to the SIGNUP, never the redemption (shared/promo-trial.ts).
    const verdict = promoTrialFor(user.createdAt, record.trialDays, now);
    if (!verdict.ok) return verdict;
    end = verdict.trialEndsAt;
  } else {
    // Anchored to the redemption, on top of any trial still running.
    const current =
      user.role === "coach" ? user.trialExpiresAt : sub?.status === "trialing" ? sub.trialEndsAt : null;
    const anchor = current && current.getTime() > now.getTime() ? current : now;
    end = promoTrialEndFromSignup(anchor, record.trialDays);
  }
  await storage.recordCodeRedemption(userId, record.id);
  const inForce =
    user.role === "coach" ? await storage.extendCoachTrial(userId, end) : await storage.extendFreeAgentTrial(userId, end);
  return {
    ok: true,
    trialExpiresAt: inForce,
    applied: "trial",
    message: `Code applied: full access is free through ${dateWord(inForce)}.`,
  };
}
