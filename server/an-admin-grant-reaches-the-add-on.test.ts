import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  addOnIsActive,
  reconcileAdminAddOnSave,
  withinRefundWindow,
  type AddOnTerms,
} from "@shared/add-on-terms";

/**
 * AN ADMIN'S TICK-BOX GRANTS THE ADD-ON, AND A REMOVAL SAYS WHAT IT LEFT RUNNING.
 *
 * Found 2026-10-14, sweeping the billing line. The admin billing panel is the only way an
 * add-on is ever comped, and it wrote ONE of the two places add-on state lives: the owned array
 * (users.freeAgentAddOns / users.billingAddOns). The other is users.addOnTerms, which
 * addOnIsActive asks second -- and where a refund stamp is final and a cancellation's
 * accessUntil can already be in the past. So:
 *
 *   - Ticking the box for a REFUNDED add-on saved cleanly, read back ticked, and granted
 *     nothing. For good: nothing else in the repo clears refundedAt.
 *   - Re-ticking one whose paid month had run out did the same.
 *   - Un-ticking a store-bought one closed access and left the provider charging the card,
 *     with the screen saying only "Billing updated".
 *
 * The first two are the class CLAUDE.md names five times over -- a writer that touches one of
 * the two places a fact lives, invisible because the surface reads back the half it wrote.
 *
 * THE SHAPE OF THE FIX IS "AN ADMIN GRANT IS NOT A PURCHASE": clear the stamps that make the
 * grant inert, invent nothing in their place. No fresh purchasedAt (that would open a 72-hour
 * refund window on money nobody paid) and no provider handle (Forge has not sold anything).
 * And a removal is REPORTED, never acted on -- this server does not cancel a customer's
 * subscription as a side effect of a checkbox.
 *
 * Every assertion about whether an add-on works asks addOnIsActive, the real reader, rather
 * than re-stating its rule here. A test that reimplements the thing it is checking passes
 * against a broken implementation, which is how a mutation slipped through this same sweep
 * once already.
 */

const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("an admin's grant reaches an add-on the terms had switched off", () => {
  it("re-grants a REFUNDED add-on, where ticking the box alone granted nothing", () => {
    const terms: AddOnTerms = {
      all_classes: {
        purchasedAt: iso(Date.now() - 400 * HOUR),
        refundedAt: iso(Date.now() - 300 * HOUR),
      },
    };
    // What the panel did before the fix: the array gains the id, the terms are untouched.
    expect(addOnIsActive(["all_classes"], terms, "all_classes")).toBe(false);

    const save = reconcileAdminAddOnSave(terms, [], ["all_classes"]);
    expect(save.granted).toEqual(["all_classes"]);
    expect(addOnIsActive(["all_classes"], save.terms, "all_classes")).toBe(true);
  });

  it("re-grants one whose cancelled month has already run out", () => {
    const terms: AddOnTerms = {
      coaches_corner: {
        purchasedAt: iso(Date.now() - 800 * HOUR),
        accessUntil: iso(Date.now() - HOUR),
      },
    };
    expect(addOnIsActive(["coaches_corner"], terms, "coaches_corner")).toBe(false);

    const save = reconcileAdminAddOnSave(terms, ["coaches_corner"], ["coaches_corner"]);
    expect(save.granted).toEqual(["coaches_corner"]);
    expect(addOnIsActive(["coaches_corner"], save.terms, "coaches_corner")).toBe(true);
  });

  it("does not invent a purchase: the refund window stays shut on a comped add-on", () => {
    // A fresh purchasedAt would make withinRefundWindow true, and the cancel route would offer
    // a refund of money nobody paid.
    const purchasedAt = iso(Date.now() - 400 * HOUR);
    const terms: AddOnTerms = { all_classes: { purchasedAt, refundedAt: iso(Date.now()) } };

    const save = reconcileAdminAddOnSave(terms, [], ["all_classes"]);
    expect(save.terms!.all_classes.purchasedAt).toBe(purchasedAt);
    expect(withinRefundWindow(save.terms!.all_classes)).toBe(false);
  });

  it("keeps the provider handle, so a subscription Forge may still need is not forgotten", () => {
    const terms: AddOnTerms = {
      coaches_corner: {
        purchasedAt: iso(Date.now() - 400 * HOUR),
        refundedAt: iso(Date.now()),
        stripeSubscriptionId: "sub_live_1",
      },
    };
    const save = reconcileAdminAddOnSave(terms, [], ["coaches_corner"]);
    expect(save.terms!.coaches_corner.stripeSubscriptionId).toBe("sub_live_1");
  });

  it("leaves the column alone when nothing was switched off", () => {
    // The ordinary save -- an admin ticking a box on an account with no term history at all,
    // which is most of them. A write here would rewrite addOnTerms to itself on every save.
    const save = reconcileAdminAddOnSave(null, [], ["all_classes"]);
    expect(save.granted).toEqual([]);
    expect(save.terms).toBeUndefined();
    // And it is live regardless: no term means owned is all there is to go on.
    expect(addOnIsActive(["all_classes"], null, "all_classes")).toBe(true);
  });

  it("does not disturb the OTHER add-ons' terms while granting one", () => {
    const other = { purchasedAt: iso(Date.now() - 10 * HOUR), stripeSubscriptionId: "sub_other" };
    const terms: AddOnTerms = {
      all_classes: { purchasedAt: iso(Date.now() - 400 * HOUR), refundedAt: iso(Date.now()) },
      golf_swing: other,
    };
    const save = reconcileAdminAddOnSave(terms, ["golf_swing"], ["all_classes", "golf_swing"]);
    expect(save.terms!.golf_swing).toEqual(other);
  });
});

describe("a removal says what it left billing", () => {
  it("names the Stripe subscription still charging the card", () => {
    const terms: AddOnTerms = {
      coaches_corner: { purchasedAt: iso(Date.now()), stripeSubscriptionId: "sub_live_1" },
    };
    const save = reconcileAdminAddOnSave(terms, ["coaches_corner"], []);
    expect(save.stillBilling).toEqual([
      { addOnId: "coaches_corner", stripeSubscriptionId: "sub_live_1" },
    ]);
  });

  it("names an Apple subscription too, which this server cannot cancel at all", () => {
    const terms: AddOnTerms = {
      all_classes: { purchasedAt: iso(Date.now()), appleOriginalTransactionId: "2000000111" },
    };
    const save = reconcileAdminAddOnSave(terms, ["all_classes"], []);
    expect(save.stillBilling).toEqual([
      { addOnId: "all_classes", appleOriginalTransactionId: "2000000111" },
    ]);
  });

  it("says nothing about an add-on an admin granted in the first place", () => {
    // No provider handle means nobody is being charged, so there is nothing for an operator to
    // go and stop. A warning here would be noise on the commonest action this panel performs.
    const terms: AddOnTerms = { all_classes: { purchasedAt: iso(Date.now()) } };
    const save = reconcileAdminAddOnSave(terms, ["all_classes"], []);
    expect(save.stillBilling).toEqual([]);
  });

  it("says nothing about one that was already refunded", () => {
    const terms: AddOnTerms = {
      all_classes: {
        purchasedAt: iso(Date.now() - 400 * HOUR),
        refundedAt: iso(Date.now() - 300 * HOUR),
        stripeSubscriptionId: "sub_refunded",
      },
    };
    const save = reconcileAdminAddOnSave(terms, ["all_classes"], []);
    expect(save.stillBilling).toEqual([]);
  });

  it("reports a grant and a removal made in the same save", () => {
    const terms: AddOnTerms = {
      all_classes: { purchasedAt: iso(Date.now() - 400 * HOUR), refundedAt: iso(Date.now()) },
      coaches_corner: { purchasedAt: iso(Date.now()), stripeSubscriptionId: "sub_live_1" },
    };
    const save = reconcileAdminAddOnSave(terms, ["coaches_corner"], ["all_classes"]);
    expect(save.granted).toEqual(["all_classes"]);
    expect(save.stillBilling.map((e) => e.addOnId)).toEqual(["coaches_corner"]);
  });
});

describe("both admin writers go through the one rule", () => {
  const storageSrc = readFileSync(join(import.meta.dirname, "storage.ts"), "utf8");

  function writerBody(name: string) {
    const start = storageSrc.indexOf(`async ${name}(`);
    expect(start, `${name} not found in storage.ts`).toBeGreaterThan(-1);
    // To the next method on the storage object, so an assertion cannot be satisfied by code
    // that happens to sit below this one.
    const end = storageSrc.indexOf("\n  },\n", start);
    return storageSrc.slice(start, end);
  }

  for (const [name, column] of [
    ["updateCoachBilling", "billingAddOns"],
    ["updateFreeAgentBilling", "freeAgentAddOns"],
  ] as const) {
    it(`${name} reconciles the terms and writes addOnTerms`, () => {
      const body = writerBody(name);
      expect(body).toMatch(/reconcileAdminAddOnSave\(/);
      // Re-pointed 2026-10-15, not relaxed: the read and the write moved inside
      // mutateAddOnsAtomically (see every-add-on-write-takes-the-lock.test.ts), so the reconcile's
      // terms are now spread into that transaction's patch under the name `decided` rather than
      // assigned from a `save` built one statement earlier. Same assertion -- the reconciled
      // terms reach the addOnTerms column -- against the shape that performs it.
      expect(body).toMatch(/decided\.terms !== undefined && \{ addOnTerms: decided\.terms \}/);
      expect(body).toMatch(/mutateAddOnsAtomically\(/);
      expect(body).toMatch(new RegExp(`values\\.${column} !== undefined`));
      // The result reaches the caller, or the screen cannot say what is still billing.
      expect(body).toMatch(/addOnsStillBilling/);
    });
  }

  it("warns about a CLEARED PLAN the same way, which the add-on half did and the tier never did", () => {
    // The asymmetry the 2026-10-15 audit named. Un-ticking an add-on has warned since 2026-10-14;
    // setting a tier or a band to null closed access and said nothing, while the card went on
    // being charged. Same rule, same reason: this server does not cancel somebody's subscription
    // as a side effect of an admin's dropdown, so it reports and hands over the handle.
    for (const name of ["updateFreeAgentBilling", "updateCoachBilling"]) {
      const body = writerBody(name);
      expect(body, name).toContain("liveSubscriptionHandleFor");
      expect(body, name).toContain('"plan.cleared_by_admin_still_billing"');
      expect(body, name).toContain("planStillBilling");
      // Only on a CLEAR. Assigning a tier is not the case this is about, and warning on every
      // save would make the real one noise.
      expect(body, name).toMatch(/if \(values\.(freeAgentTier|billingTier) === null\) \{/);
    }
  });

  it("only counts a subscription a provider is actually charging for", () => {
    // A cancelled or incomplete row, and a row with no provider id, are nothing for an operator
    // to chase -- a warning about those is the kind nobody reads twice.
    const fn = writerBody("liveSubscriptionHandleFor");
    expect(fn).not.toBe("");
    expect(fn).toContain('sub.status !== "active" && sub.status !== "trialing" && sub.status !== "past_due"');
    expect(fn).toContain("if (!sub) return null;");
  });

  it("the panel says it, and says which rail, because one of them it cannot act on", () => {
    const page = readFileSync(
      join(import.meta.dirname, "../client/src/components/admin-billing-assignment.tsx"),
      "utf8",
    );
    expect(page).toContain("reportPlanStillBilling(result.planStillBilling)");
    // An App Store subscription cannot be cancelled from here by anyone but the buyer.
    expect(page).toContain("iOS Settings");
    expect(page).toContain("Stripe dashboard");
    expect(page).toContain("duration: 30000");
  });

  it("logs every grant and warns loudly about every removal that left a subscription", () => {
    const body = writerBody("_logAdminAddOnSave");
    expect(body).toMatch(/add_on\.granted_by_admin/);
    expect(body).toMatch(/add_on\.removed_by_admin_still_billing/);
    // LOUD: nothing else in the system notices, and the card keeps being charged.
    expect(body).toMatch(/console\.warn\(/);
  });

  it("is the only thing that sends those writers an add-on array", () => {
    // THE INVARIANT THE FIX RESTS ON. The writers treat "an add-on array arrived" as "an admin
    // saved the panel", because every other caller patches the tier or the beta flag alone and
    // a real purchase goes through addFreeAgentAddOn / addCoachBillingAddOn. Discovered from
    // the directory rather than held as a list, so a new caller cannot slip past by being
    // somewhere nobody thought to look.
    const dir = import.meta.dirname;
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") || file.includes(".test.") || file.includes(".itest.")) continue;
      if (file === "routes.ts") continue; // the admin routes themselves
      const src = readFileSync(join(dir, file), "utf8");
      for (const writer of ["updateCoachBilling", "updateFreeAgentBilling"]) {
        let at = src.indexOf(`${writer}(`);
        while (at !== -1) {
          const call = src.slice(at, at + 300);
          if (/freeAgentAddOns|billingAddOns/.test(call)) offenders.push(`${file}: ${writer}`);
          at = src.indexOf(`${writer}(`, at + 1);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the admin panel says what the removal left running", () => {
  const panel = readFileSync(
    join(import.meta.dirname, "..", "client", "src", "components", "admin-billing-assignment.tsx"),
    "utf8",
  );

  it("reads the save's answer on both forms rather than discarding it", () => {
    // Both mutations used to `await apiRequest(...)` and throw the body away, which is why the
    // screen could only ever say "Billing updated".
    expect(panel.match(/reportStillBilling\(result\.addOnsStillBilling\)/g)).toHaveLength(2);
    expect(panel).toMatch(/await res\.json\(\)/);
  });

  it("warns rather than reporting a cancellation that did not happen", () => {
    expect(panel).toMatch(/toast\.warning\(/);
    expect(panel).toMatch(/still billing/i);
    // Long enough to read: this is an instruction to go and do something elsewhere.
    expect(panel).toMatch(/duration: 30000/);
  });
});
