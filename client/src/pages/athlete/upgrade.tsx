import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import {
  isAppleIapSupported,
  fetchFreeAgentTierProducts,
  purchaseFreeAgentTier,
  restoreFreeAgentPurchases,
  ApplePurchaseCancelledError,
  ApplePurchasePendingError,
  type FreeAgentTierProduct,
} from "@/lib/apple-iap";
import type { FreeAgentTierId } from "@shared/free-agent-tiers";
import { Sparkles, Video, RotateCcw } from "lucide-react";

/** The one real purchase surface in the app -- everything else (the sport
 * coaches, Coaches Corner, Classes) stays framework-only until this proves
 * out. Three states, checked in order: not on iOS at all (no purchase
 * mechanism exists anywhere else), on iOS but APPLE_IAP_LIVE is off (real
 * IAP is built but intentionally not turned on -- see server/apple-iap.ts),
 * or actually live. Only the third state ever renders a Subscribe button. */
export default function AthleteUpgrade() {
  const supported = isAppleIapSupported();

  const { data: liveConfig } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/billing/apple-iap-enabled"],
    queryFn: () => getJson("/api/billing/apple-iap-enabled"),
    enabled: supported,
  });
  const live = supported && !!liveConfig?.enabled;

  const {
    data: products,
    isLoading,
    refetch,
  } = useQuery<FreeAgentTierProduct[]>({
    queryKey: ["apple-iap-free-agent-products"],
    queryFn: fetchFreeAgentTierProducts,
    enabled: live,
  });

  const [purchasingTier, setPurchasingTier] = useState<FreeAgentTierId | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function handlePurchase(tier: FreeAgentTierId) {
    setPurchasingTier(tier);
    try {
      await purchaseFreeAgentTier(tier);
      toast.success("You're upgraded -- welcome to the new tier.");
      refetch();
    } catch (err) {
      if (err instanceof ApplePurchaseCancelledError) {
        // Athlete backed out of the Apple purchase sheet -- not an error.
      } else if (err instanceof ApplePurchasePendingError) {
        toast("Purchase pending approval -- you'll be upgraded once it's confirmed.");
      } else {
        toast.error("Couldn't complete that purchase -- try again");
      }
    } finally {
      setPurchasingTier(null);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      await restoreFreeAgentPurchases();
      toast.success("Purchases restored");
      refetch();
    } catch {
      toast.error("Couldn't restore purchases -- try again");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <FreeAgentGate title="Upgrade">
      <AppShell
        title="Upgrade"
        actions={
          live ? (
            <Button variant="outline" size="sm" onClick={handleRestore} disabled={restoring}>
              <RotateCcw className="h-4 w-4" />
              {restoring ? "Restoring..." : "Restore Purchases"}
            </Button>
          ) : undefined
        }
      >
        {!supported && (
          <Card className="mt-6">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground" />
              <p className="max-w-sm text-muted-foreground">
                Upgrading is only available in the Forge iOS app.
              </p>
            </CardContent>
          </Card>
        )}
        {supported && !live && (
          <Card className="mt-6">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground" />
              <p className="max-w-sm text-muted-foreground">
                Upgrades aren't open yet -- check back soon.
              </p>
            </CardContent>
          </Card>
        )}
        {live && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {isLoading &&
              [0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-lg bg-surface" />)}
            {products?.map((p) => (
              <Card key={p.tier} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-lg font-bold uppercase tracking-wide">{p.label}</p>
                    {p.hasVideoFormCheck && (
                      <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                        <Video className="h-2.5 w-2.5" />
                        VIDEO
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                  <p className="mt-auto font-display text-2xl font-bold">
                    {p.displayPrice ?? "--"}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </p>
                  <Button
                    onClick={() => handlePurchase(p.tier)}
                    disabled={purchasingTier !== null || !p.displayPrice}
                  >
                    {purchasingTier === p.tier ? "Purchasing..." : "Subscribe"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </AppShell>
    </FreeAgentGate>
  );
}
