import { describe, it, expect } from "vitest";
import { describePromoCode, promoDiscountMonths, promoPercentOff, promoAudienceOf, promoKindOf } from "./promo-codes";

/* Scott, 2026-10-16: "one month free for new users would be different than 50% off for existing
 * users, a 4th of July sale might be 50% off where a new years/Christmas sale might be one month
 * free for all users." The two choices an admin makes, and what each reads as. */
describe("what a promo code says it gives, and to whom", () => {
  const launch = { audience: "new_accounts", kind: "free_time", trialDays: 30, percentOff: null, discountMonths: null };
  const july = { audience: "everyone", kind: "percent_off", trialDays: 0, percentOff: 50, discountMonths: 1 };
  const xmas = { audience: "everyone", kind: "free_time", trialDays: 30, percentOff: null, discountMonths: null };

  it("a launch month is free time from the signup, for new accounts", () => {
    expect(describePromoCode(launch)).toBe("1 month free from the signup date, new accounts");
  });

  it("a Fourth of July sale is a percentage off for everyone", () => {
    expect(describePromoCode(july)).toBe("50% off for 1 month, any account");
    expect(promoPercentOff(july)).toBe(50);
    expect(promoDiscountMonths(july)).toBe(1);
  });

  it("a Christmas month is free time from the redemption, for everyone", () => {
    expect(describePromoCode(xmas)).toBe("1 month free from the day it is redeemed, any account");
    // On a card plan the free month is a 100% coupon for one billing month.
    expect(promoPercentOff(xmas)).toBe(100);
    expect(promoDiscountMonths(xmas)).toBe(1);
  });

  it("free days that are not a whole month read as days, and round to months for a card", () => {
    expect(describePromoCode({ ...launch, trialDays: 14 })).toBe("14 days free from the signup date, new accounts");
    expect(promoDiscountMonths({ ...launch, trialDays: 14 })).toBe(1);
    expect(promoDiscountMonths({ ...launch, trialDays: 60 })).toBe(2);
    expect(describePromoCode({ ...launch, trialDays: 60 })).toBe("2 months free from the signup date, new accounts");
  });

  it("a row from before the columns existed reads as the only kind there was", () => {
    expect(promoAudienceOf({ audience: "" })).toBe("new_accounts");
    expect(promoKindOf({ kind: "" })).toBe("free_time");
  });
});
