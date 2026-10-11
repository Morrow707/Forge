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
