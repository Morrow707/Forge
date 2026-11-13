/**
 * EXTRA VIDEO STORAGE, FOR SALE (2026-11-13). Scott: "should have a place to checkout."
 *
 * It had a price and no checkout, so the only way anybody got it was an admin's tick. This is the
 * Free Agent's card for it, on the plans screen: Stripe on the web, the store's own sheet in the
 * app, and nothing drawn to buy while the store has no such product yet. It follows
 * AllClassesCard, which is the one add-on card already proven on both rails.
 *
 * "Already has it" comes from the server (`extraVideoStorage`), never from the purchase record
 * alone: an account an admin ticked, or a comped one, already keeps the larger limits and must
 * not be offered them again.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, getJson } from "@/lib/queryClient";
import { formatCents } from "@shared/billing-tiers";
import { VIDEO_STORAGE_ADD_ON_ID, FREE_AGENT_ADD_ONS, type FreeAgentAddOnId } from "@shared/free-agent-tiers";
import {
  isAppleIapSupported,
  fetchFreeAgentAddOnProducts,
  purchaseFreeAgentAddOn,
  ApplePurchaseCancelledError,
  ApplePurchasePendingError,
  type FreeAgentAddOnProduct,
} from "@/lib/apple-iap";
import {
  isGooglePlayBillingSupported,
  fetchGooglePlayAddOnProducts,
  purchaseFreeAgentAddOnOnGooglePlay,
  GooglePlayPurchaseCancelledError,
  GooglePlayPurchasePendingError,
} from "@/lib/google-play-billing";
import { HardDrive, Lock, Unlock } from "lucide-react";
import { SubscriptionLegalLinks } from "@/components/subscription-legal-links";

type Entitlements = {
  addOns: Record<FreeAgentAddOnId, boolean>;
  ownedAddOns: Record<FreeAgentAddOnId, boolean>;
  billingOpen: boolean;
  extraVideoStorage?: boolean;
};

/** ALL CLASSES, the one thing a Free Agent can buy on top of a tier (2026-10-04). Drawn on
 * the upgrade page and, compact, beside a locked chapter. Access comes from the server
 * (/api/athlete/entitlements), never re-derived; the buy goes through StoreKit on iOS, Play on
 * Android, Stripe on the web, exactly as a tier does. A coached athlete never sees this: their
 * classes come from their coach, and the server refuses the purchase for them. */
export function VideoStorageCard() {
  const nativeIap = isAppleIapSupported();
  const androidNative = isGooglePlayBillingSupported();
  const [busy, setBusy] = useState(false);
  const addOn = FREE_AGENT_ADD_ONS[VIDEO_STORAGE_ADD_ON_ID];

  const { data: entitlements, refetch } = useQuery<Entitlements>({
    queryKey: ["/api/athlete/entitlements"],
    queryFn: () => getJson("/api/athlete/entitlements"),
  });
  // TWO SWITCHES, ONE PER RAIL, the same split the tier cards on the upgrade page use. The web
  // checkout opens with BILLING_LIVE (billingOpen); the store sheet opens with APPLE_IAP_LIVE
  // or GOOGLE_PLAY_BILLING_LIVE, which is what lets a sandbox purchase run before launch day.
  // Gating the phone on billingOpen too (2026-10-05) drew "Free while Forge is in beta" on a
  // locked card and nothing could be bought.
  const webBillingOpen = entitlements?.billingOpen === true;
  const { data: appleLive } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/billing/apple-iap-enabled"],
    queryFn: () => getJson("/api/billing/apple-iap-enabled"),
    enabled: nativeIap,
  });
  const { data: playLive } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/billing/google-play-enabled"],
    queryFn: () => getJson("/api/billing/google-play-enabled"),
    enabled: androidNative,
  });
  const storeOpen = nativeIap ? appleLive?.enabled === true : androidNative ? playLive?.enabled === true : false;
  const billingOpen = nativeIap || androidNative ? storeOpen : webBillingOpen;
  const { data: iosProducts } = useQuery<FreeAgentAddOnProduct[]>({
    queryKey: ["apple-iap-free-agent-add-ons"],
    queryFn: fetchFreeAgentAddOnProducts,
    enabled: nativeIap && storeOpen,
  });
  const { data: playProducts } = useQuery<FreeAgentAddOnProduct[]>({
    queryKey: ["google-play-free-agent-add-ons"],
    queryFn: fetchGooglePlayAddOnProducts,
    enabled: androidNative && storeOpen,
  });

  const unlocked = entitlements?.extraVideoStorage === true;
  const owned = entitlements?.ownedAddOns[VIDEO_STORAGE_ADD_ON_ID] === true;
  const storePrice = (nativeIap ? iosProducts : androidNative ? playProducts : undefined)?.find((p) => p.addOn === VIDEO_STORAGE_ADD_ON_ID)?.displayPrice ?? null;
  // On a phone the price shown has to be the store's own, and a missing one means there is no
  // product to buy yet. On the web the Stripe checkout quotes the shared constant.
  const sellable = billingOpen && (nativeIap || androidNative ? storePrice !== null : true);
  const price = nativeIap || androidNative ? storePrice : formatCents(addOn.monthlyPriceCents);

  async function buy() {
    setBusy(true);
    try {
      if (nativeIap) {
        await purchaseFreeAgentAddOn(VIDEO_STORAGE_ADD_ON_ID);
      } else if (androidNative) {
        await purchaseFreeAgentAddOnOnGooglePlay(VIDEO_STORAGE_ADD_ON_ID);
      } else {
        const res = await apiRequest("POST", "/api/billing/checkout/free-agent-add-on", { addOnId: VIDEO_STORAGE_ADD_ON_ID });
        const { url } = await res.json();
        window.location.href = url;
        return;
      }
      toast.success("Extra video storage is on.");
      await refetch();
    } catch (err) {
      if (err instanceof ApplePurchaseCancelledError || err instanceof GooglePlayPurchaseCancelledError) {
        // Backed out of the store's sheet: not an error.
      } else if (err instanceof ApplePurchasePendingError || err instanceof GooglePlayPurchasePendingError) {
        toast("Purchase pending approval. Extra storage turns on once it's confirmed.");
      } else {
        toast.error(err instanceof Error ? err.message : "Couldn't start that purchase");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={unlocked ? "border-success/50" : undefined}>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HardDrive className="h-5 w-5" />
          </div>
          {unlocked ? (
            <Badge variant="success" className="shrink-0 gap-1 text-[10px]">
              <Unlock className="h-2.5 w-2.5" />
              {owned ? "SUBSCRIBED" : "UNLOCKED"}
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
              <Lock className="h-2.5 w-2.5" />
              {sellable && price ? price : "LOCKED"}
            </Badge>
          )}
        </div>
        <p className="font-display text-xl font-bold uppercase tracking-wide">{addOn.label}</p>
        <p className="text-sm text-muted-foreground">{addOn.description}</p>
        {unlocked ? (
          <p className="mt-auto rounded-md border border-border px-3 py-2 text-center text-xs text-muted-foreground">
            Your account keeps the larger limits.
          </p>
        ) : sellable ? (
          <Button size="sm" variant="outline" className="mt-auto w-full" disabled={busy} onClick={() => void buy()}>
            {busy ? "Opening..." : `Get for ${price}/mo`}
          </Button>
        ) : (
          <p className="mt-auto rounded-md border border-border px-3 py-2 text-center text-xs text-muted-foreground">
            {billingOpen ? "Not available in the store yet." : "Not available yet."}
          </p>
        )}
        {!unlocked && sellable && <SubscriptionLegalLinks compact />}
      </CardContent>
    </Card>
  );
}
