import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getJson } from "@/lib/queryClient";
import { ProgressBar } from "@/components/food-log-panel";
import { Apple, ChevronRight } from "lucide-react";

type NutritionTargets = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
} | null;

type FoodLogTotals = { caloriesKcal: number; proteinG: number; carbsG: number; fatG: number };

/** At-a-glance macros for today, reusing the same targets/food-log endpoints
 * and ProgressBar the full Nutrition tab uses -- a quick-view landing page
 * card, not a replacement for that tab (no logging here, just today's
 * progress and a link through). */
export function NutritionQuickSummary() {
  const today = new Date().toISOString().slice(0, 10);

  const { data: targets, isLoading: targetsLoading } = useQuery<NutritionTargets>({
    queryKey: ["/api/athlete/nutrition"],
    queryFn: () => getJson("/api/athlete/nutrition"),
  });
  const { data: log, isLoading: logLoading } = useQuery<{ totals: FoodLogTotals }>({
    queryKey: ["/api/athlete/food-log", today],
    queryFn: () => getJson(`/api/athlete/food-log?date=${today}`),
  });

  const totals = log?.totals ?? { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Apple className="h-4 w-4 text-primary" />
          Today's Nutrition
        </CardTitle>
        <Link href="/athlete/nutrition" className="flex items-center text-xs font-semibold text-primary hover:underline">
          Full log
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        {targetsLoading || logLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-surface" />
        ) : !targets ? (
          <p className="text-sm text-muted-foreground">No nutrition targets set yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <ProgressBar label="Calories" value={totals.caloriesKcal} target={targets.caloriesKcal} unit="kcal" />
            <ProgressBar label="Protein" value={totals.proteinG} target={targets.proteinG} unit="g" />
            <ProgressBar label="Carbs" value={totals.carbsG} target={targets.carbsG} unit="g" />
            <ProgressBar label="Fat" value={totals.fatG} target={targets.fatG} unit="g" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
