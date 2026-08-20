import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

type ExerciseHistoryPoint = {
  date: string;
  weight: number;
  weightUnit: "lbs" | "kg";
  estimatedOneRm: number | null;
  isPR: boolean;
};

/** The one piece of "growth over time" an athlete's own view shows for a
 * single exercise -- just weight & est. 1RM over time. Everything else
 * (velocity, bar path, tempo) stays coach-only in the full analytics page.
 * Shared by the Progress page's Recent PRs card and the full lift-history
 * page -- same click-through, same trend, either place. */
export function ExerciseTrendDialog({
  exercise,
  onOpenChange,
}: {
  exercise: { id: number; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: history = [], isLoading } = useQuery<ExerciseHistoryPoint[]>({
    queryKey: ["/api/athlete/exercise-history", exercise?.id],
    queryFn: () => getJson(`/api/athlete/exercise-history?exerciseId=${exercise!.id}`),
    enabled: exercise != null,
  });

  const chartData = history.map((p) => ({
    label: format(parseISO(p.date), "MMM d"),
    weight: p.weight,
    estimatedOneRm: p.estimatedOneRm,
    isPR: p.isPR,
  }));
  const unit = history.find((p) => p.weightUnit)?.weightUnit ?? "lbs";

  return (
    <Dialog open={exercise != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{exercise?.name} — Growth Trend</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="h-64 animate-pulse rounded-md bg-surface" />
        ) : chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Not enough logged sets yet to show a trend.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={44} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                  formatter={(value: unknown, name: unknown, item: any) => [
                    `${value} ${unit}${item?.payload?.isPR ? " — PR!" : ""}`,
                    String(name),
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  name="Weight"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  connectNulls
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="estimatedOneRm"
                  name="Est. 1RM"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  connectNulls
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
