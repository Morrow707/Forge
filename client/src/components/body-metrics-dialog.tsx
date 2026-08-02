import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Scale } from "lucide-react";

type BodyMetric = {
  id: number;
  date: string;
  weight: number;
  weightUnit: "lbs" | "kg";
  bodyFatPercent: number | null;
};

/** Coach-only, read-only view of an athlete's self-logged body metrics --
 * the coach never edits these, only the athlete does (see progress.tsx). */
export function BodyMetricsDialog({
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
  const { data, isLoading } = useQuery<BodyMetric[]>({
    queryKey: [fetchUrl],
    queryFn: async () => {
      const res = await apiRequest("GET", fetchUrl);
      return res.json();
    },
    enabled: open,
  });

  const chartData = (data ?? []).map((m) => ({
    label: format(parseISO(m.date), "MMM d"),
    weight: m.weight,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            {athleteName}'s Body Metrics
          </DialogTitle>
          <DialogDescription>Self-logged by the athlete. Read-only here.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface" />
        ) : !data?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No entries logged yet.
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
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      name="Weight"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {[...data].reverse().map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm"
                >
                  <span className="font-semibold">
                    {m.weight} {m.weightUnit}
                    {m.bodyFatPercent != null && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {m.bodyFatPercent}% BF
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(m.date), "MMM d, yyyy")}
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
