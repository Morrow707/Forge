import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HeartPulse, HeartCrack, Gauge, Activity } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { READINESS_LABEL, type ReadinessLevel } from "@shared/wellness";
import { ACWR_RISK_LABEL, type AcwrRiskLevel } from "@shared/load";
import { READINESS_CLASSNAME } from "@/components/wellness-history-dialog";
import { ACWR_RISK_CLASSNAME } from "@/components/acwr-history-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type HealthStatus = "healthy" | "hurt";

// Read-only -- reflects the athlete's own mandatory daily check-in. Absent
// entirely (not "red") when they haven't checked in yet today, since that's
// a different fact than a real low score.
export function WellnessBadge({
  entry,
  onClick,
}: {
  entry?: { score: number; level: ReadinessLevel };
  onClick: () => void;
}) {
  if (!entry) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`Readiness ${entry.score}/100, ${READINESS_LABEL[entry.level]} -- view wellness history`}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80",
        READINESS_CLASSNAME[entry.level],
      )}
    >
      <Gauge className="h-3 w-3" />
      {entry.score} · {READINESS_LABEL[entry.level]}
    </button>
  );
}

// Coach-only -- flags when an athlete's recent training load has spiked (or
// crashed) relative to what they've been adapting to. Absent entirely when
// they haven't logged enough training yet to compute a ratio, same "absent
// means no data, not a real reading" convention as the wellness badge.
export function AcwrBadge({
  entry,
  onClick,
}: {
  entry?: { ratio: number | null; level: AcwrRiskLevel };
  onClick: () => void;
}) {
  if (!entry || entry.ratio == null) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`Training load: ${ACWR_RISK_LABEL[entry.level]} -- view load history`}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80",
        ACWR_RISK_CLASSNAME[entry.level],
      )}
    >
      <Activity className="h-3 w-3" />
      {ACWR_RISK_LABEL[entry.level]}
    </button>
  );
}

// Coach-only quick-glance status -- never shown to the athlete themselves
// (the backend strips it from any athlete-facing response). Icon + text
// label so the signal isn't color-only.
export function HealthStatusToggle({
  athleteId,
  status,
}: {
  athleteId: number;
  status: HealthStatus;
}) {
  const qc = useQueryClient();
  const isHealthy = status === "healthy";

  const mutation = useMutation({
    mutationFn: async (next: HealthStatus) => {
      await apiRequest("PATCH", `/api/coach/roster/${athleteId}/health-status`, {
        healthStatus: next,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not update status"),
  });

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        mutation.mutate(isHealthy ? "hurt" : "healthy");
      }}
      disabled={mutation.isPending}
      aria-label={`${isHealthy ? "Healthy" : "Hurt"} -- click to mark ${isHealthy ? "hurt" : "healthy"}`}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
        isHealthy
          ? "bg-success/15 text-success hover:bg-success/25"
          : "bg-destructive/15 text-destructive hover:bg-destructive/25",
      )}
    >
      {isHealthy ? <HeartPulse className="h-3 w-3" /> : <HeartCrack className="h-3 w-3" />}
      {isHealthy ? "Healthy" : "Hurt"}
    </button>
  );
}
