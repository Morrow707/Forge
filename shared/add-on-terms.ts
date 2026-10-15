/**
 * WHAT A BOUGHT ADD-ON IS OWED, AND WHEN IT STOPS.
 *
 * Added 2026-10-11. Until this, an add-on could be bought and never un-bought: the only
 * writers of users.freeAgentAddOns and users.billingAddOns were addFreeAgentAddOn and
 * addCoachBillingAddOn, both documented APPEND-not-set, and there was no removal function
 * anywhere in the repo. A coach who cancelled Coaches Corner in the Stripe portal, or an
 * athlete refunded for All Classes, kept the product for good.
 *
 * Scott's rules, verbatim, 2026-10-11:
 *   "they need to be able to remove it, give them until the next billing cycle to have it as
 *    the billing is a month, so if they buy it the 16th, remove it the 1st, they have until
 *    the 16th to use it again with no refund"
 *   "lets add too they have a 72 hour refund policy, if something is refunded then they don't
 *    have access obviously"
 *
 * So there are exactly TWO ways an add-on ends, and they are not the same event:
 *
 *   CANCEL  -- the month is already paid for, so access runs to the end of it. No refund. The
 *              add-on can be picked back up inside that window at no further cost, which is
 *              what `restore` is for: it clears the end date and the paid month carries on.
 *   REFUND  -- the money went back, so access stops the moment it does. Not at a period end,
 *              not after a grace day. `refundedAt` is set and the add-on leaves the owned list.
 *
 * Both are recorded per add-on in users.addOnTerms rather than by mutating the owned array
 * alone, because "owned" cannot express "owned until the 16th" and that is the whole of what
 * he asked for.
 */

/** How long after a purchase a refund may be requested. Scott, 2026-10-11: a 72 hour policy. */
export const ADD_ON_REFUND_WINDOW_HOURS = 72;

/** The purchase time recorded for an add-on that was bought BEFORE terms were recorded, when a
 *  cancellation or refund first gives it a term (added 2026-10-15).
 *
 *  nextAddOnTerms used to invent `new Date()` here, so cancelling an add-on bought in September
 *  stamped it as bought that second and the cancel route answered `refundable: true` -- a fresh
 *  72-hour refund window opened on a purchase months old, by the act of cancelling it. The epoch
 *  is outside every window there will ever be, it is honest about what is known (nothing), and
 *  it parses, so a reader printing the date gets 1970 rather than a crash or a guess at today. */
export const PURCHASED_BEFORE_TERMS_WERE_RECORDED = "1970-01-01T00:00:00.000Z";

/** The per-add-on record. Keyed by add-on id in users.addOnTerms.
 *
 * The coach ids (shared/billing-tiers.ts AddOnId) and the Free Agent ids
 * (shared/free-agent-tiers.ts FreeAgentAddOnId) are disjoint, which is what lets ONE column
 * serve both sides; `add-on-terms.test.ts` asserts that disjointness so the day somebody adds
 * a colliding id is the day a test fails rather than the day two accounts share a record. */
export interface AddOnTerm {
  /** When the purchase was recorded. Drives the refund window and nothing else. */
  purchasedAt: string;
  /** Set by a cancellation: the end of the month already paid for. Access survives until it. */
  accessUntil?: string;
  /** Set by a refund. Access is over at this instant, whatever accessUntil says. */
  refundedAt?: string;
  /** The provider's own handle on this add-on's subscription, so a cancellation can reach it.
   *
   * THIS IS THE REASON A RECORD EXISTS AT ALL RATHER THAN A SECOND ARRAY. `subscriptions.userId`
   * is UNIQUE, so one account has exactly one subscription row and an add-on's Stripe
   * subscription id had nowhere to live -- which is why nothing could cancel one even in
   * principle. A coach with a tier AND Coaches Corner has two Stripe subscriptions and the row
   * could only ever hold one. */
  stripeSubscriptionId?: string;
  /** Apple's stable id for the subscription, for the same reason. An Apple subscription is
   * cancelled by the person in iOS Settings, never by this server, so what Forge does with it
   * is recognise the REFUND and expiry notifications that name it. */
  appleOriginalTransactionId?: string;
}

export type AddOnTerms = Record<string, AddOnTerm>;

/**
 * IS THIS ADD-ON LIVE RIGHT NOW? The one rule, asked by every reader.
 *
 * Three facts decide it and they are checked in order of how final they are: a refund ends it
 * outright, then a cancellation's end date, then plain ownership. Written as one function
 * because the four readers that ask (Coaches Corner, All Classes, the sport coaches, the
 * personalization bundle) are in three different files, and the same question answered in three
 * places drifts -- the drift being visible only to the person it strands.
 */
export function addOnIsActive(
  owned: readonly string[] | null | undefined,
  terms: AddOnTerms | null | undefined,
  addOnId: string,
  now: Date = new Date(),
): boolean {
  if (!owned?.includes(addOnId)) return false;
  const term = terms?.[addOnId];
  if (!term) return true; // bought before terms were recorded: owned is all there is to go on.
  if (term.refundedAt != null) return false;
  if (term.accessUntil == null) return true;
  const until = Date.parse(term.accessUntil);
  // AN UNPARSEABLE DATE KEEPS ACCESS. It is a cancellation record, not a refund: the money for
  // this month was taken and not returned, so the failure that costs the customer something
  // they paid for is the wrong one to choose.
  return Number.isNaN(until) ? true : now.getTime() < until;
}

/** Every add-on id this account can currently use. */
export function activeAddOns(
  owned: readonly string[] | null | undefined,
  terms: AddOnTerms | null | undefined,
  now: Date = new Date(),
): string[] {
  return (owned ?? []).filter((id) => addOnIsActive(owned, terms, id, now));
}

/** May this purchase still be refunded? 72 hours from the purchase, per Scott's policy.
 *
 * A missing or unparseable purchasedAt is OUTSIDE the window: the window is a promise Forge
 * makes, and honouring it on a record that cannot say when the money moved would make it
 * unbounded. A support refund is always still possible by hand -- this governs the
 * self-serve request, not what a human may do. */
export function withinRefundWindow(
  term: AddOnTerm | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!term?.purchasedAt) return false;
  const bought = Date.parse(term.purchasedAt);
  if (Number.isNaN(bought)) return false;
  return now.getTime() - bought < ADD_ON_REFUND_WINDOW_HOURS * 60 * 60 * 1000;
}

/** The sentence a buyer is shown wherever an add-on is sold or cancelled.
 *
 * ONE constant so the policy cannot be stated two ways. NOTE: this is product copy, not the
 * Terms of Use -- the Terms are attorney-reviewed and are never edited in place (see CLAUDE.md
 * on registering a version), so a refund policy belonging IN them is counsel's to write. */
export const ADD_ON_CANCELLATION_POLICY =
  `Cancel any time. You keep the add-on until the end of the month you have paid for, and you ` +
  `can turn it back on before then at no extra cost. Refunds are available within ` +
  `${ADD_ON_REFUND_WINDOW_HOURS} hours of purchase; a refunded add-on stops working straight away.`;

/** Merge one add-on's terms into the stored map.
 *
 * A PURCHASE RESETS THE LIFECYCLE FIELDS; anything else merges. `purchasedAt` arriving means
 * "this is a purchase", so accessUntil and refundedAt are dropped -- Scott's rule that turning
 * an add-on back on inside its paid month costs nothing depends on the pending cancellation
 * going away, and a re-purchase after a refund must not inherit the refund stamp that would
 * keep it switched off. A cancellation or a refund carries no purchasedAt and so keeps the
 * purchase time, which is what the 72-hour refund window is measured from.
 *
 * Lived in server/storage.ts until 2026-10-14 and moved here unchanged, so that
 * reconcileAdminAddOnSave below -- which has to clear the same two fields without claiming a
 * purchase -- can be a pure function in the module that owns what an add-on is owed, and can
 * be unit-tested without a database. */
export function nextAddOnTerms(
  existing: AddOnTerms | null | undefined,
  addOnId: string,
  patch: Partial<AddOnTerm>,
): AddOnTerms {
  const all = { ...(existing ?? {}) };
  const prior = all[addOnId];
  const base: AddOnTerm =
    patch.purchasedAt != null
      ? { ...prior, purchasedAt: patch.purchasedAt, accessUntil: undefined, refundedAt: undefined }
      : { ...prior, purchasedAt: prior?.purchasedAt ?? PURCHASED_BEFORE_TERMS_WERE_RECORDED };
  const merged: AddOnTerm = { ...base, ...patch };
  // Undefined keys are dropped rather than stored as nulls: this is a json column, and a reader
  // asking `term.accessUntil == null` must not have to care which of the two it got.
  for (const k of Object.keys(merged) as (keyof AddOnTerm)[]) {
    if (merged[k] === undefined) delete merged[k];
  }
  all[addOnId] = merged;
  return all;
}

/** A provider subscription that outlived the add-on an admin just removed. */
export interface AddOnStillBilling {
  addOnId: string;
  stripeSubscriptionId?: string;
  appleOriginalTransactionId?: string;
}

/**
 * RECONCILE users.addOnTerms WITH THE ADD-ON LIST AN ADMIN JUST SAVED.
 *
 * Added 2026-10-14. The admin billing panel writes the owned ARRAY (users.freeAgentAddOns /
 * users.billingAddOns) and nothing else -- and ownership is only half of what decides whether
 * an add-on works, because addOnIsActive reads the TERM beside it, where a refund stamp is
 * final and a cancellation's accessUntil can already be in the past. So ticking the box for a
 * refunded add-on saved cleanly, read back ticked, and granted nothing, for good: no other
 * write in the repo clears refundedAt. Re-ticking one whose paid month had run out did the
 * same. **Both halves of that are the same bug as the five this file's own history records --
 * add-on state lives in TWO places and a writer touched one of them.**
 *
 * AN ADMIN GRANT IS NOT A PURCHASE, which is what decides the shape of the fix: the stamps
 * that would make the grant inert are CLEARED, and nothing is invented in their place. No
 * fresh purchasedAt, because that would open a 72-hour refund window on money nobody paid
 * (withinRefundWindow above), and no provider handle, because Forge has not sold anything
 * here. The original purchasedAt and any provider handle already on the record are left
 * exactly as they are: they are the history of a real purchase, and a subscription this server
 * may still have to reach is the last thing to forget.
 *
 * A REMOVAL IS REPORTED, NEVER ACTED ON. Un-ticking the box closes access -- the array is the
 * first thing addOnIsActive asks -- but the provider is still charging the card, and this
 * server does not cancel somebody's subscription as a side effect of an admin's checkbox.
 * `stillBilling` is what the writer logs and hands back so the screen can name the
 * subscription an operator has to go and stop, which is the same posture as the self-serve
 * cancel route's `alsoCancelInAppStore`: say it plainly rather than report a cancellation that
 * did not happen.
 */
export function reconcileAdminAddOnSave(
  priorTerms: AddOnTerms | null | undefined,
  ownedBefore: readonly string[] | null | undefined,
  ownedAfter: readonly string[],
): { terms: AddOnTerms | undefined; granted: string[]; stillBilling: AddOnStillBilling[] } {
  // Only the ids the TERMS would veto need a write. An id with no term at all is already live
  // ("bought before terms were recorded: owned is all there is to go on"), so this is a no-op
  // for every ordinary save -- and it is asked of addOnIsActive itself rather than re-stating
  // its rule, so a fourth way for an add-on to end is covered here the day it is added there.
  const granted = ownedAfter.filter((id) => !addOnIsActive(ownedAfter, priorTerms, id));
  let terms: AddOnTerms | undefined = priorTerms ?? undefined;
  for (const id of granted) {
    terms = nextAddOnTerms(terms, id, { accessUntil: undefined, refundedAt: undefined });
  }

  const stillBilling: AddOnStillBilling[] = [];
  for (const id of ownedBefore ?? []) {
    if (ownedAfter.includes(id)) continue;
    const term = priorTerms?.[id];
    // A refunded term is not still billing: the money already went back.
    if (!term || term.refundedAt != null) continue;
    if (!term.stripeSubscriptionId && !term.appleOriginalTransactionId) continue;
    stillBilling.push({
      addOnId: id,
      ...(term.stripeSubscriptionId ? { stripeSubscriptionId: term.stripeSubscriptionId } : {}),
      ...(term.appleOriginalTransactionId
        ? { appleOriginalTransactionId: term.appleOriginalTransactionId }
        : {}),
    });
  }

  // undefined, not the unchanged map, so an ordinary save leaves the column alone rather than
  // rewriting it to itself.
  return { terms: granted.length > 0 ? terms : undefined, granted, stillBilling };
}
