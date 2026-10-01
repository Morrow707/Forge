import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { apiRequest } from "@/lib/queryClient";
import {
  FREE_AGENT_ADD_ONS,
  FREE_AGENT_ADD_ON_ORDER,
  FREE_AGENT_TIER_ORDER,
  FREE_AGENT_TIERS,
  googlePlayProductIdForFreeAgentAddOn,
  googlePlayProductIdForFreeAgentTier,
  type FreeAgentAddOnId,
  type FreeAgentTierId,
} from "@shared/free-agent-tiers";
import type { FreeAgentTierProduct, FreeAgentAddOnProduct } from "@/lib/apple-iap";

// THE ANDROID TWIN OF apple-iap.ts, same contract: a purchase is only "done" once the server
// has verified the purchase token with Google, and only then is it acknowledged to Play (an
// unacknowledged subscription is refunded by Play after three days -- the fail-closed shape
// finishTransaction gives iOS). Native implementation:
// android/app/src/main/java/com/foreperformancesystems/forge/GooglePlayBillingPlugin.java.

type GooglePlayPurchase = {
  purchaseToken: string;
  productId: string;
  orderId: string | null;
  acknowledged: boolean;
};

interface GooglePlayBillingPluginInterface {
  getProducts(options: { productIds: string[] }): Promise<{
    products: { id: string; displayName: string; description: string; displayPrice: string | null }[];
  }>;
  purchase(options: { productId: string }): Promise<GooglePlayPurchase>;
  acknowledge(options: { purchaseToken: string }): Promise<void>;
  restorePurchases(): Promise<{ transactions: GooglePlayPurchase[] }>;
  addListener(
    eventName: "purchaseUpdated",
    listenerFunc: (purchase: GooglePlayPurchase) => void,
  ): Promise<PluginListenerHandle>;
}

const GooglePlayBilling = registerPlugin<GooglePlayBillingPluginInterface>("GooglePlayBilling");

/** True only in the Android app. The live switch (GOOGLE_PLAY_BILLING_LIVE) is a separate,
 * server-side question, fetched from GET /api/billing/google-play-enabled. */
export function isGooglePlayBillingSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function allProductIds(): string[] {
  return [
    ...FREE_AGENT_TIER_ORDER.map(googlePlayProductIdForFreeAgentTier),
    ...FREE_AGENT_ADD_ON_ORDER.map(googlePlayProductIdForFreeAgentAddOn),
  ];
}

export async function fetchGooglePlayTierProducts(): Promise<FreeAgentTierProduct[]> {
  const { products } = await GooglePlayBilling.getProducts({ productIds: allProductIds() });
  const byId = new Map(products.map((p) => [p.id, p]));
  return FREE_AGENT_TIER_ORDER.map((tier) => {
    const def = FREE_AGENT_TIERS[tier];
    return {
      tier,
      label: def.label,
      description: def.description,
      hasVideoFormCheck: def.hasVideoFormCheck,
      displayPrice: byId.get(googlePlayProductIdForFreeAgentTier(tier))?.displayPrice ?? null,
    };
  });
}

export async function fetchGooglePlayAddOnProducts(): Promise<FreeAgentAddOnProduct[]> {
  const { products } = await GooglePlayBilling.getProducts({ productIds: allProductIds() });
  const byId = new Map(products.map((p) => [p.id, p]));
  return FREE_AGENT_ADD_ON_ORDER.map((addOn) => {
    const def = FREE_AGENT_ADD_ONS[addOn];
    return {
      addOn,
      label: def.label,
      description: def.description,
      displayPrice: byId.get(googlePlayProductIdForFreeAgentAddOn(addOn))?.displayPrice ?? null,
    };
  });
}

async function verifyAndAcknowledge(purchase: GooglePlayPurchase): Promise<void> {
  await apiRequest("POST", "/api/athlete/google-play/verify", {
    purchaseToken: purchase.purchaseToken,
    productId: purchase.productId,
  });
  if (!purchase.acknowledged) {
    await GooglePlayBilling.acknowledge({ purchaseToken: purchase.purchaseToken });
  }
}

export class GooglePlayPurchaseCancelledError extends Error {}
export class GooglePlayPurchasePendingError extends Error {}

function rethrow(err: unknown): never {
  const message = (err as { message?: string })?.message;
  if (message === "cancelled") throw new GooglePlayPurchaseCancelledError();
  if (message === "pending") throw new GooglePlayPurchasePendingError();
  throw err;
}

/** Resolves once the purchase is made, verified server-side and acknowledged to Play. */
export async function purchaseFreeAgentTierOnGooglePlay(tier: FreeAgentTierId): Promise<void> {
  try {
    const purchase = await GooglePlayBilling.purchase({ productId: googlePlayProductIdForFreeAgentTier(tier) });
    await verifyAndAcknowledge(purchase);
  } catch (err) {
    rethrow(err);
  }
}

export async function purchaseFreeAgentAddOnOnGooglePlay(addOn: FreeAgentAddOnId): Promise<void> {
  try {
    const purchase = await GooglePlayBilling.purchase({ productId: googlePlayProductIdForFreeAgentAddOn(addOn) });
    await verifyAndAcknowledge(purchase);
  } catch (err) {
    rethrow(err);
  }
}

/** Restore Purchases: every active subscription the signed-in Google account holds. */
export async function restoreGooglePlayPurchases(): Promise<void> {
  const { transactions } = await GooglePlayBilling.restorePurchases();
  for (const purchase of transactions) await verifyAndAcknowledge(purchase);
}

/** Once at startup on Android: a pending purchase that completes later, or one made on
 * another device, is verified the moment Play reports it. */
export function watchGooglePlayPurchaseUpdates(): void {
  if (!isGooglePlayBillingSupported()) return;
  GooglePlayBilling.addListener("purchaseUpdated", (purchase) => {
    verifyAndAcknowledge(purchase).catch((err) => {
      console.error("Google Play Billing: failed to verify a background purchase update", err);
    });
  });
}
