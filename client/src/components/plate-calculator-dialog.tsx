import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calculatePlateBreakdown,
  buildWarmupRamp,
  DEFAULT_BAR_WEIGHT,
  type WeightUnit,
} from "@shared/plates";
import { Layers, Flame } from "lucide-react";

/** Pure client-side math (see shared/plates.ts) -- no request, no server
 * round trip, so it's instant and works offline like the rest of workout
 * logging. Target weight defaults to the heaviest set already entered for
 * this exercise but is freely editable. */
export function PlateCalculatorDialog({
  open,
  onOpenChange,
  exerciseName,
  initialWeight,
  unit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseName: string;
  initialWeight: number;
  unit: WeightUnit;
}) {
  const [weight, setWeight] = useState(initialWeight > 0 ? String(initialWeight) : "");
  const [barWeight, setBarWeight] = useState(String(DEFAULT_BAR_WEIGHT[unit]));

  // `open` is flipped by a plain external button, not a Radix Trigger, so
  // Radix never calls onOpenChange(true) for us to hook -- re-sync the
  // target weight from the athlete's current top set each time it opens.
  useEffect(() => {
    if (open) setWeight(initialWeight > 0 ? String(initialWeight) : "");
  }, [open, initialWeight]);

  const targetWeight = Number(weight) || 0;
  const bar = Number(barWeight) || 0;
  const breakdown = targetWeight > 0 ? calculatePlateBreakdown(targetWeight, unit, bar) : null;
  const ramp = targetWeight > 0 ? buildWarmupRamp(targetWeight, unit, bar) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Plates &amp; Warm-Up
          </DialogTitle>
          <DialogDescription>{exerciseName}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="plate-calc-weight">Target weight ({unit})</Label>
            <Input
              id="plate-calc-weight"
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plate-calc-bar">Bar weight ({unit})</Label>
            <Input
              id="plate-calc-bar"
              type="number"
              inputMode="decimal"
              value={barWeight}
              onChange={(e) => setBarWeight(e.target.value)}
            />
          </div>
        </div>

        {breakdown && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              Load per side
            </p>
            {breakdown.plates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Just the bar -- no plates needed.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {breakdown.plates.map((p, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
            {!breakdown.exact && (
              <p className="text-xs text-muted-foreground">
                Closest loadable weight: {breakdown.achievedWeight} {unit} (target was{" "}
                {targetWeight} {unit})
              </p>
            )}
          </div>
        )}

        {ramp.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
              <Flame className="h-3 w-3" /> Warm-up ramp
            </p>
            <div className="space-y-1">
              {ramp.map((step) => (
                <div
                  key={step.label}
                  className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-sm"
                >
                  <span className="text-muted-foreground">{step.label}</span>
                  <span className="font-semibold">
                    {step.weight} {unit} × {step.reps}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-sm">
                <span className="text-primary">Work set</span>
                <span className="font-semibold text-primary">
                  {targetWeight} {unit}
                </span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
