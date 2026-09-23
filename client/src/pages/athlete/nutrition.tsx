import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { NutritionPanel } from "@/components/nutrition-panel";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { getJson } from "@/lib/queryClient";
import { average } from "@/lib/wellness-metrics";
import { Scale } from "lucide-react";
import { Link } from "wouter";
import { ReadFailed } from "@/components/read-failed";

type WellnessEntry = { bodyMass: number | null };
const RECOVERY_HISTORY_DAYS = 90;

/** Dedicated Nutrition tab, same for a coached athlete and a Free Agent --
 * the difference is entirely in what NutritionPanel/FoodLogPanel let you
 * touch: a coached athlete gets a read-only view of the targets their
 * coach set (see coach/nutrition.tsx) plus their own food log, a Free
 * Agent additionally edits their own targets and gets the AI Q&A box.
 *
 * That box IS behind requirePaidAiAccess (routes.ts, POST
 * /api/athlete/nutrition/ask) -- this comment used to claim the opposite, which
 * is how it came to be presented as free and then answered with a red error
 * toast. It now answers with the server's own "paid upgrade" message. Logging
 * food is always editable either way; that's never an AI capability. */
export default function AthleteNutrition() {
  const { user } = useAuth();

  const { data: coaches, isError: coachesFailed, refetch: refetchCoaches } = useQuery<{ id: number }[]>({
    queryKey: ["/api/athlete/coaches"],
    enabled: user?.role === "athlete",
  });
  const isFreeAgent = !!coaches && coaches.length === 0;

  // Same 90-day window and queryKey as the Recovery & Vitals and Progress
  // pages (see recovery.tsx / progress.tsx) -- react-query dedupes it into
  // one shared fetch rather than three. Body mass gets its own callout here
  // (not just buried in the Recovery tabs) because a nutritionist reviewing
  // targets wants it front and center, per how most college athletes
  // actually consume this page.
  const { data: wellnessHistory, isError: wellnessFailed, refetch: refetchWellness } = useQuery<WellnessEntry[]>({
    queryKey: ["/api/athlete/wellness/history", RECOVERY_HISTORY_DAYS],
    queryFn: () => getJson(`/api/athlete/wellness/history?limit=${RECOVERY_HISTORY_DAYS}`),
  });
  const bodyMassValues = (wellnessHistory ?? []).map((w) => w.bodyMass);
  const latestBodyMass = bodyMassValues.find((v) => v != null) ?? null;
  const avgBodyMass = average(bodyMassValues);

  // This read decides which page an athlete is looking at. A failure leaves
  // isFreeAgent false, so a Free Agent is told their targets were "set by your
  // coach" -- they have none -- and loses the controls to set them at all.
  if (coachesFailed) {
    return (
      <AppShell title="Nutrition">
        <Card>
          <CardContent className="py-16">
            <ReadFailed what="your nutrition page" onRetry={() => void refetchCoaches()} />
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Nutrition">
      <div className="mb-6 space-y-2">
        <p className="text-sm text-muted-foreground">
          {isFreeAgent
            ? "Set your targets, log what you eat, ask nutrition questions."
            : "Your targets, set by your coach. Log what you eat to track against them."}
        </p>
        {/* Said once, plainly, on the page rather than only next to the AI box: Forge is not run
            by dietitians and nothing here is a prescription. Cut to one sentence 2026-09-23 --
            Scott, "just very wordy" -- and the cut is wording only. Every claim the long version
            made survives: not a dietitian, not a prescription, go to a person who knows you.
            A disclaimer nobody finishes reading protects nobody. */}
        <p className="text-xs text-muted-foreground">
          Not a dietitian, and nothing here is a prescription -- your own targets should come from
          a coach or a registered dietitian who knows you.
        </p>
      </div>
      {wellnessFailed && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <ReadFailed what="your body mass history" onRetry={() => void refetchWellness()} />
          </CardContent>
        </Card>
      )}
      {!wellnessFailed && (latestBodyMass != null || avgBodyMass != null) && (
        <Card className="mb-6">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-2xl font-bold">
                  {latestBodyMass != null ? `${latestBodyMass.toFixed(1)} lbs` : "--"}
                  {avgBodyMass != null && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({avgBodyMass.toFixed(1)} lbs avg, {RECOVERY_HISTORY_DAYS}d)
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  Body mass, synced from Apple Health
                </p>
              </div>
            </div>
            <Link href="/athlete/recovery" className="shrink-0 text-sm font-medium text-primary hover:underline">
              View Trends
            </Link>
          </CardContent>
        </Card>
      )}
      <NutritionPanel
        nutritionUrl="/api/athlete/nutrition"
        editable={isFreeAgent}
        askUrl={isFreeAgent ? "/api/athlete/nutrition/ask" : undefined}
        goalUrl={isFreeAgent ? "/api/athlete/nutrition/goal" : undefined}
        foodLogUrl="/api/athlete/food-log"
        foodLogEditable
        trendUrl="/api/athlete/nutrition/trend"
      />
    </AppShell>
  );
}
