import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReadFailed } from "@/components/read-failed";
import { ApiError, apiRequest, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { CreditCard, Users, AlertTriangle } from "lucide-react";
import { bandForAthleteCount, formatCents, ORG_PER_ATHLETE_CENTS } from "@shared/billing-tiers";

/** GET /api/coach/entitlements, the add-on half. purchasableAddOns is derived
 * server-side from COACH_PURCHASABLE_ADD_ON_ORDER, so this page never holds its
 * own list of what is for sale or what it costs. */
type CoachEntitlements = {
  coachesCorner: { unlocked: boolean; owned: boolean; compedForRoster: boolean };
  purchasableAddOns: { id: string; label: string; description: string; monthlyPriceCents: number }[];
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
  band: {
    id: string;
    label: string;
    monthlyPriceCents: number;
    athleteCapIncluded: number;
    athleteFloor: number;
  } | null;
  atCap: boolean;
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
  const isNative = Capacitor.isNativePlatform();
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

  async function buyAddOn(addOnId: string) {
    setBuyingAddOn(addOnId);
    try {
      const res = await apiRequest("POST", "/api/billing/checkout/coach-add-on", { addOnId });
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start checkout -- try again");
      setBuyingAddOn(null);
    }
  }
  // The roster band, not a flat fee. This read ORG_BASE_CENTS, which was the
  // whole bill back when there was a flat account fee; there isn't one now,
  // so that same read would have quoted every coach $0.00 a month.
  const band = bandForAthleteCount(roster.length);
  const monthlyCents = band.monthlyPriceCents;

  async function subscribe() {
    setStarting(true);
    try {
      const res = await apiRequest("POST", "/api/billing/checkout/coach", {});
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start checkout -- try again");
      setStarting(false);
    }
  }

  async function savePlan() {
    const n = Number(planDraft);
    if (!Number.isInteger(n) || n < 1 || n > 5000) {
      toast.error("Enter a whole number of athletes between 1 and 5000.");
      return;
    }
    setSavingPlan(true);
    try {
      await apiRequest("PUT", "/api/coach/plan", { expectedAthletes: n });
      await queryClient.invalidateQueries({ queryKey: ["/api/coach/plan"] });
      setPlanDraft("");
      toast.success("Plan updated.");
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 403) {
        setPlanForbidden(true);
        toast.error("Only the primary coach can change the plan.");
      } else {
        toast.error(err instanceof Error ? err.message : "Couldn't update the plan -- try again");
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
      toast.error(err instanceof Error ? err.message : "Couldn't open billing settings");
      setOpeningPortal(false);
    }
  }

  return (
    <AppShell title="Billing">
      <Card className="mt-6 max-w-xl">
        <CardContent className="flex flex-col gap-4 p-6">
          <p className="label-xs">Your plan size</p>
          {planError ? (
            // Never render the editor over a failed read: an empty box saved
            // back would overwrite the school's real planned count. See the
            // "Hydrate-in-an-effect" note in CLAUDE.md.
            <ReadFailed what="your plan" onRetry={() => void refetchPlan()} />
          ) : planIsForbidden && !plan ? (
            <p className="text-sm text-muted-foreground">
              Only the primary coach can see and change the plan size.
            </p>
          ) : !plan ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Athletes you planned for</span>
                  <span>{plan.plannedAthleteCount ?? "Not set yet"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Athletes on your roster now</span>
                  <span>{plan.rosterCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billed for</span>
                  <span>
                    {plan.band
                      ? `${plan.band.label} · ${formatCents(plan.band.monthlyPriceCents)}/month`
                      : `${plan.billedCount} athletes`}
                  </span>
                </div>
              </div>

              {plan.atCap && (
                <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span>
                    Your roster has reached the top of this plan
                    {plan.band ? ` (${plan.band.athleteCapIncluded} athletes)` : ""}. No one else
                    can join until you move the plan up.
                  </span>
                </p>
              )}

              {planIsForbidden ? (
                <p className="text-xs text-muted-foreground">
                  Only the primary coach can change the plan size.
                </p>
              ) : (
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <Label htmlFor="planDraft" className="text-sm">
                    Change how many athletes you plan for
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
                      {savingPlan ? "Updating…" : "Update"}
                    </Button>
                  </div>
                  {planDraft.trim() !== "" && Number.isInteger(Number(planDraft)) && Number(planDraft) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {bandForAthleteCount(Number(planDraft)).label} ·{" "}
                      {formatCents(bandForAthleteCount(Number(planDraft)).monthlyPriceCents)}/month
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Change it any time. Nothing is charged while Forge is in beta.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 max-w-xl">
        <CardContent className="flex flex-col gap-4 p-6">
          <p className="label-xs">Add-ons</p>
          {entitlements?.purchasableAddOns.map((addOn) => {
            // Coaches Corner is the only one today. Status is three-valued on
            // purpose -- owned, comped (beta, a trial, or a roster of 100+), and
            // for sale -- because one "locked" state for all three either offers
            // to sell something already owned or implies a purchase that never
            // happened.
            const unlocked =
              addOn.id === "coaches_corner" ? entitlements.coachesCorner.unlocked : false;
            const owned = addOn.id === "coaches_corner" ? entitlements.coachesCorner.owned : false;
            const status = owned
              ? "Owned"
              : unlocked
                ? entitlements.coachesCorner.compedForRoster
                  ? "Included with your roster size"
                  : "Included in beta"
                : entitlements.billingOpen
                  ? "Available"
                  : "Not available yet";
            return (
              <div key={addOn.id} className="flex flex-col gap-1 border-t border-border pt-4 first:border-0 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{addOn.label}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatCents(addOn.monthlyPriceCents)}/mo
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{addOn.description}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {status}
                </p>
                {!unlocked && entitlements.billingOpen && !isNative && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-fit"
                    disabled={buyingAddOn !== null}
                    onClick={() => void buyAddOn(addOn.id)}
                  >
                    {buyingAddOn === addOn.id ? "Opening checkout..." : `Get ${addOn.label}`}
                  </Button>
                )}
              </div>
            );
          })}
          {!entitlements && <p className="text-sm text-muted-foreground">Loading…</p>}
        </CardContent>
      </Card>

      <Card className="mt-6 max-w-xl">
        <CardContent className="flex flex-col gap-4 p-6">
          <div>
            <p className="label-xs">Your plan</p>
            <p className="mt-1 font-display text-3xl font-bold">
              {formatCents(monthlyCents)}
              <span className="text-base font-normal text-muted-foreground">/mo</span>
            </p>
          </div>

          <div className="space-y-1 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {roster.length} {roster.length === 1 ? "athlete" : "athletes"}
              </span>
              <span>{band.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Band covers up to</span>
              <span className="text-muted-foreground">
                {band.athleteCapIncluded} athletes
              </span>
            </div>
          </div>

          {/* The old copy here said "one flat fee, whatever your roster size", which
              described the retired model (a $10 account fee plus per-athlete
              overage). The bill is roster x rate now, so growing past the band's
              ceiling does change what you pay, and saying otherwise set up exactly
              the surprise this sentence was meant to prevent. */}
          <p className="text-xs text-muted-foreground">
            ${(ORG_PER_ATHLETE_CENTS / 100).toFixed(2)} per athlete, the same rate at every roster
            size. You pay for the band, so adding an athlete inside it doesn't change your bill --
            going past {band.athleteCapIncluded} moves you to the next band.
          </p>

          {isNative ? (
            <p className="rounded-md bg-surface-elevated p-3 text-sm text-muted-foreground">
              Coach plans are managed on the web. Open Forge in a browser to subscribe or change
              your card.
            </p>
          ) : !billingOpen ? (
            <p className="rounded-md bg-surface-elevated p-3 text-sm text-muted-foreground">
              Free while Forge is in beta. Nothing is charged, and there is nothing to set up --
              the band above is what this roster would cost once billing opens.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={subscribe} disabled={starting}>
                <CreditCard className="h-4 w-4" />
                {starting ? "Opening checkout..." : "Subscribe"}
              </Button>
              <Button variant="outline" onClick={openPortal} disabled={openingPortal}>
                {openingPortal ? "Opening..." : "Manage billing"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
