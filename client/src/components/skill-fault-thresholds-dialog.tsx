import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import {
  DEFAULT_SKILL_FAULT_THRESHOLDS,
  SKILL_FAULT_THRESHOLD_BOUNDS,
  SKILL_FAULT_THRESHOLD_FIELDS,
  type SkillFaultThresholds,
} from "@shared/skill-fault-thresholds";

const QUERY_KEY = ["/api/coach/skill-fault-thresholds"];

/** Coach-side sensitivity settings for the Skills camera tracker's
 * fault detection -- see shared/skill-fault-thresholds.ts for why these
 * six numbers exist and what each one gates. Every field falls back
 * independently to the coaching-literature default, so this form only
 * ever needs to show "what's in effect right now," not track which
 * fields a coach has touched. */
export function SkillFaultThresholdsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery<{ effective: SkillFaultThresholds; isCustomized: boolean }>({
    queryKey: QUERY_KEY,
    queryFn: () => getJson("/api/coach/skill-fault-thresholds"),
    enabled: open,
  });

  const [values, setValues] = useState<SkillFaultThresholds>(DEFAULT_SKILL_FAULT_THRESHOLDS);

  useEffect(() => {
    if (data) setValues(data.effective);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (next: SkillFaultThresholds) =>
      apiRequest("PUT", "/api/coach/skill-fault-thresholds", next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Fault detection thresholds updated");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save those thresholds"),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/coach/skill-fault-thresholds"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Reset to default thresholds");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't reset those thresholds"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-teal-400" />
            Fault Detection Sensitivity
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          These control how sensitive the camera tracker's automatic fault flags are for sprint
          and swing/throw mechanics. They started as general coaching-literature defaults --
          adjust any of them if they're too sensitive (or not sensitive enough) for your athletes.
        </p>
        <div className="space-y-4">
          {SKILL_FAULT_THRESHOLD_FIELDS.map((field) => {
            const bounds = SKILL_FAULT_THRESHOLD_BOUNDS[field.key];
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`fault-threshold-${field.key}`}>
                  {field.label} <span className="text-xs text-muted-foreground">({field.unit})</span>
                </Label>
                <Input
                  id={`fault-threshold-${field.key}`}
                  type="number"
                  min={bounds.min}
                  max={bounds.max}
                  step={field.step}
                  value={values[field.key]}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [field.key]: Number(e.target.value) }))
                  }
                />
                <p className="text-xs text-muted-foreground">{field.context}</p>
              </div>
            );
          })}
        </div>
        <DialogFooter className="sm:justify-between">
          {data?.isCustomized ? (
            <Button
              variant="outline"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending || saveMutation.isPending}
            >
              Reset to Defaults
            </Button>
          ) : (
            <span />
          )}
          <Button
            onClick={() => saveMutation.mutate(values)}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
