import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartPulse, HeartCrack, Gauge, Activity, ShieldAlert, VideoOff, Video } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { READINESS_LABEL, type ReadinessLevel } from "@shared/wellness";
import { ACWR_RISK_LABEL, type AcwrRiskLevel } from "@shared/load";
import { READINESS_CLASSNAME } from "@/components/wellness-history-dialog";
import { ACWR_RISK_CLASSNAME } from "@/components/acwr-history-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
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

// Recommendation, not an enforced gate -- an athlete flagged as a minor at
// signup, until the coach marks a waiver/consent on file. Built in full but
// dormant until GUARDIAN_NOTICE_LIVE (shared/privacy-tiers.ts) is flipped
// on: the query it reads always comes back { flagged: false } until then,
// so this renders nothing (see the early return below) in the meantime --
// no separate check needed here.
export function GuardianNoticeBadge({ athleteId }: { athleteId: number }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ flagged: boolean; acknowledgedAt: string | null }>({
    queryKey: [`/api/coach/roster/${athleteId}/guardian-notice`],
  });

  const ackMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/coach/roster/${athleteId}/guardian-notice/acknowledge`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/coach/roster/${athleteId}/guardian-notice`] });
      toast.success("Marked -- waiver/consent on file");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not update"),
  });

  if (!data?.flagged || data.acknowledgedAt) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        ackMutation.mutate();
      }}
      disabled={ackMutation.isPending}
      aria-label="This athlete signed up as a minor -- recommend a parent/guardian waiver, click once one is on file"
      title="Signed up as a minor -- recommend getting a parent/guardian waiver or consent on file, then click to mark it done"
      className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-500 transition-opacity hover:opacity-80"
    >
      <ShieldAlert className="h-3 w-3" />
      {ackMutation.isPending ? "Marking…" : "Guardian waiver needed"}
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

// Relays a parent/guardian's request to stop future camera-tracking
// collection for this athlete (see users.trackingOptOut's own comment in
// shared/schema.ts). Turning it ON is the sensitive direction -- it stops
// new tracked video/metrics from being collected at all -- so that one step
// goes through a confirm dialog; turning it back off doesn't, since re-
// enabling isn't the destructive edge. Existing data is never touched
// either way; this only affects collection going forward.
export function TrackingOptOutToggle({
  athleteId,
  trackingOptOut,
}: {
  athleteId: number;
  trackingOptOut: boolean;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      await apiRequest("POST", `/api/coach/roster/${athleteId}/tracking-opt-out`, {
        trackingOptOut: next,
      });
    },
    onSuccess: (_data, next) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      qc.invalidateQueries({ queryKey: [`/api/coach/roster/${athleteId}`] });
      toast.success(next ? "Camera tracking turned off for this athlete" : "Camera tracking turned back on");
      setConfirming(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not update"),
  });

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (trackingOptOut) {
            mutation.mutate(false);
          } else {
            setConfirming(true);
          }
        }}
        disabled={mutation.isPending}
        aria-label={
          trackingOptOut
            ? "Camera tracking is off for this athlete -- click to turn back on"
            : "Camera tracking is on -- click to turn off at a parent/guardian's request"
        }
        title={
          trackingOptOut
            ? "Camera tracking is off for this athlete at a parent/guardian's request -- click to turn back on"
            : "Turn off camera-tracking collection for this athlete (parent/guardian request)"
        }
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
          trackingOptOut
            ? "bg-amber-500/15 text-amber-500 hover:bg-amber-500/25"
            : "bg-surface text-muted-foreground hover:bg-surface-elevated",
        )}
      >
        {trackingOptOut ? <VideoOff className="h-3 w-3" /> : <Video className="h-3 w-3" />}
        {trackingOptOut ? "Tracking off" : "Tracking on"}
      </button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Turn off camera tracking?"
        description="This stops all future camera-tracked video and tracking metrics (bar speed, jump height, swing mechanics, and the like) from being collected for this athlete going forward, at a parent or guardian's request. It does not delete anything already recorded, and doesn't affect the rest of their account -- they can still log workouts normally."
        confirmLabel="Turn off tracking"
        onConfirm={() => mutation.mutate(true)}
        isPending={mutation.isPending}
      />
    </>
  );
}
