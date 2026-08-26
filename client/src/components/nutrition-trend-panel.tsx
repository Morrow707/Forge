import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type TrendDay = {
  date: string;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  loggedEntryCount: number;
  hit: boolean | null;
};

type NutritionTrend = {
  days: TrendDay[];
  targets: { caloriesKcal: number | null; proteinG: number | null } | null;
  daysLogged: number;
  daysHitTarget: number | null;
};

const CHART_HEIGHT_PX = 56;

/** Trailing 7-day view of logged calories vs. target, embedded under the
 * food log wherever NutritionPanel lives (athlete's own page, coach's
 * athlete-detail nutrition tab). Complements FoodLogPanel's single-day view
 * -- this is the "how's the week gone" glance, not another place to edit
 * anything. Bar heights are computed in plain pixels rather than CSS
 * percentages, since a percentage height only resolves against a parent
 * with an explicit height, and the flex column each bar sits in doesn't
 * have one (its height is driven by its children) -- percentages here
 * would silently collapse to nothing. */
export function NutritionTrendPanel({ fetchUrl }: { fetchUrl: string }) {
  const { data, isLoading } = useQuery<NutritionTrend>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });

  if (isLoading || !data) {
    return <div className="h-24 animate-pulse rounded-md bg-surface" />;
  }

  const { days, targets, daysLogged, daysHitTarget } = data;
  const calorieTarget = targets?.caloriesKcal ?? null;
  const maxCalories = Math.max(calorieTarget ?? 0, ...days.map((d) => d.caloriesKcal), 1);

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          Last 7 days
        </p>
        <p className="text-xs text-muted-foreground">
          {daysLogged}/{days.length} days logged
          {daysHitTarget != null && ` · ${daysHitTarget}/${days.length} hit target`}
        </p>
      </div>
      <div className="flex items-end gap-1.5" style={{ height: `${CHART_HEIGHT_PX}px` }}>
        {days.map((d) => {
          const barHeightPx =
            d.loggedEntryCount > 0
              ? Math.max(4, Math.round((d.caloriesKcal / maxCalories) * CHART_HEIGHT_PX))
              : 3;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div
                title={`${format(parseISO(d.date), "EEE M/d")}: ${
                  d.loggedEntryCount > 0 ? `${Math.round(d.caloriesKcal)} kcal` : "nothing logged"
                }`}
                className={cn(
                  "w-full rounded-t-sm transition-all",
                  d.loggedEntryCount === 0
                    ? "bg-surface-elevated"
                    : d.hit === false
                      ? "bg-primary/40"
                      : "bg-primary/70",
                )}
                style={{ height: `${barHeightPx}px` }}
              />
              <span className="text-[9px] text-muted-foreground">{format(parseISO(d.date), "EEEEE")}</span>
            </div>
          );
        })}
      </div>
      {calorieTarget == null && (
        <p className="text-[11px] text-muted-foreground">
          Set a calorie target above to see which days land within range.
        </p>
      )}
    </div>
  );
}
