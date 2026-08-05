import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { NutritionPanel } from "@/components/nutrition-panel";
import { useAuth } from "@/hooks/use-auth";

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

  return (
    <AppShell title="Nutrition">
      <p className="mb-6 text-sm text-muted-foreground">
        {isFreeAgent
          ? "Set your own macro and micro targets, log what you eat, and ask general sports-nutrition questions."
          : "Your macro and micro targets, set by your coach -- log what you eat here to track against them."}
      </p>
      <NutritionPanel
        nutritionUrl="/api/athlete/nutrition"
        editable={isFreeAgent}
        askUrl={isFreeAgent ? "/api/athlete/nutrition/ask" : undefined}
        foodLogUrl="/api/athlete/food-log"
        foodLogEditable
      />
    </AppShell>
  );
}
