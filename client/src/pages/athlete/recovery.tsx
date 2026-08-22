import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getJson } from "@/lib/queryClient";
import { average, recentTrend, METRIC_BETTER_DIRECTION } from "@/lib/wellness-metrics";
import {
  isNativeHealthSupported,
  isHealthSyncEnabled,
  fetchRecentWorkouts,
  type HealthWorkoutSummary,
} from "@/lib/native-health";
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
import { TrendingUp, TrendingDown, Minus, Dumbbell, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type WellnessEntry = {
  id: number;
  date: string;
  sleepHours: number;
  restingHeartRate: number | null;
  hrv: number | null;
  vo2Max: number | null;
  respiratoryRate: number | null;
  bodyMass: number | null;
};

// Season-length window -- long enough for the slow movers (VO2 Max, body
// mass) to actually show a trend, short of a full history so the query and
// the chart both stay cheap. See routes.ts's /api/athlete/wellness/history
// for the cap this is validated against.
const HISTORY_DAYS = 90;

type MetricKey = "sleepHours" | "restingHeartRate" | "hrv" | "vo2Max" | "respiratoryRate" | "bodyMass";

type MetricDef = {
  key: MetricKey;
  label: string;
  unit: string;
  decimals: number;
  caption: string;
};

const METRICS: MetricDef[] = [
  {
    key: "sleepHours",
    label: "Sleep",
    unit: "h",
    decimals: 1,
    caption: "Hours logged per night, self-reported or synced from Health.",
  },
  {
    key: "restingHeartRate",
    label: "Resting HR",
    unit: "bpm",
    decimals: 0,
    caption:
      "A resting heart rate that creeps up week over week is one of the earliest signs of accumulating fatigue, dehydration, or illness -- watch for a rising trend, not just a single high day.",
  },
  {
    key: "hrv",
    label: "HRV",
    unit: "ms",
    decimals: 0,
    caption:
      "Heart rate variability trending down usually shows up before soreness or a slow bar speed does -- it's often the first signal that recovery is behind training load.",
  },
  {
    key: "vo2Max",
    label: "VO2 Max",
    unit: "mL/kg/min",
    decimals: 1,
    caption: "Aerobic capacity -- should trend upward over a training block as conditioning improves.",
  },
  {
    key: "respiratoryRate",
    label: "Respiratory Rate",
    unit: "br/min",
    decimals: 1,
    caption: "Resting breathing rate -- a sustained rise here can be an early flag for illness.",
  },
  {
    key: "bodyMass",
    label: "Body Mass",
    unit: "lbs",
    decimals: 1,
    caption: "Also shown on the Nutrition page -- useful context for a nutritionist reviewing targets.",
  },
];

function TrendBadge({ metricKey, values }: { metricKey: MetricKey; values: (number | null)[] }) {
  const trend = recentTrend(values);
  if (!trend) return null;
  const betterDirection = METRIC_BETTER_DIRECTION[metricKey];
  const isGood = betterDirection ? trend.direction === betterDirection : null;
  const colorClass =
    trend.direction === "flat"
      ? "bg-secondary text-muted-foreground"
      : isGood === true
        ? "bg-success/15 text-success"
        : isGood === false
          ? "bg-destructive/15 text-destructive"
          : "bg-secondary text-foreground";
  const Icon = trend.direction === "up" ? TrendingUp : trend.direction === "down" ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        colorClass,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {trend.direction === "flat" ? "Holding steady" : `${Math.abs(trend.changePct).toFixed(0)}% ${trend.direction}`}
    </span>
  );
}

function MetricTab({ def, entries }: { def: MetricDef; entries: WellnessEntry[] }) {
  const values = entries.map((e) => e[def.key] as number | null);
  const avg = average(values);
  const chartData = entries
    .filter((e) => e[def.key] != null)
    .map((e) => ({ label: format(parseISO(e.date), "MMM d"), value: e[def.key] as number }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {HISTORY_DAYS}-day average
          </p>
          <p className="font-display text-3xl font-bold">
            {avg == null ? "--" : `${avg.toFixed(def.decimals)} ${def.unit}`}
          </p>
        </div>
        <TrendBadge metricKey={def.key} values={values} />
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {def.caption}
      </p>
      {chartData.length >= 2 ? (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} width={40} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                formatter={(value: unknown) => [`${value} ${def.unit}`, def.label]}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={def.label}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Not enough synced data yet to chart a trend.
        </p>
      )}
    </div>
  );
}

function WorkoutsTab() {
  const [workouts, setWorkouts] = useState<HealthWorkoutSummary[] | null>(null);
  const supported = isNativeHealthSupported() && isHealthSyncEnabled();

  useEffect(() => {
    if (!supported) return;
    fetchRecentWorkouts(HISTORY_DAYS).then(setWorkouts);
  }, [supported]);

  if (!supported) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Turn on Sync Apple Health in Settings to see workouts logged to Health here.
      </p>
    );
  }

  if (workouts == null) {
    return <div className="h-40 animate-pulse rounded-md bg-surface" />;
  }

  if (workouts.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No workouts logged to Health in the last {HISTORY_DAYS} days.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Calorie figures are the OS's own estimate from accelerometer and heart-rate data --
        reliable for steady-state cardio, less so for resistance training.
      </p>
      {workouts.map((w, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-2 rounded-md border border-border p-3"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Dumbbell className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold capitalize">
                {w.workoutType.replace(/([A-Z])/g, " $1").trim()}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(w.startDate), "MMM d, yyyy")} · {w.durationMinutes} min
                {w.estimatedCaloriesBurned != null &&
                  ` · ~${Math.round(w.estimatedCaloriesBurned)} kcal est.`}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AthleteRecovery() {
  const { data: entries = [], isLoading } = useQuery<WellnessEntry[]>({
    queryKey: ["/api/athlete/wellness/history", HISTORY_DAYS],
    queryFn: () => getJson(`/api/athlete/wellness/history?limit=${HISTORY_DAYS}`),
  });

  // API returns newest-first; charts and trend math both want oldest-first.
  const chronological = [...entries].reverse();

  return (
    <AppShell title="Recovery & Vitals">
      <p className="mb-6 text-sm text-muted-foreground">
        Trends from your daily check-ins and synced Apple Health data over the last{" "}
        {HISTORY_DAYS} days. Averages recompute automatically every time you check in -- nothing
        here is a running total.
      </p>
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-surface" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Trends</CardTitle>
            <CardDescription>Tap a tab to switch metrics.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="sleepHours">
              <TabsList className="flex-wrap h-auto">
                {METRICS.map((m) => (
                  <TabsTrigger key={m.key} value={m.key}>
                    {m.label}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="workouts">Workouts</TabsTrigger>
              </TabsList>
              {METRICS.map((m) => (
                <TabsContent key={m.key} value={m.key}>
                  <MetricTab def={m} entries={chronological} />
                </TabsContent>
              ))}
              <TabsContent value="workouts">
                <WorkoutsTab />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
