import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { NutritionPanel } from "@/components/nutrition-panel";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { getJson } from "@/lib/queryClient";
import { average } from "@/lib/wellness-metrics";
import { Scale } from "lucide-react";
import { Link } from "wouter";

type WellnessEntry = { bodyMass: number | null };
const RECOVERY_HISTORY_DAYS = 90;

/** Dedicated Nutrition tab, same for a coached athlete and a Free Agent --
 * the difference is entirely in what NutritionPanel/FoodLogPanel let you
 * touch: a coached athlete gets a read-only view of the targets their
 * coach set (see coach/nutrition.tsx) plus their own food log, a Free
 * Agent additionally edits their own targets and gets the free AI Q&A
 * box (never behind requirePaidAiAccess -- see routes.ts). Logging food
 * is always editable either way; that's never an AI capability. */
export default function AthleteNutrition() {
  const { user } = useAuth();

  const { data: coaches } = useQuery<{ id: number }[]>({
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
  const { data: wellnessHistory } = useQuery<WellnessEntry[]>({
    queryKey: ["/api/athlete/wellness/history", RECOVERY_HISTORY_DAYS],
    queryFn: () => getJson(`/api/athlete/wellness/history?limit=${RECOVERY_HISTORY_DAYS}`),
  });
  const bodyMassValues = (wellnessHistory ?? []).map((w) => w.bodyMass);
  const latestBodyMass = bodyMassValues.find((v) => v != null) ?? null;
  const avgBodyMass = average(bodyMassValues);

  return (
    <AppShell title="Nutrition">
      <p className="mb-6 text-sm text-muted-foreground">
        {isFreeAgent
          ? "Set your own macro and micro targets, log what you eat, and ask general sports-nutrition questions."
          : "Your macro and micro targets, set by your coach -- log what you eat here to track against them."}
      </p>
      {(latestBodyMass != null || avgBodyMass != null) && (
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
