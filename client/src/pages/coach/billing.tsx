import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApplePurchaseCancelledError,
  ApplePurchasePendingError,
  fetchCoachAddOnPrice,
  isAppleIapSupported,
  purchaseCoachAddOn,
  restoreFreeAgentPurchases,
} from "@/lib/apple-iap";
import { Capacitor } from "@capacitor/core";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReadFailed } from "@/components/read-failed";
import { ApiError, apiRequest, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { CreditCard, Users } from "lucide-react";
import { bandForAthleteCount, coachMonthlyCents, formatCents, ORG_PER_ATHLETE_CENTS } from "@shared/billing-tiers";
import { useAuth } from "@/hooks/use-auth";
import { SubscriptionLegalLinks } from "@/components/subscription-legal-links";
import { useT } from "@/i18n";

/** GET /api/coach/entitlements, the add-on half. purchasableAddOns is derived
 * server-side from COACH_PURCHASABLE_ADD_ON_ORDER, so this page never holds its
 * own list of what is for sale or what it costs. */
type CoachEntitlements = {
  coachesCorner: { unlocked: boolean; owned: boolean; compedForRoster: boolean };
  purchasableAddOns: { id: string; label: string; description: string; monthlyPriceCents: number; unlocked: boolean; owned: boolean }[];
  billingOpen: boolean;
};

type RosterAthlete = { id: number };

/** What GET/PUT /api/coach/plan answer with. `band` is null only when no
 * planned count has been set yet (an account made before the signup
 * question existed). */
type CoachPlan = {
  plannedAthleteCount: number | null;
  rosterCount: number;
  billedCount: number;
  /** What the subscription on file actually covers, which is NOT the quote below. Null until a
   *  payment or an admin writes it -- see coachPlanPayload. */
  paidBand: { id: string; label: string } | null;
  band: {
    id: string;
    label: string;
    monthlyPriceCents: number;
    athleteCapIncluded: number;
    athleteFloor: number;
  } | null;
  perAthleteCents: number;
};

/** A coach's own billing page.
 *
 * The org model is a flat account fee plus one seat per athlete, so the bill
 * is shown as that arithmetic rather than as a single number -- a coach
 * should be able to see why it is what it is, and watch it move when their
 * roster does.
 *
 * Web only. Apple requires an in-app digital purchase to go through
 * StoreKit, and there is no in-app product for coach plans, so the native
 * app says where to go instead of linking a checkout the server would
 * refuse anyway. */
export default function CoachBilling() {
  const t = useT();
  const isNative = Capacitor.isNativePlatform();
  // THE PROGRAM'S MONEY IS THE PRIMARY COACH'S, AND THIS PAGE NEVER ASKED (2026-10-11).
  //
  // The plan-edit control was already withheld from an assistant -- but by a 403 coming back
  // from the server (planForbidden below), after the fact. Subscribe and the Coaches Corner buy
  // button were drawn for anybody, and both charged the SESSION coach's card and wrote the
  // purchase to the SESSION coach's row, which no entitlement reads: every one of them resolves
  // off the primary (getEntitlementsForCoach takes coachIds[0], ownsCoachesCorner looks the
  // primary up by hand). So an assistant could pay for the band, or $19.99 a month for Coaches
  // Corner, and unlock nothing for anybody.
  //
  // The routes refuse it now (requirePrimaryCoachForBilling) and that is the real gate. This is
  // the half that stops an assistant being shown a button that takes their card and gives the
  // program nothing -- and it says who to ask instead of failing silently.
  //
  // `=== true` with no loading branch is safe here specifically: ProtectedRoute renders a
  // spinner until /api/auth/me has answered and only mounts this page for a confirmed user, so
  // `user` is never undefined by the time this runs and a primary coach can never be shown the
  // assistant's sentence in a flash. Same pattern, same reason, as coach/branding.tsx.
  const { user } = useAuth();
  const isPrimaryCoach = user?.isPrimaryCoach === true;
  // On the admin's exempt list: this coach is told so and is offered nothing to buy.
  const covered = user?.planCoveredByForge === true;
  const [starting, setStarting] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  const queryClient = useQueryClient();
  const [planDraft, setPlanDraft] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  // 403 means a staff (non-primary) coach -- they see the plan but cannot
  // change it. Held separately from isError because it is not a failed read:
  // the numbers are still on screen, only the control goes away.
  const [planForbidden, setPlanForbidden] = useState(false);

  // The plan the school picked at signup, and what it is billed for. Read
  // from the server rather than derived here: billedCount is max(planned,
  // roster) on the server side and two copies of that rule would disagree
  // silently.
  const {
    data: plan,
    isError: planReadFailed,
    error: planErr,
    refetch: refetchPlan,
  } = useQuery<CoachPlan>({
    queryKey: ["/api/coach/plan"],
    queryFn: () => getJson("/api/coach/plan"),
  });

  // A staff coach may be refused the read as well as the write. That is not
  // a failed read -- it has an answer, just not one with a control on it.
  const planIsForbidden =
    planForbidden || (planErr instanceof ApiError && planErr.status === 403);
  const planError = planReadFailed && !planIsForbidden;

  const { data: roster = [] } = useQuery<RosterAthlete[]>({
    queryKey: ["/api/coach/roster"],
    queryFn: () => getJson("/api/coach/roster"),
  });

  // Same beta switch the athlete Upgrade page reads: card checkout is
  // refused server-side while Forge is in beta, so a Subscribe button here
  // could only ever produce an error toast.
  const { data: billingStatus } = useQuery<{ open: boolean }>({
    queryKey: ["/api/billing/status"],
    queryFn: () => getJson("/api/billing/status"),
  });
  const billingOpen = !!billingStatus?.open;

  // What this org has on top of the plan, resolved by the server. The beta flag,
  // an active trial and BILLING_ENFORCEMENT_ENABLED all decide it and none of them
  // is visible from here, so this page asks rather than works it out.
  const { data: entitlements } = useQuery<CoachEntitlements>({
    queryKey: ["/api/coach/entitlements"],
    queryFn: () => getJson("/api/coach/entitlements"),
  });
  const [buyingAddOn, setBuyingAddOn] = useState<string | null>(null);
  // ON iOS THE ADD-ON IS SOLD THROUGH STOREKIT, like the Free Agent tiers: Apple requires a
  // digital subscription bought inside the app to go through in-app purchase, and the Stripe
  // checkout above is refused from a native platform. The button appears only once App Store
  // Connect answers with a price for the product (2026-10-03: Coaches Corner).
  const appleSupported = isAppleIapSupported();
  const [applePrices, setApplePrices] = useState<Record<string, string | null>>({});
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    if (!appleSupported || !entitlements) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string | null> = {};
      for (const addOn of entitlements.purchasableAddOns) {
        next[addOn.id] = await fetchCoachAddOnPrice(addOn.id).catch(() => null);
      }
      if (!cancelled) setApplePrices(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [appleSupported, entitlements]);

  async function buyAddOnWithApple(addOnId: string) {
    setBuyingAddOn(addOnId);
    try {
      await purchaseCoachAddOn(addOnId);
      toast.success(t("Purchased. Thank you."));
      queryClient.invalidateQueries({ queryKey: ["/api/coach/entitlements"] });
    } catch (err) {
      if (err instanceof ApplePurchaseCancelledError) return;
      if (err instanceof ApplePurchasePendingError) {
        toast.info(t("Waiting on approval from the App Store. It unlocks on its own once approved."));
        return;
      }
      toast.error(err instanceof Error ? err.message : t("The purchase didn't go through, try again"));
    } finally {
      setBuyingAddOn(null);
    }
  }

  async function restoreApplePurchases() {
    setRestoring(true);
    try {
      await restoreFreeAgentPurchases();
      toast.success(t("Purchases restored"));
      queryClient.invalidateQueries({ queryKey: ["/api/coach/entitlements"] });
    } catch {
      toast.error(t("Couldn't restore purchases, try again"));
    } finally {
      setRestoring(false);
    }
  }

  async function buyAddOn(addOnId: string) {
    setBuyingAddOn(addOnId);
    try {
      const res = await apiRequest("POST", "/api/billing/checkout/coach-add-on", { addOnId });
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Couldn't start checkout, try again"));
      setBuyingAddOn(null);
    }
  }
  // The roster band, not a flat fee. This read ORG_BASE_CENTS, which was the
  // whole bill back when there was a flat account fee; there isn't one now,
  // so that same read would have quoted every coach $0.00 a month.
  // And it is the BILLED count, never the roster alone: billing charges the
  // larger of what the coach planned for and what they have
  // (getBilledAthleteCountForCoach), and the plan card above already says so.
  // Reading roster.length here put "21-40 athletes · $160.00/month" and
  // "Your plan $20.00/mo · 0-5 athletes" on the same screen for a coach who
  // planned for 34 and had not added anyone yet (audit row B2, 2026-10-10).
  const band = bandForAthleteCount(plan?.billedCount ?? roster.length);
  // $4 for each billed athlete, exactly (2026-11-18); the band is only a size label.
  const monthlyCents = coachMonthlyCents(plan?.billedCount ?? roster.length);

  async function subscribe() {
    setStarting(true);
    try {
      const res = await apiRequest("POST", "/api/billing/checkout/coach", {});
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Couldn't start checkout, try again"));
      setStarting(false);
    }
  }

  async function savePlan() {
    const n = Number(planDraft);
    if (!Number.isInteger(n) || n < 1 || n > 5000) {
      toast.error(t("Enter a whole number of athletes between 1 and 5000."));
      return;
    }
    setSavingPlan(true);
    try {
      await apiRequest("PUT", "/api/coach/plan", { expectedAthletes: n });
      await queryClient.invalidateQueries({ queryKey: ["/api/coach/plan"] });
      setPlanDraft("");
      toast.success(t("Plan updated."));
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 403) {
        setPlanForbidden(true);
        toast.error(t("Only the primary coach can change the plan."));
      } else {
        toast.error(err instanceof Error ? err.message : t("Couldn't update the plan, try again"));
      }
    } finally {
      setSavingPlan(false);
    }
  }

  async function openPortal() {
    setOpeningPortal(true);
    try {
      const res = await apiRequest("POST", "/api/billing/portal", {});
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Couldn't open billing settings"));
      setOpeningPortal(false);
    }
  }

  return (
    <AppShell title={t("Billing")}>
      {covered && (
        <Card className="mt-6 max-w-xl border-primary/40" data-testid="covered-by-forge-banner">
          <CardContent className="p-5">
            <p className="text-sm font-semibold">
              {t("Your account is covered by Forge. You do not need a plan and there is nothing to buy.")}
            </p>
          </CardContent>
        </Card>
      )}
      <Card className="mt-6 max-w-xl">
        <CardContent className="flex flex-col gap-4 p-6">
          <p className="label-xs">{t("Your plan size")}</p>
          {planError ? (
            // Never render the editor over a failed read: an empty box saved
            // back would overwrite the school's real planned count. See the
            // "Hydrate-in-an-effect" note in CLAUDE.md.
            <ReadFailed what={t("your plan")} onRetry={() => void refetchPlan()} />
          ) : planIsForbidden && !plan ? (
            <p className="text-sm text-muted-foreground">
              {t("Only the primary coach can see and change the plan size.")}
            </p>
          ) : !plan ? (
            <p className="text-sm text-muted-foreground">{t("Loading…")}</p>
          ) : (
            <>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Athletes you planned for")}</span>
                  <span>{plan.plannedAthleteCount ?? t("Not set yet")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Athletes on your roster now")}</span>
                  <span>{plan.rosterCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Billed for")}</span>
                  {/* NO PRICE FOR THE COACH PLAN INSIDE THE APP (fixed 2026-10-14). The plan is
                      sold to programs on the web only, which App Store guideline 3.1.3(c) allows
                      -- on the condition that the app does not price it (3.1.1). This row printed
                      "21-40 athletes · $160.00/month" on the phone. The BAND still shows, because
                      what the program is on is a fact about their account rather than an offer;
                      the money is what may not appear. Found by the billing sweep, which also
                      found that the compliance scan covering this page only ever asserted the
                      COPY and never the money. */}
                  <span>
                    {plan.band
                      ? isNative
                        ? plan.band.label
                        : t("{count} athletes · {price}/month", { count: plan.billedCount, price: formatCents(plan.band.monthlyPriceCents) })
                      : t("{count} athletes", { count: plan.billedCount })}
                  </span>
                </div>
                {/* THE QUOTE AND THE PURCHASE ARE TWO FACTS, and until 2026-10-11 they were one
                    column: users.billingTier, written at signup from the typed headcount, so the
                    quote above was also what granted Full Personalization. Now the row above is
                    what this roster costs and this one is what the subscription on file covers.
                    Drawn only when it differs, so a coach whose plan matches their roster -- the
                    ordinary case -- reads one number and not two. */}
                {plan.paidBand && plan.paidBand.id !== plan.band?.id && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("Your subscription covers")}</span>
                    <span>{plan.paidBand.label}</span>
                  </div>
                )}
              </div>

              {planIsForbidden ? (
                <p className="text-xs text-muted-foreground">
                  {t("Only the primary coach can change the plan size.")}
                </p>
              ) : isNative ? (
                /* AND THE EDITOR ITSELF IS NOT REACHABLE FROM INSIDE THE APP. Update calls
                   PUT /api/coach/plan, which syncs the band onto the Stripe subscription and
                   PRORATES A CHARGE -- a payment taken outside in-app purchase, initiated by a
                   control in the app, which is the thing 3.1.1 forbids. It also previewed the
                   new band's monthly price under the input while doing it.
                   The cost of withholding it is that a coach cannot change their headcount from
                   the phone, which is the same cost already accepted for Subscribe below and the
                   same answer: the program's money is handled on the web. */
                <p className="text-xs text-muted-foreground">
                  {t("Your program's plan size is changed outside the app.")}
                </p>
              ) : (
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <Label htmlFor="planDraft" className="text-sm">
                    {t("Change how many athletes you plan for")}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="planDraft"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={5000}
                      step={1}
                      className="max-w-32"
                      value={planDraft}
                      onChange={(e) => setPlanDraft(e.target.value)}
                      placeholder={String(plan.plannedAthleteCount ?? plan.rosterCount)}
                    />
                    <Button onClick={savePlan} disabled={savingPlan || !planDraft.trim()}>
                      {savingPlan ? t("Updating…") : t("Update")}
                    </Button>
                  </div>
                  {planDraft.trim() !== "" && Number.isInteger(Number(planDraft)) && Number(planDraft) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("{count} athletes · {price}/month", {
                        count: Number(planDraft),
                        price: formatCents(coachMonthlyCents(Number(planDraft))),
                      })}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t("Change it any time.")}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 max-w-xl">
        <CardContent className="flex flex-col gap-4 p-6">
          <p className="label-xs">{t("Add-ons")}</p>
          {entitlements?.purchasableAddOns.map((addOn) => {
            // Status is three-valued on purpose -- owned, included (a comp, a trial, a band
            // that carries it, or for Coaches Corner a roster of 100+), and for sale -- because
            // one "locked" state for all three either offers to sell something already held or
            // implies a purchase that never happened. The server decides both flags per add-on
            // (see /api/coach/entitlements); this page never re-derives an entitlement.
            const unlocked = addOn.unlocked === true;
            const owned = addOn.owned === true;
            const status = owned
              ? t("Owned")
              : unlocked
                ? addOn.id === "coaches_corner" && entitlements.coachesCorner.compedForRoster
                  ? t("Included with your roster size")
                  : t("Included with your account")
                : entitlements.billingOpen
                  ? t("Available")
                  : t("Not available yet");
            return (
              <div key={addOn.id} className="flex flex-col gap-1 border-t border-border pt-4 first:border-0 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{addOn.label}</span>
                  <span className="text-sm text-muted-foreground">
                    {t("{price}/mo", { price: formatCents(addOn.monthlyPriceCents) })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{addOn.description}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {status}
                </p>
                {/* A COACH ADD-ON IS THE PROGRAM'S, so only the primary coach is offered it.
                    ownsCoachesCorner reads the primary's row, so an assistant's purchase landed
                    where nothing looks -- see isPrimaryCoach above. On the web the route refuses
                    it before any money moves; on iOS StoreKit takes the money first and the
                    server then grants it to the primary's row rather than refusing a paid
                    transaction (build 611's lesson), so withholding the button is what keeps an
                    assistant from paying for the program by accident. */}
                {!unlocked && !isPrimaryCoach ? (
                  <p className="text-xs text-muted-foreground">
                    {t("Your head coach looks after the program's add-ons.")}
                  </p>
                ) : null}
                {!unlocked && isPrimaryCoach && entitlements.billingOpen && !covered && !isNative && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-fit"
                    disabled={buyingAddOn !== null}
                    onClick={() => void buyAddOn(addOn.id)}
                  >
                    {buyingAddOn === addOn.id ? t("Opening checkout...") : t("Get {name}", { name: addOn.label })}
                  </Button>
                )}
                {!unlocked && !covered && isPrimaryCoach && appleSupported && applePrices[addOn.id] && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-fit"
                    disabled={buyingAddOn !== null}
                    onClick={() => void buyAddOnWithApple(addOn.id)}
                  >
                    {buyingAddOn === addOn.id ? t("Purchasing...") : t("Get {name} ({price}/mo)", { name: addOn.label, price: applePrices[addOn.id] })}
                  </Button>
                )}
              </div>
            );
          })}
          {appleSupported && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit text-muted-foreground"
              disabled={restoring}
              onClick={() => void restoreApplePurchases()}
            >
              {restoring ? t("Restoring...") : t("Restore Purchases")}
            </Button>
          )}
          {!entitlements && <p className="text-sm text-muted-foreground">{t("Loading…")}</p>}
          <SubscriptionLegalLinks />
        </CardContent>
      </Card>

      <Card className="mt-6 max-w-xl">
        <CardContent className="flex flex-col gap-4 p-6">
          <div>
            <p className="label-xs">{t("Your plan")}</p>
            <p className="mt-1 font-display text-3xl font-bold">
              {formatCents(monthlyCents)}
              <span className="text-base font-normal text-muted-foreground">{t("/mo")}</span>
            </p>
          </div>

          <div className="space-y-1 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {t.plural(roster.length, "{count} athlete", "{count} athletes")}
              </span>
              <span>{t("{price} each", { price: formatCents(ORG_PER_ATHLETE_CENTS) })}</span>
            </div>
          </div>

          {/* The old copy here said "one flat fee, whatever your roster size", which
              described the retired model (a $10 account fee plus per-athlete
              overage). The bill is roster x rate now, so growing past the band's
              ceiling does change what you pay, and saying otherwise set up exactly
              the surprise this sentence was meant to prevent. */}
          <p className="text-xs text-muted-foreground">
            {t(
              "{price} for every athlete, the same rate at every roster size and no limit. Adding an athlete adds {price}; removing one or putting them on hold takes it off.",
              { price: `$${(ORG_PER_ATHLETE_CENTS / 100).toFixed(2)}` },
            )}
          </p>

          {isNative ? (
            <p className="rounded-md bg-surface-elevated p-3 text-sm text-muted-foreground">
              {/* NO STEER TO AN OUTSIDE PURCHASE FROM INSIDE THE APP (2026-10-08). The coach plan
                  is sold to programs on the web only (App Store guideline 3.1.3(c)); the app
                  may show what the program has and must not tell a coach where to go and buy
                  it. The old sentence here did exactly that. */}
              {t("Your program's plan is set up outside the app. This screen shows what it covers.")}
            </p>
          ) : !isPrimaryCoach ? (
            <p className="rounded-md bg-surface-elevated p-3 text-sm text-muted-foreground">
              {t("Your head coach looks after the program's plan. The band above is what this roster costs.")}
            </p>
          ) : covered ? (
            <p className="rounded-md bg-surface-elevated p-3 text-sm text-muted-foreground">
              {t("Your account is covered by Forge, so there is no plan to buy.")}
            </p>
          ) : !billingOpen ? (
            <p className="rounded-md bg-surface-elevated p-3 text-sm text-muted-foreground">
              {t("Billing is not open here yet. The band above is what this roster costs.")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={subscribe} disabled={starting}>
                <CreditCard className="h-4 w-4" />
                {starting ? t("Opening checkout...") : t("Subscribe")}
              </Button>
              <Button variant="outline" onClick={openPortal} disabled={openingPortal}>
                {openingPortal ? t("Opening...") : t("Manage billing")}
              </Button>
            </div>
          )}
          <SubscriptionLegalLinks compact />
        </CardContent>
      </Card>
    </AppShell>
  );
}
