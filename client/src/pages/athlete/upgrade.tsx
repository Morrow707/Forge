import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  isGooglePlayBillingSupported,
  fetchGooglePlayTierProducts,
  purchaseFreeAgentTierOnGooglePlay,
  restoreGooglePlayPurchases,
  GooglePlayPurchaseCancelledError,
  GooglePlayPurchasePendingError,
} from "@/lib/google-play-billing";
import { cn } from "@/lib/utils";
import { ReadFailed } from "@/components/read-failed";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import {
  isAppleIapSupported,
  fetchFreeAgentTierProducts,
  purchaseFreeAgentTier,
  restoreFreeAgentPurchases,
  redeemAppleOfferCode,
  ApplePurchaseCancelledError,
  ApplePurchasePendingError,
  type FreeAgentTierProduct,
} from "@/lib/apple-iap";
import type { FreeAgentTierId, FreeAgentAddOnId } from "@shared/free-agent-tiers";
import {
  addOnIsOffered,
  FREE_AGENT_ADD_ONS,
  SPORT_COACH_ADD_ON_IDS,
} from "@shared/free-agent-tiers";
import { AllClassesCard } from "@/components/all-classes-card";
import { VideoStorageCard } from "@/components/video-storage-card";
import { Sparkles, Video, RotateCcw, CreditCard } from "lucide-react";
import {
  FREE_AGENT_TIERS,
  FREE_AGENT_TIER_ORDER,
  FREE_AGENT_TIER_GRID_COLS,
} from "@shared/free-agent-tiers";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { CameraMetricCaveat } from "@/components/camera-metric-caveat";
import { SubscriptionLegalLinks } from "@/components/subscription-legal-links";
import { forgeCodeEntryIsAllowed } from "@/lib/forge-code-entry";
import { checkoutReceipt, type CheckoutReceipt } from "@shared/checkout-receipt";
import { formatCents } from "@shared/billing-tiers";

/** The add-on half of GET /api/athlete/entitlements -- see sport-coaches.tsx for
 * why `addOns` (may I open it) and `ownedAddOns` (did I pay for it) are two
 * different questions. */
type AddOnEntitlements = {
  freeAgentTier: FreeAgentTierId | null;
  addOns: Record<FreeAgentAddOnId, boolean>;
  ownedAddOns: Record<FreeAgentAddOnId, boolean>;
  billingOpen: boolean;
  /** The plan on this account is billed through the App Store. Only ever true for somebody who
   *  bought in the app, and only read on the WEB grid below -- see its own comment. */
  appleSubscriptionOnFile?: boolean;
  /** When a running free trial ends (the signup trial or a promo code's month), else null. */
  trialEndsAt?: string | null;
};

/** The sport-coach add-ons, with price and status, on the one page an athlete
 * goes to in order to buy something.
 *
 * Status comes from the server, never from a tier table here: an add-on is a
 * separate purchase from a tier and the beta/trial short-circuit that turns it on
 * lives in getFreeAgentEntitlements. The price is the shared constant on the web;
 * on iOS the Sport Coaches page carries the StoreKit price, because only StoreKit
 * can state an Apple price and only it can take the purchase. */
function SportCoachAddOns({ webCheckout }: { webCheckout: boolean }) {
  const { data } = useQuery<AddOnEntitlements>({
    queryKey: ["/api/athlete/entitlements"],
    queryFn: () => getJson("/api/athlete/entitlements"),
  });
  /* WITHDRAWN ADD-ONS ARE NOT DRAWN AT ALL -- not greyed, not "coming soon", not priced.
   * A card saying "$7.99, coming soon" is still an offer, and this section's whole heading was
   * an offer of three things nobody has tested. The heading goes with them: with the sport
   * coaches withheld, "Sport coaches -- bought one at a time" describes an empty shelf. */
  const offered = SPORT_COACH_ADD_ON_IDS.filter(addOnIsOffered);
  if (offered.length === 0) return null;

  return (
    <div className="mt-10">
      <p className="label-xs mb-1">Add-ons</p>
      <p className="mb-4 text-sm text-muted-foreground">
        Bought one at a time, on top of whatever plan you are on.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {offered.map((id) => {
          const addOn = FREE_AGENT_ADD_ONS[id];
          // Explicit true throughout -- undefined means "not answered yet".
          const unlocked = data?.addOns[id] === true;
          const owned = data?.ownedAddOns[id] === true;
          const status = owned
            ? "Owned"
            : unlocked
              ? "Included with your account"
              : data?.billingOpen === true
                ? "Available"
                : "Not available yet";
          return (
            <Card key={id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-2 p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-base font-bold uppercase tracking-wide">
                    {addOn.label}
                  </p>
                  <Badge variant={unlocked ? "success" : "secondary"} className="shrink-0 text-[10px]">
                    {status.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{addOn.description}</p>
                <p className="mt-auto font-display text-xl font-bold">
                  {formatCents(addOn.monthlyPriceCents)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                {/* Stripe on the web only. On iOS an add-on is a StoreKit purchase
                    made from the Sport Coaches page, and the server refuses a web
                    checkout carrying the native platform header anyway -- a button
                    here would be a guaranteed error toast. */}
                {!unlocked && data?.billingOpen === true && webCheckout && (
                  <Button size="sm" variant="outline" onClick={() => void startAddOnCheckout(id)}>
                    Get
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Web checkout for one add-on. Hands off to Stripe's hosted page, same as the
 * tier checkout above it -- no card detail touches this app. */
async function startAddOnCheckout(addOnId: FreeAgentAddOnId) {
  try {
    const res = await apiRequest("POST", "/api/billing/checkout/free-agent-add-on", { addOnId });
    const { url } = await res.json();
    window.location.href = url;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Couldn't start checkout, try again");
  }
}

/** The purchase surface, which is two surfaces by necessity.
 *
 * On iOS the tiers are sold through StoreKit, because Apple requires a
 * digital purchase made inside the app to go through them. On the web they
 * are sold through Stripe Checkout. The two never both render: `supported`
 * is only true in the native app, and the server refuses a Stripe checkout
 * carrying the native platform header even if this component were wrong.
 *
 * The iOS path still has its own live switch (APPLE_IAP_LIVE, off -- see
 * server/apple-iap.ts). The web path is live once Stripe has keys and
 * prices; until then the route answers with a plain "not configured" and
 * the button surfaces it rather than failing silently. */
export default function AthleteUpgrade() {
  const supported = isAppleIapSupported();
  // THE ANDROID APP SELLS NOTHING YET, AND SAYS SO. Google Play's billing policy is Apple's:
  // a digital subscription bought inside the app goes through Play Billing, and the app may not
  // hand a buyer to the web checkout or name it. Until the Play Billing path exists (see the
  // launch checklist), the Android app shows the tiers and no purchase button -- not the Stripe
  // grid the web shows, which inside a Play-distributed app is a policy violation. The server
  // refuses a Stripe checkout from any native platform header regardless.
  const androidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  // Google Play is the Android store, the way StoreKit is the iOS one: same products, same
  // verify-then-acknowledge contract (google-play-billing.ts), its own live switch.
  const googleSupported = isGooglePlayBillingSupported();
  const { data: googleLiveConfig } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/billing/google-play-enabled"],
    queryFn: () => getJson("/api/billing/google-play-enabled"),
    enabled: googleSupported,
  });
  const googleLive = googleSupported && !!googleLiveConfig?.enabled;

  const qc = useQueryClient();
  const planRequired = useAuth().user?.planRequired === true;
  const { data: entitlements } = useQuery<AddOnEntitlements>({
    queryKey: ["/api/athlete/entitlements"],
    queryFn: () => getJson("/api/athlete/entitlements"),
  });
  const currentTier = entitlements?.freeAgentTier ?? null;
  const { data: liveConfig } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/billing/apple-iap-enabled"],
    queryFn: () => getJson("/api/billing/apple-iap-enabled"),
    enabled: supported,
  });
  const live = (supported && !!liveConfig?.enabled) || googleLive;
  const storeName = googleSupported ? "Google Play" : "the App Store";

  // The web half's own live switch. Card checkout is refused server-side
  // while Forge is in beta (see chargingClosed in server/billing.ts), so
  // without this the page would render a Subscribe button whose only
  // possible outcome is an error toast.
  const { data: billingStatus } = useQuery<{ open: boolean }>({
    queryKey: ["/api/billing/status"],
    queryFn: () => getJson("/api/billing/status"),
    enabled: !supported && !androidNative,
  });
  const webBillingOpen = !supported && !androidNative && !!billingStatus?.open;

  const {
    data: products,
    isLoading,
    isError: productsFailed,
    refetch,
  } = useQuery<FreeAgentTierProduct[]>({
    queryKey: [googleSupported ? "google-play-free-agent-products" : "apple-iap-free-agent-products"],
    queryFn: googleSupported ? fetchGooglePlayTierProducts : fetchFreeAgentTierProducts,
    enabled: live,
  });

  const [purchasingTier, setPurchasingTier] = useState<FreeAgentTierId | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [checkoutTier, setCheckoutTier] = useState<FreeAgentTierId | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  /** Web only. Hands off to Stripe's hosted checkout rather than collecting
   * a card here -- no card detail ever touches this app. */
  // THE ORDER, BEFORE THE CARD (web only). Picking a plan opens a receipt: the price, a place
  // for a code, and what the code does to today's total. The numbers come from the server
  // (shared/checkout-receipt.ts), which attaches the same code's coupon to the Stripe checkout,
  // so the receipt and the charge cannot disagree.
  const [orderTier, setOrderTier] = useState<FreeAgentTierId | null>(null);
  // Arriving straight from signup (?welcome=1), with any code typed there (?code=CODE). The
  // code box only exists where a Forge code may be typed, so the carried code is dropped in the
  // native app along with it.
  const arrivedFromSignup = new URLSearchParams(window.location.search).get("welcome") === "1";
  const carriedCode = forgeCodeEntryIsAllowed()
    ? (new URLSearchParams(window.location.search).get("code")?.trim().toUpperCase() ?? "")
    : "";
  const [orderCode, setOrderCode] = useState(carriedCode);
  const [appliedCode, setAppliedCode] = useState(carriedCode);
  const { data: orderPreview, isFetching: orderPreviewLoading } = useQuery<{
    codeAccepted: boolean;
    codeMessage: string | null;
    receipt: CheckoutReceipt;
  }>({
    queryKey: ["/api/billing/checkout/free-agent-tier/preview", orderTier, appliedCode],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/billing/checkout/free-agent-tier/preview", {
        tier: orderTier,
        promoCode: appliedCode || undefined,
      });
      return res.json();
    },
    enabled: orderTier !== null,
  });
  const orderReceipt: CheckoutReceipt | null =
    orderTier === null
      ? null
      : (orderPreview?.receipt ?? checkoutReceipt(FREE_AGENT_TIERS[orderTier].monthlyPriceCents, null));

  async function startWebCheckout(tier: FreeAgentTierId) {
    setCheckoutTier(tier);
    try {
      const res = await apiRequest("POST", "/api/billing/checkout/free-agent-tier", {
        tier,
        // Only a code the receipt accepted rides the checkout; a refused one would fail it.
        promoCode: orderPreview?.codeAccepted ? appliedCode : undefined,
      });
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start checkout, try again");
      setCheckoutTier(null);
    }
  }

  /** Stripe's own page for changing a card, reading invoices and cancelling.
   * Only useful once something has been bought, so a 503 here is expected
   * for an account that never subscribed and is surfaced as-is. */
  async function openBillingPortal() {
    setOpeningPortal(true);
    try {
      const res = await apiRequest("POST", "/api/billing/portal", {});
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open billing settings");
      setOpeningPortal(false);
    }
  }

  async function handlePurchase(tier: FreeAgentTierId) {
    setPurchasingTier(tier);
    try {
      if (googleSupported) {
        await purchaseFreeAgentTierOnGooglePlay(tier);
        toast.success("You're upgraded, welcome to the new tier.");
      } else {
        const result = await purchaseFreeAgentTier(tier);
        if (result.deferred && result.appliedTier) {
          // Apple schedules a move to a lower tier for the next renewal and keeps the current one
          // until then; saying "upgraded" here was wrong on 2026-10-05.
          toast(`${FREE_AGENT_TIERS[tier].label} starts at your next renewal. ${FREE_AGENT_TIERS[result.appliedTier].label} stays until then.`);
        } else {
          toast.success(`You're on ${FREE_AGENT_TIERS[tier].label} now.`);
        }
      }
      refetch();
      void qc.invalidateQueries({ queryKey: ["/api/athlete/entitlements"] });
      // The plan wall follows the account's own flag, so a purchase has to refresh it or the
      // athlete stays parked on this screen with a plan they just bought.
      void qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (err) {
      if (err instanceof ApplePurchaseCancelledError || err instanceof GooglePlayPurchaseCancelledError) {
        // Athlete backed out of the store's purchase sheet -- not an error.
      } else if (err instanceof ApplePurchasePendingError || err instanceof GooglePlayPurchasePendingError) {
        toast("Purchase pending approval, you'll be upgraded once it's confirmed.");
      } else {
        // The server's own sentence when it refused the receipt (a 403 for a coached athlete, a
        // 502 when verification is not configured, a 422 for a product it does not sell), so the
        // screen says which step failed instead of "try again" for all of them.
        toast.error(err instanceof ApiError && err.message ? err.message : "Couldn't complete that purchase, try again");
      }
    } finally {
      setPurchasingTier(null);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      if (googleSupported) await restoreGooglePlayPurchases();
      else await restoreFreeAgentPurchases();
      toast.success("Purchases restored");
      refetch();
    } catch {
      toast.error("Couldn't restore purchases, try again");
    } finally {
      setRestoring(false);
    }
  }

  // AN APP STORE OFFER CODE (2026-10-15), redeemed on Apple's own sheet; the transaction it
  // produces comes back through the same watcher a purchase does, so nothing here grants
  // anything. The web checkout takes a Stripe promotion code on the checkout page itself and
  // needs no button. A FORGE code (the launch offer, "30 days free from the day you signed up")
  // is the box below, ON THE WEB ONLY since the 2026-11-06 rejection -- in the app, this sheet
  // is the one way a code is ever redeemed.
  async function handleRedeemCode() {
    try {
      await redeemAppleOfferCode();
      refetch();
    } catch {
      toast.error("Couldn't open the code sheet, try again");
    }
  }

  const [forgeCode, setForgeCode] = useState("");
  const [redeemingForgeCode, setRedeemingForgeCode] = useState(false);
  async function redeemForgeCode() {
    const code = forgeCode.trim();
    if (!code) return;
    setRedeemingForgeCode(true);
    try {
      const res = await apiRequest("POST", "/api/athlete/redeem-code", { code });
      const { trialExpiresAt, message } = (await res.json()) as { trialExpiresAt: string | null; message?: string };
      // Every gate the app draws reads one of these; without the invalidation the toast says
      // unlocked while the record button stays missing until a reload.
      qc.invalidateQueries({ queryKey: ["/api/athlete/entitlements"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/camera-access"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/skills-access"] });
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast.success(
        message ??
          (trialExpiresAt ? `Code applied: full access is free through ${new Date(trialExpiresAt).toLocaleDateString()}` : "Code applied"),
      );
      setForgeCode("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't redeem that code");
    } finally {
      setRedeemingForgeCode(false);
    }
  }
  const trialEndsAt = entitlements?.trialEndsAt ? new Date(entitlements.trialEndsAt) : null;

  return (
    <FreeAgentGate title="Upgrade">
      <AppShell
        title="Upgrade"
        actions={
          live ? (
            <div className="flex items-center gap-2">
              {supported && (
                <Button variant="outline" size="sm" onClick={handleRedeemCode}>
                  App Store code
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleRestore} disabled={restoring}>
                <RotateCcw className="h-4 w-4" />
                {restoring ? "Restoring..." : "Restore Purchases"}
              </Button>
            </div>
          ) : webBillingOpen ? (
            <Button variant="outline" size="sm" onClick={openBillingPortal} disabled={openingPortal}>
              <CreditCard className="h-4 w-4" />
              {openingPortal ? "Opening..." : "Manage billing"}
            </Button>
          ) : undefined
        }
      >
        {arrivedFromSignup && !planRequired && !currentTier && (
          <Card className="mb-6 border-primary/40" data-testid="welcome-pick-a-plan">
            <CardContent className="p-5">
              <p className="font-display text-base font-bold uppercase tracking-wide">
                Welcome to Forge. Pick your plan
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                These are the plans. Choose one to see your total before anything is charged.
              </p>
            </CardContent>
          </Card>
        )}
        {planRequired && (
          <Card className="mb-6 border-primary/40" data-testid="plan-required-banner">
            <CardContent className="p-5">
              <p className="font-display text-base font-bold uppercase tracking-wide">
                Your free trial has ended
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick a plan to keep training. Everything you have logged is still here.
              </p>
            </CardContent>
          </Card>
        )}
        {!planRequired && trialEndsAt && !entitlements?.freeAgentTier && (
          <Card className="mb-6" data-testid="trial-running-banner">
            <CardContent className="p-5">
              <p className="text-sm font-semibold">
                Your free trial runs through {trialEndsAt.toLocaleDateString()}.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick a plan before then to keep training. Nothing you log is lost either way.
              </p>
            </CardContent>
          </Card>
        )}
        {/* A FORGE CODE, ON THE WEB ONLY. This card used to say Apple's rules did not reach it
            because it writes Forge's own trial row rather than buying a store product; App
            Review read it the other way on 2026-11-06 (Guideline 3.1.1, "the app uses promo
            code to unlock or enable subscription") and rejected 1.0 for it. A code that grants
            the paid features is a purchase mechanism outside In-App Purchase, whoever wrote the
            row. The native app draws the App Store code button above instead -- Apple's own
            offer-code sheet -- and nothing here. See lib/forge-code-entry.ts. */}
        {/* With no plan yet, a code goes on the order receipt below, where the card is taken. This
            box is for an account that already has a plan and is given a discount on it. */}
        {forgeCodeEntryIsAllowed() && currentTier && (
        <Card className="mt-6" data-testid="forge-promo-code">
          <CardContent className="space-y-3 p-5">
            {trialEndsAt ? (
              <p className="text-sm font-semibold">
                Full access is free through {trialEndsAt.toLocaleDateString()}.
              </p>
            ) : (
              <p className="text-sm font-semibold">Have a Forge code?</p>
            )}
            <div className="flex items-center gap-2">
              <Input
                value={forgeCode}
                onChange={(e) => setForgeCode(e.target.value.toUpperCase())}
                placeholder="CODE"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={30}
                className="font-mono uppercase"
                aria-label="Forge code"
              />
              <Button
                type="button"
                variant="outline"
                onClick={redeemForgeCode}
                disabled={!forgeCode.trim() || redeemingForgeCode}
              >
                {redeemingForgeCode ? "Checking…" : "Redeem"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Free time on a code counts from the day you signed up.
            </p>
          </CardContent>
        </Card>
        )}
        {androidNative && !live && (
          <Card className="mt-6">
            <CardContent className="p-6 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">Subscriptions aren't available in the Android app yet.</p>
              <p className="mt-2">
                Everything you already have access to keeps working. Plans will be sold here through Google Play
                once that is ready.
              </p>
            </CardContent>
          </Card>
        )}
        {/* BUYING HERE DOES NOT CANCEL AN APP STORE SUBSCRIPTION, and nothing Forge can call
            will: only the person, in iOS Settings. Until 2026-10-14 the two rails could both
            bill one account with nothing said, so this is the sentence that stops the second
            charge rather than recording it afterwards. Web only -- inside the app a tier swap
            stays inside the one StoreKit subscription group, which is why they share one. */}
        {!supported && !androidNative && entitlements?.appleSubscriptionOnFile && (
          <Card className="mt-6 border-amber-500/40">
            <CardContent className="p-5 text-sm">
              <p className="font-semibold">Your plan is billed through the App Store.</p>
              <p className="mt-1 text-muted-foreground">
                Changing plans here starts a new card subscription and does not stop that one. Cancel
                it in iOS Settings first, or you will be charged by both.
              </p>
            </CardContent>
          </Card>
        )}
        {!supported && !androidNative && (
          <div className={cn("mt-6 grid grid-cols-1 gap-4", FREE_AGENT_TIER_GRID_COLS)}>
            {FREE_AGENT_TIER_ORDER.map((id) => {
              const tier = FREE_AGENT_TIERS[id];
              return (
                <Card key={id} className="flex flex-col">
                  <CardContent className="flex flex-1 flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-lg font-bold uppercase tracking-wide">
                        {tier.label}
                      </p>
                      {tier.hasVideoFormCheck && (
                        <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                          <Video className="h-2.5 w-2.5" />
                          VIDEO
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{tier.description}</p>
                    {tier.hasVideoFormCheck && <CameraMetricCaveat variant="purchase" />}
                    <p className="mt-auto font-display text-2xl font-bold">
                      {formatCents(tier.monthlyPriceCents)}
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </p>
                    {currentTier === id ? (
                      <p className="rounded-md border border-success/60 px-3 py-2 text-center text-xs font-semibold text-success">
                        Your current plan
                      </p>
                    ) : webBillingOpen ? (
                      <Button
                        variant={orderTier === id ? "secondary" : "default"}
                        onClick={() => setOrderTier(id)}
                        disabled={checkoutTier !== null}
                        data-testid={`button-choose-plan-${id}`}
                      >
                        {orderTier === id ? "Selected" : currentTier ? "Switch to this plan" : "Choose this plan"}
                      </Button>
                    ) : (
                      <p className="rounded-md border border-border px-3 py-2 text-center text-xs text-muted-foreground">
                        Not available yet.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        {!supported && !androidNative && webBillingOpen && orderTier && orderReceipt && (
          <Card className="mt-6 border-primary/50" data-testid="order-receipt">
            <CardContent className="space-y-4 p-5">
              <p className="font-display text-lg font-bold uppercase tracking-wide">Your order</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>{FREE_AGENT_TIERS[orderTier].label}, monthly</span>
                  <span data-testid="receipt-price">{formatCents(orderReceipt.monthlyPriceCents)}</span>
                </div>
                {orderReceipt.discount && (
                  <div className="flex items-center justify-between gap-3 text-success">
                    <span data-testid="receipt-discount-label">
                      Code {orderReceipt.discount.code}:{" "}
                      {orderReceipt.discount.percentOff === 100
                        ? `free for ${orderReceipt.discount.months} month${orderReceipt.discount.months === 1 ? "" : "s"}`
                        : `${orderReceipt.discount.percentOff}% off for ${orderReceipt.discount.months} month${orderReceipt.discount.months === 1 ? "" : "s"}`}
                    </span>
                    <span data-testid="receipt-discount">-{formatCents(orderReceipt.discountCentsPerMonth)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2 text-base font-bold">
                  <span>Due today</span>
                  <span data-testid="receipt-due-today">{formatCents(orderReceipt.dueTodayCents)}</span>
                </div>
                <p className="text-xs text-muted-foreground" data-testid="receipt-summary">
                  {orderReceipt.summary}
                </p>
              </div>
              {forgeCodeEntryIsAllowed() && (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Have a coupon code?</p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={orderCode}
                      onChange={(e) => setOrderCode(e.target.value.toUpperCase())}
                      placeholder="CODE"
                      autoCapitalize="characters"
                      autoComplete="off"
                      maxLength={30}
                      className="font-mono uppercase"
                      aria-label="Coupon code"
                      data-testid="input-order-code"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAppliedCode(orderCode.trim())}
                      disabled={orderPreviewLoading || orderCode.trim() === appliedCode}
                      data-testid="button-apply-order-code"
                    >
                      {orderPreviewLoading ? "Checking…" : "Apply"}
                    </Button>
                  </div>
                  {appliedCode && orderPreview && !orderPreview.codeAccepted && (
                    <p className="text-xs text-destructive" data-testid="order-code-refused">
                      {orderPreview.codeMessage ?? "That code isn't valid"}
                    </p>
                  )}
                </div>
              )}
              <Button
                className="w-full"
                onClick={() => startWebCheckout(orderTier)}
                disabled={checkoutTier !== null || orderPreviewLoading}
                data-testid="button-checkout"
              >
                {checkoutTier ? "Opening checkout..." : "Checkout"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Your card is entered on the next page, with Stripe. Forge never sees the card number.
              </p>
            </CardContent>
          </Card>
        )}
        {!supported && !androidNative && <SubscriptionLegalLinks className="mt-4" />}
        {/* All Classes (2026-10-04): the one add-on on sale, on top of any tier. */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AllClassesCard />
          <VideoStorageCard />
        </div>
        <SportCoachAddOns webCheckout={!supported && !androidNative} />
        {supported && !live && (
          <Card className="mt-6">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground" />
              <p className="max-w-sm text-muted-foreground">
                Upgrades aren't open yet, check back soon.
              </p>
            </CardContent>
          </Card>
        )}
        {live && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {productsFailed && !isLoading && (
              <ReadFailed what={`the plans from ${storeName}`} onRetry={() => void refetch()} />
            )}
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
                  {p.hasVideoFormCheck && <CameraMetricCaveat variant="purchase" />}
                  <p className="mt-auto font-display text-2xl font-bold">
                    {p.displayPrice ?? "--"}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </p>
                  {currentTier === p.tier ? (
                    <p className="rounded-md border border-success/60 px-3 py-2 text-center text-xs font-semibold text-success">
                      Your current plan
                    </p>
                  ) : (
                    <Button
                      onClick={() => handlePurchase(p.tier)}
                      disabled={purchasingTier !== null || !p.displayPrice}
                    >
                      {purchasingTier === p.tier ? "Purchasing..." : currentTier ? "Switch to this plan" : "Subscribe"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {live && <SubscriptionLegalLinks className="mt-4" />}
      </AppShell>
    </FreeAgentGate>
  );
}
