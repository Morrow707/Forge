import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { apiRequest } from "@/lib/queryClient";
import {
  FREE_AGENT_TIER_ORDER,
  FREE_AGENT_TIERS,
  appleProductIdForFreeAgentTier,
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

// Shared by every path that ends up with a real signed transaction
// (an explicit purchase, a restore, or the background transactionUpdated
// listener below) -- verifies it server-side, and only tells StoreKit the
// transaction is "done" once that verification actually succeeded. See
// AppleIapPlugin.swift's own comment on why finishTransaction is never
// called eagerly.
async function verifyAndFinish(transaction: AppleIapTransaction): Promise<void> {
  await apiRequest("POST", "/api/athlete/apple-iap/verify", {
    signedTransactionInfo: transaction.signedTransactionInfo,
  });
  await AppleIap.finishTransaction({ transactionId: transaction.transactionId });
}

export class ApplePurchaseCancelledError extends Error {}
export class ApplePurchasePendingError extends Error {}

/** Resolves once the purchase is both made AND verified/recorded
 * server-side -- a caller awaiting this can safely assume the entitlement
 * is live the moment it resolves. Rejects with ApplePurchaseCancelledError
 * for a plain user cancel (the purchase UI should treat this as "no-op,"
 * not an error toast) and ApplePurchasePendingError for Ask to Buy/other
 * Apple-side holds (the eventual approval arrives through the
 * transactionUpdated listener, not this call). */
export async function purchaseFreeAgentTier(tier: FreeAgentTierId): Promise<void> {
  try {
    const transaction = await AppleIap.purchase({ productId: appleProductIdForFreeAgentTier(tier) });
    await verifyAndFinish(transaction);
  } catch (err: any) {
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
    verifyAndFinish(transaction).catch((err) => {
      console.error("Apple IAP: failed to verify a background transaction update", err);
    });
  });
}
