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
  LineChart,
  Line,
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
                  <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={32} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="acute"
                      name="Acute (7d)"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="chronic"
                      name="Chronic (28d avg)"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
