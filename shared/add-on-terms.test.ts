import { describe, it, expect } from "vitest";
import {
  addOnIsActive,
  activeAddOns,
  withinRefundWindow,
  ADD_ON_REFUND_WINDOW_HOURS,
  ADD_ON_CANCELLATION_POLICY,
  type AddOnTerms,
} from "./add-on-terms";
import { ALL_ADD_ON_IDS } from "./billing-tiers";
import { FREE_AGENT_ADD_ON_ORDER } from "./free-agent-tiers";

/**
 * SCOTT'S TWO RULES, IN HIS OWN TERMS (2026-10-11).
 *
 *  "give them until the next billing cycle to have it as the billing is a month, so if they buy
 *   it the 16th, remove it the 1st, they have until the 16th to use it again with no refund"
 *  "lets add too they have a 72 hour refund policy, if something is refunded then they don't
 *   have access obviously"
 *
 * His own worked example is the first test, because a date arithmetic rule is only as good as
 * the case the person asking had in mind.
 */

const AT = (iso: string) => new Date(iso);
const BOUGHT_16TH = "2026-10-16T12:00:00.000Z";
const CANCELLED_TO = "2026-11-16T12:00:00.000Z"; // the end of the month that was paid for

describe("Scott's worked example: bought the 16th, cancelled the 1st", () => {
  const terms: AddOnTerms = {
    all_classes: { purchasedAt: BOUGHT_16TH, accessUntil: CANCELLED_TO },
  };
  const owned = ["all_classes"];

  it("still works on the 1st, when they cancelled", () => {
    expect(addOnIsActive(owned, terms, "all_classes", AT("2026-11-01T12:00:00.000Z"))).toBe(true);
  });

  it("still works on the 15th, the day before the month runs out", () => {
    expect(addOnIsActive(owned, terms, "all_classes", AT("2026-11-15T23:59:00.000Z"))).toBe(true);
  });

  it("stops on the 16th, when the paid month ends", () => {
    expect(addOnIsActive(owned, terms, "all_classes", AT("2026-11-16T12:00:01.000Z"))).toBe(false);
  });

  it("is over for good after that, not merely lapsed for a day", () => {
    expect(addOnIsActive(owned, terms, "all_classes", AT("2027-03-01T00:00:00.000Z"))).toBe(false);
  });
});

describe("a refund ends it at once", () => {
  it("beats a future access date, because the money went back", () => {
    // The whole point: a cancellation runs to the end of the paid month, a refund does not get
    // that month at all. Both facts can be on one record, and the refund has to win.
    const terms: AddOnTerms = {
      all_classes: {
        purchasedAt: BOUGHT_16TH,
        accessUntil: CANCELLED_TO,
        refundedAt: "2026-10-17T09:00:00.000Z",
      },
    };
    expect(addOnIsActive(["all_classes"], terms, "all_classes", AT("2026-10-18T00:00:00.000Z"))).toBe(false);
  });

  it("is refusable even on the day of purchase", () => {
    const terms: AddOnTerms = {
      all_classes: { purchasedAt: BOUGHT_16TH, refundedAt: BOUGHT_16TH },
    };
    expect(addOnIsActive(["all_classes"], terms, "all_classes", AT(BOUGHT_16TH))).toBe(false);
  });
});

describe("the 72-hour refund window", () => {
  it("is 72 hours, and open inside it", () => {
    expect(ADD_ON_REFUND_WINDOW_HOURS).toBe(72);
    const term = { purchasedAt: BOUGHT_16TH };
    expect(withinRefundWindow(term, AT("2026-10-19T11:59:00.000Z"))).toBe(true);
  });

  it("is closed the moment it passes", () => {
    const term = { purchasedAt: BOUGHT_16TH };
    expect(withinRefundWindow(term, AT("2026-10-19T12:00:01.000Z"))).toBe(false);
  });

  it("is closed, not open, when there is no purchase time to measure from", () => {
    // Failing open here would make the promise unbounded on exactly the records that cannot say
    // when the money moved. A human can still refund by hand; this governs the self-serve path.
    expect(withinRefundWindow(undefined)).toBe(false);
    expect(withinRefundWindow({ purchasedAt: "" })).toBe(false);
    expect(withinRefundWindow({ purchasedAt: "not a date" })).toBe(false);
  });
});

describe("the parts that have to hold for the storage to be safe", () => {
  it("answers no for an add-on that was never bought", () => {
    expect(addOnIsActive([], {}, "all_classes")).toBe(false);
    expect(addOnIsActive(null, null, "all_classes")).toBe(false);
  });

  it("answers yes for one bought before terms were ever recorded", () => {
    // Every add-on owned before 2026-10-11 has no record. Owned is all there is to go on, and
    // treating those as cancelled would take away products people had paid for.
    expect(addOnIsActive(["coaches_corner"], null, "coaches_corner")).toBe(true);
    expect(addOnIsActive(["coaches_corner"], {}, "coaches_corner")).toBe(true);
  });

  it("keeps access when the end date is unreadable", () => {
    // A cancellation record, not a refund: the month was paid for and not returned, so the
    // failure that costs somebody something they bought is the wrong one to pick.
    const terms: AddOnTerms = { all_classes: { purchasedAt: BOUGHT_16TH, accessUntil: "garbage" } };
    expect(addOnIsActive(["all_classes"], terms, "all_classes")).toBe(true);
  });

  it("lists exactly the live ones", () => {
    const terms: AddOnTerms = {
      all_classes: { purchasedAt: BOUGHT_16TH, accessUntil: CANCELLED_TO },
      hitting: { purchasedAt: BOUGHT_16TH, refundedAt: BOUGHT_16TH },
    };
    const owned = ["all_classes", "hitting", "pitching"];
    expect(activeAddOns(owned, terms, AT("2026-11-01T00:00:00.000Z")).sort()).toEqual([
      "all_classes",
      "pitching",
    ]);
    expect(activeAddOns(owned, terms, AT("2026-12-01T00:00:00.000Z"))).toEqual(["pitching"]);
  });

  it("has disjoint coach and Free Agent id sets, which is what lets ONE column serve both", () => {
    // users.addOnTerms is keyed by add-on id with no role beside it, so a collision would make
    // one coach's record and one athlete's record the same record. This is the assertion that
    // turns that from a silent data bug into a failing test.
    const overlap = (ALL_ADD_ON_IDS as readonly string[]).filter((id) =>
      (FREE_AGENT_ADD_ON_ORDER as readonly string[]).includes(id),
    );
    expect(overlap).toEqual([]);
  });

  it("states the policy once, with the real window in it", () => {
    expect(ADD_ON_CANCELLATION_POLICY).toContain(String(ADD_ON_REFUND_WINDOW_HOURS));
    expect(ADD_ON_CANCELLATION_POLICY).toMatch(/end of the month/i);
    expect(ADD_ON_CANCELLATION_POLICY).toMatch(/straight away/i);
  });
});

describe("an add-on bought before terms were recorded never gains a fresh refund window", () => {
  // Fixed 2026-10-15 (the security review's item 7). nextAddOnTerms used to invent
  // `new Date()` as purchasedAt when a cancellation or refund first gave a pre-terms add-on a
  // term, so cancelling an add-on bought in September answered `refundable: true` that second.
  it("records the epoch, which is outside every window and honest about what is known", async () => {
    const { nextAddOnTerms, PURCHASED_BEFORE_TERMS_WERE_RECORDED } = await import("./add-on-terms");
    const terms = nextAddOnTerms(undefined, "all_classes", { accessUntil: CANCELLED_TO });
    expect(terms.all_classes.purchasedAt).toBe(PURCHASED_BEFORE_TERMS_WERE_RECORDED);
    expect(withinRefundWindow(terms.all_classes)).toBe(false);
    // It still parses, so a screen printing the date prints a date rather than crashing.
    expect(Number.isNaN(Date.parse(terms.all_classes.purchasedAt))).toBe(false);
  });

  it("a real purchase is unaffected: purchasedAt is what the purchase said", async () => {
    const { nextAddOnTerms } = await import("./add-on-terms");
    const terms = nextAddOnTerms(undefined, "all_classes", { purchasedAt: BOUGHT_16TH });
    expect(terms.all_classes.purchasedAt).toBe(BOUGHT_16TH);
    expect(withinRefundWindow(terms.all_classes, AT("2026-10-17T12:00:00.000Z"))).toBe(true);
  });

  it("and a prior purchase time is kept through a cancellation", async () => {
    const { nextAddOnTerms } = await import("./add-on-terms");
    const terms = nextAddOnTerms({ all_classes: { purchasedAt: BOUGHT_16TH } }, "all_classes", {
      accessUntil: CANCELLED_TO,
    });
    expect(terms.all_classes.purchasedAt).toBe(BOUGHT_16TH);
  });
});
