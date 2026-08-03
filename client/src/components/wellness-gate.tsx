import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Moon, Activity, Brain } from "lucide-react";
import { SORENESS_SCALE, STRESS_SCALE } from "@shared/wellness";

type WellnessCheckin = {
  id: number;
  date: string;
  sleepHours: number;
  soreness: number;
  stress: number;
} | null;

/** Mandatory once-per-day gate, not a dismissible reminder -- an athlete
 * can't see or interact with the rest of the app until today's check-in
 * exists. Renders nothing once that's true, or while the initial fetch is
 * still in flight (assumed submitted rather than flashing the gate). */
export function WellnessGate() {
  const qc = useQueryClient();
  const [sleepHours, setSleepHours] = useState("");
  const [soreness, setSoreness] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);

  const { data, isLoading } = useQuery<WellnessCheckin>({
    queryKey: ["/api/athlete/wellness/today"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/athlete/wellness/today");
      return res.json();
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/athlete/wellness", {
        sleepHours: Number(sleepHours),
        soreness,
        stress,
      });
      return res.json();
    },
    onSuccess: (checkin) => {
      qc.setQueryData(["/api/athlete/wellness/today"], checkin);
      toast.success("Thanks -- have a great session");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save your check-in"),
  });

  if (isLoading || data) return null;

  const sleepValue = Number(sleepHours);
  const canSubmit =
    sleepHours.trim() !== "" &&
    !Number.isNaN(sleepValue) &&
    sleepValue >= 0 &&
    sleepValue <= 24 &&
    soreness != null &&
    stress != null;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        hideClose
        className="max-w-sm"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Daily Check-In</DialogTitle>
          <DialogDescription>
            Required before you can see today's training -- takes 10 seconds and helps your
            coach see how you're recovering.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wellness-sleep" className="flex items-center gap-1.5">
              <Moon className="h-3.5 w-3.5" /> Hours of sleep last night
            </Label>
            <Input
              id="wellness-sleep"
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
              placeholder="e.g. 7.5"
            />
          </div>
          <ScaleField
            label="Soreness"
            icon={Activity}
            scale={SORENESS_SCALE}
            value={soreness}
            onChange={setSoreness}
          />
          <ScaleField
            label="Stress"
            icon={Brain}
            scale={STRESS_SCALE}
            value={stress}
            onChange={setStress}
          />
        </div>
        <DialogFooter>
          <Button
            className="w-full"
            disabled={!canSubmit || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            Submit Check-In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScaleField({
  label,
  icon: Icon,
  scale,
  value,
  onChange,
}: {
  label: string;
  icon: typeof Moon;
  scale: { value: number; label: string }[];
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" /> {label}
      </Label>
      <div className="flex gap-1">
        {scale.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            aria-label={opt.label}
            title={opt.label}
            className={cn(
              "flex-1 rounded-md border py-2 text-xs font-semibold transition-colors",
              value === opt.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            {opt.value}
          </button>
        ))}
      </div>
      <p className="h-4 text-xs text-muted-foreground">
        {value != null ? scale.find((s) => s.value === value)?.label : " "}
      </p>
    </div>
  );
}
