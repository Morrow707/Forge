import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BILLING_TIERS,
  BILLING_TIER_ORDER,
  BILLING_ADD_ONS,
  BILLING_ADD_ON_ORDER,
  formatCents,
} from "@shared/billing-tiers";
import { FREE_AGENT_TIERS, FREE_AGENT_TIER_ORDER, FREE_AGENT_ADD_ONS, FREE_AGENT_ADD_ON_ORDER } from "@shared/free-agent-tiers";
import { VIDEO_RETENTION, VIDEO_STORAGE_ADD_ON } from "@shared/video-retention";
import { Flame, Check, Video } from "lucide-react";

/** Public, unauthenticated -- renders straight from shared/billing-tiers.ts
 * so this page can never drift from what server/billing.ts actually
 * enforces (nothing yet; see ENFORCEMENT_ENABLED). Linked from login and
 * signup's footer. */
export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Flame className="h-8 w-8" />
          </div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-wider">
            Pricing
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            One roster-based plan per program. Every tier includes AI coaching, form-check video
            analysis, programming, and nutrition -- personalization scales with you.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {BILLING_TIER_ORDER.map((id) => {
            const tier = BILLING_TIERS[id];
            const featured = id === "growth";
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
                      Most popular
                    </Badge>
                  )}
                  <CardTitle className="text-lg">{tier.label}</CardTitle>
                  <CardDescription>
                    <span className="text-2xl font-extrabold text-foreground">
                      {formatCents(tier.monthlyPriceCents)}
                    </span>
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {tier.athleteCapIncluded === null
                        ? "Unlimited athletes"
                        : `${tier.athleteCapIncluded} athletes included`}
                    </li>
                    {tier.athleteCapIncluded !== null && (
                      <li className="flex items-start gap-2 text-muted-foreground">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        +{formatCents(tier.perAthleteOverageCents)}/athlete beyond that
                      </li>
                    )}
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {tier.includesFullPersonalization
                        ? "Full branding + personalization, included"
                        : "Logo + primary color, free"}
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {tier.includesMultiTeam
                        ? "Multi-team branding"
                        : "Single team branding"}
                    </li>
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-12">
          <h2 className="mb-1 text-center text-xl font-bold">Add-ons</h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Solo and Coach plans can add personalization à la carte -- Growth and above already
            include all of it.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{addOn.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="mt-16">
          <h2 className="mb-1 text-center text-xl font-bold">Training on your own?</h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            No coach yet? Get your own AI coach -- these tiers are per athlete, not per team.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {FREE_AGENT_TIER_ORDER.map((id) => {
              const tier = FREE_AGENT_TIERS[id];
              const featured = id === "ai_coach_video";
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
                        Most popular
                      </Badge>
                    )}
                    <CardTitle className="text-lg">{tier.label}</CardTitle>
                    <CardDescription>
                      <span className="text-2xl font-extrabold text-foreground">
                        {formatCents(tier.monthlyPriceCents)}
                      </span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">{tier.description}</p>
                      {tier.athleteProfileCap != null && (
                        <p className="mt-2 flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                          Covers up to {tier.athleteProfileCap} athlete profiles
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <p className="mb-4 mt-8 text-center text-sm text-muted-foreground">
            Sport-specialist coaches (coming soon) will be available as add-ons on any Free Agent
            tier:
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {FREE_AGENT_ADD_ON_ORDER.map((id) => {
              const addOn = FREE_AGENT_ADD_ONS[id];
              return (
                <div key={id} className="rounded-md border border-border p-3 text-center text-sm">
                  <span className="font-semibold">{addOn.label}</span>
                  <span className="text-muted-foreground"> -- {formatCents(addOn.monthlyPriceCents)}/mo</span>
                </div>
              );
            })}
          </div>

          <div className="mx-auto mt-6 flex max-w-lg items-start gap-3 rounded-md border border-border p-4 text-sm">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">
                Extra video storage -- {formatCents(VIDEO_STORAGE_ADD_ON.monthlyPriceCents)}/mo
              </span>{" "}
              -- every athlete keeps {VIDEO_RETENTION.favoritedCap} favorited clips per exercise or
              skill drill, {VIDEO_RETENTION.totalCap} total on a rolling basis. This add-on bumps
              that to {VIDEO_STORAGE_ADD_ON.favoritedCap} favorited / {VIDEO_STORAGE_ADD_ON.totalCap}{" "}
              total, for both form-check videos and skill clips. Applies per athlete on any plan --
              Free Agent or coached.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-3">
          <Link href="/signup">
            <Button size="lg">Get started</Button>
          </Link>
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
