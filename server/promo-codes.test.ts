import { beforeEach, describe, expect, it, vi } from "vitest";

/* THE CARD-RAIL BRANCHES OF A REDEMPTION, with storage and Stripe stood in for. The database
 * branches (trials, windows, refusals that spend nothing) are driven for real in
 * a-launch-code-is-thirty-days-from-the-signup.itest.ts; the integration suite has no Stripe,
 * so what a coupon does to a paying account is proved here against a fake of billing.ts. */

const storageMock = vi.hoisted(() => ({
  findRedeemableCode: vi.fn(),
  hasRedeemedCode: vi.fn(),
  getUser: vi.fn(),
  getPrimaryCoachId: vi.fn(),
  getCoachesForAthlete: vi.fn(),
  getSubscriptionForUser: vi.fn(),
  recordCodeRedemption: vi.fn(),
  extendCoachTrial: vi.fn(),
  extendFreeAgentTrial: vi.fn(),
}));
const billingMock = vi.hoisted(() => ({
  liveStripeSubscriptionIdsFor: vi.fn(),
  applyStripeCouponToSubscriptions: vi.fn(),
}));
vi.mock("./storage", () => ({ storage: storageMock }));
vi.mock("./billing", () => billingMock);

import { redeemPromoCode } from "./promo-codes";

const NOW = new Date("2026-07-04T12:00:00.000Z");
const code = (over: Record<string, unknown> = {}) => ({
  id: 7,
  code: "JULY50",
  trialDays: 0,
  audience: "everyone",
  kind: "percent_off",
  percentOff: 50,
  discountMonths: 2,
  stripeCouponId: "coupon_july",
  stripePromotionCodeId: "promo_july",
  maxRedemptions: null,
  expiresAt: null,
  createdAt: NOW,
  ...over,
});
const freeAgent = (over: Record<string, unknown> = {}) => ({
  id: 42,
  role: "athlete",
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  trialExpiresAt: null,
  freeAgentAddOns: [],
  billingAddOns: [],
  addOnTerms: null,
  ...over,
});

beforeEach(() => {
  for (const fn of [...Object.values(storageMock), ...Object.values(billingMock)]) fn.mockReset();
  storageMock.hasRedeemedCode.mockResolvedValue(false);
  storageMock.getCoachesForAthlete.mockResolvedValue([]);
  storageMock.getPrimaryCoachId.mockImplementation(async (id: number) => id);
  storageMock.recordCodeRedemption.mockResolvedValue(undefined);
  storageMock.extendCoachTrial.mockImplementation(async (_id: number, end: Date) => end);
  storageMock.extendFreeAgentTrial.mockImplementation(async (_id: number, end: Date) => end);
  billingMock.liveStripeSubscriptionIdsFor.mockResolvedValue([]);
  billingMock.applyStripeCouponToSubscriptions.mockImplementation(async (_u: number, ids: string[]) => ({ applied: [...ids], failed: [] }));
});

describe("a percent-off code on an account paying by card", () => {
  it("puts the coupon on every live card subscription, records the redemption, and says so", async () => {
    storageMock.findRedeemableCode.mockResolvedValue({ ok: true, record: code() });
    storageMock.getUser.mockResolvedValue(freeAgent());
    storageMock.getSubscriptionForUser.mockResolvedValue({ status: "active", stripeSubscriptionId: "sub_tier", appleOriginalTransactionId: null });
    billingMock.liveStripeSubscriptionIdsFor.mockResolvedValue(["sub_tier", "sub_addon"]);
    const out = await redeemPromoCode(42, "july50", NOW);
    expect(out).toMatchObject({ ok: true, applied: "card_discount", trialExpiresAt: null });
    expect((out as { message: string }).message).toContain("50% off your plan for the next 2 months");
    expect(billingMock.applyStripeCouponToSubscriptions).toHaveBeenCalledWith(42, ["sub_tier", "sub_addon"], "coupon_july", "JULY50");
    expect(storageMock.recordCodeRedemption).toHaveBeenCalledWith(42, 7);
    // A discount never touches the trial columns.
    expect(storageMock.extendFreeAgentTrial).not.toHaveBeenCalled();
    expect(storageMock.extendCoachTrial).not.toHaveBeenCalled();
  });

  it("when Stripe reaches none of them, refuses and spends nothing", async () => {
    storageMock.findRedeemableCode.mockResolvedValue({ ok: true, record: code() });
    storageMock.getUser.mockResolvedValue(freeAgent());
    storageMock.getSubscriptionForUser.mockResolvedValue({ status: "active", stripeSubscriptionId: "sub_tier", appleOriginalTransactionId: null });
    billingMock.liveStripeSubscriptionIdsFor.mockResolvedValue(["sub_tier"]);
    billingMock.applyStripeCouponToSubscriptions.mockResolvedValue({ applied: [], failed: ["sub_tier"] });
    const out = await redeemPromoCode(42, "JULY50", NOW);
    expect(out.ok).toBe(false);
    expect(storageMock.recordCodeRedemption).not.toHaveBeenCalled();
  });

  it("a code created while Stripe was unreachable cannot discount a card, and says so rather than pretending", async () => {
    storageMock.findRedeemableCode.mockResolvedValue({ ok: true, record: code({ stripeCouponId: null }) });
    storageMock.getUser.mockResolvedValue(freeAgent());
    storageMock.getSubscriptionForUser.mockResolvedValue({ status: "active", stripeSubscriptionId: "sub_tier", appleOriginalTransactionId: null });
    billingMock.liveStripeSubscriptionIdsFor.mockResolvedValue(["sub_tier"]);
    const out = await redeemPromoCode(42, "JULY50", NOW);
    expect(out.ok).toBe(false);
    expect((out as { message: string }).message).toContain("card billing");
    expect(billingMock.applyStripeCouponToSubscriptions).not.toHaveBeenCalled();
  });
});

describe("a free-time code for everyone on an account paying by card", () => {
  it("is a 100% coupon for the months on the card plan, never a trial row over a live plan", async () => {
    storageMock.findRedeemableCode.mockResolvedValue({
      ok: true,
      record: code({ code: "XMAS30", kind: "free_time", trialDays: 30, percentOff: null, discountMonths: null, stripeCouponId: "coupon_xmas" }),
    });
    storageMock.getUser.mockResolvedValue(freeAgent({ role: "coach" }));
    storageMock.getSubscriptionForUser.mockResolvedValue({ status: "active", stripeSubscriptionId: "sub_program", appleOriginalTransactionId: null });
    billingMock.liveStripeSubscriptionIdsFor.mockResolvedValue(["sub_program"]);
    const out = await redeemPromoCode(42, "XMAS30", NOW);
    expect(out).toMatchObject({ ok: true, applied: "card_discount", trialExpiresAt: null });
    expect((out as { message: string }).message).toContain("free for the next 1 month");
    expect(billingMock.applyStripeCouponToSubscriptions).toHaveBeenCalledWith(42, ["sub_program"], "coupon_xmas", "XMAS30");
    expect(storageMock.extendCoachTrial).not.toHaveBeenCalled();
    expect(storageMock.recordCodeRedemption).toHaveBeenCalledWith(42, 7);
  });

  it("on an account nobody bills, moves the trial out from today on top of a trial still running", async () => {
    storageMock.findRedeemableCode.mockResolvedValue({
      ok: true,
      record: code({ code: "XMAS30", kind: "free_time", trialDays: 30, percentOff: null, discountMonths: null }),
    });
    const running = new Date("2026-07-10T12:00:00.000Z");
    storageMock.getUser.mockResolvedValue(freeAgent({ role: "coach", trialExpiresAt: running }));
    storageMock.getSubscriptionForUser.mockResolvedValue(undefined);
    const out = await redeemPromoCode(42, "XMAS30", NOW);
    expect(out.ok).toBe(true);
    // A month on top of July 10th, not on top of today: the running trial is not lost.
    expect(storageMock.extendCoachTrial).toHaveBeenCalledWith(42, new Date("2026-08-10T12:00:00.000Z"));
    expect(billingMock.applyStripeCouponToSubscriptions).not.toHaveBeenCalled();
  });
});

describe("a plan billed through the App Store", () => {
  it("is Apple's to discount: either kind is refused with the App Store sheet named, and nothing is spent", async () => {
    storageMock.getUser.mockResolvedValue(freeAgent());
    storageMock.getSubscriptionForUser.mockResolvedValue({ status: "active", stripeSubscriptionId: null, appleOriginalTransactionId: "2000000001" });
    for (const record of [code(), code({ kind: "free_time", trialDays: 30, percentOff: null })]) {
      storageMock.findRedeemableCode.mockResolvedValue({ ok: true, record });
      const out = await redeemPromoCode(42, record.code, NOW);
      expect(out.ok).toBe(false);
      expect((out as { message: string }).message).toContain("App Store");
    }
    expect(storageMock.recordCodeRedemption).not.toHaveBeenCalled();
    expect(billingMock.applyStripeCouponToSubscriptions).not.toHaveBeenCalled();
  });
});

describe("who may carry a code", () => {
  it("a staff coach is sent to the head coach, and a coached athlete to their program", async () => {
    storageMock.findRedeemableCode.mockResolvedValue({ ok: true, record: code() });
    storageMock.getUser.mockResolvedValue(freeAgent({ role: "coach" }));
    storageMock.getPrimaryCoachId.mockResolvedValue(1);
    expect((await redeemPromoCode(42, "JULY50", NOW)).ok).toBe(false);
    storageMock.getUser.mockResolvedValue(freeAgent());
    storageMock.getCoachesForAthlete.mockResolvedValue([{ id: 1 }]);
    const out = await redeemPromoCode(42, "JULY50", NOW);
    expect(out.ok).toBe(false);
    expect((out as { message: string }).message).toContain("coach's program");
    expect(storageMock.recordCodeRedemption).not.toHaveBeenCalled();
  });
});
