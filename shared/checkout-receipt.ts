/**
 * THE RECEIPT A BUYER SEES BEFORE CHECKOUT, and the one rule for what a code does to it.
 *
 * Scott, 2026-11-13: "show them the receipt, if they don't have a coupon code the receipt will
 * read as normal, pricing, and a checkout button, if they do have a coupon code the checkout
 * receipt should change to reflect that it will in fact be $0. Also we need to make sure that
 * stripe actually honors this, if it's 60 days, 90, a fraction off, whatever."
 *
 * Pure, so the server that builds the Stripe checkout and the screen that draws the receipt read
 * the same arithmetic. A code is a percentage off for a number of monthly bills: free time is
 * 100% off for its months (30 days is one bill, 60 two, 90 three), which is exactly the coupon
 * Forge creates at Stripe for the code, so what is drawn here is what the card is charged.
 */
export interface CheckoutDiscount {
  code: string;
  /** 1-100. 100 is free time. */
  percentOff: number;
  /** How many monthly bills the discount covers, at least one. */
  months: number;
}

export interface CheckoutReceipt {
  monthlyPriceCents: number;
  discount: CheckoutDiscount | null;
  /** Taken off each discounted bill. */
  discountCentsPerMonth: number;
  /** Charged to the card today. */
  dueTodayCents: number;
  /** Charged on each later discounted bill (the same as today's). */
  discountedMonthlyCents: number;
  /** The first bill at full price is this many months from today. */
  fullPriceStartsAfterMonths: number;
  /** One sentence saying what happens after the discount, or what the plan costs with none. */
  summary: string;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function checkoutReceipt(monthlyPriceCents: number, discount: CheckoutDiscount | null): CheckoutReceipt {
  if (!discount) {
    return {
      monthlyPriceCents,
      discount: null,
      discountCentsPerMonth: 0,
      dueTodayCents: monthlyPriceCents,
      discountedMonthlyCents: monthlyPriceCents,
      fullPriceStartsAfterMonths: 0,
      summary: `${dollars(monthlyPriceCents)} today, then ${dollars(monthlyPriceCents)} each month until you cancel.`,
    };
  }
  const percent = Math.min(100, Math.max(1, Math.round(discount.percentOff)));
  const months = Math.max(1, Math.round(discount.months));
  // Stripe rounds a percentage discount to the nearest cent, half up.
  const off = Math.min(monthlyPriceCents, Math.round((monthlyPriceCents * percent) / 100));
  const due = monthlyPriceCents - off;
  const span = months === 1 ? "month" : `${months} months`;
  const summary =
    due === 0
      ? `$0.00 today. Your first ${span} ${months === 1 ? "is" : "are"} free, then ${dollars(monthlyPriceCents)} each month until you cancel. A card is needed now so the plan can continue after the free time.`
      : `${dollars(due)} today${months > 1 ? ` and for the first ${span}` : ""}, then ${dollars(monthlyPriceCents)} each month until you cancel.`;
  return {
    monthlyPriceCents,
    discount: { code: discount.code, percentOff: percent, months },
    discountCentsPerMonth: off,
    dueTodayCents: due,
    discountedMonthlyCents: due,
    fullPriceStartsAfterMonths: months,
    summary,
  };
}
