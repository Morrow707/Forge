import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import {
  FREE_AGENT_ADD_ONS,
  FREE_AGENT_ADD_ON_ORDER,
  type FreeAgentAddOnId,
} from "@shared/free-agent-tiers";
import { formatCents } from "@shared/billing-tiers";
import {
  isAppleIapSupported,
  fetchFreeAgentAddOnProducts,
  purchaseFreeAgentAddOn,
  ApplePurchaseCancelledError,
  ApplePurchasePendingError,
  type FreeAgentAddOnProduct,
} from "@/lib/apple-iap";
import { cn } from "@/lib/utils";
import { Sparkles, Unlock, Lock } from "lucide-react";

/** What GET /api/athlete/entitlements answers with. `addOns` is MAY I OPEN THIS
 * and `ownedAddOns` is DID I PAY FOR THIS -- two different questions, and the
 * difference between them is the whole of beta. */
type AthleteEntitlements = {
  addOns: Record<FreeAgentAddOnId, boolean>;
  ownedAddOns: Record<FreeAgentAddOnId, boolean>;
  billingOpen: boolean;
};

/** Picker for the three sport-specialist AI coaches -- each is its own paid
 * add-on (see shared/free-agent-tiers.ts).
 *
 * ACCESS COMES FROM THE SERVER, and that is a fix rather than a refactor. This
 * page used to read `user.isBetaAccount ? all : user.freeAgentAddOns` off the
 * /api/auth/me payload, which is a second copy of a rule that lives in
 * getFreeAgentEntitlements -- and an incomplete copy: an active redeemed trial
 * and BILLING_ENFORCEMENT_ENABLED being off both unlock every add-on server-side
 * and neither had any effect here, so a trialing athlete was shown three "Not in
 * your plan" cards for three coaches the server would have let them open. Same
 * rule CLAUDE.md states for the camera: the client never re-derives it, and every
 * gate below requires an explicit true. */
export default function AthleteSportCoaches() {
  const [, navigate] = useLocation();
  const nativeIap = isAppleIapSupported();
  const [busyAddOn, setBusyAddOn] = useState<FreeAgentAddOnId | null>(null);

  const {
    data: entitlements,
    isError,
    refetch,
  } = useQuery<AthleteEntitlements>({
    queryKey: ["/api/athlete/entitlements"],
    queryFn: () => getJson("/api/athlete/entitlements"),
  });

  // StoreKit's own prices, on iOS only and only once there is something to sell.
  // Null displayPrice (which is every add-on today -- the Products do not exist in
  // App Store Connect yet) means no purchase button, never a button that fails.
  const { data: iapProducts } = useQuery<FreeAgentAddOnProduct[]>({
    queryKey: ["apple-iap-free-agent-add-ons"],
    queryFn: fetchFreeAgentAddOnProducts,
    enabled: nativeIap && !!entitlements?.billingOpen,
  });

  async function buy(id: FreeAgentAddOnId) {
    setBusyAddOn(id);
    try {
      if (nativeIap) {
        await purchaseFreeAgentAddOn(id);
        toast.success("Unlocked -- your new coach is ready.");
        await refetch();
      } else {
        const res = await apiRequest("POST", "/api/billing/checkout/free-agent-add-on", {
          addOnId: id,
        });
        const { url } = await res.json();
        window.location.href = url;
        return;
      }
    } catch (err) {
      if (err instanceof ApplePurchaseCancelledError) {
        // Backed out of Apple's sheet -- not an error.
      } else if (err instanceof ApplePurchasePendingError) {
        toast("Purchase pending approval -- you'll be unlocked once it's confirmed.");
      } else {
        toast.error(err instanceof Error ? err.message : "Couldn't start that purchase");
      }
    } finally {
      setBusyAddOn(null);
    }
  }

  return (
    <FreeAgentGate title="Sport Coaches">
      <AppShell title="Sport Coaches">
        {/* Never render the cards over a failed read: without an answer every card
            would draw its locked state, which tells an athlete who owns all three
            that they own none. */}
        {isError ? (
          <Card>
            <CardContent className="py-16">
              <ReadFailed what="your sport coaches" onRetry={() => void refetch()} />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FREE_AGENT_ADD_ON_ORDER.map((id) => {
              const addOn = FREE_AGENT_ADD_ONS[id];
              // Explicit true, never truthiness: undefined is "not answered yet",
              // which is neither yes nor no.
              const unlocked = entitlements?.addOns[id] === true;
              const owned = entitlements?.ownedAddOns[id] === true;
              const billingOpen = entitlements?.billingOpen === true;
              const iapPrice = iapProducts?.find((p) => p.addOn === id)?.displayPrice ?? null;
              // On iOS the price shown has to be StoreKit's own, and a missing one
              // means there is no Product to buy. On the web the Stripe checkout
              // quotes the shared constant.
              const sellable = billingOpen && (!nativeIap || iapPrice !== null);
              const price = nativeIap ? iapPrice : formatCents(addOn.monthlyPriceCents);
              return (
                <Card
                  key={id}
                  className={cn(
                    "flex flex-col transition-colors",
                    unlocked ? "cursor-pointer hover:border-primary/50" : "opacity-75",
                  )}
                  onClick={unlocked ? () => navigate(`/athlete/coach/${id}`) : undefined}
                >
                  <CardContent className="flex flex-1 flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      {unlocked ? (
                        <Badge variant="success" className="shrink-0 gap-1 text-[10px]">
                          <Unlock className="h-2.5 w-2.5" />
                          UNLOCKED
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                          <Lock className="h-2.5 w-2.5" />
                          {sellable ? (price ?? "") : "LOCKED"}
                        </Badge>
                      )}
                    </div>
                    <p className="font-display text-xl font-bold uppercase tracking-wide">
                      {addOn.label}
                    </p>
                    <p className="text-sm text-muted-foreground">{addOn.description}</p>
                    {unlocked ? (
                      <Button size="sm" className="mt-auto w-full">
                        Open chat
                      </Button>
                    ) : sellable ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-auto w-full"
                        disabled={busyAddOn !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          void buy(id);
                        }}
                      >
                        {busyAddOn === id ? "Opening..." : `Get for ${price}/mo`}
                      </Button>
                    ) : (
                      // NOT "free while Forge is in beta" -- this branch is reached
                      // precisely by an account that is NOT comped (a beta account
                      // or a live trial resolves as unlocked above and never gets
                      // here), so that sentence would be false for the only people
                      // who can read it. A dead disabled button saying "Not in your
                      // plan" was the other wrong answer: there is no plan this is
                      // in, and nothing sells it yet.
                      <p className="mt-auto rounded-md border border-border px-3 py-2 text-center text-xs text-muted-foreground">
                        Not available yet -- this coach will be purchasable when billing opens.
                      </p>
                    )}
                    {unlocked && !owned && (
                      <p className="text-center text-[11px] text-muted-foreground">
                        Free while Forge is in beta.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </AppShell>
    </FreeAgentGate>
  );
}
