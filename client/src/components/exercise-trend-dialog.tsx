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
import { convertWeight } from "@/lib/progression";

const round1 = (n: number) => Math.round(n * 10) / 10;

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

  // One axis needs one unit. This took the unit off whichever point came
  // first and stamped it on the whole chart while plotting every point's raw
  // number, so an athlete who switched from pounds to kilograms saw their
  // line fall off a cliff -- the same lifts, relabelled -- and the axis
  // named a unit that was wrong for half the data.
  //
  // The most recent point decides the unit, because that is what the athlete
  // is logging in now and what every other number on their screen is already
  // shown in. Older points are converted onto it.
  const unit = history[history.length - 1]?.weightUnit ?? history[0]?.weightUnit ?? "lbs";
  const chartData = history.map((p) => ({
    label: format(parseISO(p.date), "MMM d"),
    // Rounded like every other weight the app shows -- a converted value is
    // otherwise 220.46200000000002 in the tooltip.
    weight: round1(convertWeight(p.weight, p.weightUnit ?? unit, unit)),
    estimatedOneRm:
      p.estimatedOneRm != null
        ? round1(convertWeight(p.estimatedOneRm, p.weightUnit ?? unit, unit))
        : null,
    isPR: p.isPR,
  }));

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
