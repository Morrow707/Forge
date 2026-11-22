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
import { parseISO } from "date-fns";
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
import { ReadFailed } from "@/components/read-failed";
import { useT } from "@/i18n";

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
  const t = useT();
  const [metric, setMetric] = useState<TestingMetricKey>("fortyYardDash");

  const { data = [], isLoading, isError, refetch } = useQuery<TestingResult[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });

  const activeMetric = TESTING_METRICS.find((m) => m.key === metric)!;
  const points = data.filter((r) => r[metric] != null);
  const chartData = points.map((r) => ({
    label: t.date(parseISO(r.date), { month: "short", day: "numeric" }),
    value: r[metric] as number,
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("Snapshots are recorded automatically whenever testing fields change on this athlete's profile.")}
      </p>

      <Select value={metric} onValueChange={(v) => setMetric(v as TestingMetricKey)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TESTING_METRICS.map((m) => (
            <SelectItem key={m.key} value={m.key}>
              {t(m.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-md bg-surface" />
      ) : isError ? (
        <ReadFailed what={t("these results")} onRetry={() => void refetch()} />
      ) : points.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("No {metric} entries recorded yet.", { metric: t(activeMetric.label).toLowerCase() })}
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
                    formatter={(value: unknown) => [`${value} ${activeMetric.unit}`, t(activeMetric.label)]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={t(activeMetric.label)}
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
                  {t.date(parseISO(r.date), { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
