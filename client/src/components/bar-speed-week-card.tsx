import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Gauge } from "lucide-react";
import { getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { ReadFailed } from "@/components/read-failed";
import { AthleteAvatar } from "@/components/athlete-avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CAMERA_ACCURACY_INLINE } from "@shared/camera-accuracy-copy";

/* The coach dashboard's "Bar Speed" card (2026-11-11): only the athletes whose camera bar speed
 * left their zone this week -- a big drop inside one session, mostly slow, or every set fast. An
 * athlete in their zone is counted, not listed, so the card stays short. See
 * /api/coach/bar-speed-week in server/velocity-zones.ts and coachFlag in shared/velocity-zones.ts. */

type Flag = {
  athleteId: number;
  athleteName: string;
  exerciseName: string;
  lowMps: number;
  highMps: number;
  kind: "drop" | "slow" | "fast";
  sets: number;
  slow: number;
  fast: number;
  avgMps: number;
  dropShare: number | null;
};
type Week = { flagged: Flag[]; inZone: number; withZones: number };

const STALE_MS = 300_000;
const PERCENT = 100;
const MPS_DIGITS = 2;
const mps = (v: number) => v.toFixed(MPS_DIGITS);

const PILL: Record<Flag["kind"], { label: string; className: string }> = {
  drop: { label: "Speed drop", className: "bg-primary/15 text-primary" },
  slow: { label: "Slow", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  fast: { label: "Fast", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
};

function describe(f: Flag): string {
  const zone = `${mps(f.lowMps)}–${mps(f.highMps)}`;
  const lines: Record<Flag["kind"], string> = {
    drop: `Speed down ${Math.round((f.dropShare ?? 0) * PERCENT)}% inside one session; ${f.slow} of ${f.sets} sets slow`,
    slow: `${f.slow} of ${f.sets} sets slow (avg ${mps(f.avgMps)} against ${zone})`,
    fast: `All ${f.sets} sets fast (avg ${mps(f.avgMps)} against ${zone})`,
  };
  return lines[f.kind];
}

export function BarSpeedWeekCard() {
  const { data, isError, refetch } = useQuery<Week>({
    queryKey: ["/api/coach/bar-speed-week"],
    queryFn: () => getJson("/api/coach/bar-speed-week"),
    staleTime: STALE_MS,
  });
  if (!data && !isError) return null;
  const summary = data
    ? `Athletes whose bar speed left their zone this week.${data.inZone ? ` ${data.inZone} lift${data.inZone === 1 ? "" : "s"} in zone.` : ""}`
    : "";

  return (
    <Card className="flex flex-col">
      <CardHeader className="p-3 md:p-4">
        <CardTitle className="flex items-center gap-2 text-base md:text-lg">
          <Gauge className="h-4 w-4 text-primary" />
          Bar Speed
        </CardTitle>
        {data && <CardDescription>{summary}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0 md:p-4 md:pt-0">
        {isError && <ReadFailed what="this week's bar speed" onRetry={() => void refetch()} className="flex flex-col items-start gap-2 py-1 text-left" />}
        {data && data.withZones === 0 && (
          <p className="py-1 text-sm text-muted-foreground">
            No camera sets against a zone this week. Set an athlete's zones on the Bar Speed tab of their page.
          </p>
        )}
        {data && data.withZones > 0 && data.flagged.length === 0 && (
          <p className="py-1 text-sm text-muted-foreground">Everyone filmed this week stayed in their zone.</p>
        )}
        {data?.flagged.map((f) => (
          <Link key={`${f.athleteId}-${f.exerciseName}`} href={`/coach/roster/${f.athleteId}?tab=bar-speed`}>
            <div className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-2.5 transition-colors hover:bg-surface-elevated">
              <AthleteAvatar name={f.athleteName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{f.athleteName} · {f.exerciseName}</p>
                <p className="text-xs text-muted-foreground">{describe(f)}</p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", PILL[f.kind].className)}>{PILL[f.kind].label}</span>
            </div>
          </Link>
        ))}
        {data && data.withZones > 0 && <p className="text-[11px] text-muted-foreground">{CAMERA_ACCURACY_INLINE}</p>}
      </CardContent>
    </Card>
  );
}
