import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { CreditCard, Users } from "lucide-react";
import { bandForAthleteCount, formatCents } from "@shared/billing-tiers";

type RosterAthlete = { id: number };

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

  const { data: roster = [] } = useQuery<RosterAthlete[]>({
    queryKey: ["/api/coach/roster"],
    queryFn: () => getJson("/api/coach/roster"),
  });
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

          <p className="text-xs text-muted-foreground">
            One flat fee, whatever your roster size. Adding or removing an athlete doesn't change
            what you pay.
          </p>

          {isNative ? (
            <p className="rounded-md bg-surface-elevated p-3 text-sm text-muted-foreground">
              Coach plans are managed on the web. Open Forge in a browser to subscribe or change
              your card.
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
