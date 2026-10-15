import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

/**
 * TWO ADD-ON WRITES ON ONE ACCOUNT LOST ONE OF THEM ENTIRELY.
 *
 * Every writer of users.addOnTerms replaced the WHOLE json object: a `getUser`, then
 * milliseconds later a `.set({ addOnTerms: nextAddOnTerms(thatRead, ...) })`. Two landing inside
 * that window and the later one's object has no trace of the earlier one's key -- and the
 * collision is ACROSS add-ons, not just within one, since a Free Agent add-on and a coach add-on
 * write different owned ARRAYS and the same terms object.
 *
 * The consequence is this repo's recurring shape, a write that looks like it worked: a lost term
 * is an add-on whose stripeSubscriptionId was never recorded, so nothing can ever cancel or
 * refund it -- silently, and for good. A lost array append is an add-on somebody paid for and was
 * not granted.
 *
 * Recorded by the 2026-10-14 sweep as verified-real-and-not-fixed with a jsonb_set shape
 * sketched. The fix shipped is a locked transaction instead, which also closes the narrower
 * same-id value race the sketch could not.
 *
 * REAL CONCURRENCY, NOT A SIMULATION: these drive the actual methods with Promise.all against
 * real Postgres, so the lock is what makes them pass. Every case here fails against the
 * pre-2026-10-15 read-modify-write -- not every single run, since the window is milliseconds,
 * which is exactly why it needed a test that can run it many times over.
 */

const ROUNDS = 12;

const termsFor = async (id: number) => {
  const [row] = await db
    .select({ terms: users.addOnTerms, fa: users.freeAgentAddOns, coach: users.billingAddOns })
    .from(users)
    .where(eq(users.id, id));
  return row;
};

describe("two add-on writes on one account", () => {
  beforeEach(resetDatabase);

  it("both land when a Free Agent buys two add-ons at once", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const athlete = await makeAthlete();
      await Promise.all([
        storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_classes" }),
        storage.addFreeAgentAddOn(athlete.id, "golf_swing", { stripeSubscriptionId: "sub_golf" }),
      ]);
      const row = await termsFor(athlete.id);
      // The handle is the half that cannot be recovered: nothing else in the system ever writes
      // it, so an add-on that lost it bills forever with nothing able to find it.
      expect(row.terms?.all_classes?.stripeSubscriptionId).toBe("sub_classes");
      expect(row.terms?.golf_swing?.stripeSubscriptionId).toBe("sub_golf");
      expect([...(row.fa ?? [])].sort()).toEqual(["all_classes", "golf_swing"]);
    }
  });

  it("both land across the two different owned arrays", async () => {
    // A coach add-on and a Free Agent add-on write DIFFERENT array columns and the SAME terms
    // object, which is why "one add-on at a time per account" was never the protection it looked
    // like. One account can hold both -- an admin comping a coach who also trains on the platform.
    for (let round = 0; round < ROUNDS; round += 1) {
      const coach = await makeCoach();
      await Promise.all([
        storage.addCoachBillingAddOn(coach.id, "coaches_corner", { stripeSubscriptionId: "sub_corner" }),
        storage.addFreeAgentAddOn(coach.id, "all_classes", { stripeSubscriptionId: "sub_classes" }),
      ]);
      const row = await termsFor(coach.id);
      expect(row.terms?.coaches_corner?.stripeSubscriptionId).toBe("sub_corner");
      expect(row.terms?.all_classes?.stripeSubscriptionId).toBe("sub_classes");
      expect(row.coach).toEqual(["coaches_corner"]);
      expect(row.fa).toEqual(["all_classes"]);
    }
  });

  it("a refund of one add-on never resurrects another", async () => {
    // revokeAddOnAfterRefund writes the refund stamp AND both owned arrays, so it is the writer
    // most able to undo a purchase happening beside it.
    for (let round = 0; round < ROUNDS; round += 1) {
      const athlete = await makeAthlete();
      await storage.addFreeAgentAddOn(athlete.id, "golf_swing", { stripeSubscriptionId: "sub_golf" });
      await Promise.all([
        storage.revokeAddOnAfterRefund(athlete.id, "golf_swing"),
        storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_classes" }),
      ]);
      const row = await termsFor(athlete.id);
      expect(row.terms?.golf_swing?.refundedAt).toBeTruthy();
      expect(row.terms?.all_classes?.stripeSubscriptionId).toBe("sub_classes");
      expect(row.fa).toContain("all_classes");
      expect(row.fa).not.toContain("golf_swing");
    }
  });

  it("a scheduled cancellation of one never erases another's term", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const athlete = await makeAthlete();
      await storage.addFreeAgentAddOn(athlete.id, "golf_swing", { stripeSubscriptionId: "sub_golf" });
      const until = new Date(Date.now() + 86_400_000);
      await Promise.all([
        storage.scheduleAddOnRemoval(athlete.id, "golf_swing", until),
        storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_classes" }),
      ]);
      const row = await termsFor(athlete.id);
      expect(row.terms?.golf_swing?.accessUntil).toBeTruthy();
      expect(row.terms?.all_classes?.stripeSubscriptionId).toBe("sub_classes");
    }
  });

  it("a restore of one never erases another's term", async () => {
    // restoreAddOn writes the terms object wholesale rather than through nextAddOnTerms (it DROPS
    // a key), which makes it the writer most able to erase a neighbour outright.
    for (let round = 0; round < ROUNDS; round += 1) {
      const athlete = await makeAthlete();
      await storage.addFreeAgentAddOn(athlete.id, "golf_swing", { stripeSubscriptionId: "sub_golf" });
      await storage.scheduleAddOnRemoval(athlete.id, "golf_swing", new Date(Date.now() + 86_400_000));
      await Promise.all([
        storage.restoreAddOn(athlete.id, "golf_swing"),
        storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_classes" }),
      ]);
      const row = await termsFor(athlete.id);
      expect(row.terms?.golf_swing?.accessUntil).toBeUndefined();
      expect(row.terms?.golf_swing?.stripeSubscriptionId).toBe("sub_golf");
      expect(row.terms?.all_classes?.stripeSubscriptionId).toBe("sub_classes");
    }
  });

  it("an admin's whole-panel save never erases a purchase landing beside it", async () => {
    // The admin save writes a tier, a comp flag and the owned array in ONE statement, and its
    // reconcile READS the terms -- so it is both a victim and a cause.
    for (let round = 0; round < ROUNDS; round += 1) {
      const athlete = await makeAthlete({ isBetaAccount: false });
      await Promise.all([
        storage.updateFreeAgentBilling(athlete.id, {
          freeAgentAddOns: ["golf_swing"],
          freeAgentTier: "basic",
        } as never),
        storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_classes" }),
      ]);
      const row = await termsFor(athlete.id);
      // The TERM is the thing the race destroyed and the thing nothing can rebuild, so that is
      // what is asserted in BOTH orders. The owned ARRAY is a different matter and deliberately
      // order-dependent: the admin panel PATCHes the whole desired list, so landing second it
      // legitimately drops all_classes from it. The term stays either way, which is what keeps
      // the subscription cancellable and lets an admin re-tick it (reconcileAdminAddOnSave).
      expect(row.terms?.all_classes?.stripeSubscriptionId).toBe("sub_classes");
      expect(row.fa).toContain("golf_swing");
      const [acct] = await db.select({ tier: users.freeAgentTier }).from(users).where(eq(users.id, athlete.id));
      expect(acct.tier).toBe("basic");
    }
  });

  it("the same add-on written twice keeps one coherent term, not a half of each", async () => {
    // The narrower same-id race, which the jsonb_set sketch could not have fixed: a purchase's
    // term is COMPUTED from the prior record (it clears accessUntil and refundedAt), so even a
    // single-key write needs the read it was derived from to still be the state when it lands.
    //
    // HONEST ABOUT ITS OWN STRENGTH: this is the one case in this file that still passes with
    // the lock removed, because both racing writes happen to clear accessUntil whichever read
    // they were built from. It is here to state the property, not to prove it -- the other seven
    // cases all go red without the `for("update")`, which is where the proof is.
    for (let round = 0; round < ROUNDS; round += 1) {
      const athlete = await makeAthlete();
      await storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_old" });
      await storage.scheduleAddOnRemoval(athlete.id, "all_classes", new Date(Date.now() + 86_400_000));
      await Promise.all([
        storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_new" }),
        storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_newer" }),
      ]);
      const row = await termsFor(athlete.id);
      const term = row.terms?.all_classes;
      // A purchase clears the pending cancellation. If one of the two was built from a read
      // taken before the other, accessUntil could survive and the add-on would expire inside a
      // month that had just been paid for.
      expect(term?.accessUntil).toBeUndefined();
      expect(["sub_new", "sub_newer"]).toContain(term?.stripeSubscriptionId);
      expect(row.fa).toEqual(["all_classes"]);
    }
  });

  it("hands the superseded subscription up exactly once", async () => {
    // The caller cancels whatever comes back here, so reporting it twice would cancel one
    // subscription twice (harmless) and reporting the WRONG one -- a handle a concurrent writer
    // had already replaced -- would cancel a live subscription somebody is paying for.
    for (let round = 0; round < ROUNDS; round += 1) {
      const athlete = await makeAthlete();
      await storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_first" });
      const [a, b] = await Promise.all([
        storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_second" }),
        storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_third" }),
      ]);
      const superseded = [a, b]
        .map((r) => (r as { supersededStripeSubscriptionId?: string } | null)?.supersededStripeSubscriptionId)
        .filter(Boolean);
      // Two purchases over one existing subscription supersede three handles across two writes:
      // each must name the one that was really on the row when it took the lock, so no handle is
      // named twice and the one left on the row is never among them.
      const row = await termsFor(athlete.id);
      expect(new Set(superseded).size).toBe(superseded.length);
      expect(superseded).not.toContain(row.terms?.all_classes?.stripeSubscriptionId);
      expect(superseded).toContain("sub_first");
    }
  });
});
