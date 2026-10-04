import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, getJson } from "@/lib/queryClient";
import { formatCents } from "@shared/billing-tiers";
import { ALL_CLASSES_ADD_ON_ID, FREE_AGENT_ADD_ONS, type FreeAgentAddOnId } from "@shared/free-agent-tiers";
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
import { GraduationCap, Lock, Unlock } from "lucide-react";

type Entitlements = {
  addOns: Record<FreeAgentAddOnId, boolean>;
  ownedAddOns: Record<FreeAgentAddOnId, boolean>;
  billingOpen: boolean;
};

/** ALL CLASSES, the one thing a Free Agent can buy on top of a tier (2026-10-04). Drawn on
 * the upgrade page and, compact, beside a locked chapter. Access comes from the server
 * (/api/athlete/entitlements), never re-derived; the buy goes through StoreKit on iOS, Play on
 * Android, Stripe on the web, exactly as a tier does. A coached athlete never sees this: their
 * classes come from their coach, and the server refuses the purchase for them. */
export function AllClassesCard({ compact = false }: { compact?: boolean }) {
  const [, navigate] = useLocation();
  const nativeIap = isAppleIapSupported();
  const androidNative = isGooglePlayBillingSupported();
  const [busy, setBusy] = useState(false);
  const addOn = FREE_AGENT_ADD_ONS[ALL_CLASSES_ADD_ON_ID];

  const { data: entitlements, refetch } = useQuery<Entitlements>({
    queryKey: ["/api/athlete/entitlements"],
    queryFn: () => getJson("/api/athlete/entitlements"),
  });
  const billingOpen = entitlements?.billingOpen === true;
  const { data: iosProducts } = useQuery<FreeAgentAddOnProduct[]>({
    queryKey: ["apple-iap-free-agent-add-ons"],
    queryFn: fetchFreeAgentAddOnProducts,
    enabled: nativeIap && billingOpen,
  });
  const { data: playProducts } = useQuery<FreeAgentAddOnProduct[]>({
    queryKey: ["google-play-free-agent-add-ons"],
    queryFn: fetchGooglePlayAddOnProducts,
    enabled: androidNative && billingOpen,
  });

  const unlocked = entitlements?.addOns[ALL_CLASSES_ADD_ON_ID] === true;
  const owned = entitlements?.ownedAddOns[ALL_CLASSES_ADD_ON_ID] === true;
  const storePrice = (nativeIap ? iosProducts : androidNative ? playProducts : undefined)?.find((p) => p.addOn === ALL_CLASSES_ADD_ON_ID)?.displayPrice ?? null;
  // On a phone the price shown has to be the store's own, and a missing one means there is no
  // product to buy yet. On the web the Stripe checkout quotes the shared constant.
  const sellable = billingOpen && (nativeIap || androidNative ? storePrice !== null : true);
  const price = nativeIap || androidNative ? storePrice : formatCents(addOn.monthlyPriceCents);

  async function buy() {
    setBusy(true);
    try {
      if (nativeIap) {
        await purchaseFreeAgentAddOn(ALL_CLASSES_ADD_ON_ID);
      } else if (androidNative) {
        await purchaseFreeAgentAddOnOnGooglePlay(ALL_CLASSES_ADD_ON_ID);
      } else {
        const res = await apiRequest("POST", "/api/billing/checkout/free-agent-add-on", { addOnId: ALL_CLASSES_ADD_ON_ID });
        const { url } = await res.json();
        window.location.href = url;
        return;
      }
      toast.success("Every class is open.");
      await refetch();
    } catch (err) {
      if (err instanceof ApplePurchaseCancelledError || err instanceof GooglePlayPurchaseCancelledError) {
        // Backed out of the store's sheet: not an error.
      } else if (err instanceof ApplePurchasePendingError || err instanceof GooglePlayPurchasePendingError) {
        toast("Purchase pending approval, every class opens once it's confirmed.");
      } else {
        toast.error(err instanceof Error ? err.message : "Couldn't start that purchase");
      }
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Comes with All Classes{price ? `, ${price}/mo` : ""}
        </span>
        {sellable ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void buy()}>
            {busy ? "Opening..." : "Get All Classes"}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => navigate("/athlete/upgrade")}>
            See plans
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={unlocked ? "border-success/50" : undefined}>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
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
          <Button size="sm" className="mt-auto w-full" onClick={() => navigate("/athlete/classes")}>
            Open classes
          </Button>
        ) : sellable ? (
          <Button size="sm" variant="outline" className="mt-auto w-full" disabled={busy} onClick={() => void buy()}>
            {busy ? "Opening..." : `Get for ${price}/mo`}
          </Button>
        ) : (
          <p className="mt-auto rounded-md border border-border px-3 py-2 text-center text-xs text-muted-foreground">
            {billingOpen ? "Not available in the store yet." : "Free while Forge is in beta, nothing to pay yet."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
