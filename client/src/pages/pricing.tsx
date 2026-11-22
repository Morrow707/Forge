import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SignupCta } from "@/components/signup-cta";
import { MarketingShell } from "@/components/marketing-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BILLING_ADD_ONS,
  BILLING_ADD_ON_ORDER,
  coachMonthlyCents,
  FULL_PERSONALIZATION_INCLUDED_AT_ATHLETES,
  formatCents,
  ORG_PER_ATHLETE_CENTS,
  ORG_BLOCK_SIZE,
} from "@shared/billing-tiers";
import {
  FREE_AGENT_TIERS,
  FREE_AGENT_TIER_ORDER,
  FREE_AGENT_TIER_GRID_COLS,
  FREE_AGENT_ADD_ONS,
  SPORT_COACH_ADD_ON_IDS,
  addOnIsOffered,
  ALL_CLASSES_ADD_ON_ID,
} from "@shared/free-agent-tiers";
import { VIDEO_RETENTION } from "@shared/video-retention";
import { Flame, Check, Video, AlertTriangle } from "lucide-react";
import { CAMERA_ACCURACY_LONG } from "@shared/camera-accuracy-copy";
import { CLASS_PRICING_LINE } from "@shared/class-pricing-rule";
import { CameraMetricCaveat } from "@/components/camera-metric-caveat";
import { useT } from "@/i18n";

/** Example roster sizes, each priced by the one rule: $4 an athlete. */
const SAMPLE_ROSTERS = [5, 12, 20, 35, 50, 75, 120, 500];

/** Public, unauthenticated -- renders straight from shared/billing-tiers.ts
 * so this page can never drift from what server/billing.ts actually
 * enforces (nothing yet; see ENFORCEMENT_ENABLED). Linked from login and
 * signup's footer. */
export default function PricingPage() {
  const t = useT();
  return (
    // THE NAV AND FOOTER, which this page was the only one of the six marketing pages without.
    //
    // Found 2026-10-09: /pricing is indexable at priority 0.9 and reached from the login screen,
    // the signup footer and the nav on every other page -- and once a visitor was on it the only
    // way onward was the browser's back button. The footer is also the internal link graph (see
    // MarketingNav's own comment), so a page outside it is one a crawler reaches only through the
    // sitemap.
    //
    // No min-h-screen or bg-background here: MarketingShell supplies both, and nesting two
    // min-h-screen wrappers makes the page at least two viewports tall with a dead second one.
    <MarketingShell>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Flame className="h-8 w-8" />
          </div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-wider">
            {t("Pricing")}
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("One roster-based plan per program. Every tier includes AI coaching, form-check video analysis, programming, and nutrition, personalization scales with you.")}
          </p>
        </div>

        {/* Every tier above claims "form-check video analysis" as a real, working feature, and
            right now the numbers that analysis produces are not accurate -- see
            docs/camera-tracking-notes.md for what's actually validated versus still being
            calibrated. This has to be visible before someone pays for a tier that leads with it,
            not just disclosed after signup in CameraAccuracyNotice. */}
        <div className="mx-auto mb-10 flex max-w-3xl items-start gap-3 rounded-md border-2 border-destructive bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <p className="text-sm font-bold text-destructive">
            {t("Camera tracking notice: {notice}", { notice: t(CAMERA_ACCURACY_LONG) })}
          </p>
        </div>

        {/* $4 AN ATHLETE, EXACTLY (2026-11-18). This section used to list roster bands priced
            at their ceiling, so a 41-athlete program read $240 and was charged for 60. Scott:
            "Stripe is only charged per athlete ... $4 per athlete". The sample sizes below are
            examples of that one multiplication, not steps. */}
        <Card>
          <CardHeader>
            <Badge className="mb-1 w-fit gap-1 bg-primary/15 text-primary hover:bg-primary/15">
              {t("Teams, programs & schools")}
            </Badge>
            <CardTitle className="text-lg">{t("{price}/athlete a month", { price: formatCents(ORG_PER_ATHLETE_CENTS) })}</CardTitle>
            <CardDescription>
              {t(
                "You pay for exactly the athletes on your roster, at one rate, with no account fee, no minimum block and no roster limit. Add an athlete and the bill goes up {price}; remove one or put them on hold and it comes down. Logo and main color are free on every plan; full branding and personalization are included once your roster reaches {threshold} athletes, and more than one team from {teams}.",
                {
                  price: formatCents(ORG_PER_ATHLETE_CENTS),
                  threshold: FULL_PERSONALIZATION_INCLUDED_AT_ATHLETES,
                  teams: ORG_BLOCK_SIZE + 1,
                },
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              {SAMPLE_ROSTERS.map((n) => (
                <div
                  key={n}
                  className="flex items-center justify-between gap-2 rounded-md border border-border p-2"
                >
                  <span className="text-muted-foreground">{t("{count} athletes", { count: n })}</span>
                  <span className="font-semibold text-foreground">{t("{price}/mo", { price: formatCents(coachMonthlyCents(n)) })}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="mt-12">
          <h2 className="mb-1 text-center text-xl font-bold">{t("Add-ons")}</h2>
          {/* One threshold, derived. This said "above 30 athletes" while the band
              card above it said 20: a number a customer could reasonably hold Forge
              to, contradicted on the same page. includesFullPersonalization is the
              only real answer, so both now read it. */}
          <p className="mb-6 text-center text-sm text-muted-foreground">
            {t(
              "Add-ons for any program. Below {threshold} athletes, Full Personalization is one bundle; from {threshold} it is included. Coaches Corner, the coach education library, is a separate add-on at every size.",
              { threshold: FULL_PERSONALIZATION_INCLUDED_AT_ATHLETES },
            )}
          </p>
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
            {BILLING_ADD_ON_ORDER.map((id) => {
              const addOn = BILLING_ADD_ONS[id];
              return (
                <Card key={id}>
                  <CardHeader>
                    <CardTitle className="text-base">{addOn.label}</CardTitle>
                    <CardDescription>
                      <span className="text-xl font-extrabold text-foreground">
                        {formatCents(addOn.monthlyPriceCents)}
                      </span>
                      <span className="text-sm text-muted-foreground">{t("/mo")}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{t(addOn.description)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="mt-16">
          <h2 className="mb-1 text-center text-xl font-bold">{t("Training on your own?")}</h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            {t("No coach yet? Train on your own: Basic to log, AI Coach for an AI coach, AI Coach + Video to film. Per athlete, not per team.")}
          </p>
          <div className={cn("grid gap-4", FREE_AGENT_TIER_GRID_COLS)}>
            {FREE_AGENT_TIER_ORDER.map((id) => {
              const tier = FREE_AGENT_TIERS[id];
              // The priciest tier ON SALE, derived rather than named. This used to be a literal
              // comparison against the top tier's id, so withdrawing that tier left the section
              // with no highlighted card at all and nothing to say which plan the page steers
              // toward. Deriving also moves the highlight back on its own if the tier returns.
              const featured = id === FREE_AGENT_TIER_ORDER[FREE_AGENT_TIER_ORDER.length - 1];
              return (
                <Card
                  key={id}
                  className={cn(
                    "flex flex-col",
                    featured && "border-primary shadow-[0_0_0_1px] shadow-primary/50",
                  )}
                >
                  <CardHeader>
                    {featured && (
                      <Badge className="mb-1 w-fit gap-1 bg-primary/15 text-primary hover:bg-primary/15">
                        {t("Most popular")}
                      </Badge>
                    )}
                    <CardTitle className="text-lg">{tier.label}</CardTitle>
                    <CardDescription>
                      <span className="text-2xl font-extrabold text-foreground">
                        {formatCents(tier.monthlyPriceCents)}
                      </span>
                      <span className="text-sm text-muted-foreground">{t("/mo")}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">{t(tier.description)}</p>
                    </div>
                    {tier.hasVideoFormCheck && (
                      // The purchase variant, not the generic caveat: this card has a price on it
                      // and a button under it. See CAMERA_ACCURACY_PURCHASE_WARNING.
                      <CameraMetricCaveat variant="purchase" />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* All Classes (2026-10-04): the one add-on on sale, on top of any Free Agent tier. */}
          <div className="mx-auto mt-8 max-w-lg rounded-md border border-border p-4 text-center text-sm">
            <p className="font-semibold">
              {t("{name}, {price}/mo on any Free Agent tier", {
                name: FREE_AGENT_ADD_ONS[ALL_CLASSES_ADD_ON_ID].label,
                price: formatCents(FREE_AGENT_ADD_ONS[ALL_CLASSES_ADD_ON_ID].monthlyPriceCents),
              })}
            </p>
            <p className="mt-1 text-muted-foreground">{t(CLASS_PRICING_LINE)}</p>
          </div>
          {/* A WITHDRAWN ADD-ON IS NOT PRICED ON A PUBLIC PAGE. The heading goes with the
              cards, for the reason athlete/upgrade.tsx already spells out: with the sport
              coaches withheld, "available as add-ons on any Free Agent tier" is an offer of an
              empty shelf. All three are withdrawn today (WITHDRAWN_ADD_ONS), so this whole
              block renders nothing -- and it was pricing them at $7.99/mo on the one page a
              stranger reads, in the sitemap at priority 0.9, while every checkout path refused
              them (createFreeAgentAddOnCheckout) and the signed-in upgrade screen correctly
              drew no card at all. Found 2026-10-08 by the launch audit's price sweep. */}
          {SPORT_COACH_ADD_ON_IDS.filter(addOnIsOffered).length > 0 && (
            <>
              <p className="mb-4 mt-8 text-center text-sm text-muted-foreground">
                {t("Sport-specialist coaches, available as add-ons on any Free Agent tier:")}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {SPORT_COACH_ADD_ON_IDS.filter(addOnIsOffered).map((id) => {
                  const addOn = FREE_AGENT_ADD_ONS[id];
                  return (
                    <div key={id} className="rounded-md border border-border p-3 text-center text-sm">
                      <span className="font-semibold">{addOn.label}</span>
                      <span className="text-muted-foreground">{t(", {price}/mo", { price: formatCents(addOn.monthlyPriceCents) })}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* WHAT EVERY PLAN KEEPS, AND NO PRICE ON SOMETHING NOBODY CAN BUY (fixed 2026-10-11).
              This read "Extra video storage, $9.99/mo" on the one page a stranger reads, in the
              sitemap at priority 0.9 -- and hasVideoStorageAddOn has no Stripe Price, no
              checkout route, no App Store product and no control on the athlete's own upgrade
              screen. The only way to get it is an admin ticking a box on /admin/billing. A card
              with a price on it is an offer, and this one had nothing behind it.

              The same bug as the three withdrawn sport coaches priced a few lines above, found
              by the 10-08 price sweep -- which could not see this one, because it scanned for
              SPORT_COACH_ADD_ON_IDS specifically. See
              every-public-price-can-be-bought.test.ts, which discovers the prices instead.

              The caps stay: they are what every plan includes, which is a pricing-page fact. */}
          <div className="mx-auto mt-6 flex max-w-lg items-start gap-3 rounded-md border border-border p-4 text-sm">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">{t("Video storage is included")}</span>:{" "}
              {t(
                "every athlete keeps {favorited} favorited clips per exercise or skill drill, {total} total on a rolling basis, for both form-check videos and skill clips, on AI Coach + Video and for every coached athlete. Extra Video Storage raises it on the plan that films.",
                { favorited: VIDEO_RETENTION.favoritedCap, total: VIDEO_RETENTION.totalCap },
              )}
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-3">
          <SignupCta size="lg">{t("Get started")}</SignupCta>
          <p className="text-sm text-muted-foreground">
            {t("Already have an account?")}{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              {t("Log in")}
            </Link>
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
