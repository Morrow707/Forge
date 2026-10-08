import { logDebug } from "@/lib/debug-console";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { apiRequest, ApiError } from "@/lib/queryClient";
import {
  FREE_AGENT_ADD_ONS,
  FREE_AGENT_ADD_ON_ORDER,
  FREE_AGENT_TIER_ORDER,
  ALL_FREE_AGENT_TIER_IDS,
  FREE_AGENT_TIERS,
  appleProductIdForCoachAddOn,
  appleProductIdForFreeAgentAddOn,
  appleProductIdForFreeAgentTier,
  type FreeAgentAddOnId,
  type FreeAgentTierId,
} from "@shared/free-agent-tiers";

type AppleIapTransaction = {
  transactionId: string;
  productId: string;
  signedTransactionInfo: string;
};

interface AppleIapPluginInterface {
  getProducts(): Promise<{
    products: { id: string; displayName: string; description: string; displayPrice: string }[];
  }>;
  purchase(options: { productId: string }): Promise<AppleIapTransaction>;
  finishTransaction(options: { transactionId: string }): Promise<void>;
  restorePurchases(): Promise<{ transactions: AppleIapTransaction[] }>;
  addListener(
    eventName: "transactionUpdated",
    listenerFunc: (transaction: AppleIapTransaction) => void,
  ): Promise<PluginListenerHandle>;
}

// registerPlugin resolves to the real native implementation
// (ios/App/App/AppleIapPlugin.swift) only on iOS; every other platform gets
// Capacitor's own "not implemented" rejection for every call, which is
// exactly right here -- there's no web/Android equivalent purchase flow to
// fall back to, and isAppleIapSupported() below is what every caller
// actually gates on before touching this plugin at all.
const AppleIap = registerPlugin<AppleIapPluginInterface>("AppleIap");

/** True only on a real iOS device/simulator -- gates every function below.
 * Doesn't factor in APPLE_IAP_LIVE (the server-side "is this actually
 * turned on" flag, fetched separately via GET /api/billing/apple-iap-enabled)
 * since that's a business-state check, this is a platform-capability one. */
export function isAppleIapSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export type FreeAgentTierProduct = {
  tier: FreeAgentTierId;
  label: string;
  description: string;
  hasVideoFormCheck: boolean;
  /** StoreKit's own localized, tax-inclusive price string (e.g. "$9.99") --
   * the real price a purchase() call will actually charge. Null until
   * App Store Connect has a matching priced Product for this tier's id
   * (see appleProductIdForFreeAgentTier), which is expected during beta. */
  displayPrice: string | null;
};

/** Joins FREE_AGENT_TIERS' own copy (label/description/hasVideoFormCheck)
 * with StoreKit's live displayPrice for each tier, in FREE_AGENT_TIER_ORDER
 * -- the purchase UI's one data source, so it never hand-duplicates pricing
 * copy that's already defined once in shared/free-agent-tiers.ts. */
export async function fetchFreeAgentTierProducts(): Promise<FreeAgentTierProduct[]> {
  const { products } = await AppleIap.getProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  return FREE_AGENT_TIER_ORDER.map((tier) => {
    const def = FREE_AGENT_TIERS[tier];
    const storeProduct = byId.get(appleProductIdForFreeAgentTier(tier));
    return {
      tier,
      label: def.label,
      description: def.description,
      hasVideoFormCheck: def.hasVideoFormCheck,
      displayPrice: storeProduct?.displayPrice ?? null,
    };
  });
}

export type FreeAgentAddOnProduct = {
  addOn: FreeAgentAddOnId;
  label: string;
  description: string;
  /** StoreKit's own localized price, or null until App Store Connect has a
   * matching priced Product for this add-on's id -- which is every add-on today
   * (see appleProductIdForFreeAgentAddOn: none of the three has been created
   * yet). A card with no price never offers a purchase button. */
  displayPrice: string | null;
};

/** The three sport-coach add-ons, joined with StoreKit's live prices, exactly as
 * fetchFreeAgentTierProducts does for the tiers -- one getProducts() call covers
 * both, since StoreKit returns every configured Product for the app. */
export async function fetchFreeAgentAddOnProducts(): Promise<FreeAgentAddOnProduct[]> {
  const { products } = await AppleIap.getProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  return FREE_AGENT_ADD_ON_ORDER.map((addOn) => {
    const def = FREE_AGENT_ADD_ONS[addOn];
    return {
      addOn,
      label: def.label,
      description: def.description,
      displayPrice: byId.get(appleProductIdForFreeAgentAddOn(addOn))?.displayPrice ?? null,
    };
  });
}

/* ONE VERIFY PER TRANSACTION, however many paths see it.
 *
 * A direct purchase is delivered TWICE: purchase() returns the transaction, and
 * Transaction.updates fires for the same one a moment later. Both call verifyAndFinish, so the
 * console on 2026-10-05 showed every sandbox purchase verified twice a second apart -- the same
 * transactionId POSTed to the server, recorded, and finished, then POSTed again:
 *
 *   34:38 StoreKit transaction 2000001246169392 for ...ai_coach_v3, verifying with the server
 *   34:38 server recorded ...ai_coach_v3, finishing with StoreKit
 *   34:39 StoreKit transaction 2000001246169392 for ...ai_coach_v3, verifying with the server
 *   34:39 server recorded ...ai_coach_v3, finishing with StoreKit
 *
 * The grant is idempotent so nothing was wrong in the end, but it doubles the verify calls, lets
 * two read-modify-writes of the same row interleave, and -- worst of the three -- doubles the
 * debug console, which is the ONLY instrument on an iPhone and the thing every one of these bugs
 * has been found with. Keyed by transactionId: a second caller awaits the first's promise rather
 * than issuing its own request.
 *
 * A FAILURE IS NOT REMEMBERED, deliberately. The 401-before-sign-in path replays held
 * transactions after login and has to be able to try the very same id again, so only a verify
 * that actually succeeded is recorded as done. */
const verifyInFlight = new Map<string, Promise<void>>();
const verifiedTransactionIds = new Set<string>();

// Shared by every path that ends up with a real signed transaction
// (an explicit purchase, a restore, or the background transactionUpdated
// listener below) -- verifies it server-side, and only tells StoreKit the
// transaction is "done" once that verification actually succeeded. See
// AppleIapPlugin.swift's own comment on why finishTransaction is never
// called eagerly.
async function verifyAndFinish(transaction: AppleIapTransaction): Promise<void> {
  const id = transaction.transactionId;
  if (verifiedTransactionIds.has(id)) {
    logDebug("IAP", `${transaction.productId}: transaction ${id} already recorded, skipping`);
    return;
  }
  const running = verifyInFlight.get(id);
  if (running) return running;
  const attempt = verifyAndFinishOnce(transaction)
    .then(() => {
      verifiedTransactionIds.add(id);
    })
    .finally(() => {
      verifyInFlight.delete(id);
    });
  verifyInFlight.set(id, attempt);
  return attempt;
}

async function verifyAndFinishOnce(transaction: AppleIapTransaction): Promise<void> {
  // The account-scoped route: the server reads the role and applies the receipt to the right
  // kind of purchase (a Free Agent's tier or add-on, a coach's Coaches Corner).
  logDebug("IAP", `StoreKit transaction ${transaction.transactionId} for ${transaction.productId}, verifying with the server`);
  try {
    await apiRequest("POST", "/api/account/apple-iap/verify", {
      signedTransactionInfo: transaction.signedTransactionInfo,
    });
  } catch (err: any) {
    // There is no console to read on an iPhone, and the toast above this used to say "try
    // again" for every failure. The first sandbox purchase (2026-10-05) failed with no record
    // anywhere of which step refused it.
    if (err instanceof ApiError && err.status === 401) {
      logDebug("IAP", `${transaction.productId}: not signed in yet, will retry after sign-in`);
    } else if (err instanceof ApiError && err.status === 410) {
      // A RETIRED PRODUCT (RETIRED_APPLE_PRODUCT_IDS): a sandbox transaction for an id that was
      // created wrong and replaced. The server will never record it and StoreKit will replay it
      // at every launch until it is finished, so it is finished HERE, with nothing granted -- the
      // one refusal that does not leave the transaction open. Every other refusal still does.
      logDebug("IAP", `${transaction.productId}: retired product, finishing with StoreKit so it stops replaying`);
      await AppleIap.finishTransaction({ transactionId: transaction.transactionId });
      return;
    } else {
      logDebug("IAP", `server verify refused ${transaction.productId}: ${err?.status ?? "no status"} ${err?.message ?? String(err)}`);
    }
    throw err;
  }
  logDebug("IAP", `server recorded ${transaction.productId}, finishing with StoreKit`);
  await AppleIap.finishTransaction({ transactionId: transaction.transactionId });
}

function logPurchaseFailure(productId: string, err: any): void {
  const msg = err?.message ?? String(err);
  if (msg === "cancelled") logDebug("IAP", `${productId}: cancelled on the sheet`);
  else if (msg === "pending") logDebug("IAP", `${productId}: pending approval (Ask to Buy)`);
  else logDebug("IAP", `${productId}: purchase failed: ${msg}`);
}

/** StoreKit's live price for a coach add-on (Coaches Corner), or null until App Store Connect
 * carries a priced Product for its id. A card with no price never offers a purchase button. */
export async function fetchCoachAddOnPrice(addOn: string): Promise<string | null> {
  const { products } = await AppleIap.getProducts();
  return products.find((p) => p.id === appleProductIdForCoachAddOn(addOn))?.displayPrice ?? null;
}

/** A coach buying Coaches Corner through StoreKit. Same verify-then-finish contract and the
 * same two typed rejections as purchaseFreeAgentTier. */
export async function purchaseCoachAddOn(addOn: string): Promise<void> {
  const productId = appleProductIdForCoachAddOn(addOn);
  logDebug("IAP", `purchase requested: ${productId}`);
  try {
    const transaction = await AppleIap.purchase({ productId });
    await verifyAndFinish(transaction);
  } catch (err: any) {
    logPurchaseFailure(productId, err);
    if (err?.message === "cancelled") throw new ApplePurchaseCancelledError();
    if (err?.message === "pending") throw new ApplePurchasePendingError();
    throw err;
  }
}

export class ApplePurchaseCancelledError extends Error {}
export class ApplePurchasePendingError extends Error {}

/** The tier a StoreKit product id names, or null for an add-on or an unknown id. */
export function tierForAppleProductId(productId: string): FreeAgentTierId | null {
  return ALL_FREE_AGENT_TIER_IDS.find((tier) => appleProductIdForFreeAgentTier(tier) === productId) ?? null;
}

/** What a tier purchase came back as. Apple applies an UPGRADE at once and hands back the new
 * product; a DOWNGRADE is scheduled for the next renewal and the transaction it hands back is
 * still the CURRENT product (seen 2026-10-05: tapping Basic while on AI Coach + Video returned
 * an ai_coach_video transaction, and the toast said "You're upgraded"). `appliedTier` is what
 * Forge recorded; `deferred` is true when it is not the tier that was asked for. */
export type TierPurchaseResult = { requestedTier: FreeAgentTierId; appliedTier: FreeAgentTierId | null; deferred: boolean };

/** Resolves once the purchase is both made AND verified/recorded
 * server-side -- a caller awaiting this can safely assume the entitlement
 * is live the moment it resolves. Rejects with ApplePurchaseCancelledError
 * for a plain user cancel (the purchase UI should treat this as "no-op,"
 * not an error toast) and ApplePurchasePendingError for Ask to Buy/other
 * Apple-side holds (the eventual approval arrives through the
 * transactionUpdated listener, not this call). */
export async function purchaseFreeAgentTier(tier: FreeAgentTierId): Promise<TierPurchaseResult> {
  const productId = appleProductIdForFreeAgentTier(tier);
  logDebug("IAP", `purchase requested: ${productId}`);
  try {
    const transaction = await AppleIap.purchase({ productId });
    await verifyAndFinish(transaction);
    const appliedTier = tierForAppleProductId(transaction.productId);
    const deferred = appliedTier !== tier;
    if (deferred) logDebug("IAP", `${productId}: Apple returned ${transaction.productId}; the change applies at the next renewal`);
    return { requestedTier: tier, appliedTier, deferred };
  } catch (err: any) {
    logPurchaseFailure(productId, err);
    if (err?.message === "cancelled") throw new ApplePurchaseCancelledError();
    if (err?.message === "pending") throw new ApplePurchasePendingError();
    throw err;
  }
}

/** Buys one sport-coach add-on through StoreKit, with the same verify-then-finish
 * contract as purchaseFreeAgentTier -- and the same two typed rejections, so a
 * caller can tell a plain cancel from an Ask-to-Buy hold.
 *
 * No Swift change was needed for this: AppleIapPlugin.purchase takes a productId,
 * and an add-on Product is a productId. What is missing is at Apple's end, not in
 * the app -- the three Products do not exist in App Store Connect yet, so
 * getProducts returns no price for them and the UI never offers the button. */
export async function purchaseFreeAgentAddOn(addOn: FreeAgentAddOnId): Promise<void> {
  const productId = appleProductIdForFreeAgentAddOn(addOn);
  logDebug("IAP", `purchase requested: ${productId}`);
  try {
    const transaction = await AppleIap.purchase({ productId });
    await verifyAndFinish(transaction);
  } catch (err: any) {
    logPurchaseFailure(productId, err);
    if (err?.message === "cancelled") throw new ApplePurchaseCancelledError();
    if (err?.message === "pending") throw new ApplePurchasePendingError();
    throw err;
  }
}

/** For a "Restore Purchases" button -- re-verifies every currently-active
 * transaction StoreKit knows about for this Apple ID, not just ones made on
 * this device. A no-op (empty transactions array) is the normal outcome for
 * someone with nothing to restore, not an error. */
export async function restoreFreeAgentPurchases(): Promise<void> {
  const { transactions } = await AppleIap.restorePurchases();
  logDebug("IAP", `restore: StoreKit returned ${transactions.length} transaction(s)`);
  for (const transaction of transactions) {
    await verifyAndFinish(transaction);
  }
}

/** Call once, near app startup on iOS -- catches a transaction that
 * completes outside any purchase()/restorePurchases() call in this session
 * (Ask to Buy approval, a subscription bought on another device) and
 * verifies it the moment StoreKit reports it, instead of waiting for the
 * athlete to happen to open the upgrade page again. */
export function watchAppleIapTransactionUpdates(): void {
  if (!isAppleIapSupported()) return;
  AppleIap.addListener("transactionUpdated", (transaction) => {
    void verifyBackgroundTransaction(transaction);
  });
}

/** StoreKit replays every unfinished transaction at launch, which on a cold start is BEFORE
 * the session cookie has been checked, so the verify route answered 401 for all three on
 * 2026-10-05 and the console showed three refusals that were not refusals. A transaction that
 * meets a 401 is held here and sent again once a sign-in lands (flushAppleIapTransactionsHeldForSignIn,
 * called from App.tsx when the user becomes known). StoreKit would replay it on the next launch
 * anyway; this just makes it land in the same session, without a log line that reads as a bug. */
const heldForSignIn = new Map<string, AppleIapTransaction>();

async function verifyBackgroundTransaction(transaction: AppleIapTransaction): Promise<void> {
  try {
    await verifyAndFinish(transaction);
    heldForSignIn.delete(transaction.transactionId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      heldForSignIn.set(transaction.transactionId, transaction);
      logDebug("IAP", `holding ${transaction.productId} until sign-in`);
      return;
    }
    console.error("Apple IAP: failed to verify a background transaction update", err);
  }
}

export async function flushAppleIapTransactionsHeldForSignIn(): Promise<void> {
  if (heldForSignIn.size === 0) return;
  const pending = [...heldForSignIn.values()];
  heldForSignIn.clear();
  logDebug("IAP", `signed in, re-sending ${pending.length} held transaction(s)`);
  for (const transaction of pending) await verifyBackgroundTransaction(transaction);
}
