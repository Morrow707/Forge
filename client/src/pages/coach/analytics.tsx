import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, getJson } from "@/lib/queryClient";
import { Users, Gauge, Crown, CalendarDays, TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { TESTING_METRICS, type TestingMetricKey } from "@shared/testing-metrics";

type RosterEntry = { id: number; name: string; email: string };
type TrackedExercise = { id: number; name: string };
type AnalyticsPoint = {
  date: string;
  setNumber: number;
  reps: string | null;
  weight: string | null;
  weightUnit: "lbs" | "kg" | null;
  weightMode: "numeric" | "bodyweight" | "band";
  rpe: number | null;
  estimatedOneRm: number | null;
  isPR: boolean;
  peakVelocityMps: number | null;
  meanVelocityMps: number | null;
  concentricSeconds: number | null;
  eccentricSeconds: number | null;
  barPathDeviationCm: number | null;
};
type RecentSession = {
  date: string;
  dayTitle: string;
  completed: boolean;
  exercises: string[];
  totalReps: number;
  totalVolume: number;
};

/** Coach-only performance history -- weight, PRs, and (when tracked)
 * velocity/bar-path/tempo for one athlete's exercise. Deliberately has no
 * athlete-facing equivalent -- athletes only see the live number during
 * their own set, this page is where the history/coaching value lives. */
export default function CoachAnalytics() {
  const [athleteId, setAthleteId] = useState<string>("");
  const [exerciseId, setExerciseId] = useState<string>("");

  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });

  const { data: exercises = [] } = useQuery<TrackedExercise[]>({
    queryKey: ["/api/coach/analytics/exercises", athleteId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/coach/analytics/exercises?athleteId=${athleteId}`,
      );
      return res.json();
    },
    enabled: !!athleteId,
  });

  const { data: overview = [], isLoading: overviewLoading } = useQuery<RecentSession[]>({
    queryKey: ["/api/coach/analytics/overview", athleteId],
    queryFn: () => getJson(`/api/coach/analytics/overview?athleteId=${athleteId}`),
    enabled: !!athleteId && !exerciseId,
  });

  const { data: points = [], isLoading } = useQuery<AnalyticsPoint[]>({
    queryKey: ["/api/coach/analytics", athleteId, exerciseId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/coach/analytics?athleteId=${athleteId}&exerciseId=${exerciseId}`,
      );
      return res.json();
    },
    enabled: !!athleteId && !!exerciseId,
  });

  const chartData = points.map((p) => ({
    ...p,
    label: `${format(parseISO(p.date), "MMM d")} · Set ${p.setNumber}`,
  }));

  const hasNumericWeight = chartData.some((p) => p.weightMode === "numeric" && p.weight != null);
  const hasVelocity = chartData.some((p) => p.peakVelocityMps != null);
  const hasPath = chartData.some((p) => p.barPathDeviationCm != null);
  const prCount = chartData.filter((p) => p.isPR).length;
  const unit = chartData.find((p) => p.weightUnit)?.weightUnit ?? "lbs";
  const selectedExerciseName = exercises.find((e) => String(e.id) === exerciseId)?.name;

  function handleAthleteChange(value: string) {
    setAthleteId(value);
    setExerciseId("");
  }

  return (
    <AppShell title="Analytics">
      <Tabs defaultValue="performance">
        <TabsList className="mb-6">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="trends">Team Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="performance">
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Athlete</label>
          <Select value={athleteId} onValueChange={handleAthleteChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select an athlete" />
            </SelectTrigger>
            <SelectContent>
              {roster.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase text-muted-foreground">
            Exercise (optional)
          </label>
          <Select value={exerciseId} onValueChange={setExerciseId} disabled={!athleteId}>
            <SelectTrigger>
              <SelectValue
                placeholder={athleteId ? "All exercises (recent sessions)" : "Pick an athlete first"}
              />
            </SelectTrigger>
            <SelectContent>
              {exercises.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!athleteId && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Pick an athlete to see their training history and PRs.
            </p>
          </CardContent>
        </Card>
      )}

      {athleteId && !exerciseId && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
            <CardDescription>
              Every exercise this athlete has logged. Pick one above for full history, PRs, and
              (if tracked) bar speed and path.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!overviewLoading && overview.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <CalendarDays className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">No workouts logged yet.</p>
              </div>
            )}
            <div className="space-y-2">
              {overview.map((s) => (
                <div
                  key={s.date}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {format(parseISO(s.date), "EEE, MMM d")} — {s.dayTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.exercises.join(", ") || "No exercises logged"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span>{s.totalReps} reps</span>
                    {s.totalVolume > 0 && <span>{s.totalVolume.toLocaleString()} vol.</span>}
                    <Badge variant={s.completed ? "success" : "outline"}>
                      {s.completed ? "Completed" : "In progress"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {athleteId && exerciseId && !isLoading && chartData.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Gauge className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No sets logged for this exercise yet.</p>
          </CardContent>
        </Card>
      )}

      {athleteId && exerciseId && chartData.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl font-bold uppercase">{selectedExerciseName}</h2>
            {prCount > 0 && (
              <Badge className="gap-1 bg-amber-400 text-black hover:bg-amber-400">
                <Crown className="h-3.5 w-3.5" />
                {prCount} PR{prCount === 1 ? "" : "s"}
              </Badge>
            )}
          </div>

          {hasNumericWeight && (
            <Card>
              <CardHeader>
                <CardTitle>Weight &amp; Estimated 1RM</CardTitle>
                <CardDescription>
                  Weight lifted per set ({unit}), with an Epley-estimated 1RM. Crowned points are
                  PRs for that exact rep count.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData.filter((p) => p.weightMode === "numeric")}
                    margin={{ left: 4, right: 12 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={(v) => `${v}`} />
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
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      name="Weight"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      connectNulls
                      dot={(props: any) =>
                        props.payload.isPR ? (
                          <svg
                            key={props.key}
                            x={props.cx - 7}
                            y={props.cy - 7}
                            width={14}
                            height={14}
                            viewBox="0 0 24 24"
                            fill="#fbbf24"
                            stroke="#000"
                          >
                            <path d="M2 20h20v2H2zM3 8l4 4 5-8 5 8 4-4v10H3z" />
                          </svg>
                        ) : (
                          <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="hsl(var(--primary))" />
                        )
                      }
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
              </CardContent>
            </Card>
          )}

          {hasVelocity && (
            <Card>
              <CardHeader>
                <CardTitle>Bar Speed</CardTitle>
                <CardDescription>Peak and mean concentric velocity per tracked set.</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="peakVelocityMps"
                      name="Peak velocity"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="meanVelocityMps"
                      name="Mean velocity"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasPath && (
            <Card>
              <CardHeader>
                <CardTitle>Bar Path Deviation</CardTitle>
                <CardDescription>
                  How far the bar drifted from a straight vertical line, per tracked set.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="barPathDeviationCm"
                      name="Deviation"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasVelocity && (
            <Card>
              <CardHeader>
                <CardTitle>Tempo</CardTitle>
                <CardDescription>Average concentric vs. eccentric duration per set.</CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={32} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="concentricSeconds"
                      name="Concentric"
                      stroke="hsl(var(--success))"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="eccentricSeconds"
                      name="Eccentric"
                      stroke="#a855f7"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Every Data Point</CardTitle>
              <CardDescription>The complete raw history behind the charts above.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                    <th className="py-1.5 pr-3">Date</th>
                    <th className="py-1.5 pr-3">Set</th>
                    <th className="py-1.5 pr-3">Reps</th>
                    <th className="py-1.5 pr-3">Weight</th>
                    <th className="py-1.5 pr-3">Est. 1RM</th>
                    <th className="py-1.5 pr-3">RPE</th>
                    <th className="py-1.5 pr-3">Peak m/s</th>
                    <th className="py-1.5 pr-3">Path (cm)</th>
                    <th className="py-1.5">PR</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((p, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-border/50",
                        p.isPR && "bg-amber-400/10",
                      )}
                    >
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {format(parseISO(p.date), "MMM d")}
                      </td>
                      <td className="py-1.5 pr-3">{p.setNumber}</td>
                      <td className="py-1.5 pr-3">{p.reps ?? "-"}</td>
                      <td className="py-1.5 pr-3">
                        {p.weightMode === "numeric"
                          ? `${p.weight ?? "-"} ${p.weightUnit ?? ""}`
                          : p.weightMode === "band"
                            ? p.weight ?? "-"
                            : "Bodyweight"}
                      </td>
                      <td className="py-1.5 pr-3">{p.estimatedOneRm ?? "-"}</td>
                      <td className="py-1.5 pr-3">{p.rpe ?? "-"}</td>
                      <td className="py-1.5 pr-3">{p.peakVelocityMps ?? "-"}</td>
                      <td className="py-1.5 pr-3">{p.barPathDeviationCm ?? "-"}</td>
                      <td className="py-1.5">
                        {p.isPR && <Crown className="h-3.5 w-3.5 text-amber-400" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
        </TabsContent>

        <TabsContent value="trends">
          <TeamTrends />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

type TrendPoint = { athleteId: number; athleteName: string; date: string; value: number };

const TREND_COLORS = [
  "hsl(var(--primary))",
  "#3b82f6",
  "#f59e0b",
  "#a855f7",
  "#22c55e",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
];

/** One line per athlete for a chosen testing metric, so a coach can see team-wide
 * trends rather than just one athlete at a time. Reuses the automatic snapshot
 * history built from profile-edit testing fields -- no separate data entry. */
function TeamTrends() {
  const [metric, setMetric] = useState<TestingMetricKey>("fortyYardDash");

  const { data: points = [], isLoading } = useQuery<TrendPoint[]>({
    queryKey: ["/api/coach/testing-trends", metric],
    queryFn: () => getJson(`/api/coach/testing-trends?metric=${metric}`),
  });

  const activeMetric = TESTING_METRICS.find((m) => m.key === metric)!;
  const athletes = Array.from(new Set(points.map((p) => p.athleteName))).sort();
  const dates = Array.from(new Set(points.map((p) => p.date))).sort();

  const chartData = dates.map((date) => {
    const row: Record<string, string | number> = { label: format(parseISO(date), "MMM d") };
    for (const p of points.filter((pt) => pt.date === date)) {
      row[p.athleteName] = p.value;
    }
    return row;
  });

  return (
    <div className="space-y-4">
      <div className="max-w-xs space-y-1.5">
        <label className="text-xs font-semibold uppercase text-muted-foreground">Metric</label>
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
      </div>

      {!isLoading && athletes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              No {activeMetric.label.toLowerCase()} entries recorded for your team yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{activeMetric.label} — Team Trend</CardTitle>
            <CardDescription>
              Every athlete with a recorded {activeMetric.label.toLowerCase()} ({activeMetric.unit}
              ), over time.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={44} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {athletes.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={TREND_COLORS[i % TREND_COLORS.length]}
                    strokeWidth={2}
                    connectNulls
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
