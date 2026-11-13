import { describe, expect, it } from "vitest";
import { checkoutReceipt } from "./checkout-receipt";

describe("the receipt a buyer sees before checkout", () => {
  it("reads as normal with no code: the price today and each month", () => {
    const r = checkoutReceipt(499, null);
    expect(r.dueTodayCents).toBe(499);
    expect(r.discount).toBeNull();
    expect(r.summary).toBe("$4.99 today, then $4.99 each month until you cancel.");
  });
  it("is $0 today on a 30-day free code, and says a card is still needed", () => {
    const r = checkoutReceipt(1999, { code: "LAUNCH30", percentOff: 100, months: 1 });
    expect(r.dueTodayCents).toBe(0);
    expect(r.discountCentsPerMonth).toBe(1999);
    expect(r.fullPriceStartsAfterMonths).toBe(1);
    expect(r.summary).toContain("$0.00 today");
    expect(r.summary).toContain("first month is free");
    expect(r.summary).toContain("card is needed");
  });
  it("60 and 90 days are two and three free bills", () => {
    expect(checkoutReceipt(999, { code: "A", percentOff: 100, months: 2 }).summary).toContain("first 2 months are free");
    expect(checkoutReceipt(999, { code: "A", percentOff: 100, months: 3 }).fullPriceStartsAfterMonths).toBe(3);
  });
  it("a fraction off charges the rest, rounded as Stripe rounds", () => {
    const half = checkoutReceipt(1999, { code: "HALF", percentOff: 50, months: 3 });
    expect(half.discountCentsPerMonth).toBe(1000);
    expect(half.dueTodayCents).toBe(999);
    expect(half.summary).toBe("$9.99 today and for the first 3 months, then $19.99 each month until you cancel.");
    expect(checkoutReceipt(499, { code: "Q", percentOff: 25, months: 1 }).dueTodayCents).toBe(374);
  });
  it("never goes below zero or above the price", () => {
    expect(checkoutReceipt(499, { code: "X", percentOff: 250, months: 0 }).dueTodayCents).toBe(0);
  });
});
