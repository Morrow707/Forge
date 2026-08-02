import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Timer } from "lucide-react";
import { TESTING_METRICS, type TestingMetricKey } from "@/lib/testing-metrics";

type TestingResult = {
  id: number;
  date: string;
  fortyYardDash: number | null;
  verticalJumpIn: number | null;
  broadJumpIn: number | null;
  proAgilitySeconds: number | null;
  benchMaxLbs: number | null;
  squatMaxLbs: number | null;
  deadliftMaxLbs: number | null;
};

/** Read-only -- history is built automatically whenever a coach edits an
 * athlete's testing fields on their profile, so there's nothing to add here. */
export function TestingHistoryDialog({
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
  const [metric, setMetric] = useState<TestingMetricKey>("fortyYardDash");

  const { data = [], isLoading } = useQuery<TestingResult[]>({
    queryKey: [fetchUrl],
    queryFn: async () => {
      const res = await apiRequest("GET", fetchUrl);
      return res.json();
    },
    enabled: open,
  });

  const activeMetric = TESTING_METRICS.find((m) => m.key === metric)!;
  const points = data.filter((r) => r[metric] != null);
  const chartData = points.map((r) => ({
    label: format(parseISO(r.date), "MMM d"),
    value: r[metric] as number,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            {athleteName}'s Testing History
          </DialogTitle>
          <DialogDescription>
            Snapshots are recorded automatically whenever testing fields change on this
            athlete's profile.
          </DialogDescription>
        </DialogHeader>

        <Select value={metric} onValueChange={(v) => setMetric(v as TestingMetricKey)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TESTING_METRICS.map((m) => (
              <SelectItem key={m.key} value={m.key}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface" />
        ) : points.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No {activeMetric.label.toLowerCase()} entries recorded yet.
          </p>
        ) : (
          <div className="space-y-4">
            {chartData.length >= 2 && (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                      }}
                      formatter={(value: unknown) => [`${value} ${activeMetric.unit}`, activeMetric.label]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={activeMetric.label}
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {[...points].reverse().map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm"
                >
                  <span className="font-semibold">
                    {r[metric]} {activeMetric.unit}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(r.date), "MMM d, yyyy")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
