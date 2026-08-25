import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getJson } from "@/lib/queryClient";
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
import { TESTING_METRICS, type TestingMetricKey } from "@shared/testing-metrics";

type TestingResult = {
  id: number;
  date: string;
  fortyYardDash: number | null;
  verticalJumpIn: number | null;
  broadJumpIn: number | null;
  proAgilitySeconds: number | null;
  threeConeSeconds: number | null;
  benchMaxLbs: number | null;
  squatMaxLbs: number | null;
  deadliftMaxLbs: number | null;
};

/** Read-only -- history is built automatically whenever a coach edits an
 * athlete's testing fields on their profile, so there's nothing to add here. */
export function TestingHistoryPanel({ fetchUrl }: { fetchUrl: string }) {
  const [metric, setMetric] = useState<TestingMetricKey>("fortyYardDash");

  const { data = [], isLoading } = useQuery<TestingResult[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });

  const activeMetric = TESTING_METRICS.find((m) => m.key === metric)!;
  const points = data.filter((r) => r[metric] != null);
  const chartData = points.map((r) => ({
    label: format(parseISO(r.date), "MMM d"),
    value: r[metric] as number,
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Snapshots are recorded automatically whenever testing fields change on this athlete's
        profile.
      </p>

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
    </div>
  );
}
