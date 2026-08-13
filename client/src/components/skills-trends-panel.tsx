import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioChipGroup } from "@/components/filter-chip-group";
import { VideoAnalysisDialog } from "@/components/video-analysis-dialog";
import { getJson } from "@/lib/queryClient";
import { Video as VideoIcon, TrendingUp } from "lucide-react";

type SkillSessionRow = {
  id: number;
  trackingLevel: "sprint" | "mechanics";
  createdAt: string;
  skillExerciseName: string;
  elapsedSeconds: number | null;
  distanceYards: number | null;
  cameraAngle: string | null;
  faults: { code: string; label: string }[] | null;
  hipShoulderSeparationDeg: number | null;
  weightTransferPct: number | null;
  hipRotationDeg: number | null;
  armSlotDeg: number | null;
  armSlotLabel: string | null;
  wellSequenced: boolean | null;
  videoUrl: string | null;
};

type MechanicsMetric = "hipShoulderSeparationDeg" | "weightTransferPct" | "hipRotationDeg";

const MECHANICS_METRIC_LABEL: Record<MechanicsMetric, string> = {
  hipShoulderSeparationDeg: "Hip-Shoulder Separation",
  weightTransferPct: "Weight Transfer",
  hipRotationDeg: "Hip Rotation",
};

const MECHANICS_METRIC_UNIT: Record<MechanicsMetric, string> = {
  hipShoulderSeparationDeg: "°",
  weightTransferPct: "%",
  hipRotationDeg: "°",
};

function fmtSpeed(elapsedSeconds: number | null, distanceYards: number | null): string {
  if (!elapsedSeconds || !distanceYards) return "–";
  return `${(distanceYards / elapsedSeconds).toFixed(2)} yd/s`;
}

/** Coach-facing trend view for Skills camera-tracking sessions (sprint and
 * swing/throw mechanics) -- the numbers-and-history counterpart to
 * SkillSessionsPanel's raw clip list. Before this existed, everything
 * sprint-tracking.ts/mechanics-tracking.ts computed (splits, speed,
 * hip-shoulder separation, weight transfer, sequencing) was saved and then
 * never read back anywhere except the athlete's own one-time post-capture
 * screen -- a coach had no way to see how a number trended over time
 * without rewatching every clip. Shares the athlete-picker state the
 * Performance/Videos tabs already lift, same as VideosTab. */
export function SkillsTrendsPanel({ athleteId, athleteName }: { athleteId: string; athleteName?: string }) {
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [mechanicsMetric, setMechanicsMetric] = useState<MechanicsMetric>("hipShoulderSeparationDeg");
  const [analyzing, setAnalyzing] = useState<{ url: string; title: string } | null>(null);

  const { data: sessions = [], isLoading } = useQuery<SkillSessionRow[]>({
    queryKey: ["/api/coach/roster", athleteId, "skill-session-history"],
    queryFn: () => getJson(`/api/coach/roster/${athleteId}/skill-session-history`),
    enabled: !!athleteId,
  });

  // One picker entry per (exercise, tracking level) pair actually seen --
  // almost always one entry per exercise name, but a drill COULD be
  // assigned under both tracking levels across different programs, and
  // conflating those would mix sprint seconds with mechanics degrees on
  // one chart.
  const exerciseOptions = useMemo(() => {
    const seen = new Map<string, { label: string; trackingLevel: "sprint" | "mechanics" }>();
    for (const s of sessions) {
      const key = `${s.skillExerciseName}::${s.trackingLevel}`;
      if (!seen.has(key)) seen.set(key, { label: s.skillExerciseName, trackingLevel: s.trackingLevel });
    }
    return Array.from(seen.entries()).map(([key, v]) => ({ key, ...v }));
  }, [sessions]);

  const activeKey = selectedKey || exerciseOptions[0]?.key || "";
  const active = exerciseOptions.find((o) => o.key === activeKey);
  const rows = useMemo(
    () => sessions.filter((s) => `${s.skillExerciseName}::${s.trackingLevel}` === activeKey),
    [sessions, activeKey],
  );
  // Oldest-first for the chart (reads left-to-right as progress over time);
  // the table below stays newest-first, same convention the Strength side's
  // raw-data table already uses.
  const chartRows = [...rows].reverse();

  if (isLoading) return <div className="h-24 animate-pulse rounded-md bg-surface" />;

  if (exerciseOptions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <TrendingUp className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">
            No Skills sessions logged yet for {athleteName?.split(" ")[0] ?? "this athlete"}.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Select value={activeKey} onValueChange={setSelectedKey}>
        <SelectTrigger className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {exerciseOptions.map((o) => (
            <SelectItem key={o.key} value={o.key}>
              {o.label} · {o.trackingLevel === "sprint" ? "Sprint" : "Mechanics"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {active?.trackingLevel === "mechanics" && (
        <RadioChipGroup
          label="Metric"
          options={[
            MECHANICS_METRIC_LABEL.hipShoulderSeparationDeg,
            MECHANICS_METRIC_LABEL.weightTransferPct,
            MECHANICS_METRIC_LABEL.hipRotationDeg,
          ]}
          value={MECHANICS_METRIC_LABEL[mechanicsMetric]}
          onChange={(label) => {
            const entry = (Object.entries(MECHANICS_METRIC_LABEL) as [MechanicsMetric, string][]).find(
              ([, v]) => v === label,
            );
            if (entry) setMechanicsMetric(entry[0]);
          }}
        />
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="createdAt"
                  tickFormatter={(v) => format(parseISO(v), "MMM d")}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={40}
                  unit={active?.trackingLevel === "sprint" ? "s" : MECHANICS_METRIC_UNIT[mechanicsMetric]}
                  domain={active?.trackingLevel === "sprint" ? undefined : [0, "auto"]}
                />
                <Tooltip
                  labelFormatter={(v) => format(parseISO(v as string), "MMM d, yyyy")}
                  formatter={(v) => [
                    active?.trackingLevel === "sprint" ? `${v}s` : `${v}${MECHANICS_METRIC_UNIT[mechanicsMetric]}`,
                    active?.trackingLevel === "sprint" ? "Time" : MECHANICS_METRIC_LABEL[mechanicsMetric],
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey={active?.trackingLevel === "sprint" ? "elapsedSeconds" : mechanicsMetric}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {rows.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{format(parseISO(s.createdAt), "MMM d, yyyy")}</p>
                    {s.trackingLevel === "sprint" ? (
                      <span className="text-xs text-muted-foreground">
                        {s.elapsedSeconds != null ? `${s.elapsedSeconds}s` : "–"}
                        {s.distanceYards != null ? ` · ${s.distanceYards} yd` : ""}
                        {s.elapsedSeconds != null && s.distanceYards != null
                          ? ` · ${fmtSpeed(s.elapsedSeconds, s.distanceYards)}`
                          : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {s.hipShoulderSeparationDeg != null ? `Sep ${s.hipShoulderSeparationDeg}°` : ""}
                        {s.weightTransferPct != null ? ` · Transfer ${s.weightTransferPct}%` : ""}
                        {s.hipRotationDeg != null ? ` · Rotation ${s.hipRotationDeg}°` : ""}
                        {s.wellSequenced != null ? ` · ${s.wellSequenced ? "Well sequenced" : "Sequencing off"}` : ""}
                      </span>
                    )}
                  </div>
                  {s.faults && s.faults.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.faults.map((f) => (
                        <Badge
                          key={f.code}
                          variant="outline"
                          className="border-amber-500/40 text-[10px] text-amber-500"
                        >
                          {f.label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {s.videoUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAnalyzing({ url: s.videoUrl!, title: `${s.skillExerciseName} — ${format(parseISO(s.createdAt), "MMM d")}` })}
                  >
                    <VideoIcon className="h-3.5 w-3.5" />
                    Watch
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {analyzing && (
        <VideoAnalysisDialog
          open={!!analyzing}
          onOpenChange={(o) => !o && setAnalyzing(null)}
          videoUrl={analyzing.url}
          title={analyzing.title}
        />
      )}
    </div>
  );
}
