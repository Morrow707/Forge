import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import { BODY_PAIN_PARTS } from "@shared/wellness";
import { useT } from "@/i18n";

const LABEL_BY_PART = new Map<string, string>(BODY_PAIN_PARTS.map((p) => [p.key, p.label]));

/** Lives at the top of the athlete's workout-day overview -- only ever
 * renders something when today's wellness check-in flagged pain. Nudges
 * toward an AI-generated modified session while any currently-shown
 * exercise still looks risky for what's flagged, and switches to a plain
 * "modified today" notice (with an undo) once nothing risky is left. */
export function ModifiedWorkoutBanner({
  apiBase,
  assignmentId,
  programDayId,
  date,
  todayPainParts,
  hasModifiableRisk,
  isModified,
}: {
  apiBase: string;
  // Kept as the same raw string params useParams hands the page, not
  // Number-coerced -- the invalidated query key below has to be reference-
  // equal (same type, same value) to the workout page's own day-query key.
  assignmentId: string;
  programDayId: string;
  date: string;
  todayPainParts: string[];
  hasModifiableRisk: boolean;
  isModified: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const dayQueryKey = [`${apiBase}/day`, assignmentId, programDayId, date];

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `${apiBase}/assignments/${assignmentId}/days/${programDayId}/modified-workout`,
        { date },
      );
      return res.json() as Promise<{ summary: string }>;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: dayQueryKey });
      toast.success(result.summary);
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't modify today's workout")),
  });

  const revertMutation = useMutation({
    mutationFn: async () =>
      apiRequest("DELETE", `${apiBase}/assignments/${assignmentId}/days/${programDayId}/modified-workout`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dayQueryKey });
      toast.success(t("Reverted to the original session"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't revert this workout")),
  });

  if (todayPainParts.length === 0) return null;

  const painLabels = todayPainParts.map((p) => { const label = LABEL_BY_PART.get(p); return label ? t(label) : p; }).join(", ");

  if (hasModifiableRisk) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">
              {t("Pain flagged today")}
            </p>
            <p className="text-sm text-foreground">
              {t("You reported {pain} in today's check-in, part of this session may aggravate it.", { pain: painLabels })}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("Generate Modified Workout")}
          </Button>
        </div>
      </div>
    );
  }

  if (isModified) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-elevated p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-foreground">
            {t("Modified for today's reported {pain} pain.", { pain: painLabels })}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => revertMutation.mutate()}
            disabled={revertMutation.isPending}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("Revert to Original")}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
