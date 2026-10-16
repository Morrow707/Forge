/**
 * TWO KINDS OF CODE, TWO AUDIENCES (2026-10-16).
 *
 * Scott: "if I give a 50% off or a one month free give the admin the option, one month free for
 * new users would be different than 50% off for existing users, a 4th of July sale might be 50%
 * off where a new years/Christmas sale might be one month free for all users." And: "Obviously
 * they have to type the code in to redeem it, but, gives us the option."
 *
 * So every code is typed in to redeem, and the admin chooses two things when creating it:
 *
 *   AUDIENCE  "new_accounts"  only an account younger than its window; free time counts from
 *                             the SIGNUP (shared/promo-trial.ts), so a launch code gives a month
 *                             from the day the account was made whenever it is typed.
 *             "everyone"      any account, old or new; free time counts from the REDEMPTION.
 *
 *   KIND      "free_time"     trialDays of full access. For an account nobody bills, that is
 *                             the trial column (the coach's users.trialExpiresAt, the Free
 *                             Agent's subscriptions row). For an account Forge bills by CARD it
 *                             is a 100%-off Stripe coupon for that many months on every live
 *                             subscription, so the card is not charged for the free time.
 *             "percent_off"   percentOff off the next discountMonths on every subscription
 *                             Forge bills by card, applied the moment the code is typed. An
 *                             account with no card subscription yet is told to type the same
 *                             code on the checkout page: the code is created at Stripe as a
 *                             promotion code too, so the checkout honours it.
 *
 * WHAT FORGE CANNOT DO, said on the screen rather than pretended: a plan billed through the
 * App Store is Apple's, and only Apple's offer-code sheet can discount it. The admin copy says
 * to create the same code as an App Store offer code; a redemption on an Apple-billed account
 * says to use the sheet in the app.
 */

export const PROMO_AUDIENCES = ["new_accounts", "everyone"] as const;
export type PromoAudience = (typeof PROMO_AUDIENCES)[number];

export const PROMO_KINDS = ["free_time", "percent_off"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

/** How long after signup a "new_accounts" PERCENT-OFF code can still be typed. A free-time
 *  code's window is its own free days (a 30-day code is redeemable for 30 days, after which it
 *  has nothing left to give); a discount has no such length, so it borrows the default. */
export const NEW_ACCOUNT_WINDOW_DAYS = 30;

export interface PromoCodeShape {
  audience: string;
  kind: string;
  trialDays: number;
  percentOff: number | null;
  discountMonths: number | null;
}

export function promoAudienceOf(record: Pick<PromoCodeShape, "audience">): PromoAudience {
  return record.audience === "everyone" ? "everyone" : "new_accounts";
}

export function promoKindOf(record: Pick<PromoCodeShape, "kind">): PromoKind {
  return record.kind === "percent_off" ? "percent_off" : "free_time";
}

/** The number of billing months a card discount runs: the stated months for a percent-off
 *  code, the free days rounded to whole months (at least one) for a free-time code. */
export function promoDiscountMonths(record: PromoCodeShape): number {
  if (promoKindOf(record) === "percent_off") return Math.max(1, record.discountMonths ?? 1);
  return Math.max(1, Math.round(record.trialDays / 30));
}

/** The percentage a card discount takes off: 100 for free time. */
export function promoPercentOff(record: PromoCodeShape): number {
  return promoKindOf(record) === "percent_off" ? Math.min(100, Math.max(1, record.percentOff ?? 0)) : 100;
}

/** One sentence for the admin list and for a redeemer: what the code gives, to whom. */
export function describePromoCode(record: PromoCodeShape): string {
  const who = promoAudienceOf(record) === "everyone" ? "any account" : "new accounts";
  if (promoKindOf(record) === "percent_off") {
    const months = promoDiscountMonths(record);
    return `${promoPercentOff(record)}% off for ${months} month${months === 1 ? "" : "s"}, ${who}`;
  }
  const days = record.trialDays;
  const span = days % 30 === 0 && days > 0 ? `${days / 30} month${days === 30 ? "" : "s"}` : `${days} days`;
  return promoAudienceOf(record) === "everyone"
    ? `${span} free from the day it is redeemed, ${who}`
    : `${span} free from the signup date, ${who}`;
}
