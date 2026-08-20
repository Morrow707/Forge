import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/queryClient";
import { Apple, ChevronRight, ScanLine } from "lucide-react";

// Same reasoning as food-log-panel.tsx's own lazy import: barcode scanning
// (@zxing/browser) and the photo-analysis path it drags in are only needed
// once someone actually opens the dialog -- a static import would put that
// weight on every dashboard load, including a coach's, who never renders
// this card at all.
const FoodScannerDialog = lazy(() =>
  import("@/components/food-scanner-dialog").then((m) => ({ default: m.FoodScannerDialog })),
);

type NutritionTargets = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
} | null;

type FoodLogTotals = { caloriesKcal: number; proteinG: number; carbsG: number; fatG: number };

const RING_SIZE = 52;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** One "wheel" -- consumed vs. target for a single macro, filling clockwise
 * from the top. Unlike the full Nutrition tab's linear ProgressBar, four of
 * these fit across a narrow dashboard card at a glance without reading
 * numbers first. */
function MacroRing({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
}) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const offset = RING_CIRCUMFERENCE * (1 - pct / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            className="stroke-surface"
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="stroke-primary transition-all"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums">
          {Math.round(value)}
        </span>
      </div>
      <div className="text-center leading-tight">
        <p className="text-[11px] font-semibold">{label}</p>
        <p className="text-[10px] text-muted-foreground">
          {target ? `of ${target}${unit}` : "no target"}
        </p>
      </div>
    </div>
  );
}

/** At-a-glance macros for today, reusing the same targets/food-log endpoints
 * the full Nutrition tab uses -- a quick-view landing page card, not a
 * replacement for that tab (the Log Food button below covers "I just ate
 * something," everything else -- history, editing entries, micros -- still
 * needs the full page, hence "Full log" staying right here too). */
export function NutritionQuickSummary() {
  const today = new Date().toISOString().slice(0, 10);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerEverOpened, setScannerEverOpened] = useState(false);

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
      <CardContent className="space-y-3">
        {targetsLoading || logLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-surface" />
        ) : !targets ? (
          <p className="text-sm text-muted-foreground">No nutrition targets set yet.</p>
        ) : (
          <div className="flex justify-between gap-1">
            <MacroRing label="Calories" value={totals.caloriesKcal} target={targets.caloriesKcal} unit="" />
            <MacroRing label="Protein" value={totals.proteinG} target={targets.proteinG} unit="g" />
            <MacroRing label="Carbs" value={totals.carbsG} target={targets.carbsG} unit="g" />
            <MacroRing label="Fat" value={totals.fatG} target={targets.fatG} unit="g" />
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            setScannerEverOpened(true);
            setScannerOpen(true);
          }}
        >
          <ScanLine className="h-4 w-4" />
          Scan or Add Food
        </Button>
      </CardContent>

      {scannerEverOpened && (
        <Suspense fallback={null}>
          <FoodScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} date={today} />
        </Suspense>
      )}
    </Card>
  );
}
