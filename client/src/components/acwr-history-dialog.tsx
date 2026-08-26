import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getJson } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Activity } from "lucide-react";
import { ACWR_RISK_LABEL, type AcwrRiskLevel } from "@shared/load";
import { cn } from "@/lib/utils";

type AcwrPoint = {
  date: string;
  acuteLoad: number;
  chronicLoad: number;
  ratio: number | null;
  level: AcwrRiskLevel;
};

export const ACWR_RISK_CLASSNAME: Record<AcwrRiskLevel, string> = {
  green: "bg-success/15 text-success",
  yellow: "bg-amber-400/20 text-amber-400",
  red: "bg-destructive/15 text-destructive",
};

/** Dark-theme tooltip content -- Recharts' default <Tooltip> ships
 * light-mode inline styles, so a chart-native custom content is needed to
 * read cleanly against this app's dark surfaces. Mirrors the frosted-glass
 * language already used by Card/Popover (see components/ui/popover.tsx). */
function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; name?: string | number; value?: string | number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-white/10 bg-card/95 px-3 py-2 text-xs shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_16px_40px_-16px_rgba(0,0,0,0.7)] backdrop-blur-xl backdrop-saturate-150">
      {label && <p className="mb-1 font-medium text-foreground">{label}</p>}
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <div key={`${entry.dataKey ?? i}`} className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="ml-auto font-semibold text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Builds a Recharts custom `dot` renderer that keeps the area otherwise
 * dot-free and draws a larger, outlined dot only on the most recent point,
 * so the eye lands on "where things are right now." */
function makeEndpointDot(opts: { dataLength: number; color: string; radius?: number }) {
  const { dataLength, color, radius = 5 } = opts;
  return (props: { cx?: number; cy?: number; index?: number }) => {
    const { cx, cy, index = -1 } = props;
    if (cx == null || cy == null || index !== dataLength - 1) {
      return <circle cx={cx ?? 0} cy={cy ?? 0} r={0} fill="none" key={`endpoint-dot-${index}`} />;
    }
    return (
      <circle
        key={`endpoint-dot-${index}`}
        cx={cx}
        cy={cy}
        r={radius}
        fill={color}
        stroke="hsl(var(--card))"
        strokeWidth={2}
      />
    );
  };
}

/** Read-only -- ACWR is derived purely from logged training volume (see
 * shared/load.ts), never edited directly from either side. A day with no
 * ratio yet (not enough history behind it) just shows no line for that
 * point rather than a misleading zero. */
export function AcwrHistoryDialog({
  open,
  onOpenChange,
  athleteName,
  fetchUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteName: string;
  fetchUrl: string;
}) {
  const { data = [], isLoading } = useQuery<AcwrPoint[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
    enabled: open,
  });

  const chartData = data.map((p) => ({
    label: format(parseISO(p.date), "MMM d"),
    acute: Math.round(p.acuteLoad),
    chronic: Math.round(p.chronicLoad),
  }));
  const latest = data[data.length - 1];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {athleteName}'s Training Load
          </DialogTitle>
          <DialogDescription>
            Acute (7-day) vs. chronic (28-day average) training load -- a general
            load-management guideline, not a medical diagnosis.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface" />
        ) : data.length === 0 || data.every((p) => p.acuteLoad === 0 && p.chronicLoad === 0) ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Not enough logged training yet to calculate a load ratio.
          </p>
        ) : (
          <div className="space-y-4">
            {latest?.ratio != null && (
              <div className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
                <span className="text-muted-foreground">Current ratio</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{latest.ratio.toFixed(2)}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      ACWR_RISK_CLASSNAME[latest.level],
                    )}
                  >
                    {ACWR_RISK_LABEL[latest.level]}
                  </span>
                </div>
              </div>
            )}
            {chartData.length >= 2 && (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <defs>
                      <linearGradient id="acwrHistoryAcuteFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="acwrHistoryChronicFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={32} />
                    <Tooltip
                      content={<ChartTooltipContent />}
                      cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="monotone"
                      dataKey="acute"
                      name="Acute (7d)"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#acwrHistoryAcuteFill)"
                      dot={makeEndpointDot({ dataLength: chartData.length, color: "hsl(var(--primary))", radius: 5 })}
                      activeDot={{ r: 5, fill: "hsl(var(--primary))", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="chronic"
                      name="Chronic (28d avg)"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      fill="url(#acwrHistoryChronicFill)"
                      dot={makeEndpointDot({ dataLength: chartData.length, color: "hsl(var(--muted-foreground))", radius: 4 })}
                      activeDot={{ r: 4, fill: "hsl(var(--muted-foreground))", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
