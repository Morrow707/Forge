import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, getJson } from "@/lib/queryClient";
import { FoodScannerDialog } from "@/components/food-scanner-dialog";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";

type FoodLogEntry = {
  id: number;
  description: string;
  brand: string | null;
  servingDescription: string | null;
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  source: "barcode" | "search" | "manual";
};

type FoodLogResponse = {
  entries: FoodLogEntry[];
  totals: {
    caloriesKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sodiumMg: number;
  };
};

type Targets = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
} | null;

function ProgressBar({ label, value, target, unit }: { label: string; value: number; target: number | null; unit: string }) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {Math.round(value)}
          {target ? ` / ${target}` : ""} {unit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct ?? Math.min(100, value > 0 ? 10 : 0)}%` }}
        />
      </div>
    </div>
  );
}

/** Logged food vs. the athlete's nutritionTargets, for a given day --
 * embedded alongside NutritionPanel wherever that lives. `fetchUrl` points
 * at either the athlete's own endpoint (self-service, editable) or the
 * coach's read-only roster sub-resource (view-only, no add/delete) -- same
 * parametrized-panel pattern as NutritionPanel/GoalsPanel. Logging is never
 * an AI capability (see foodLogEntries' schema comment), so the editable
 * case is always free regardless of coach/paywall status. */
export function FoodLogPanel({
  fetchUrl,
  editable,
  targets,
}: {
  fetchUrl: string;
  editable: boolean;
  targets: Targets;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scannerOpen, setScannerOpen] = useState(false);

  const queryKey = [fetchUrl, date];
  const { data, isLoading } = useQuery<FoodLogResponse>({
    queryKey,
    queryFn: () => getJson(`${fetchUrl}?date=${date}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/athlete/food-log/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: () => toast.error("Couldn't remove that entry"),
  });

  const totals = data?.totals ?? { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 };
  const isToday = date === new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Food Log</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setDate((d) => format(addDays(parseISO(d), -1), "yyyy-MM-dd"))}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-24 text-center text-xs text-muted-foreground">
            {isToday ? "Today" : format(parseISO(date), "MMM d")}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={isToday}
            onClick={() => setDate((d) => format(addDays(parseISO(d), 1), "yyyy-MM-dd"))}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-20 animate-pulse rounded-md bg-surface" />
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <ProgressBar label="Calories" value={totals.caloriesKcal} target={targets?.caloriesKcal ?? null} unit="kcal" />
            <ProgressBar label="Protein" value={totals.proteinG} target={targets?.proteinG ?? null} unit="g" />
            <ProgressBar label="Carbs" value={totals.carbsG} target={targets?.carbsG ?? null} unit="g" />
            <ProgressBar label="Fat" value={totals.fatG} target={targets?.fatG ?? null} unit="g" />
          </div>

          <div className="space-y-1.5">
            {!data?.entries.length && (
              <p className="py-3 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
            )}
            {data?.entries.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm"
              >
                <div>
                  <p className="font-medium">{e.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.servingDescription ? `${e.servingDescription} -- ` : ""}
                    {e.caloriesKcal ?? "?"} kcal
                    {e.proteinG != null ? `, ${e.proteinG}g protein` : ""}
                  </p>
                </div>
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove entry"
                    onClick={() => deleteMutation.mutate(e.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {editable && isToday && (
        <Button type="button" variant="outline" onClick={() => setScannerOpen(true)}>
          <Plus className="h-4 w-4" />
          Log Food
        </Button>
      )}

      {editable && <FoodScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} date={date} />}
    </div>
  );
}
